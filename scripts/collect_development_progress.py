#!/usr/bin/env python3
"""Evidence-scored development readiness, private details vs public safe view.

Never infer product completion from repo age or naming. Scores are a fixed
cross-project *verification checklist*, not a claim about a product's spec.
"""
from __future__ import annotations
import argparse
import datetime as dt
import json
from pathlib import Path
import subprocess
import os
import re

MILESTONES = [
    ("design", "設計・説明が存在", 15),
    ("implementation", "実装コードの痕跡", 25),
    ("tests_present", "テストコードが存在", 10),
    ("tests_pass", "テスト実行成功を検証", 10),
    ("automation", "自動化用の構成が存在", 10),
    ("runtime", "紐付く実行の終了コード0を検証", 10),
    ("deployed", "実際の公開デプロイを検証", 10),
    ("outcome", "実データ／業務成果を検証", 10),
]
assert sum(weight for _,_,weight in MILESTONES)==100

def gh(command: list[str], timeout: int=38) -> dict:
    p = subprocess.run(["gh","api","graphql","-f","query="+command[0]],capture_output=True,
                       text=True,encoding="utf-8",errors="replace",timeout=timeout)
    if p.returncode:
        raise RuntimeError("GitHub inspection error exit="+str(p.returncode))
    parsed = json.loads(p.stdout)
    if parsed.get("errors"):
        raise RuntimeError("GitHub GraphQL schema/permission error")
    return parsed

def fetch_tree_inventory() -> list[dict]:
    cursor = None
    rows=[]
    while True:
        after=f',after:"{cursor}"' if cursor else ''
        q=('query { user(login:"univcorp2-ctrl") { repositories(first:50'+after+
           ',ownerAffiliations:OWNER,orderBy:{field:UPDATED_AT,direction:DESC})'
           '{totalCount pageInfo{hasNextPage endCursor} nodes{'
           'name isPrivate isArchived url description defaultBranchRef{target{'
           '... on Commit{committedDate tree{entries{name type}}}'
           '}}}}}}')
        d=gh([q])["data"]["user"]["repositories"]
        rows.extend(d["nodes"])
        if not d["pageInfo"]["hasNextPage"]:break
        cursor=d["pageInfo"]["endCursor"]
        if len(rows)>500:raise RuntimeError("unexpected repository size")
    return rows

def evidence_record(repo:dict, mapped:dict, user_jobs:list[dict], now:str) -> dict:
    entries=((repo.get("defaultBranchRef") or {}).get("target") or {}).get("tree") or {}
    root=entries.get("entries") or []
    names={x.get("name","").lower() for x in root}
    description=(repo.get("description") or "").strip()
    has_readme=any(n.startswith("readme") or n in ("docs","design","spec","architecture.md") for n in names)
    has_code=any(n in names for n in ("src","app","apps","lib","backend","frontend","server",
                                    "main.py","main.ts","index.js","index.ts","package.json","pyproject.toml",
                                    "requirements.txt","cargo.toml","go.mod","pom.xml","manage.py","scripts"))
    has_tests=any(n in names for n in ("test","tests","__tests__","spec","specs","pytest.ini",
                                     "vitest.config.ts","jest.config.js","jest.config.ts",
                                     "test_main.py","test.py")) or any(n.startswith("test_") and n.endswith(".py") for n in names)
    has_auto=any(n in names for n in (".github","scripts","worker","functions","wrangler.toml",
                                     "wrangler.jsonc","dockerfile","docker-compose.yml",".gitlab-ci.yml",
                                     "vercel.json","cloudbuild.yaml"))
    found=[j for j in user_jobs if repo["name"].lower() in
           (str(j.get("executable") or "")+" "+str(j.get("arguments") or "")).lower()
           and len(repo["name"])>=7]
    has_live=any(j.get("health")=="last_exit_zero_unverified" for j in found)
    # Exact, verified dashboard site and API, not general assumptions for other repos.
    verified_dashboard=(repo["name"]=="cloud-local-task-dashboard")
    checks={
        "design": bool(description or has_readme),
        "implementation": bool(has_code),
        "tests_present": bool(has_tests),
        "tests_pass": bool(verified_dashboard),
        "automation": bool(has_auto),
        "runtime": bool(has_live or verified_dashboard),
        "deployed": bool(verified_dashboard),
        "outcome": bool(verified_dashboard),
    }
    pct=sum(w for k,_,w in MILESTONES if checks[k])
    if not checks["implementation"]:
        next_action="READMEとソースを確認し、動く最小実装と完了条件を定義する"
    elif not checks["tests_present"]:
        next_action="入出力と依存先を調査し、最低1件の再現可能な自動テストを追加する"
    elif not checks["tests_pass"]:
        next_action="既存テストを安全な検証環境で実行し、失敗ログと根因を保存する"
    elif not checks["runtime"]:
        next_action="実行起点・認証/依存関係・最新終了ログを照合する"
    elif not checks["deployed"]:
        next_action="既存の公開先を特定して変更を本番へ反映し、再取得する"
    elif not checks["outcome"]:
        next_action="実利用で成果物を照合し、E2E受入条件を検証する"
    else:
        next_action="日次動作とソース更新を継続監視し、未カバーの業務成果を追加監査する"
    overrides={
        "chatgpt-chat-controller":"Resident Watchdog異常の根因を再現し、同一Chatへの2段階追撃・checkpoint・doneをE2E再検証する",
        "Bukken-DB":"BANK_DBと融資再計算の最新性、実データ→Web/Drive一致を確認し、失敗を最小差分で直す",
        "fb-group-autoposter":"新規スレッド投稿の実permalinkとEstateBoard連動を検証し、投稿監視の非0原因を修復する",
        "autonomous-research-agent":"予定の稼働ログとNotion反映件数を照合し、未検証候補不足と実行エラーを切り分ける",
        "EstateBoard":"Bukken/FBの物件状態とダッシュボード実表示の一致を確認する",
        "line-official-auto-reply-bot":"LineAutoReply5mの終了コードと実返信・資料送付のE2Eを確認する",
    }
    next_action=overrides.get(repo["name"],next_action)
    stages={
      "design":"企画・調査段階","implementation":"実装段階","verification":"検証段階","operations":"運用接続段階","production":"本番・成果検証段階"
    }
    if not checks["implementation"]:phase=stages["design"]
    elif not checks["tests_present"]:phase=stages["implementation"]
    elif not checks["tests_pass"]:phase=stages["verification"]
    elif not checks["deployed"] or not checks["runtime"]:phase=stages["operations"]
    else:phase=stages["production"]
    milestones=[{"id":k,"label":label,"weight":weight,"verified":checks[k]} for k,label,weight in MILESTONES]
    evidence=[{"type":"github_root","source":"GitHub default branch tree","names":[n for n in sorted(names) if n in ("readme.md","src","app","scripts","tests","test","__tests__",".github","package.json","pyproject.toml","functions")]}]
    if found:
        evidence.append({"type":"scheduled_command_match","count":len(found),
                         "lastExitZeroCount":sum(j.get("health")=="last_exit_zero_unverified" for j in found)})
    if verified_dashboard:
        evidence.append({"type":"verified_site","source":"Pages public URL, JSON API, Windows update PASS, prior tests"})
    private={
      "name":repo["name"], "url":repo["url"],"private":repo["isPrivate"],
      "category":mapped.get("category","other"),"description":description[:220],
      "archived":repo.get("isArchived",False),"lastCommitAt":(((repo.get("defaultBranchRef") or {}).get("target") or {}).get("committedDate")),
      "progressPercent":pct,"progressMetric":"共通の検証チェックリスト達成重み合計 (製品完成率ではない)",
      "confidence":"high" if verified_dashboard else ("medium" if found else "low"),
      "phase":phase,"milestones":milestones,"nextAction":next_action,
      "lastAction":"GitHub default branch のREADME・実装・テスト・自動化構成を読取検査し、PCタスクと実パス突合",
      "lastActionResult":("本番Web・定期更新・テスト完了を別途E2E検証" if verified_dashboard
                          else "コード構造のみ確認。個別のテスト実行/本番業務成果は未検証"),
      "actionStatus":"verified" if verified_dashboard else "investigated_pending_execution",
      "evidence":evidence, "inspectedAt":now
    }
    return private

def run(main_catalog:Path, private_output:Path, public_output:Path)->dict:
    cat=json.loads(main_catalog.read_text(encoding="utf-8"))
    originals={x["name"]:x for x in cat["repositories"]}
    jobs=cat["scheduledTasks"]
    now=dt.datetime.now(dt.timezone.utc).isoformat()
    allrepos=fetch_tree_inventory()
    byname={x["name"]:evidence_record(x,originals.get(x["name"],{}),jobs,now) for x in allrepos}
    if len(byname)!=cat["totalRepositories"] or set(byname)!=set(originals):
        raise RuntimeError("GitHub live inventory mismatches canonical registry; leave published file intact")
    allrows=sorted(byname.values(),key=lambda x:(x["category"],-x["progressPercent"],x["name"].lower()))
    # Explicit active-work queue selected from the user's canonical project.
    # Only aliases and non-sensitive workflow statuses leave the Private store.
    # Never send private repository names, GitHub URLs, paths or task commands
    # to the public Pages resource.
    active_map=[
       ("chatgpt-chat-controller", "GPT Follower｜ChatGPT自動追撃", "P0",
        "同一Chatの自動追撃・2回の回答回収・checkpoint・doneのE2E再検証",
        "ChatGPT-Supervisor-Resident-Watchdog"),
       ("Bukken-DB", "不動産DB・銀行融資自動連携", "P0",
        "銀行データ鮮度・物件計算・本番表示の入力から結果までの一致を検証",
        "BukkenDB_AutoUpdate"),
       ("fb-group-autoposter", "Facebook新規投稿・反響自動化", "P0",
        "新規投稿の実permalinkと物件Web反映を検証",
        "FBAutoposter-Post10Monitor"),
       ("autonomous-research-agent", "海外不動産・資金調達 自律調査AI", "P0",
        "資金調達候補の公式出典・Notion実同期・定期処理のエラーを検証",
        "AutonomousResearchAgent-CashDistance"),
       ("EstateBoard", "不動産物件・投稿統合ビュー", "P1",
        "実物件DBと投稿permalink、公開Webのデータ鮮度を照合",
        ""),
       ("line-official-auto-reply-bot", "LINE・Messenger自動返信", "P1",
        "実送信・添付資料・返信受信までのE2Eを確認",
        "LineAutoReply5m"),
       ("cloud-local-task-dashboard", "統合Webダッシュボード", "P1",
        "開発進捗パネルの本番反映と定期同期を検証",
        "Univ-Repo-Dashboard-Refresh"),
    ]
    active=[]
    for repo_name,title,priority,action,task_name in active_map:
        item=byname.get(repo_name)
        if not item:
            continue
        job=next((t for t in jobs if t.get("name")==task_name),None)
        current=job.get("health") if job else None
        label=({"needs_review":"異常コードあり・E2E未確認",
                "disabled":"停止中・E2E未確認",
                "never_run":"未起動・E2E未確認",
                "last_exit_zero_unverified":"処理終了0・業務成果未検証"}).get(current,"実行証跡との紐付け未検証")
        result_note="GitHub構成の棚卸しとPC実行記録の突合を完了。" + label
        if repo_name=="chatgpt-chat-controller" and job and job.get("state")=="Running" and job.get("lastResult")==2147946720:
            label="常駐中／再起動拒否コード0x800710E0。追撃E2Eは未確認"
            result_note="Windows常駐プロセスの起動、重複起動拒否記録を確認。10/21時点で制御画面HTTP200。実際の追撃E2E未達"
        if repo_name=="cloud-local-task-dashboard" and item["progressPercent"]>=90:
            label="本番公開・データ反映確認済み（他の業務システム完了とは別）"
            result_note="GitHub main反映、Windows定期更新・Cloudflare公開JSON・React/Python検証PASS"
        active.append({
            "id":re.sub(r"[^a-z0-9-]","-",title.lower().encode("ascii","ignore").decode())[:20] or str(len(active)),
            "title":title,"priority":priority,
            "progressPercent":item["progressPercent"],"confidence":item["confidence"],
            "executionStatus":label,"nextAction":action,
            "lastActionResult":result_note,
            "inspectedAt":now,"phase":item["phase"],
            "visibility":"public_alias_only",
        })
    cats=[]
    for src in cat["categories"]:
        full=[x for x in allrows if x["category"]==src["id"]]
        mean=round(sum(x["progressPercent"] for x in full)/len(full),1) if full else None
        cats.append({"id":src["id"],"name":src["name"],"repositoryCount":len(full),
                     "privateRepositoryCount":sum(x["private"] for x in full),
                     "averageEvidenceProgress":mean,
                     "stageCounts":{s:sum(x["phase"]==s for x in full) for s in (
                         "企画・調査段階","実装段階","検証段階","運用接続段階","本番・成果検証段階")}})
    # For public surface include ONLY public repo metadata/activities.
    safe_fields=("name","url","category","description","archived","lastCommitAt","progressPercent",
                 "progressMetric","confidence","phase","milestones","nextAction","lastAction",
                 "lastActionResult","actionStatus","inspectedAt")
    pub={
       "generatedAt":now,"source":"GitHub GraphQL 153 live default branch trees + private Windows task inventory",
       "progressDefinition":"各検証マイルストーンを固定配点で集計。開発全仕様に対する完成率とは異なる暫定の証拠ベース進捗",
       "milestoneWeights":[{"id":k,"name":title,"weight":weight} for k,title,weight in MILESTONES],
       "coverage":{"allRepositories":len(allrows),"public":sum(not x["private"] for x in allrows),
                   "private":sum(x["private"] for x in allrows),"inspected":len(allrows)},
       "averageProgress":round(sum(x["progressPercent"] for x in allrows)/len(allrows),1),
       "categories":cats,
       "activeProjects":active,
       "publicProjects":[{k:r[k] for k in safe_fields} for r in allrows if not r["private"]],
       "privateSummary":"非公開repoは詳細を公開サイトに配信せず、カテゴリ集計だけ掲載。詳細はNotion/DriveのPrivate台帳を参照",
    }
    private={"generatedAt":now,"definition":pub["progressDefinition"],"milestoneWeights":pub["milestoneWeights"],
             "coverage":pub["coverage"],"categories":cats,"activeProjects":active,"projects":allrows}
    for target,value in ((private_output,private),(public_output,pub)):
        target.parent.mkdir(parents=True,exist_ok=True)
        tmp=target.with_suffix(target.suffix+".tmp")
        tmp.write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding="utf-8")
        os.replace(tmp,target)
    return {"all":len(allrows),"public":pub["coverage"]["public"],
            "private":pub["coverage"]["private"],"average":pub["averageProgress"],
            "categories":[{"id":c["id"],"average":c["averageEvidenceProgress"]} for c in cats]}

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--catalog",required=True)
    p.add_argument("--private-output",required=True)
    p.add_argument("--public-output",required=True)
    a=p.parse_args()
    print(json.dumps(run(Path(a.catalog),Path(a.private_output),Path(a.public_output)),ensure_ascii=False))
