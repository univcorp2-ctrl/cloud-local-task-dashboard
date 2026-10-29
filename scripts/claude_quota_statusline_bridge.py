#!/usr/bin/env python3
"""Claude Code statusLine bridge: preserve the existing status line and capture only
provider-supplied 5h/7d quota percentages. No network, tokens or prompts stored.
"""
from __future__ import annotations
import datetime as dt
import json
import math
import os
from pathlib import Path
import subprocess
import sys

HOME=Path.home()/'.claude'
ORIGINAL=HOME/'task-control-center-original-statusline.json'
SNAPSHOT=HOME/'usage-dashboard-statusline.json'
def clean_window(value):
    if not isinstance(value,dict):
        return None
    n=value.get('used_percentage')
    if not isinstance(n,(int,float)) or isinstance(n,bool) or not math.isfinite(n) or not 0<=n<=100:
        return None
    result={'used_percentage':round(float(n),2)}
    reset=value.get('resets_at')
    if isinstance(reset,(int,float,str)) and not isinstance(reset,bool):
        result['resets_at']=reset
    return result
def projection(raw):
    try:
        document=json.loads(raw)
    except (ValueError,TypeError):
        return None
    if not isinstance(document,dict):
        return None
    limits=document.get('rate_limits')
    if not isinstance(limits,dict):
        return None
    windows={}
    for label in ('five_hour','seven_day'):
        validated=clean_window(limits.get(label))
        if validated is not None:
            windows[label]=validated
    if not windows:
        return None
    return {'observedAt':dt.datetime.now(dt.timezone.utc).isoformat(),
            'rate_limits':windows}
def save_snapshot(snapshot):
    HOME.mkdir(exist_ok=True)
    tmp=SNAPSHOT.with_suffix('.pending')
    tmp.write_text(json.dumps(snapshot,ensure_ascii=False)+'\n',encoding='utf-8')
    os.replace(tmp,SNAPSHOT)
def run():
    raw=sys.stdin.buffer.read(1_048_576)
    sanitized=projection(raw)
    if sanitized is not None:
        try: save_snapshot(sanitized)
        except OSError: pass
    try:
        old=json.loads(ORIGINAL.read_text(encoding='utf-8')).get('command')
        if isinstance(old,str) and 'claude_quota_statusline_bridge.py' not in old and old.strip():
            proc=subprocess.run(old,input=raw,shell=True,stdout=subprocess.PIPE,
                                stderr=subprocess.DEVNULL,timeout=9)
            if proc.stdout: sys.stdout.buffer.write(proc.stdout[:100_000])
    except (OSError,ValueError,subprocess.TimeoutExpired):
        pass
if __name__=='__main__':
    if '--self-test' in sys.argv:
        sample={'rate_limits':{'five_hour':{'used_percentage':35,'resets_at':123},
                               'seven_day':{'used_percentage':12}}}
        assert projection(json.dumps(sample))['rate_limits']['five_hour']['used_percentage']==35
        assert projection('{}') is None
        assert projection(json.dumps({'rate_limits':{'five_hour':{'used_percentage':-10}}})) is None
        print('SELF_TEST_PASS: only sanitized provider quota fields kept; no file touched')
    else: run()
