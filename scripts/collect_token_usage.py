#!/usr/bin/env python3
"""Per-task token/quota attribution for the Task Control Center ("which task eats how much").

Codex  : ~/.codex/sessions/**/*.jsonl (last 7 days). Each session's final token_count
         total_token_usage is attributed to a task label = first line of the first user prompt
         (scheduled `codex exec` runs reuse the same prompt, so they group together) or
         "対話: <cwd>" for interactive sessions. Subagents are shown separately.
         quotaPercent = share of Codex tokens x Codex 7-day used %  (an attribution, not a meter).
Claude : account usage endpoint `seven_day_breakdown` (Cowork / Chats / Claude Code %, measured by
         Anthropic) -> surface rows. Scheduled cloud tasks are listed from a snapshot file
         (claude_scheduled_tasks.json: name, runs per week, average run seconds, model) and their
         share of the Cowork surface is ESTIMATED by runs x run time. Claude Code CLI sessions on
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


def _first_user_line(event: dict) -> str | None:
    p = event.get("payload") or {}
    if event.get("type") != "response_item" or p.get("type") != "message" or p.get("role") != "user":
        return None
    for part in p.get("content") or []:
        t = part.get("text") if isinstance(part, dict) else None
        if not t or t.lstrip().startswith("<"):
            continue
        for line in t.splitlines():
            line = line.strip().lstrip("#").strip()
            if line:
                return line
    return None


def codex_sessions(home: Path, now: dt.datetime) -> list[dict]:
    cut = (now - WINDOW).timestamp()
    out = []
    for f in glob.glob(str(home / ".codex" / "sessions" / "**" / "*.jsonl"), recursive=True):
        try:
            if os.path.getmtime(f) < cut:
                continue
            meta, label, total, last_at = {}, None, None, None
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
                        total = (p["info"].get("total_token_usage") or {})
                        last_at = e.get("timestamp") or last_at
        except OSError:
            continue
        if not total:
            continue
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
                      "note": f"キャッシュ除く {x['fresh']:,}"})
    return {"provider": "codex", "window": "7d", "observedAt": now.isoformat(), "basis": "tokens",
            "source": "Codex CLI session logs (~/.codex/sessions, 7d, per task)", "totalTokens": total,
            "quotaUsedPercent": weekly_used, "items": items}


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


def claude_usage(usage_body: dict | None, home: Path, now: dt.datetime, tasks_file: Path | None) -> dict | None:
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
        if r.get("key") == "cowork":
            cowork_pct = float(pct)
        items.append({"key": "surface:" + str(r.get("key"))[:30], "label": f"{r.get('display_name')}（面全体）", "kind": "surface",
                      "tokens": None, "sharePercent": float(pct), "quotaPercent": round(float(pct) * weekly / 100.0, 1) if weekly is not None else None,
                      "runs": None, "lastAt": None, "note": "Anthropic計測の7日内訳"})
    # scheduled cloud tasks: estimated split of the Cowork surface by runs x run time
    tasks = []
    if tasks_file and tasks_file.exists():
        try:
            tasks = json.loads(tasks_file.read_text(encoding="utf-8")).get("tasks", [])
        except (OSError, ValueError):
            tasks = []
    weights = [(t, float(t.get("runsPerWeek") or 0) * float(t.get("avgSeconds") or 0)) for t in tasks]
    wsum = sum(w for _, w in weights)
    for t, w in sorted(weights, key=lambda tw: -tw[1]):
        if not wsum:
            break
        share_of_cowork = 100.0 * w / wsum
        share_total = share_of_cowork * (cowork_pct or 0) / 100.0
        items.append({"key": "sched:" + clean(t.get("name", ""), 40), "label": clean(t.get("name", ""), 60), "kind": "scheduled", "tokens": None,
                      "sharePercent": round(share_total, 1), "quotaPercent": round(share_total * weekly / 100.0, 1) if weekly is not None else None,
                      "runs": int(t.get("runsPerWeek") or 0), "lastAt": t.get("lastRunAt"),
                      "note": f"推定（週{int(t.get('runsPerWeek') or 0)}回×平均{int(t.get('avgSeconds') or 0)}秒・{t.get('model', '')}）"})
    for c in claude_code_cli(home, now)[:5]:
        items.append({**c, "sharePercent": None, "quotaPercent": None, "note": "PC上のCLI（Claude Code面に含まれる）"})
    if not items:
        return None
    return {"provider": "claude", "window": "7d", "observedAt": now.isoformat(), "basis": "percent",
            "source": "Claude account usage seven_day_breakdown + scheduled-task estimate", "totalTokens": None,
            "quotaUsedPercent": weekly, "items": items[:40]}
