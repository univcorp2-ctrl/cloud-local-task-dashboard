#!/usr/bin/env python3
"""Push AI quota observations from this PC to the control-center state API.

Sources (all local/read-only, no LLM calls, no credential stores):
  * Codex CLI session logs, Claude Code sanitized statusline snapshot, Antigravity usage DB
    -> via scripts/collect_ai_quotas.merge_observations (unchanged logic)
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
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from collect_ai_quotas import merge_observations  # noqa: E402

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
    ap.add_argument("--log", type=Path, help="append one status line here")
    args = ap.parse_args()
    now = dt.datetime.now(UTC)
    quotas = local_quotas(args.home, args.appdata, now)
    muse = muse_quota(args.muse_payload or find_muse_payload() or Path("/nonexistent"), now)
    if muse:
        quotas.append(muse)
    agents = [{"name": "pc-collector", "status": "running", "currentTask": "AI残量を収集してAPIへ送信"}]
    if muse:
        # Muse's own 3-hourly Drive update is evidence that Muse is alive; report it as such.
        agents.append({"name": "muse", "status": "idle", "currentTask": "Drive token_status_payload を更新 " + parse(muse["observedAt"]).astimezone(JST).strftime("%m/%d %H:%M"),
                       "note": "pc-collector が Drive 更新時刻から推定"})
    payload = {"actor": "pc-collector", "quotas": quotas, "agents": agents}
    line = f"{dt.datetime.now(JST).isoformat(timespec='seconds')} | providers={','.join(q['provider'] for q in quotas) or 'none'}"
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
