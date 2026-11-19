"""Read-only Worker/Cron inventory. Reuse Wrangler auth in memory; never print it."""
import argparse
import concurrent.futures
import datetime as dt
import json
import os
from pathlib import Path
import sys
import tomllib
import urllib.request
import urllib.parse

def collect(account):
    candidates=[Path.home()/'.wrangler/config/default.toml',Path(os.environ.get('APPDATA',''))/'xdg.config/.wrangler/config/default.toml']
    token=os.environ.get('CLOUDFLARE_API_TOKEN')
    if not token:
        for path in candidates:
            if path.is_file():
                token=tomllib.loads(path.read_text(encoding='utf-8')).get('oauth_token')
                if token:break
    if not token:return {'ok':False,'error':'existing_auth_unavailable','items':[]}
    def get(path):
        req=urllib.request.Request('https://api.cloudflare.com/client/v4/accounts/'+account+path,headers={'Authorization':'Bearer '+token})
        with urllib.request.urlopen(req,timeout=25) as response:data=json.load(response)
        if not data.get('success'):raise ValueError('api_failed')
        return data['result']
    try:scripts=get('/workers/scripts')
    except Exception:return {'ok':False,'error':'workers_list_unavailable','items':[]}
    def one(script):
        name=script['id'];crons=None
        try:crons=[s['cron'] for s in get('/workers/scripts/'+urllib.parse.quote(name,safe='')+'/schedules')['schedules']]
        except Exception:pass
        return dict(id=name,name=name,schedule='UTC cron: '+' / '.join(crons) if crons else 'HTTP/イベント駆動' if crons==[] else '未取得',
          crons=crons,lastRun=None,nextRun=None,result='実行履歴UNKNOWN（配置・トリガーのみ確認）')
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:items=list(pool.map(one,scripts))
    return {'ok':True,'observedAt':dt.datetime.now(dt.timezone.utc).isoformat(),'items':items}
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--account',required=True);a=p.parse_args()
    json.dump(collect(a.account),sys.stdout,ensure_ascii=True)
