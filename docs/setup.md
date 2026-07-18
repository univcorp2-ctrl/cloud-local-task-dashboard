# Initial setup

本番ダッシュボードはサンプルデータですぐ表示できます。実際のタスク情報を接続する資格情報は、収集を実行するローカルPCまたはGitHub Actionsだけに保存し、フロントエンドへは置きません。

## 本番URL

- Dashboard: `https://cloud-local-task-dashboard.pages.dev`
- Health: `https://cloud-local-task-dashboard.pages.dev/api/health`
- Snapshot: `https://cloud-local-task-dashboard.pages.dev/data/tasks.json`

## ローカルPCの自動登録

### Windows

`scripts/install-agent.ps1` を実行すると、Windows Task Schedulerへ `TaskControlCenterAgent` が登録され、5分間隔で更新します。

### macOS / Linux

`bash scripts/install-agent.sh` を実行します。macOSではLaunchAgent、Linuxではユーザーcrontabへ5分間隔で登録されます。

公開ダッシュボードへローカルスナップショットを送る場合だけ、インストール前に次の環境変数を設定します。

- `TASK_DASHBOARD_GITHUB_TOKEN`
- `TASK_DASHBOARD_REPOSITORY`（`univcorp2-ctrl/cloud-local-task-dashboard`）
- `TASK_DASHBOARD_BRANCH`（省略時は `main`）

GitHub Tokenはこのリポジトリだけに限定したFine-grained tokenを使い、ContentsのRead/Writeだけを許可します。TokenはローカルPC外へ保存しません。

## クラウド収集

GitHub Actionsは15分間隔で起動します。このリポジトリ自身のWorkflowは標準の `GITHUB_TOKEN` で収集できます。追加リポジトリを含める場合だけ次を登録します。

- Repository variable: `GH_TASK_SOURCE_REPOS`
- Repository secret: `GH_TASK_SOURCE_TOKEN`

Cloudflare Workers Cron Triggersを収集する場合は次のRepository secretsを登録します。

- `CF_ACCOUNT_ID`
- `CF_API_TOKEN`

Cloudflare TokenにはWorkers ScriptsのRead権限だけを付与します。

## 公開時の保護

現在のPages URLは公開です。実際のPC名やタスク名を表示する前に、Cloudflare AccessをPagesドメインの前段へ設定するか、タスク名とcommandを匿名化してください。収集JSONへToken、Cookie、OAuth情報、接続文字列を書き込まないでください。

## ローカル開発

```bash
npm install
npm run dev
python agent/task_collector.py --output public/data/tasks.json
```

## 確認場所

- GitHub Actionsの `quality` job: TypeScript、Vitest、Vite build、Python unittest
- Artifact `dashboard-dist`: 本番静的ファイル
- Artifact `task-snapshot`: 収集されたJSON
- Google Drive: `repos/cloud-local-task-dashboard`
