#!/usr/bin/env python3
"""Quota-only local telemetry: Codex logs, sanitized Claude JSON, AG SQLite.

No credentials, OAuth calls, conversations, or system configuration are exported.
"""
from __future__ import annotations

import argparse
from collections import deque
from contextlib import closing
import datetime as dt
import json
import math
import os
from pathlib import Path
import sqlite3
from typing import Any

UTC = dt.timezone.utc
STALE_SECONDS = 30 * 60
CATEGORIES = ('Gemini Pro', 'Claude/GPT', 'Gemini', 'Other')


def obj(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def read_json(path: Path) -> dict[str, Any]:
    try:
        return obj(json.loads(path.read_text(encoding='utf-8-sig')))
    except (OSError, ValueError):
        return {}


def num_percent(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    try:
        n = float(value)
        return round(n, 2) if math.isfinite(n) and 0 <= n <= 100 else None
    except (ValueError, TypeError, OverflowError):
        return None


def parse_time(value: Any) -> dt.datetime | None:
    try:
        if isinstance(value, bool) or value is None:
            return None
        if isinstance(value, (int, float)):
            # Extension timestamps may be JS milliseconds; Codex uses epoch seconds.
            value = value / 1000 if abs(value) >= 100_000_000_000 else value
            return dt.datetime.fromtimestamp(value, UTC)
        parsed = dt.datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        return parsed.astimezone(UTC) if parsed.tzinfo else None
    except (ValueError, TypeError, OverflowError, OSError):
        return None


def iso(value: Any) -> str | None:
    parsed = parse_time(value)
    return parsed.isoformat() if parsed else None


def quality(timestamp: Any, now: dt.datetime) -> str:
    observed = parse_time(timestamp)
    if observed is None or observed > now + dt.timedelta(minutes=5):
        return 'unavailable'
    return 'stale' if (now - observed).total_seconds() > STALE_SECONDS else 'measured'


def find_codex_rate_limits(home: Path) -> tuple[dict[str, Any], str]:
    candidates: list[tuple[float, Path]] = []
    for root in (home / '.codex/sessions', home / '.codex/archived_sessions'):
        try:
            for path in root.rglob('*.jsonl'):
                try:
                    candidates.append((path.stat().st_mtime, path))
                except OSError:
                    continue
        except OSError:
            continue
    latest: tuple[dt.datetime, dict[str, Any], str] | None = None
    for _, path in sorted(candidates, key=lambda pair: pair[0], reverse=True)[:30]:
        try:
            with path.open(encoding='utf-8', errors='replace') as file:
                lines = deque(file, maxlen=4000)
            for line in lines:
                if '"rate_limits"' not in line or '"token_count"' not in line:
                    continue
                try:
                    envelope = obj(json.loads(line))
                except ValueError:
                    continue
                payload = obj(envelope.get('payload'))
                rate = obj(payload.get('rate_limits'))
                timestamp = parse_time(envelope.get('timestamp'))
                if payload.get('type') != 'token_count' or not rate or timestamp is None:
                    continue
                # Never substitute an additional model-specific Codex pool.
                if rate.get('limit_id') not in (None, 'codex'):
                    continue
                if latest is None or timestamp > latest[0]:
                    latest = timestamp, rate, timestamp.isoformat()
        except OSError:
            continue
    return (latest[1], latest[2]) if latest else ({}, '')


def read_ag_pools(path: Path, now: dt.datetime) -> list[dict[str, Any]]:
    try:
        # mode=ro prevents accidental database creation or mutation. Close on Windows.
        with closing(sqlite3.connect(path.resolve().as_uri() + '?mode=ro', uri=True, timeout=1)) as conn:
            row = conn.execute('SELECT value FROM ItemTable WHERE key = ?', ('crsx.ag-usage',)).fetchone()
        history = obj(json.loads(row[0])).get('quotaHistory') if row else None
    except (OSError, sqlite3.Error, ValueError, TypeError):
        return []
    if not isinstance(history, list):
        return []
    latest: dict[str, dict[str, Any]] = {}
    for raw in history:
        record = obj(raw)
        category = record.get('category')
        timestamp = parse_time(record.get('timestamp'))
        if not isinstance(category, str) or category not in CATEGORIES or timestamp is None:
            continue
        previous = latest.get(category)
        if previous is None or timestamp > parse_time(previous['timestamp']):
            latest[category] = record
    pools = []
    for category in CATEGORIES:
        if category not in latest:
            continue
        record = latest[category]
        fraction = record.get('currentQuota')
        if isinstance(fraction, bool) or not isinstance(fraction, (int, float)) or not 0 <= fraction <= 1:
            continue
        state = quality(record.get('timestamp'), now)
        if state == 'unavailable':
            continue
        pools.append(dict(category=category, usedPercent=round((1 - fraction) * 100, 2),
                          observedAt=iso(record['timestamp']), resetAt=iso(record.get('resetTime')),
                          quality=state))
    return pools


def set_windows(q: dict[str, Any], primary: Any, weekly: Any, timestamp: Any,
                reset: Any, weekly_reset: Any, now: dt.datetime, evidence: str) -> None:
    used, week = num_percent(primary), num_percent(weekly)
    state = quality(timestamp, now)
    if state == 'unavailable' or (used is None and week is None):
        return
    q.update(usedPercent=used, remainingPercent=round(100-used, 2) if used is not None else None,
             weeklyUsedPercent=week, resetAt=iso(reset), weeklyResetAt=iso(weekly_reset),
             observedAt=iso(timestamp), windowLabel='5時間', quality=state, evidence=evidence)


def merge_observations(catalog: dict[str, Any], home: Path, *, appdata: Path | None = None,
                       now: dt.datetime | None = None, ag_db: Path | None = None) -> dict[str, Any]:
    now = now or dt.datetime.now(UTC)
    quotas = catalog.get('quotas')
    if not isinstance(quotas, list):
        return catalog
    by_name = {q.get('provider'): q for q in quotas if isinstance(q, dict)}
    # Never leave cached measured values in place when a source disappears.
    for q in by_name.values():
        for key in ('model', 'windowLabel', 'modelPools'):
            q.pop(key, None)
        q.update(usedPercent=None, remainingPercent=None, weeklyUsedPercent=None,
                 resetAt=None, weeklyResetAt=None, observedAt=None, quality='unavailable',
                 evidence='利用枠の観測データなし')
    rate, timestamp = find_codex_rate_limits(home)
    if 'Codex CLI' in by_name:
        primary, secondary = obj(rate.get('primary')), obj(rate.get('secondary'))
        set_windows(by_name['Codex CLI'], primary.get('used_percent'), secondary.get('used_percent'),
                    timestamp, primary.get('resets_at'), secondary.get('resets_at'), now,
                    'Codex token_count rate_limits')
    # Explicit sanitized snapshot only. No credential store or network fallback.
    claude = read_json(home / '.claude/usage-dashboard-statusline.json')
    rates = obj(claude.get('rate_limits'))
    five, seven = obj(rates.get('five_hour')), obj(rates.get('seven_day'))
    if 'Claude Code CLI' in by_name:
        set_windows(by_name['Claude Code CLI'], five.get('used_percentage'), seven.get('used_percentage'),
                    claude.get('observedAt') or claude.get('timestamp'), five.get('resets_at'),
                    seven.get('resets_at'), now, 'sanitized Claude Code statusline')
    if ag_db is None:
        appdata = appdata or (Path(os.environ['APPDATA']) if os.environ.get('APPDATA') else home / 'AppData/Roaming')
        ag_db = appdata / 'Antigravity/User/globalStorage/state.vscdb'
    pools = read_ag_pools(ag_db, now)
    if pools and 'Gemini / Antigravity CLI' in by_name:
        limiting = max(pools, key=lambda p: p['usedPercent'])
        # All category snapshots participate; an old pool makes the summary stale.
        state = 'stale' if any(p['quality'] == 'stale' for p in pools) else 'measured'
        by_name['Gemini / Antigravity CLI'].update(
            usedPercent=limiting['usedPercent'], remainingPercent=round(100-limiting['usedPercent'], 2),
            resetAt=limiting['resetAt'], observedAt=min(p['observedAt'] for p in pools),
            quality=state, model=limiting['category'], modelPools=pools,
            windowLabel='モデル別', evidence='Antigravity crsx.ag-usage quotaHistory (read-only)')
    # Muse has no verified quota source in this environment. Its optional
    # sanitized local usage snapshot can be provided by an authorized agent.
    # No token credentials, browser profile, or prompt content is read.
    muse = read_json(home / '.muse/usage-dashboard-quota.json')
    if 'Muse' not in by_name:
        if isinstance(quotas, list):
            entry = {'provider':'Muse', 'quality':'unavailable', 'evidence':'Museの検証済み使用枠ソース未接続', 'remainingPercent':None, 'usedPercent':None, 'weeklyUsedPercent':None, 'resetAt':None, 'observedAt':None}
            quotas.append(entry)
            by_name['Muse'] = entry
    if 'Muse' in by_name:
        q = by_name['Muse']
        observed = muse.get('observedAt')
        quota_state = quality(observed, now)
        remaining = num_percent(muse.get('remainingPercent'))
        if remaining is not None and quota_state != 'unavailable':
            q.update(usedPercent=round(100-remaining,2),remainingPercent=remaining,
                     observedAt=iso(observed),resetAt=iso(muse.get('resetAt')),
                     quality=quota_state,windowLabel='provider-reported',
                     evidence='sanitized Muse local quota snapshot (provided by authorized agent)')
    states = {q['quality'] for q in by_name.values()}
    catalog['quotaStatus'] = 'partial_measured' if 'measured' in states else 'stale' if 'stale' in states else 'unavailable'
    catalog['quotaCollectedAt'] = now.isoformat()
    return catalog


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--catalog', type=Path, required=True)
    parser.add_argument('--home', type=Path, default=Path.home())
    parser.add_argument('--appdata', type=Path)
    args = parser.parse_args()
    catalog = read_json(args.catalog)
    if not catalog:
        raise SystemExit('No valid catalog; preserve existing file')
    data = merge_observations(catalog, args.home, appdata=args.appdata)
    output = args.catalog.with_suffix('.pending')
    output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    os.replace(output, args.catalog)
    print('Quota-only metadata updated; unavailable or stale sources marked explicitly.')


if __name__ == '__main__':
    main()
