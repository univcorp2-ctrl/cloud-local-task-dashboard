# タスクコントロールセンター / Task Control Center (TCC)

## AIエントリーポイント（30秒で特定）
正式名: タスクコントロールセンター。旧名: AI Operations Hub / Cloud Local Task Dashboard。
別名: タスク、タスクコントロール、コントローラー、ダッシュボード、統合ダッシュボード、開発管理、オペレーションハブ、Task Control Center、TCC。
「タスク」などの一般語は会話文脈により判定。固有のWebアプリ名を指している場合はそのリポジトリへ。

- 本番: https://cloud-local-task-dashboard.pages.dev/#development
- GitHub正本: https://github.com/univcorp2-ctrl/cloud-local-task-dashboard
- Notion AI索引: https://app.notion.com/p/40810562e58b811aa7a9ca50e2d29f9e
- Google Drive: https://drive.google.com/drive/folders/1Azk8BEl0dkiE1iiAlfZj9_PRDTrgwkJG
- ユーザー追加用Sheet: https://docs.google.com/spreadsheets/d/1O8OoxxzNH91wRFdTjyx56Jr6l-_KIdQjUVFeoliuUVM/edit

## 改修箇所
- `#development`: `src/DevelopmentProgressPanel.tsx`, `src/development-progress.css` とデータ `public/data/development-progress.json`。
- `#my-tasks`: `src/ManualTasksPanel.tsx` + `functions/api/private-tasks.ts`。Notion本人タスクAPIのJWT保護と統合DBの本人確認が必要。
- `#automation`: `src/OperationsOverview.tsx`, `src/TokenUsagePanel.tsx`, `src/QuotaStrip.tsx`, `scripts/collect_ai_quotas.py`。
- 共通ナビ・アプリ追加: `src/App.tsx`, `src/appLinks.ts`。新リンクはユーザー追加Sheetを受け付け、AIが有効性・掲載許可を検証してから変更。
- 収集と公開: `scripts/refresh_inventory_and_publish.py`。秘密・私的ページ情報は静的JSONへ出さない。

## 完了チェックと監査
Notionを唯一の正本として扱う。完了チェックは、認証済みNotionの一意の実レコードIDが確認できるときだけ有効。未紐付けはチェック不可（誤更新防止）。
`PATCH /api/private-tasks` が成功後に同じNotionページへ監査ログ追記。ログ追記に失敗した場合は独立の警告を表示。通常画面では完了を非表示、明示した場合だけ完了済みを表示。
Notion PagesのCloudflare Access設定 `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, `NOTION_API_TOKEN`, `NOTION_DATA_SOURCE_ID` は秘密のまま設定。未設定は503で閉鎖。設定・E2Eを通さず有効化と報告しない。

## AI残量
Codexの実行ログ、Claude Codeステータスライン、Antigravityのローカル使用枠メタデータ、Museの権限済みサニタイズ済みメタデータを用いる。残りトークン数と利用枠％は別物。
残り50%以上=緑、30〜49%=黄、30%未満=赤。未取得/古い/推定を区別。
Claude Codeに既存ステータスライン保持のサニタイズラッパーを設置（実際の利用時のみ観測）。
古いローカル記録や未接続サービスを0%や100%に補完しない。

## AI実行順
1. 正式名・別名からここへ。該当するURLと狙うセクションを特定。
2. 既存README→関連ファイル→テスト→本番設定（最小範囲で読む）。
3. 安全に最小変更。認証・監査・非公開情報の公開防止を維持。
4. npm run lint / npm test / npm run build / Python unit tests。
5. GitHub SHA・CI・Cloudflareデプロイ・本番画面・Notion同期の証跡が揃うまで「本番完了」としない。
