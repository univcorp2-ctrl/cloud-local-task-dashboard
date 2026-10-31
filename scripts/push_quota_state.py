#!/usr/bin/env python3
"""Push AI quota observations from this PC to the control-center state API.

Sources (all local, read-only; only percentages leave this machine):
  * Codex CLI session logs (+ Claude statusline snapshot, legacy Antigravity DB)
    -> via scripts/collect_ai_quotas.merge_observations (unchanged logic)
  * Claude: the account usage endpoint, called with the OAuth access token Claude Code keeps in
    ~/.claude/.credentials.json (owner decision 2026-10-31: Claude is used mostly via Cowork/web, so
    the statusline bridge never observes anything). If the access token is expired the script runs
    `claude -p` once so Claude Code itself refreshes the credential file; this script never writes it.
  * Antigravity: the running IDE's local language_server (GetUserStatus -> per-model quotaInfo),
    using the CSRF token from its own command line. Only works while Antigravity is open.
  * Muse: Google Drive file `…/Muse 作業ログ/05_EstateBoard連携/token_status_payload.json`
    (written by Muse's own token-status-sync job every 3 hours)

Target: POST {api}/api/state/ingest with `Authorization: Bearer $TCC_ACCESS_TOKEN`
(or $TCC_AGENT_TOKEN). The token comes from the process environment only; the PowerShell
runner decrypts it from a DPAPI file and removes it afterwards. Nothing secret is logged.

Unlike the previous pipeline this does not rebuild or redeploy the site, so it keeps working
whatever revision is deployed. A reading older than 7 days is not sent at all.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from collect_ai_quotas import merge_observations  # noqa: E402
import collect_token_usage as ctu  # noqa: E402

LAST_CLAUDE_USAGE: dict = {}

APPROVED = ("https://cloud-local-task-dashboard.pages.dev",)
UTC = dt.timezone.utc
JST = dt.timezone(dt.timedelta(hours=9))
SEED_CATALOG = {"quotas": [{"provider": p} for p in ("Codex CLI", "Claude Code CLI", "Gemini / Antigravity CLI")]}
PROVIDER_MAP = {"Codex CLI": "codex", "Claude Code CLI": "claude", "Gemini / Antigravity CLI": "antigravity"}
MAX_AGE = dt.timedelta(days=7)


def parse(value):
    if not value:
        return None
    try:
        t = dt.datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return t if t.tzinfo else t.replace(tzinfo=UTC)
    except ValueError:
        return None


def local_quotas(home: Path, appdata: Path | None, now: dt.datetime) -> list[dict]:
    catalog = merge_observations(json.loads(json.dumps(SEED_CATALOG)), home, appdata=appdata, now=now)
    out = []
    for q in catalog.get("quotas", []):
        provider = PROVIDER_MAP.get(q.get("provider"))
        observed = parse(q.get("observedAt"))
        if not provider or q.get("quality") == "unavailable" or observed is None or now - observed > MAX_AGE:
            continue
        windows = []
        if provider == "antigravity":
            for pool in q.get("modelPools") or []:
                if isinstance(pool.get("usedPercent"), (int, float)):
                    windows.append({"kind": "model", "label": f"モデル枠 {pool.get('category', '')}".strip(),
                                    "usedPercent": pool["usedPercent"], "resetsAt": pool.get("resetAt")})
        else:
            if isinstance(q.get("weeklyUsedPercent"), (int, float)):
                windows.append({"kind": "weekly", "label": "7日枠", "usedPercent": q["weeklyUsedPercent"], "resetsAt": q.get("weeklyResetAt")})
            if isinstance(q.get("usedPercent"), (int, float)):
                windows.append({"kind": "five_hour", "label": "5時間枠", "usedPercent": q["usedPercent"], "resetsAt": q.get("resetAt")})
        if not windows:
            continue
        out.append({"provider": provider, "windows": windows, "observedAt": observed.isoformat(),
                    "source": str(q.get("evidence") or "local observation")[:120], "quality": "measured", "staleAfterMinutes": 180})
    return out


def muse_quota(path: Path, now: dt.datetime) -> dict | None:
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, ValueError):
        return None
    observed = parse(data.get("updated_at"))
    if observed is None or now - observed > MAX_AGE:
        return None
    windows = []
    weekly = data.get("weekly_free_limit") or {}
    if isinstance(weekly.get("remaining_percent"), (int, float)):
        windows.append({"kind": "weekly", "label": "週次無料枠", "remainingPercent": weekly["remaining_percent"], "resetsAt": weekly.get("resets_at")})
    extra = data.get("additional_tokens") or {}
    if isinstance(extra.get("remaining_percent"), (int, float)):
        windows.append({"kind": "additional", "label": "追加トークン", "remainingPercent": extra["remaining_percent"],
                        "remainingText": str(extra.get("remaining_tokens_reported") or "")[:32] or None})
    if not windows:
        return None
    plan = (data.get("subscription") or {}).get("plan")
    return {"provider": "muse", "windows": windows, "observedAt": observed.isoformat(),
            "source": "Muse subscription-status via Drive token_status_payload.json", "quality": "self_reported",
            "staleAfterMinutes": 240, "note": f"plan={plan}" if plan else None}


# ----------------------------------------------------------------------------- Claude (OAuth usage)
CLAUDE_USAGE_URL = "https://api.anthropic.com/api/oauth/usage"
CLAUDE_WINDOWS = (("seven_day", "weekly", "7日枠"), ("five_hour", "five_hour", "5時間枠"))


def read_claude_access(home: Path) -> tuple[str, float]:
    try:
        data = json.loads((home / ".claude" / ".credentials.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return "", 0.0
    oauth = data.get("claudeAiOauth") or {}
    exp = oauth.get("expiresAt") or 0
    return str(oauth.get("accessToken") or ""), float(exp / 1000 if exp > 1e12 else exp)


def refresh_claude_credentials() -> bool:
    """Let Claude Code refresh its own credential file (a one-turn, no-tool prompt)."""
    exe = shutil.which("claude") or shutil.which("claude.exe")
    if not exe:
        return False
    try:
        with tempfile.TemporaryDirectory() as d:
            r = subprocess.run([exe, "-p", "Reply with the single word OK.", "--max-turns", "1", "--model", "haiku"],
                               cwd=d, capture_output=True, text=True, timeout=180, stdin=subprocess.DEVNULL,
                               creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        return r.returncode == 0
    except (OSError, subprocess.SubprocessError):
        return False


def claude_quota(home: Path, now: dt.datetime, allow_refresh: bool = True) -> dict | None:
    token, exp = read_claude_access(home)
    if not token:
        return None
    if exp < time.time() + 60 and allow_refresh:
        if not refresh_claude_credentials():
            return None
        token, exp = read_claude_access(home)
        if not token or exp < time.time():
            return None
    req = urllib.request.Request(CLAUDE_USAGE_URL, headers={"Authorization": "Bearer " + token, "anthropic-beta": "oauth-2025-04-20",
                                                            "Accept": "application/json", "User-Agent": "TCC-QuotaPush/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, ValueError):
        return None
    LAST_CLAUDE_USAGE.clear(); LAST_CLAUDE_USAGE.update(body)
    return claude_windows(body, now)


def claude_windows(body: dict, now: dt.datetime) -> dict | None:
    windows = []
    for key, kind, label in CLAUDE_WINDOWS:
        w = body.get(key)
        if isinstance(w, dict) and isinstance(w.get("utilization"), (int, float)):
            used = max(0.0, min(100.0, float(w["utilization"])))
            windows.append({"kind": kind, "label": label, "usedPercent": round(used, 1), "resetsAt": w.get("resets_at")})
    if not windows:
        return None
    return {"provider": "claude", "windows": windows, "observedAt": now.isoformat(),
            "source": "Claude account usage API (OAuth, local credentials, read-only)", "quality": "measured", "staleAfterMinutes": 90}


# ----------------------------------------------------------------------------- Antigravity (local language server)
def antigravity_endpoints() -> tuple[str, list[str]]:
    if os.name != "nt":
        return "", []
    try:
        cmd = subprocess.run(["powershell", "-NoProfile", "-Command",
                              "(Get-CimInstance Win32_Process -Filter \"name='language_server.exe'\" | Where-Object { $_.CommandLine -match 'antigravity' }).CommandLine"],
                             capture_output=True, text=True, timeout=40, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)).stdout
        m = re.search(r"--csrf_token[= ](\S+)", cmd or "")
        if not m:
            return "", []
        ports = subprocess.run(["powershell", "-NoProfile", "-Command",
                                "Get-NetTCPConnection -State Listen -LocalAddress 127.0.0.1 | Where-Object { (Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName -eq 'language_server' } | ForEach-Object { $_.LocalPort }"],
                               capture_output=True, text=True, timeout=40, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)).stdout
        return m.group(1), re.findall(r"\d+", ports or "")
    except (OSError, subprocess.SubprocessError):
        return "", []


def antigravity_quota(now: dt.datetime) -> dict | None:
    csrf, ports = antigravity_endpoints()
    if not csrf or not ports:
        return None
    meta = {"metadata": {"ideName": "antigravity", "extensionName": "antigravity", "locale": "en"}}
    for port in ports:
        req = urllib.request.Request(f"http://127.0.0.1:{port}/exa.language_server_pb.LanguageServerService/GetUserStatus",
                                     data=json.dumps(meta).encode(), method="POST",
                                     headers={"Content-Type": "application/json", "x-codeium-csrf-token": csrf, "Connect-Protocol-Version": "1"})
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                body = json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, ValueError):
            continue
        return antigravity_windows(body, now)
    return None


def antigravity_windows(body: dict, now: dt.datetime) -> dict | None:
    configs = (((body.get("userStatus") or {}).get("cascadeModelConfigData") or {}).get("clientModelConfigs")) or []
    seen, rows = set(), []
    for c in configs:
        q = c.get("quotaInfo") or {}
        label = str(c.get("label") or "").strip()[:36]
        frac = q.get("remainingFraction")
        if not label or label in seen or not isinstance(frac, (int, float)):
            continue
        seen.add(label)
        rows.append((0 if c.get("isRecommended") else 1, float(frac), label, q.get("resetTime")))
    if not rows:
        return None
    rows.sort(key=lambda r: (r[0], r[1]))
    windows = [{"kind": "model", "label": label, "remainingPercent": round(max(0.0, min(1.0, frac)) * 100, 1), "resetsAt": reset}
               for _, frac, label, reset in rows[:6]]
    return {"provider": "antigravity", "windows": windows, "observedAt": now.isoformat(),
            "source": "Antigravity language_server GetUserStatus (local, per-model quota)", "quality": "measured", "staleAfterMinutes": 180,
            "note": f"{len(rows)}モデルのうち上位{len(windows)}件を表示"}


def find_muse_payload() -> Path | None:
    import glob
    hits = glob.glob(r"G:\*\00.Bukken_Master_DB\Muse*\05_EstateBoard連携\token_status_payload.json")
    return Path(hits[0]) if len(hits) == 1 else None


def post(api: str, token: str, payload: dict) -> dict:
    req = urllib.request.Request(api + "/api/state/ingest", data=json.dumps(payload, ensure_ascii=False).encode("utf-8"), method="POST",
                                 headers={"Authorization": "Bearer " + token, "Content-Type": "application/json", "Accept": "application/json",
                                          "User-Agent": "TCC-QuotaPush/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")[:200]
        raise SystemExit(f"ingest HTTP {e.code}: {body}")
    except (urllib.error.URLError, TimeoutError) as e:
        raise SystemExit("ingest network error") from e


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--api-base", default=APPROVED[0], choices=APPROVED)
    ap.add_argument("--home", type=Path, default=Path.home())
    ap.add_argument("--appdata", type=Path)
    ap.add_argument("--muse-payload", type=Path, help="override path of Muse token_status_payload.json")
    ap.add_argument("--apply", action="store_true", help="POST to the API (default: print payload only)")
    ap.add_argument("--no-claude", action="store_true", help="skip the Claude account usage lookup")
    ap.add_argument("--no-usage", action="store_true", help="skip per-task usage attribution")
    ap.add_argument("--claude-tasks", type=Path, default=Path(r"G:\マイドライブ\AI_Agents\Private\automation-control-center\claude_scheduled_tasks.json"),
                    help="snapshot of Claude scheduled cloud tasks (name, runsPerWeek, avgSeconds, model)")
    ap.add_argument("--no-antigravity", action="store_true", help="skip the Antigravity language-server lookup")
    ap.add_argument("--log", type=Path, help="append one status line here")
    args = ap.parse_args()
    now = dt.datetime.now(UTC)
    quotas = local_quotas(args.home, args.appdata, now)
    live = {}
    if not args.no_claude:
        c = claude_quota(args.home, now)
        if c:
            live["claude"] = c
    if not args.no_antigravity:
        a = antigravity_quota(now)
        if a:
            live["antigravity"] = a
    # live account readings beat the legacy local heuristics for the same provider
    quotas = [q for q in quotas if q["provider"] not in live] + list(live.values())
    muse = muse_quota(args.muse_payload or find_muse_payload() or Path("/nonexistent"), now)
    if muse:
        quotas.append(muse)
    agents = [{"name": "pc-collector", "status": "running", "currentTask": "AI残量を収集してAPIへ送信"}]
    if muse:
        # Muse's own 3-hourly Drive update is evidence that Muse is alive; report it as such.
        agents.append({"name": "muse", "status": "idle", "currentTask": "Drive token_status_payload を更新 " + parse(muse["observedAt"]).astimezone(JST).strftime("%m/%d %H:%M"),
                       "note": "pc-collector が Drive 更新時刻から推定"})
    usage = []
    if not args.no_usage:
        codex_q = next((q for q in quotas if q["provider"] == "codex"), None)
        codex_week = next((w.get("usedPercent") for w in (codex_q or {}).get("windows", []) if w.get("kind") == "weekly"), None)
        for u in (ctu.codex_usage(args.home, now, codex_week),
                  ctu.claude_usage(LAST_CLAUDE_USAGE or None, args.home, now, args.claude_tasks)):
            if u:
                usage.append(u)
    payload = {"actor": "pc-collector", "quotas": quotas, "agents": agents, "usage": usage}
    line = f"{dt.datetime.now(JST).isoformat(timespec='seconds')} | providers={','.join(q['provider'] for q in quotas) or 'none'} usage={','.join(u['provider'] + ':' + str(len(u['items'])) for u in usage) or 'none'}"
    if not args.apply:
        print(json.dumps(payload, ensure_ascii=False, indent=1))
        print("DRY RUN " + line)
        return 0
    token = os.environ.get("TCC_ACCESS_TOKEN") or os.environ.get("TCC_AGENT_TOKEN") or ""
    if not token:
        raise SystemExit("TCC_ACCESS_TOKEN/TCC_AGENT_TOKEN missing from environment")
    if not quotas:
        line += " | nothing to send"
    else:
        result = post(args.api_base, token, payload)
        line += f" | applied={','.join(result.get('applied', {}).get('quotas', []))} updatedAt={result.get('updatedAt')}"
    print(line)
    if args.log:
        with args.log.open("a", encoding="utf-8") as f:
            f.write(line + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
