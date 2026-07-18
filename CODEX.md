# Repository operating notes

## Required checks

変更前後に次を実行します。

```bash
npm run lint
npm test
npm run build
python -m unittest discover -s agent -p 'test_*.py'
```

## Production rules

- `main` へのpushでCloudflare Pagesへ本番反映する。
- `.github/workflows/ci.yml` が15分ごとにクラウドタスクを収集する。
- `public/data/tasks.json` は公開されるため、Token、Cookie、接続文字列、個人情報を書かない。
- ローカル収集は `agent/task_collector.py` の共通スキーマへ正規化する。
- 新しい収集元は `src/types.ts` の `ScheduledTask` と互換にする。
- GitHub更新後はGoogle Driveの `repos/cloud-local-task-dashboard` へ完全同期する。

## Architecture ownership

- UI: `src/App.tsx`, `src/styles.css`
- Schema: `src/types.ts`
- Collectors: `agent/task_collector.py`
- CI/CD: `.github/workflows/ci.yml`
- Deployment health: `functions/api/health.ts`
- System design: `docs/architecture.md`
- Setup: `docs/setup.md`
