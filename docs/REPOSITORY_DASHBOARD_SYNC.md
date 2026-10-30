# リポジトリ更新 → 開発ダッシュボード統合（必須）

正本ダッシュボード： https://cloud-local-task-dashboard.pages.dev/#development

**2026-10-30ユーザー指示：今後すべてのリポジトリ更新で、このダッシュボードの開発状況とリンクの更新を同じ作業の完了条件とする。**

## 必須フロー（別のスケジューラは作らない）
1. 対象GitHubの実際の差分・commit SHA、PRのdraft/merged、テスト結果、デプロイID、公開URL、未完了条件を確認。
2. Notionの該当タスク／全153リポジトリ索引に **変更内容・確認時刻・次アクション・リンク・ブロッカー** を保存する。未実施を「完了」にしない。
3. `scripts/record_development_update.py --input <公開用・検証済みJSON>` で `public/data/development-progress.json` の `activeProjects` に追加・上書きする。既存の進捗率は証拠がない限り上げない。対象が公開repoの場合だけ `publicProjects` 側の根拠と一致させる。
4. 表示ラベルは非公開リポジトリの場合、**公開安全な業務別名称のみ**。非公開repo名、GitHub private URL/PR URL、アカウント情報、cookie、OAuth、機密資料名、PC識別子を静的JSONへ書かない。プライベートソースの詳細リンクはNotionなど認証済み側にのみ保存する。公開ページで示すリンクは公開許可済みの実URLのみ。
5. `npm run lint && npm test && npm run build` と `python -m unittest discover -s agent -p 'test_*.py'` を確認。単純なJSONスキーマ・coverageとリンクもチェック。
6. GitHubのDashboardリポジトリへcommitし、Cloudflare Pages本番を更新。**本番の /data/development-progress.json を再取得し、更新時刻・対象項目・URLの一致**をチェック、可能なら画面の#developmentまで確認する。ハッシュのみのURLはフロントエンドのstateであり、JSON APIではない。
7. GitHub SHA、Notion更新確認、Cloudflareデプロイ、画面の本番反映まで検証して初めて「ダッシュボード統合済」と報告。どれか未確認なら「部分完了」と理由と次工程を残す。

## 公開情報ガード
`scripts/record_development_update.py` は公開URLのallowlist、GitHub URLや権限情報の混入拒否、ID重複・coverage整合性を確認する。新しい公開先を許可する際は公開許可と認証要否を確認してからドメインallowlistを変更。既存の153リポジトリ一覧（公開93／非公開60）を勝手に数増しせず、`activeProjects` は業務案件の数である点を区別する。

## 今回の登録例（2026-10-29実測、10-30反映）
- 「不動産DB・銀行融資自動連携」：マスター53,243、公開52,475、買い候補792、公開照合PASS。公開リンク： https://bukken-customer.pages.dev/
- 「物件ソースAPI取得・認証維持」：API269/269ページ、元データ53,749、Excel52,572、25単体テストPASS。Google認証失効時に無期限接続は保証されず、PR統合と定期稼働監査は残る。
- Private GitHub PR・内部実装ディレクトリ・認証値はNotion正本へ保存し、公開ダッシュボードには表示しない。
