"""Build a private Notion upsert plan from sanitized existing TCC/native snapshots.

No network or writes by default. Never put output in public/ or commit snapshots.
"""
import argparse
import datetime as dt
import json
from pathlib import Path

def plan(state, windows, existing, now):
    stamp=now.isoformat(); rows={}; updates=[]
    def add(key, title, executor, schedule, status, last, next_run, result, evidence):
        rows[key]={'処理名':title,'実行キー':key,'実行者':executor,'スケジュール':schedule or '未取得',
          '状態':status,'成果':result,'稼働確認':evidence,'計測品質':'未取得',
          'date:最終確認:start':stamp,'date:最終確認:is_datetime':1,
          'date:最終実行:start':last,'date:最終実行:is_datetime':1,
          'date:次回実行:start':next_run,'date:次回実行:is_datetime':1}
    for r in windows:
        key='windows:'+r['path']+r['name']; status='停止' if r['state']=='Disabled' else '要確認' if r['result'] not in (0,267009) else '稼働'
        add(key,r['name'],'PC（Windows タスク）','Windows Task Scheduler: '+(','.join(str(t) for t in r.get('triggers',[]) if t) or '頻度未取得'),status,
          r.get('lastRun'),None if status=='停止' else r.get('nextRun'),
          '実行中' if r['state']=='Running' else '終了コード '+str(r['result'])+'（業務成果は別途照合）',
          '実機Task Scheduler確認。プロセス起動/終了と成果を区別')
    for source in state.get('jobs',[]):
        if source['source'].startswith('windows:'):continue
        stale=source.get('observedAt') or source.get('updatedAt')
        for r in source.get('items',[]):
            key=source['source']+':'+r['id']; last=r.get('lastRunAt'); next_run=r.get('nextRunAt')
            old=not last or now-dt.datetime.fromisoformat(last.replace('Z','+00:00'))>dt.timedelta(days=2)
            status='停止' if not r.get('enabled',True) else '要確認' if old or r.get('status')=='failed' else '稼働'
            add(key,r['name'],'Claude定期タスク' if source['source']=='claude-cloud' else 'Muse',r.get('scheduleLabel') or r.get('schedule'),status,last,next_run,
              '取得元状態: '+str(r.get('status','UNKNOWN'))+'。業務成果UNKNOWN',
              'TCC既存ジョブ一覧。最終実行が古い/欠損のため稼働未確認' if old else 'TCC既存ジョブ一覧で照合（本人操作・送信は実行しない）')
    # Usage items stay explicitly in their original rolling window, never calendar-week totals.
    for source in state.get('usage',[]):
        provider=source['provider']; executor={'codex':'Codex','antigravity':'Antigravity','muse':'Muse','claude':'Claude定期タスク'}.get(provider)
        if not executor:continue
        for r in source.get('items',[]):
            if r.get('kind')=='surface':continue
            matching=next((k for k in rows if k.endswith(':'+str(r.get('key')))),None)
            if matching:
                row=rows[matching]
                row['計測品質']='未取得（既存推定はrolling7d。暦週と混在させない）'
            elif provider!='claude':
                key='usage:'+provider+':'+r['key']
                add(key,r.get('label') or r['key'],executor,'既存TCC usage集計（直近7日）','要確認',r.get('lastAt'),None,
                    'ログ集計: '+str(r.get('tokens'))+' tokens / quality='+str(r.get('quality'))+'。暦週別値は未取得',
                    '実行単位との対応・全件網羅性はUNKNOWN')
    existing_keys={r.get('実行キー'):r for r in existing if r.get('実行キー')}
    exact_locations={r.get('ID・場所'):r for r in existing if r.get('ID・場所') and '／' not in r['ID・場所']}
    creates=[];used=set()
    for key,props in rows.items():
        old=existing_keys.get(key) or exact_locations.get(key.split(':',1)[1])
        if old:
            updates.append({'page_id':old['url'].split('/')[-1],'command':'update_properties','properties':props});used.add(old['url'])
        else:creates.append({'properties':props})
    for old in existing:
        if old['url'] not in used and not old.get('実行キー'):
            updates.append({'page_id':old['url'].split('/')[-1],'command':'update_properties','properties':{
              '状態':'要確認','稼働確認':'旧集約行/未照合。個別実行キー行で確認。推測による稼働認定を解除。',
              '計測品質':'未取得','date:最終確認:start':stamp,'date:最終確認:is_datetime':1}})
    return {'creates':creates,'updates':updates,'coverage':{'windows':len(windows),'sources':[s['source'] for s in state.get('jobs',[])],'github':'UNKNOWN','cloudflare':'UNKNOWN'}}

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--state',type=Path,required=True);p.add_argument('--windows',type=Path,required=True);p.add_argument('--existing',type=Path,required=True)
    a=p.parse_args();read=lambda path:json.loads(path.read_text(encoding='utf-8-sig'))
    print(json.dumps(plan(read(a.state),read(a.windows),read(a.existing),dt.datetime.now(dt.timezone.utc)),ensure_ascii=True))
if __name__=='__main__':main()
