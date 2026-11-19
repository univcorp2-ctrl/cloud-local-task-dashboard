"""Sanitize local usage increments without exporting prompts or credentials.

Codex cumulative counters become increments; Claude Code message IDs deduplicate
streamed snapshots. Cloud-hosted Claude/Muse logs remain UNKNOWN when absent.
"""
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import sys
from background_usage import stamp, summarize

def logfiles(root):
    # Native Windows paths can exceed MAX_PATH in Claude scratch projects.
    root=str(root.resolve())
    if os.name=='nt' and not root.startswith('\\\\?\\'):root='\\\\?\\'+root
    for folder,_,names in os.walk(root):
        for name in names:
            if name.endswith('.jsonl'):yield Path(folder)/name

def loglines(path):
    with path.open(encoding='utf-8',errors='replace') as stream:
        yield from stream

def codex_events(home, start, end):
    out=[]
    for path in logfiles(home/'.codex/sessions'):
        try:
            if path.stat().st_mtime<start.timestamp():continue
        except OSError:continue
        session=None;origin=None;previous=0;seen={}
        try:
            for line in loglines(path):
                try:e=json.loads(line)
                except ValueError:continue
                p=e.get('payload') or {}
                if e.get('type')=='session_meta':session=p.get('id');origin=p.get('originator')
                if e.get('type')!='event_msg' or p.get('type')!='token_count':continue
                total=((p.get('info') or {}).get('total_token_usage') or {}).get('total_tokens')
                if not isinstance(total,int) or total<0 or not e.get('timestamp'):continue
                at=stamp(e['timestamp']);old=previous;previous=total
                if total<old:continue
                if not session or not start<=at<end:continue
                identity=e['timestamp']+':'+str(total)
                if identity in seen:continue
                seen[identity]=True
                out.append(dict(provider='codex',process='codex-session:'+session,run_id=session+':'+identity,
                  at=at.isoformat(),tokens=total-old,origin=origin))
        except OSError:continue
    return out

def claude_events(home,start,end):
    messages={}
    for path in logfiles(home/'.claude/projects'):
        try:
            if path.stat().st_mtime<start.timestamp():continue
        except OSError:continue
        try:
            for line in loglines(path):
                try:e=json.loads(line)
                except ValueError:continue
                m=e.get('message') or {};u=m.get('usage');mid=m.get('id');sid=e.get('sessionId')
                if e.get('type')!='assistant' or not u or not mid or not sid or not e.get('timestamp'):continue
                at=stamp(e['timestamp'])
                if not start<=at<end:continue
                counts=[u.get(k,0) for k in ('input_tokens','output_tokens','cache_creation_input_tokens','cache_read_input_tokens')]
                if not all(isinstance(n,int) and n>=0 for n in counts):continue
                # Streaming message snapshots can grow: keep the maximum, do not add copies.
                key=(sid,mid);total=sum(counts)
                if key not in messages or messages[key]['tokens']<total:
                    messages[key]=dict(provider='claude-code',process='claude-session:'+sid,run_id=sid+':'+mid,at=at.isoformat(),tokens=total)
        except OSError:continue
    return list(messages.values())

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--home',type=Path,default=Path.home());p.add_argument('--week-start',required=True)
    a=p.parse_args();start=stamp(a.week_start);end=min(start+dt.timedelta(days=7),dt.datetime.now(dt.timezone.utc))
    events=codex_events(a.home,start,end)+claude_events(a.home,start,end)
    json.dump({'weekStart':start.isoformat(),'observedAt':end.isoformat(),'rows':summarize(events,a.week_start,{}),'eventCount':len(events)},sys.stdout,ensure_ascii=True)
