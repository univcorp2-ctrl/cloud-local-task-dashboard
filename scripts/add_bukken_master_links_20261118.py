"""Add validated, login-gated property master/document entry points, idempotently."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
ts=ROOT/"src"/"appLinks.ts"
old=ts.read_text(encoding="utf8")
anchor="export const dashboardAppLinks: DashboardAppLink[] = ["
assert anchor in old
snippet="""  { id: 'property-today', label: '今日のおすすめ物件（Notion）', category: '不動産', url: 'https://app.notion.com/p/41210562e58b815cabe2fcdc5db513d1', description: '毎朝の厳選候補。Notionログインが必要な場合があります' },
  { id: 'property-master-notion', label: '統一物件マスターDB（正本台帳）', category: '不動産', url: 'https://app.notion.com/p/25c2ceb7d2d640f0aceefa790d9ee161', description: '全AI共通の物件正本。価格・判断・進捗・資料リンクを確認' },
  { id: 'property-documents-drive', label: '仕入れ候補の物件資料（Drive）', category: '不動産', url: 'https://drive.google.com/drive/folders/1sPPYbCMAtTQPk1rSye5PEsRjRxag68_b', description: '販売図面・登記・レントロール等の原本。Googleログインが必要な場合があります' },
"""
if "id: 'property-master-notion'" not in old:ts.write_text(old.replace(anchor,anchor+"\n"+snippet,1),encoding="utf8")
p=ROOT/"public"/"data"/"dashboard-links.json"
j=json.loads(p.read_text(encoding="utf8"))
urls=[
 ("property-today","今日のおすすめ物件（Notion）","https://app.notion.com/p/41210562e58b815cabe2fcdc5db513d1","毎朝のおすすめ候補。Notionログインが必要な場合あり"),
 ("property-master-notion","統一物件マスターDB（正本台帳）","https://app.notion.com/p/25c2ceb7d2d640f0aceefa790d9ee161","物件の価格・判断・進捗・個別Driveリンクの正本。Notionログインが必要な場合あり"),
 ("property-documents-drive","仕入れ候補の物件資料（Drive）","https://drive.google.com/drive/folders/1sPPYbCMAtTQPk1rSye5PEsRjRxag68_b","販売図面・登記・レントロールなど原本。Googleログインが必要な場合あり")]
new=[dict(id=i,name=n,category="不動産",url=u,status="login",note=note) for i,n,u,note in urls if not any(x.get("id")==i for x in j["links"])]
j["links"]=new+j["links"]
if new:p.write_text(json.dumps(j,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
print("TCC_NEW_LINKS",len(new),[x["id"] for x in new])
assert "id: 'property-master-notion'" in ts.read_text(encoding="utf8")
assert all(any(q.get("id")==i for q in j["links"]) for i,_,_,_ in urls)
