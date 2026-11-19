"""Aggregate sanitized per-run usage; no provider API or credentials are read.

Input JSONL: provider/process/run_id/at/tokens. Use increment records, never cumulative
session totals. Calibration requires a complete same-provider, same-week denominator.
Default dry-run. --apply --confirm writes only the explicit local output file.
"""
import argparse
import datetime as dt
import json
import math
from pathlib import Path

JST = dt.timezone(dt.timedelta(hours=9))
def stamp(value):
    t = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    return t if t.tzinfo else t.replace(tzinfo=JST)

def summarize(events, week_start, calibration):
    start = stamp(week_start); end = start + dt.timedelta(days=7)
    seen = {}; groups = {}
    for e in events:
        tokens = e['tokens']
        if isinstance(tokens, bool) or not isinstance(tokens, (int, float)) or not math.isfinite(tokens) or tokens < 0:
            raise ValueError('invalid token increment')
        at = stamp(e['at'])
        if not start <= at < end: continue
        key = (e['provider'], e['run_id'])
        signature = (e['process'], tokens, at)
        if key in seen:
            if seen[key] != signature: raise ValueError('conflicting run_id')
            continue
        seen[key] = signature
        group = (e['provider'], e['process'])
        groups[group] = groups.get(group, 0) + tokens
    totals = {}
    for (provider, _), tokens in groups.items(): totals[provider] = totals.get(provider, 0) + tokens
    out = []
    for (provider, process), tokens in sorted(groups.items()):
        c = calibration.get(provider, {}); used = c.get('used_percent')
        if used is not None and (isinstance(used,bool) or not isinstance(used,(int,float)) or not math.isfinite(used) or not 0 <= used <= 100):
            raise ValueError('invalid usage percentage')
        share = tokens / totals[provider] * 100 if totals[provider] else None
        quota = share * used / 100 if share is not None and used is not None and c.get('coverage_complete') is True else None
        out.append(dict(provider=provider, process=process, tokens=tokens, share_percent=share,
                        quota_percent=quota, quality='estimated', week_start=start.isoformat()))
    return out

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--events',type=Path,required=True);p.add_argument('--week-start',required=True)
    p.add_argument('--calibration',type=Path);p.add_argument('--output',type=Path)
    p.add_argument('--dry-run',action='store_true');p.add_argument('--apply',action='store_true');p.add_argument('--confirm',action='store_true')
    a=p.parse_args()
    if a.apply and (not a.confirm or not a.output or a.dry_run):p.error('--apply requires --confirm --output and no --dry-run')
    events=[json.loads(line) for line in a.events.read_text(encoding='utf-8-sig').splitlines() if line.strip()]
    c=json.loads(a.calibration.read_text(encoding='utf-8-sig')) if a.calibration else {}
    result=json.dumps(summarize(events,a.week_start,c),ensure_ascii=False,indent=2)
    if a.apply:a.output.write_text(result+'\n',encoding='utf-8')
    else:print(result)
if __name__=='__main__':main()
