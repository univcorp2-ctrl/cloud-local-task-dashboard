#!/usr/bin/env python3
"""Build a provenance-labelled repository and Windows scheduler inventory.

Never publishes private repository names, task commands, hosts or credentials.
Private complete inventory stays in an explicitly private local/Drive path.
"""
from __future__ import annotations
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import re
import subprocess
import sys

CATEGORIES = [
    ("real_estate", "不動産", "土地から新築・中古一棟・戸建・ホテル・民泊・物件DB"),
    ("commerce", "物販・EC", "Apple・Amazon・Shopee・Mercari・出品・販売"),
    ("research", "情報収集・投資調査", "自律調査、業界・市場・投資情報、定期リサーチ"),
    ("finance", "資金調達・補助金", "銀行融資、助成金、補助金、事業資金の探索"),
    ("social", "Facebook・SNS投稿", "新規スレッド投稿と投稿進捗の監視"),
    ("messaging", "LINE・Messenger・顧客対応", "反響受付、資料共有、返信"),
    ("chatgpt", "ChatGPT通常Chat・自動追撃", "Chatモード実行と継続・完了判定"),
    ("secretary", "AI秘書・人手アサイン", "ユーザータスク、人手委任、応募支援"),
    ("control", "Webダッシュボード・実行基盤", "タスク監視、デプロイ、CLI制御と復旧"),
    ("marketing", "営業・集客・メディア", "コンテンツ、SNS運用、営業AI、デジタル広告"),
    ("games", "ゲーム・デジタル商品", "ゲーム開発、Roblox、デジタルコンテンツの制作・販売"),
    ("investment", "投資・市況分析", "暗号資産、株式、コモディティと投資シグナル"),
    ("other", "その他・未分類", "用途の再確認が必要なリポジトリやタスク"),
]
PATTERNS = [
    ("social", r"facebook|fb[-_]?|threads|x-autopost|auto.post|notion.creator.ops"),
    ("messaging", r"messenger|line[-_]|gmail.*reply|email.*reply|property.sender|sender.automation|mail"),
    ("real_estate", r"bukken|chuko|shinchiku|estate|real[-_]estate|property|apartment|broker|hotel|minpaku|land.search|reins|terass|suumo|rakumachi|kenbiya|rimawari|leasing"),
    ("commerce", r"amazon|mercari|marketplace|purchase|shop|shopee|apple|listing|snaplist|rolex|suzuri|rakuten.room|qoo10|keita|buyback|yamato.ship|morimori|mobatori"),
    ("finance", r"hojokin|subsid|grant|funding|loan|bank.inquiry|finance|capital|fundraise|lender|gpoi|customer.house"),
    ("chatgpt", r"chatgpt|chatfirst|chrome.browser.chatgpt|supervisor|gpt.follower"),
    ("secretary", r"secretary|personal.task|crowdworks|lancers|job.aggregat|handoff|reservation.form"),
    ("games", r"roblox|game|quest|rock.paper.scissors|slime|stamps|circuit|nebula"),
    ("investment", r"investment|cripto|crypto|stock|commodity|climate|arbitrage|trading"),
    ("marketing", r"content|publisher|blog|course|landing|outbound|affiliate|substack|note.growth|creator|voice.queue|company.contact"),
    ("research", r"research|info.gather|news|notebooklm|knowledge|youtube|enoking|data.processing|data.export|digest|scraper|rawdata"),
    ("control", r"dashboard|control.plane|agent.orchestration|secure.local|ci.auto|github|repository|orchestrat|automation|codex|claude|agent|testgpt|custom.gpt|commander|script.factory|gpt.file.server|desktopcommander|disk.cleanup|chrome.auto|windows.executor|lightcheck|autorun"),
]
# Explicit mapping for repos whose ownership is clear from the project registry.
EXACT = {
    "Agent_Orchestration": "control",
    "cloud-local-task-dashboard": "control",
    "chatgpt-chat-controller": "chatgpt",
    "personal-task-agent-hub": "secretary",
    "autonomous-research-agent": "research",
    "Bukken-DB": "real_estate",
    "EstateBoard": "real_estate",
    "fb-group-autoposter": "social",
    "facebook-auto-post": "social",
    "amazon-marketplace-sync-hub": "commerce",
    "line-official-auto-reply-bot": "messaging",
    "Hojokin": "finance",
}
def category(name: str) -> tuple[str, str]:
    if name in EXACT:
        return EXACT[name], "registered"
    for label, pattern in PATTERNS:
        if re.search(pattern, name, re.IGNORECASE):
            return label, "name_inferred"
    return "other", "unverified"

def run(args: list[str], timeout: int = 45) -> str:
    process = subprocess.run(args, capture_output=True, text=True, encoding="utf-8",
                             errors="replace", timeout=timeout, check=False)
    if process.returncode:
        raise RuntimeError(f"{args[0]} failed, exit={process.returncode}")
    return process.stdout.strip()

def git_repos() -> list[dict]:
    data = json.loads(run(["gh", "repo", "list", "univcorp2-ctrl", "--limit", "1000",
                           "--json", "name,description,isPrivate,isArchived,updatedAt,url"], 35))
    result = []
    for entry in data:
        group, origin = category(entry["name"])
        result.append({
            "name": entry["name"], "url": entry["url"], "private": entry["isPrivate"],
            "archived": entry["isArchived"], "updatedAt": entry.get("updatedAt"),
            "description": (entry.get("description") or "")[:180],
            "category": group, "classificationEvidence": origin,
            "executionOwner": "unverified", "verification": "repository_detected_only",
        })
    return sorted(result, key=lambda x: (x["category"], x["name"].lower()))

TASK_PS = r"""
[Console]::OutputEncoding=[System.Text.Encoding]::UTF8
$ErrorActionPreference='SilentlyContinue'
$all=Get-ScheduledTask | Where-Object {$_.TaskPath -notlike '\Microsoft\*'}
$result=foreach($task in $all){
  $info=$task | Get-ScheduledTaskInfo
  $action=$task.Actions | Select-Object -First 1
  [PSCustomObject]@{
    name=$task.TaskName; state=[string]$task.State;
    schedulePath=$task.TaskPath;
    executable=[string]$action.Execute; arguments=[string]$action.Arguments;
    lastRun=[string]$info.LastRunTime; nextRun=[string]$info.NextRunTime;
    lastResult=$info.LastTaskResult;
    everRun=[bool]($info.LastRunTime -gt [datetime]'2001-01-01')
  }
}
ConvertTo-Json -Compress -Depth 4 -InputObject @($result)
"""
def scheduler_tasks() -> list[dict]:
    if os.name != "nt":
        return []
    raw = run(["powershell", "-NoProfile", "-NonInteractive", "-Command", TASK_PS], 45)
    entries = json.loads(raw)
    result = []
    for entry in entries:
        name = entry.get("name") or ""
        cat, src = category(name)
        combined = (str(entry.get("executable") or "") + " " + str(entry.get("arguments") or "")).lower()
        if "chatgpt" in name.lower() or "gptfollower" in name.lower():
            owner = "ChatGPT通常Chat（制御スクリプト）"
        elif "codex" in combined:
            owner = "Codex CLI"
        elif "claude" in combined:
            owner = "Claude Code CLI"
        elif "gemini" in combined or "agy" in combined:
            owner = "Gemini / Antigravity CLI"
        elif "python" in combined or ".py" in combined:
            owner = "Python・スクリプト"
        elif "wscript" in combined or ".vbs" in combined:
            owner = "Windowsスケジューラー → VBS（内部実行先未検証）"
        else:
            owner = "Windowsスケジューラー（内部実行先未検証）"
        code = entry.get("lastResult")
        result.append({
            **entry, "category": cat, "classificationEvidence": src,
            "executionOwner": owner,
            "health": "disabled" if entry.get("state") == "Disabled"
                      else "never_run" if not entry.get("everRun", False)
                      else "needs_review" if isinstance(code, int) and code != 0
                      else "last_exit_zero_unverified",
        })
    return result

def report(repos: list[dict], tasks: list[dict]) -> tuple[dict,dict]:
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    categories = []
    for key, label, purpose in CATEGORIES:
        rr = [r for r in repos if r["category"] == key]
        tt = [t for t in tasks if t["category"] == key]
        categories.append({
            "id": key, "name": label, "purpose": purpose,
            "repoCount": len(rr),
            "privateRepoCount": sum(1 for r in rr if r["private"]),
            "publicRepoCount": sum(1 for r in rr if not r["private"]),
            "scheduledTaskCount": len(tt),
            "suspectedFailedTaskCount": sum(1 for t in tt if t["health"] == "needs_review"),
            "taskHealthCounts": {
                "exitZero": sum(1 for t in tt if t["health"] == "last_exit_zero_unverified"),
                "nonzero": sum(1 for t in tt if t["health"] == "needs_review"),
                "disabled": sum(1 for t in tt if t["health"] == "disabled"),
                "neverRun": sum(1 for t in tt if t["health"] == "never_run"),
                "runningNow": sum(1 for t in tt if t.get("state") == "Running"),
            },
            "executionOwners": [
                {"owner": name, "taskCount": count}
                for name, count in sorted(
                    ((name, sum(1 for t in tt if t["executionOwner"] == name))
                     for name in sorted({t["executionOwner"] for t in tt})),
                    key=lambda pair: -pair[1]
                )
            ],
            # Public-only resource contains NO private repository names, URLs, paths,
            # commands, hostnames, emails, or authorization data.
            "publicRepositories": [
                {k: r[k] for k in ("name", "url", "description", "classificationEvidence",
                                    "executionOwner", "verification")}
                for r in rr if not r["private"]
            ],
        })
    common = {
        "generatedAt": now, "source": "GitHub authenticated inventory + Windows Task Scheduler",
        "totalRepositories": len(repos),
        "privateRepositoryCount": sum(1 for r in repos if r["private"]),
        "publicRepositoryCount": sum(1 for r in repos if not r["private"]),
        "totalUserScheduledTasks": len(tasks),
        "taskHealthSummary": {
            "exitZero": sum(1 for t in tasks if t["health"] == "last_exit_zero_unverified"),
            "nonzero": sum(1 for t in tasks if t["health"] == "needs_review"),
            "disabled": sum(1 for t in tasks if t["health"] == "disabled"),
            "neverRun": sum(1 for t in tasks if t["health"] == "never_run"),
            "runningNow": sum(1 for t in tasks if t.get("state") == "Running"),
        },
        "classificationNote": "Category is registered for select repos, inferred by name for others; manual verification required.",
        "coverageNote": "Includes GitHub repository metadata and non-Microsoft local Windows tasks, not the execution history of all workflows.",
        "quotaStatus": "unavailable", "quotas": [
            {"provider": "Codex CLI", "remainingPercent": None, "resetAt": None, "evidence": "No verified provider quota endpoint"},
            {"provider": "Claude Code CLI", "remainingPercent": None, "resetAt": None, "evidence": "No verified provider quota endpoint"},
            {"provider": "Gemini / Antigravity CLI", "remainingPercent": None, "resetAt": None, "evidence": "No verified provider quota endpoint"},
            {"provider": "ChatGPT通常Chat", "remainingPercent": None, "resetAt": None, "evidence": "No official remaining-quota telemetry connected"},
        ], "categories": categories,
    }
    private = {**common, "repositories": repos, "scheduledTasks": tasks}
    return common, private

def public_task_snapshot(tasks: list[dict], generated: str) -> dict:
    """Anonymized overview, no task titles, commands, paths, SID, or PC name."""
    import hashlib
    out = []
    counts: dict[str, int] = {}
    for task in tasks:
        cat = task["category"]
        counts[cat] = counts.get(cat, 0) + 1
        title = next((label for key, label, _ in CATEGORIES if key == cat), "その他")
        raw = str(task.get("schedulePath") or "") + str(task.get("name") or "")
        state = task.get("health")
        status = ("paused" if state == "disabled" else
                  "failed" if state == "needs_review" else "scheduled")
        # One opaque row per task; explicit unknown success rate.
        out.append({
            "id": "local-" + hashlib.sha256(raw.encode("utf-8")).hexdigest()[:12],
            "name": f"{title} / 自動タスク {counts[cat]}",
            "source": "local", "environment": "Windows / 詳細は内部台帳",
            "status": status, "schedule": "詳細非公開",
            "lastRun": None, "nextRun": None, "durationSeconds": None,
            "successRate": -1,
            "detail": "実行内容とログはPrivate台帳で確認。終了コードは成果達成を保証しない。",
        })
    return {
        "generatedAt": generated,
        "redacted": True,
        "agents": [{"id": "local-windows", "name": "Windowsスケジューラー",
                    "kind": "PC scheduled tasks (anonymized)", "status": "online",
                    "lastSeen": generated, "taskCount": len(out)}],
        "tasks": out
    }


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--public-output", required=True)
    p.add_argument("--private-output", required=True)
    p.add_argument("--tasks-public-output", required=False)
    args = p.parse_args()
    repos, tasks = git_repos(), scheduler_tasks()
    # Link only when the actual scheduler executable/arguments references the
    # repository name. Name/category similarity alone does not prove ownership.
    for repo in repos:
        name = repo["name"].lower()
        direct = [t for t in tasks if len(name) >= 7 and name in
                  (str(t.get("executable") or "") + " " + str(t.get("arguments") or "")).lower()]
        if direct:
            owners = sorted(set(t["executionOwner"] for t in direct))
            repo["executionOwner"] = " / ".join(owners)
            repo["verification"] = "explicit_scheduled_command_reference"
    public, private = report(repos, tasks)
    for path, obj in ((args.public_output, public), (args.private_output, private)):
        target=Path(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        tmp=target.with_suffix(target.suffix + ".tmp")
        tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(tmp, target)
    if args.tasks_public_output:
        tpath = Path(args.tasks_public_output)
        tpath.parent.mkdir(parents=True, exist_ok=True)
        tmp = tpath.with_suffix(".tmp")
        tmp.write_text(json.dumps(public_task_snapshot(tasks, public["generatedAt"]),
                                  ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(tmp, tpath)
    print(json.dumps({"repoCount": len(repos), "privateRepoCount": public["privateRepositoryCount"],
                      "scheduledTaskCount": len(tasks),
                      "categories": [{"id": x["id"], "repos": x["repoCount"], "jobs": x["scheduledTaskCount"],
                                      "failed": x["suspectedFailedTaskCount"]} for x in public["categories"]]},
                     ensure_ascii=False))

if __name__ == "__main__":
    main()
