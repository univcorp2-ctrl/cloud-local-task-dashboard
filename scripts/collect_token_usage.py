#!/usr/bin/env python3
"""Per-task token/quota attribution for the Task Control Center ("which task eats how much").

Codex  : ~/.codex/sessions/**/*.jsonl (last 7 days). Each session's final token_count
         total_token_usage is attributed to a task label = first line of the first user prompt
         (scheduled `codex exec` runs reuse the same prompt, so they group together) or
         "対話: <cwd>" for interactive sessions. Subagents are shown separately.
         quotaPercent = share of Codex tokens x Codex 7-day used %  (an attribution, not a meter).
Claude : account usage endpoint `seven_day_breakdown` (Cowork / Chats / Claude Code %, measured by
         Anthropic) -> surface rows. Scheduled cloud tasks come from authenticated TCC jobs;
         the old snapshot is used only if that source is absent. Their share of the
         Cowork + Other surfaces is ESTIMATED by runs x run time. Claude Code CLI sessions on
         this PC (~/.claude/projects) are counted in tokens.
Nothing leaves the PC except labels, counts and percentages.
"""
from __future__ import annotations

import datetime as dt
import glob
import json
import os
import re
from collections import defaultdict
from pathlib import Path

UTC = dt.timezone.utc
WINDOW = dt.timedelta(days=7)
SAFE = re.compile(r"https?://\S+|[\w.+-]+@[\w.-]+\.[a-z]{2,}|[A-Za-z0-9_\-]{32,}|[<>\u0000-\u001f]")


def clean(text: str, limit: int = 60) -> str:
    text = SAFE.sub("", text or "").strip()
    text = re.sub(r"\s+", " ", text)
    return text[:limit] or "(無題)"


def _first_user_line(event: dict, queue_root: Path = Path(r"C:\AI-Agent\queue\codex")) -> str | None:
    p = event.get("payload") or {}
    if event.get("type") != "response_item" or p.get("type") != "message" or p.get("role") != "user":
        return None
    for part in p.get("content") or []:
        t = part.get("text") if isinstance(part, dict) else None
        if not t or t.lstrip().startswith("<") or t.lstrip().startswith("# AGENTS.md instructions"):
            continue
        for line in t.splitlines():
            line = line.strip().lstrip("#").strip()
            if line:
                if line.count('?') > max(3, len(line) * .2):
                    # Recover only a title from the exact existing request, never its body.
                    match = re.search(r'https://app\.notion\.com/p/([0-9a-f]{32})\b', t)
                    if match:
                        for folder in ('running', 'done', 'pending'):
                            for path in (queue_root / folder).glob(f'*{match[1]}.md'):
                                try:
                                    with path.open(encoding='utf-8-sig') as fh:
                                        title = fh.readline().strip().lstrip('#').strip()
                                    if title and title.count('?') <= 3:
                                        return title
                                except (OSError, UnicodeError):
                                    pass
                return line
    return None


def codex_sessions(home: Path, now: dt.datetime) -> list[dict]:
    cut = (now - WINDOW).timestamp()
    out = []
    for f in glob.glob(str(home / ".codex" / "sessions" / "**" / "*.jsonl"), recursive=True):
        try:
            if os.path.getmtime(f) < cut:
                continue
            meta, label, total, last_at, baseline = {}, None, None, None, {}
            with open(f, encoding="utf-8", errors="replace") as fh:
                for line in fh:
                    try:
                        e = json.loads(line)
                    except ValueError:
                        continue
                    if e.get("type") == "session_meta":
                        meta = e.get("payload") or {}
                    if label is None:
                        label = _first_user_line(e)
                    p = e.get("payload") or {}
                    if e.get("type") == "event_msg" and p.get("type") == "token_count" and p.get("info"):
                        at = parse_time(e.get("timestamp"))
                        if at is None or at > now:
                            continue
                        if at < now - WINDOW:
                            baseline = p["info"].get("total_token_usage") or {}
                            continue
                        total = (p["info"].get("total_token_usage") or {})
                        last_at = e.get("timestamp") or last_at
        except OSError:
            continue
        if not total:
            continue
        total = {k: max(0, (v or 0) - (baseline.get(k) or 0)) for k, v in total.items() if isinstance(v, (int, float))}
        src = meta.get("source")
        sub = isinstance(src, dict) and "subagent" in src
        interactive = meta.get("originator") not in ("codex_exec",) and not sub
        cwd = Path(str(meta.get("cwd") or "")).name or "?"
        if sub:
            key, kind = "subagent:" + clean(json.dumps(src.get("subagent"), ensure_ascii=False), 30), "subagent"
            name = "サブエージェント " + clean(json.dumps(src.get("subagent"), ensure_ascii=False), 30)
        elif interactive:
            key, kind, name = "cli:" + cwd, "cli", f"対話セッション（{cwd}）"
        else:
            name = clean(label or f"exec（{cwd}）", 50)
            key, kind = "exec:" + name[:30], "scheduled"
        out.append({"key": key, "label": name, "kind": kind, "tokens": int(total.get("total_tokens") or 0),
                    "fresh": int((total.get("input_tokens") or 0) - (total.get("cached_input_tokens") or 0) + (total.get("output_tokens") or 0)),
                    "lastAt": last_at})
    return out


def group(rows: list[dict]) -> list[dict]:
    g: dict[str, dict] = {}
    for r in rows:
        x = g.setdefault(r["key"], {"key": r["key"], "label": r["label"], "kind": r["kind"], "tokens": 0, "fresh": 0, "runs": 0, "lastAt": None})
        x["tokens"] += r["tokens"]
        x["fresh"] += r.get("fresh", 0)
        x["runs"] += 1
        if r.get("lastAt") and (x["lastAt"] is None or r["lastAt"] > x["lastAt"]):
            x["lastAt"] = r["lastAt"]
    return sorted(g.values(), key=lambda x: -x["tokens"])


def codex_usage(home: Path, now: dt.datetime, weekly_used: float | None) -> dict | None:
    groups = group(codex_sessions(home, now))
    total = sum(x["tokens"] for x in groups)
    if not total:
        return None
    items = []
    for x in groups[:25]:
        share = 100.0 * x["tokens"] / total
        items.append({"key": x["key"][:60], "label": x["label"], "kind": x["kind"], "tokens": x["tokens"], "sharePercent": round(share, 1),
                      "quotaPercent": round(share * weekly_used / 100.0, 1) if weekly_used is not None else None,
                      "runs": x["runs"], "lastAt": x["lastAt"],
                      "quality": "measured", "note": f"キャッシュ除く {x['fresh']:,}・枠への帰属は按分推定"})
    return {"provider": "codex", "window": "7d", "observedAt": now.isoformat(), "basis": "tokens",
            "source": "Codex CLI session logs (~/.codex/sessions, 7d, per task)", "totalTokens": total,
            "quality": "measured", "quotaUsedPercent": weekly_used, "items": items}


def claude_code_cli(home: Path, now: dt.datetime) -> list[dict]:
    cut = (now - WINDOW).timestamp()
    per: dict[str, dict] = defaultdict(lambda: {"tokens": 0, "runs": set(), "lastAt": None})
    for f in glob.glob(str(home / ".claude" / "projects" / "*" / "*.jsonl")):
        try:
            if os.path.getmtime(f) < cut:
                continue
            proj = Path(f).parent.name.split("-")[-1] or Path(f).parent.name
            with open(f, encoding="utf-8", errors="replace") as fh:
                for line in fh:
                    try:
                        e = json.loads(line)
                    except ValueError:
                        continue
                    u = (e.get("message") or {}).get("usage") if e.get("type") == "assistant" else None
                    if not u:
                        continue
                    at = parse_time(e.get("timestamp"))
                    if at is None or not now - WINDOW <= at <= now:
                        continue
                    t = (u.get("input_tokens") or 0) + (u.get("cache_creation_input_tokens") or 0) + (u.get("output_tokens") or 0)
                    x = per[proj]
                    x["tokens"] += t
                    x["runs"].add(e.get("sessionId"))
                    ts = e.get("timestamp")
                    if ts and (x["lastAt"] is None or ts > x["lastAt"]):
                        x["lastAt"] = ts
        except OSError:
            continue
    return [{"key": "claude-code:" + k[:40], "label": f"Claude Code CLI（{clean(k, 30)}）", "kind": "cli", "tokens": v["tokens"],
             "runs": len(v["runs"]), "lastAt": v["lastAt"]} for k, v in sorted(per.items(), key=lambda kv: -kv[1]["tokens"])]


def claude_usage(usage_body: dict | None, home: Path, now: dt.datetime, tasks_file: Path | None, live_tasks: list[dict] | None = None) -> dict | None:
    if not usage_body:
        return None
    weekly = (usage_body.get("seven_day") or {}).get("utilization")
    weekly = float(weekly) if isinstance(weekly, (int, float)) else None
    rows = ((usage_body.get("seven_day_breakdown") or {}).get("rows")) or []
    items: list[dict] = []
    cowork_pct = None
    for r in rows:
        pct = r.get("percent")
        if not isinstance(pct, (int, float)):
            continue
        if r.get("key") in ("cowork", "other"):
            cowork_pct = (cowork_pct or 0) + float(pct)
        items.append({"key": "surface:" + str(r.get("key"))[:30], "label": f"{r.get('display_name')}（面全体）", "kind": "surface",
                      "tokens": None, "sharePercent": float(pct), "quotaPercent": round(float(pct) * weekly / 100.0, 1) if weekly is not None else None,
                      "runs": None, "lastAt": None, "quality": "measured", "note": "Anthropic計測の7日内訳"})
    # scheduled cloud tasks: estimated split of the Cowork surface by runs x run time
    tasks = list(live_tasks or [])
    if live_tasks is None and tasks_file and tasks_file.exists():
        try:
            tasks = json.loads(tasks_file.read_text(encoding="utf-8")).get("tasks", [])
        except (OSError, ValueError):
            tasks = []
    weights = [(t, 0 if t.get("enabled") is False else max(0, float(t.get("runsPerWeek") or 0)) * max(0, float(t.get("durationSeconds") or t.get("avgSeconds") or 0))) for t in tasks]
    wsum = sum(w for _, w in weights)
    for t, w in sorted(weights, key=lambda tw: -tw[1]):
        share_total = w / wsum * cowork_pct if wsum and cowork_pct is not None else (0 if t.get("enabled") is False else None)
        observed = parse_time(t.get("observedAt"))
        stale = observed is None or now - observed > dt.timedelta(hours=48)
        date = observed.astimezone(dt.timezone(dt.timedelta(hours=9))) if observed else None
        warning = f"・定期タスク一覧が古い（最終 {date.month}/{date.day}）" if stale and date else "・一覧の観測時刻未取得" if stale else ""
        items.append({"key": "sched:" + clean(t.get("name", ""), 40), "label": clean(t.get("name", ""), 60), "kind": "scheduled", "tokens": None,
                      "sharePercent": round(share_total, 1) if share_total is not None else None, "quotaPercent": round(share_total * weekly / 100.0, 1) if weekly is not None and share_total is not None else None,
                      "quality": "estimated", "runs": 0 if t.get("enabled") is False else int(t.get("runsPerWeek") or 0), "lastAt": t.get("lastFinishedAt") or t.get("lastRunAt"),
                      "note": "runs×時間による按分" + ("・停止中" if t.get("enabled") is False else "") + warning})
    for c in claude_code_cli(home, now)[:5]:
        items.append({**c, "sharePercent": None, "quotaPercent": None, "quality": "measured", "note": "PC上のCLI（Claude Code面に含まれる）"})
    if not items:
        return None
    return {"provider": "claude", "window": "7d", "observedAt": now.isoformat(), "basis": "percent",
            "quality": "estimated", "source": "Claude account usage + scheduled estimate" + (" (live job list)" if live_tasks is not None else " (snapshot fallback)"), "totalTokens": None,
            "quotaUsedPercent": weekly, "items": items[:40]}


def parse_time(value) -> dt.datetime | None:
    try:
        value = dt.datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return value if value.tzinfo else value.replace(tzinfo=UTC)
    except (ValueError, TypeError):
        return None


def antigravity_usage(home: Path, now: dt.datetime, weekly_used: float | None,
                      commerce_file: Path = Path(r"C:\AI-Agent\state\univ-commerce\usage.jsonl")) -> dict:
    """Read only token JSONL, never IDE credential databases or conversation text.

    Commerce audit events repeat agy_call generation totals: count the calls once.
    A source can explicitly mark token_basis=estimated; never promote it to measured.
    """
    files = [commerce_file]
    for root in home.glob(".antigravity*"):
        if root.is_dir():
            for folder in (root / "sessions", root / "logs"):
                if folder.is_dir():
                    files.extend(sorted(folder.rglob("*.jsonl")))
    rows = []
    seen = set()
    for path in dict.fromkeys(files):
        try:
            with path.open(encoding="utf-8-sig", errors="replace") as fh:
                for line in fh:
                    try:
                        e = json.loads(line)
                    except ValueError:
                        continue
                    if not isinstance(e, dict):
                        continue
                    at = parse_time(e.get("at") or e.get("timestamp"))
                    if at is None or not now - WINDOW <= at <= now:
                        continue
                    basis = str(e.get("token_basis") or "")
                    if "audit" in basis or e.get("event") not in ("agy_call", "published", "draft_only", "error", "token_usage"):
                        continue
                    values = (e.get("input_tokens"), e.get("output_tokens"))
                    if not any(isinstance(v, (int, float)) and not isinstance(v, bool) for v in values):
                        continue
                    tokens = sum(max(0, int(v)) for v in values if isinstance(v, (int, float)) and not isinstance(v, bool))
                    # Stable IDs deduplicate copied session logs; timestamps alone aren't IDs.
                    identity = e.get("request_id") or e.get("event_id")
                    if identity and identity in seen:
                        continue
                    if identity:
                        seen.add(identity)
                    engine = str(e.get("engine") or e.get("job") or "")
                    key = engine if engine in ("daily-content-engine", "commerce-autopilot") else "interactive"
                    rows.append({"key": key, "label": key if key != "interactive" else "対話", "kind": "scheduled" if key != "interactive" else "cli",
                                 "tokens": tokens, "lastAt": at.isoformat(), "estimated": "estimat" in basis})
        except OSError:
            continue
    groups = group(rows)
    total = sum(r["tokens"] for r in groups)
    items = []
    for g in groups:
        estimated = any(r.get("estimated") for r in rows if r["key"] == g["key"])
        share = g["tokens"] / total * 100 if total else None
        items.append({**g, "quality": "estimated" if estimated else "measured", "sharePercent": round(share, 1) if share is not None else None,
                      "quotaPercent": round(share * weekly_used / 100, 1) if share is not None and weekly_used is not None else None,
                      "note": "記録されたトークン内の按分。全アカウントの計測ではない"})
    return {"provider": "antigravity", "window": "7d", "observedAt": max((r['lastAt'] for r in rows), default=now.isoformat()),
            "basis": "tokens", "quality": "estimated" if any(r.get("estimated") for r in rows) else "measured",
            "source": "Antigravity local token logs (7d; audit duplicates excluded)", "totalTokens": total if rows else None,
            "quotaUsedPercent": weekly_used, "items": items}


def muse_usage(path: Path | None, now: dt.datetime, weekly_used: float | None) -> dict | None:
    if path is None:
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, ValueError):
        return None
    at = parse_time(data.get("updated_at"))
    if at is None or now - at > WINDOW:
        return None
    raw = data.get("task_usage") or data.get("tasks") or []
    if isinstance(raw, dict):
        raw = raw.get("items", [])
    items = []
    for i, row in enumerate(raw if isinstance(raw, list) else []):
        if not isinstance(row, dict):
            continue
        tok = row.get("tokens") or row.get("total_tokens")
        if tok is not None and (not isinstance(tok, (int, float)) or tok < 0):
            continue
        def pct(key):
            v = row.get(key)
            return float(v) if isinstance(v, (int, float)) and 0 <= v <= 100 else None
        items.append({"key": clean(str(row.get("key") or f"muse-{i}")), "label": clean(str(row.get("label") or row.get("name") or "Museタスク")),
                      "kind": "other", "tokens": tok, "sharePercent": pct("sharePercent"), "quotaPercent": pct("quotaPercent"),
                      "quality": "self_reported", "lastAt": row.get("lastAt") if parse_time(row.get("lastAt")) else None})
    if not items:
        items = [{"key": "muse-total", "label": "Muse全体（自己申告）", "kind": "other", "tokens": None, "sharePercent": None,
                  "quotaPercent": weekly_used, "quality": "self_reported", "note": "タスク別の値は未取得"}]
    return {"provider": "muse", "window": "7d", "observedAt": at.isoformat(), "source": "Muse Drive token_status_payload.json",
            "basis": "percent", "quality": "self_reported", "totalTokens": None, "quotaUsedPercent": weekly_used, "items": items[:40]}
