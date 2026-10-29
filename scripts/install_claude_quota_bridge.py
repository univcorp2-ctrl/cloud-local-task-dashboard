#!/usr/bin/env python3
"""Safely install a read-only Claude statusline quota bridge; keep original command."""
from pathlib import Path
import datetime as dt, json, os, shutil, sys
home=Path.home()/'.claude'
settings=home/'settings.json'
bridge=Path(__file__).resolve().parent/'claude_quota_statusline_bridge.py'
original=home/'task-control-center-original-statusline.json'
if not settings.exists() or not bridge.exists():
    raise SystemExit('MISSING_ORIGINAL_OR_BRIDGE')
data=json.loads(settings.read_text(encoding='utf-8-sig'))
status=data.get('statusLine')
if not isinstance(status,dict) or status.get('type')!='command':
    raise SystemExit('STATUSLINE_NOT_COMMAND')
command=status.get('command')
if not isinstance(command,str) or not command.strip():
    raise SystemExit('ORIGINAL_STATUSLINE_EMPTY')
if 'claude_quota_statusline_bridge.py' in command:
    print('ALREADY_INSTALLED')
    sys.exit(0)
if original.exists():
    raise SystemExit('ORIGINAL_CONFIG_ALREADY_EXISTS_BUT_NOT_ACTIVE; abort to avoid overwrite')
backup=home/f'settings.backup.tcc-{dt.datetime.now().strftime("%Y%m%d-%H%M%S")}.json'
shutil.copy2(settings,backup)
original.write_text(json.dumps({'command':command},ensure_ascii=False),encoding='utf-8')
data['statusLine']['command']='python -u "'+str(bridge)+'"'
temp=settings.with_suffix('.tcc-tmp')
temp.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
try:
    json.loads(temp.read_text(encoding='utf-8'))
    os.replace(temp,settings)
except Exception:
    if temp.exists(): temp.unlink()
    shutil.copy2(backup,settings)
    original.unlink(missing_ok=True)
    raise
verify=json.loads(settings.read_text(encoding='utf-8'))
if verify['statusLine']['command']!=data['statusLine']['command']:
    shutil.copy2(backup,settings)
    raise SystemExit('INSTALL_VERIFY_FAILED_AND_RESTORED')
print('STATUSLINE_BRIDGE_INSTALLED / original statusLine retained in private config; backup available')
