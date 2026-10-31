#!/usr/bin/env python3
"""Claude scheduled tasks -> Task Control Center "jobs" (source=claude-cloud).

Reads list_triggers results either from JSON files given on the command line, or (default)
from the newest Claude Code transcript (~/.claude/projects/**/*.jsonl) of the current session,
condenses them (no prompts, no connector lists) and POSTs them to /api/state/ingest.

  python3 claude_jobs_sync.py --token-file /tmp/tcc_agent_token [--dry-run] [pages.json ...]

Only names, schedules, run status and timestamps leave the session.
"""
from __future__ import annotations

import argparse
import datetime as dt
import glob
import json
import os
import re
import sys
import urllib.request

INGEST = "https://cloud-local-task-dashboard.pages.dev/api/state/ingest"
JST = dt.timezone(dt.timedelta(hours=9))


# ------------------------------------------------------------------ cron helpers (5-field, CRON_TZ prefix)
def _field(spec: str, lo: int, hi: int) -> set[int]:
    out: set[int] = set()
    for part in spec.split(","):
        step = 1
        if "/" in part:
            part, s = part.split("/")
            step = int(s)
        if part in ("*", ""):
            a, b = lo, hi
        elif "-" in part:
            a, b = (int(x) for x in part.split("-"))
        else:
            a = b = int(part)
            if step != 1:
                b = hi
        out.update(range(a, b + 1, step))
    return out


def parse_cron(expr: str):
    expr = (expr or "").strip()
    tz = None
    m = re.match(r"CRON_TZ=(\S+)\s+(.*)", expr)
    if m:
        tz, expr = m.group(1), m.group(2)
    parts = expr.split()
    if len(parts) != 5:
        return None
    try:
        mins, hours, dom, mon, dow = (_field(parts[0], 0, 59), _field(parts[1], 0, 23), _field(parts[2], 1, 31),
                                      _field(parts[3], 1, 12), {d % 7 for d in _field(parts[4], 0, 7)})
    except ValueError:
        return None
    return {"tz": tz, "min": mins, "hour": hours, "dom": dom, "mon": mon, "dow": dow, "raw": parts}


def runs_per_week(c) -> float | None:
    if not c:
        return None
    days = 7
    if c["raw"][2] != "*" and c["raw"][4] == "*":
        days = 7 * len(c["dom"]) / 30.4
    elif c["raw"][4] != "*":
        days = len(c["dow"])
    if c["raw"][3] != "*" and len(c["mon"]) < 12:
        now_month = dt.datetime.now(JST).month
        if now_month not in c["mon"]:
            return 0.0
    return round(len(c["min"]) * len(c["hour"]) * days, 1)


def label(c, expr: str) -> str:
    if not c:
        return expr[:40]
    mins, hours = sorted(c["min"]), sorted(c["hour"])
    raw = c["raw"]
    tz = "" if (c["tz"] or "").startswith("Asia/Tokyo") else "UTC "
    if raw[1] == "*" and len(mins) == 1:
        base = f"毎時:{mins[0]:02d}"
    elif raw[1].startswith("*/"):
        base = f"{raw[1][2:]}時間毎:{mins[0]:02d}"
    elif len(hours) == 1 and len(mins) == 1:
        base = f"毎日{hours[0]:02d}:{mins[0]:02d}"
    elif len(mins) == 1 and len(hours) <= 8:
        base = f"{'/'.join(str(h) for h in hours)}時{mins[0]:02d}分"
    elif len(mins) == 1:
        base = f"1日{len(hours)}回 :{mins[0]:02d}"
    else:
        base = " ".join(raw)
    if raw[4] != "*":
        base += "（" + "".join("日月火水木金土"[d] for d in sorted(c["dow"])) + "）"
    if raw[2].startswith("*/"):
        base += f"（{raw[2][2:]}日ごと）"
    elif raw[2] != "*":
        base += f"（{raw[2]}日）"
    return tz + base


# ------------------------------------------------------------------ conversion
def category(name: str) -> str | None:
    rules = [("Earn Lab", "Earn Lab"), ("物件|銀行|融資|KSI|公売|クレアス|不動産", "不動産"), ("GPT追撃", "GPT追撃"),
             ("Upwork|受注|販売", "受注・販売"), ("補助金|助成金", "補助金"), ("レポート|総点検|ブリーフィング", "レポート"),
             ("納税|税", "守り・期限"), ("ディスパッチャー|自律実行", "司令塔")]
    for pat, cat in rules:
        if re.search(pat, name):
            return cat
    return None


def iso(v):
    return v if isinstance(v, str) and v else None


def to_job(t: dict) -> dict:
    cron = t.get("cron_expression") or ""
    one_shot = bool(t.get("run_once_at")) and not cron
    c = parse_cron(cron)
    last = t.get("last_run") or {}
    st = (last.get("status") or "").replace("ROUTINE_RUN_STATUS_", "")
    if st in ("PENDING", "RUNNING", "IN_PROGRESS") and not last.get("finished_at"):
        status = "running"
    elif st == "FAILED":
        status = "failed"
    elif st == "SUCCEEDED":
        status = "success"
    else:
        status = "scheduled"
    if not t.get("enabled"):
        status = "ended" if (t.get("ended_reason") or one_shot) else ("running" if status == "running" else "paused")
    dur = None
    if last.get("fired_at") and last.get("finished_at"):
        a = dt.datetime.fromisoformat(last["fired_at"].replace("Z", "+00:00"))
        b = dt.datetime.fromisoformat(last["finished_at"].replace("Z", "+00:00"))
        dur = max(0, int((b - a).total_seconds()))
    model = ((t.get("derived_state") or {}).get("model") or "").replace("claude-", "") or None
    note = None
    if status == "failed":
        note = "失敗: " + (last.get("failure_reason") or "").replace("ROUTINE_RUN_FAILURE_REASON_", "")
    elif t.get("suspension_reason"):
        note = "一時停止: " + t["suspension_reason"]
    if one_shot:
        sched_label = "1回 " + dt.datetime.fromisoformat(t["run_once_at"].replace("Z", "+00:00")).astimezone(JST).strftime("%m/%d %H:%M")
    else:
        sched_label = label(c, cron)
    return {
        "id": t["id"], "name": (t.get("name") or t["id"])[:140], "platform": "claude", "schedule": cron[:80],
        "scheduleLabel": sched_label[:60], "enabled": bool(t.get("enabled")), "oneShot": one_shot, "status": status,
        "lastRunAt": iso(last.get("fired_at")) or iso(t.get("last_fired_at")), "lastFinishedAt": iso(last.get("finished_at")),
        "nextRunAt": iso(t.get("next_run_at")) if t.get("enabled") else None, "durationSeconds": dur,
        "model": model, "runsPerWeek": (0 if one_shot else runs_per_week(c)), "category": category(t.get("name") or ""),
        "note": note,
    }


def triggers_from_transcript() -> list[dict]:
    files = sorted(glob.glob(os.path.expanduser("~/.claude/projects/**/*.jsonl"), recursive=True), key=os.path.getmtime)
    if not files:
        return []
    ids, found = set(), {}
    with open(files[-1], encoding="utf-8", errors="replace") as fh:
        for line in fh:
            try:
                e = json.loads(line)
            except ValueError:
                continue
            content = (e.get("message") or {}).get("content")
            if not isinstance(content, list):
                continue
            for part in content:
                if not isinstance(part, dict):
                    continue
                if part.get("type") == "tool_use" and str(part.get("name", "")).endswith("list_triggers"):
                    ids.add(part.get("id"))
                if part.get("type") == "tool_result" and part.get("tool_use_id") in ids:
                    body = part.get("content")
                    texts = [x.get("text", "") for x in body] if isinstance(body, list) else [body or ""]
                    for tx in texts:
                        try:
                            data = json.loads(tx[tx.index("{"):tx.rindex("}") + 1])
                        except (ValueError, TypeError):
                            continue
                        for t in data.get("data", []):
                            found[t["id"]] = t  # later results win
    return list(found.values())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="*")
    ap.add_argument("--token-file")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    triggers: list[dict] = []
    if a.files:
        for f in a.files:
            d = json.load(open(f, encoding="utf-8"))
            triggers.extend(d.get("data", d) if isinstance(d, dict) else d)
    else:
        triggers = triggers_from_transcript()
    if not triggers:
        print("no list_triggers results found", file=sys.stderr)
        return 2
    jobs = [to_job(t) for t in triggers]
    # keep recently ended one-shots for a day, drop older ended ones
    cut = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=2)).isoformat()
    jobs = [j for j in jobs if j["enabled"] or j["status"] == "running" or (j["lastRunAt"] or "") >= cut or j["status"] == "paused"]
    payload = {"actor": "claude-jobs-sync", "jobs": [{"source": "claude-cloud", "label": "Claude定期タスク",
               "observedAt": dt.datetime.now(dt.timezone.utc).isoformat(), "items": jobs[:200]}]}
    if a.dry_run:
        print(json.dumps(payload, ensure_ascii=False, indent=1))
        return 0
    token = open(a.token_file).read().strip() if a.token_file else os.environ.get("TCC_AGENT_TOKEN", "")
    req = urllib.request.Request(INGEST, data=json.dumps(payload).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}", "User-Agent": "tcc-claude-jobs-sync"})
    with urllib.request.urlopen(req, timeout=30) as r:
        print(r.status, r.read().decode()[:300])
    print(f"jobs={len(jobs)} running={sum(j['status']=='running' for j in jobs)} failed={sum(j['status']=='failed' for j in jobs)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
