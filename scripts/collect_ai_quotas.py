#!/usr/bin/env python3
"""Collect quota-only telemetry. Never reads conversation text or publishes credentials.

Usage: python scripts/collect_ai_quotas.py --catalog public/data/operations-catalog.json

Codex: token_count rate_limits events in ~/.codex/sessions.
Claude: optional sanitized usage-dashboard-statusline.json from a statusline helper.
Antigravity: optional sanitized quota-status.json from Antigravity CLI statusline.
Unknown plan caps are NOT turned into fabricated usage percentages.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
from pathlib import Path
from typing import Any


def read_json(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8-sig"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def num_percent(value: Any) -> float | None:
    try:
        n = float(value)
        return round(n, 2) if 0 <= n <= 100 else None
    except (ValueError, TypeError):
        return None


def find_codex_rate_limits(home: Path) -> tuple[dict[str, Any], str]:
    roots = [home / ".codex" / "sessions", home / ".codex" / "archived_sessions"]
    candidates: list[Path] = []
    for root in roots:
        if root.exists():
            candidates.extend(root.rglob("*.jsonl"))
    candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    # Bounded scan; parse only rate-limit event envelopes, never text content.
    for path in candidates[:30]:
        try:
            with path.open("r", encoding="utf-8", errors="replace") as file:
                for line in reversed(file.readlines()[-4000:]):
                    if '"rate_limits"' not in line or '"token_count"' not in line:
                        continue
                    envelope = json.loads(line)
                    payload = envelope.get("payload") or {}
                    if payload.get("type") != "token_count":
                        continue
                    rate = payload.get("rate_limits")
                    if isinstance(rate, dict) and isinstance(rate.get("primary"), dict):
                        return rate, str(envelope.get("timestamp") or "")
        except (OSError, ValueError):
            continue
    return {}, ""


def merge_observations(catalog: dict[str, Any], home: Path) -> dict[str, Any]:
    quotas = catalog.get("quotas")
    if not isinstance(quotas, list):
        return catalog
    by_name = {q.get("provider"): q for q in quotas if isinstance(q, dict)}
    rate, timestamp = find_codex_rate_limits(home)
    if rate and "Codex CLI" in by_name:
        primary = num_percent((rate.get("primary") or {}).get("used_percent"))
        secondary = num_percent((rate.get("secondary") or {}).get("used_percent"))
        q = by_name["Codex CLI"]
        if primary is not None:
            q.update(usedPercent=primary, remainingPercent=round(100-primary, 2),
                     windowLabel="5時間", quality="measured",
                     evidence=f"Codex token_count ({timestamp or 'timestamp missing'})")
        if secondary is not None:
            q["weeklyUsedPercent"] = secondary
        reset_at = (rate.get("primary") or {}).get("resets_at")
        if isinstance(reset_at, (int, float)):
            q["resetAt"] = dt.datetime.fromtimestamp(reset_at, dt.timezone.utc).isoformat()

    # Read only explicitly sanitized quota snapshots; no OAuth storage or cookies.
    claude = read_json(home / ".claude" / "usage-dashboard-statusline.json")
    claude_rate = claude.get("rate_limits") or {}
    five = (claude_rate.get("five_hour") or {}).get("used_percentage")
    weekly = (claude_rate.get("seven_day") or {}).get("used_percentage")
    if "Claude Code CLI" in by_name and num_percent(five) is not None:
        q = by_name["Claude Code CLI"]
        used = num_percent(five)
        q.update(usedPercent=used, remainingPercent=100-used, quality="measured",
                 windowLabel="5時間", evidence="sanitized Claude Code statusline")
        if num_percent(weekly) is not None:
            q["weeklyUsedPercent"] = num_percent(weekly)

    ag = read_json(home / ".gemini" / "antigravity-cli" / "quota-status.json")
    pools = ag.get("quota") or {}
    if isinstance(pools, dict) and "Gemini / Antigravity CLI" in by_name:
        fractions = [v.get("remaining_fraction") for v in pools.values() if isinstance(v, dict)]
        valid = [float(v) for v in fractions if isinstance(v, (float, int)) and 0 <= v <= 1]
        if valid:
            # The smallest remaining quota is the conservative limiting pool,
            # not an invented combined total across distinct quota pools.
            used = round((1-min(valid))*100, 2)
            by_name["Gemini / Antigravity CLI"].update(
                remainingPercent=round(100-used, 2), usedPercent=used, quality="measured",
                windowLabel="最も逼迫したモデル利用枠", evidence="Antigravity sanitized statusline quota")
    catalog["quotaStatus"] = "partial_measured"
    catalog["quotaCollectedAt"] = dt.datetime.now(dt.timezone.utc).isoformat()
    return catalog


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog", type=Path, required=True)
    parser.add_argument("--home", type=Path, default=Path.home())
    args = parser.parse_args()
    catalog = read_json(args.catalog)
    if not catalog:
        raise SystemExit("No valid catalog; preserve existing file")
    data = merge_observations(catalog, args.home)
    output = args.catalog.with_suffix(".pending")
    output.write_text(json.dumps(data, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    os.replace(output, args.catalog)
    print("Quota-only metadata updated. Unknown providers left unestimated.")


if __name__ == "__main__":
    main()
