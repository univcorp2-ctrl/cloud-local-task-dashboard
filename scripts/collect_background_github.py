"""Read-only workflow inventory through existing gh authentication; windowless children.

Output is private operational metadata. No run logs, secrets, environment or YAML
contents are persisted. Failed sources are reported explicitly.
"""
import base64
import concurrent.futures
import datetime as dt
import json
import re
import subprocess
import sys

FLAGS=getattr(subprocess,'CREATE_NO_WINDOW',0)
def gh(*args):
    r=subprocess.run(['gh',*args],capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=50,creationflags=FLAGS)
    if r.returncode:raise RuntimeError('github_read_failed')
    return json.loads(r.stdout)
def collect(repo):
    name=repo['name'];out=[]
    try:
        pages=gh('api',f'repos/univcorp2-ctrl/{name}/actions/workflows?per_page=100','--paginate','--slurp')
        runs=gh('api',f'repos/univcorp2-ctrl/{name}/actions/runs?per_page=100').get('workflow_runs',[])
        for w in [w for p in pages for w in p.get('workflows',[])]:
            latest=next((r for r in runs if r['workflow_id']==w['id']),None)
            crons=[];schedule_quality='unavailable'
            try:
                content=gh('api',f'repos/univcorp2-ctrl/{name}/contents/'+w['path'])
                yaml=base64.b64decode(content['content']).decode('utf-8')
                crons=re.findall(r'^\s*-?\s*cron:\s*[\'\"]([^\'\"]+)[\'\"]',yaml,re.M)
                schedule_quality='configured'
            except (RuntimeError,KeyError,ValueError):pass
            out.append(dict(repo=name,id=str(w['id']),name=w['name'],url=w['html_url'],path=w['path'],state=w['state'],
              schedule='UTC cron: '+' / '.join(crons) if crons else '随時/イベント駆動' if schedule_quality=='configured' else '未取得',
              lastRun=latest.get('run_started_at') if latest else None,result=latest.get('conclusion') or latest.get('status') if latest else 'UNKNOWN',
              evidence=latest.get('html_url') if latest else None,nextRun=None))
        return {'repo':name,'ok':True,'items':out}
    except Exception:return {'repo':name,'ok':False,'error':'github_read_failed','items':out}
def main():
    repos=gh('repo','list','univcorp2-ctrl','--limit','500','--json','name,isArchived')
    active=[r for r in repos if not r['isArchived']]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:results=list(pool.map(collect,active))
    json.dump({'observedAt':dt.datetime.now(dt.timezone.utc).isoformat(),'repositories':len(active),'sources':results},sys.stdout,ensure_ascii=True)
if __name__=='__main__':main()
