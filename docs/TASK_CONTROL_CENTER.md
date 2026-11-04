# タスクコントロールセンター / Task Control Center (TCC)

## AIエントリーポイント（30秒で特定）
正式名: タスクコントロールセンター。旧名: AI Operations Hub / Cloud Local Task Dashboard。
別名: タスク、タスクコントロール、コントローラー、ダッシュボード、統合ダッシュボード、開発管理、オペレーションハブ、Task Control Center、TCC。
「タスク」などの一般語は会話文脈により判定。固有のWebアプリ名を指している場合はそのリポジトリへ。

- 本番: https://cloud-local-task-dashboard.pages.dev/#overview（統合ホーム）／ #development
- GitHub正本: https://github.com/univcorp2-ctrl/cloud-local-task-dashboard
- Notion AI索引: https://app.notion.com/p/40810562e58b811aa7a9ca50e2d29f9e
- Google Drive: https://drive.google.com/drive/folders/1Azk8BEl0dkiE1iiAlfZj9_PRDTrgwkJG
- ユーザー追加用Sheet: https://docs.google.com/spreadsheets/d/1O8OoxxzNH91wRFdTjyx56Jr6l-_KIdQjUVFeoliuUVM/edit

## 改修箇所
- `#overview`（既定ホーム）: `src/OverviewPage.tsx`, `src/QuotaGauges.tsx`, `src/controlState.ts`, `src/ConnectDialog.tsx`, `src/overview.css`。データは `/api/state`（KV）＋ `/api/external/*` ＋ 既存JSON。詳細 [control-state-api.md](control-state-api.md)。
- 状態API/MCP: `functions/_lib/{state,mcp,auth,notion}.ts`, `functions/api/state/*`, `functions/api/mcp.ts`。テスト `functions/_lib/__tests__/`。
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
2026-10-31以降は `/api/state`（KV）が正本。PC `TCC-Quota-Push`（30分ごと）とMCP `set_quota` が書く。`operations-catalog.json` の quotas は旧経路（参考）。
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

## 2026-10-30 恒久運用ルール：全リポジトリ更新後の同期

リポジトリのコード・PR・デプロイ・復旧を実行したときは、必ず同じ作業内で `#development` の進捗、最終検証、次アクション、公開可能なリンクを更新する。**本番 JSON と表示の一致確認ができるまで「完了」にしない。** ユーザー指示の正本は Notion「全ルール集（正本）」および「全153リポジトリ索引」。詳細手順： [REPOSITORY_DASHBOARD_SYNC.md](REPOSITORY_DASHBOARD_SYNC.md)。

## 2026-11-04｜全AIフォローアップ・回答・回収の一元管理（証拠優先）

- **既存正本を再利用**：案件・対外返信・回収のマスターは [Notion 💹 稼ぐパイプライン盤](https://app.notion.com/p/67cfe9e3503444dc9e5aab80d47fa0ea)。2026-11-04に実読した14行はそのまま保持。新しい同義DBを作らない。TCCの [Notionナビゲーション正本](https://app.notion.com/p/40810562e58b811aa7a9ca50e2d29f9e) を起点にする。
- **追加された既存DB項目**：`実行AI`（ChatGPT/Claude/Codex/Muse等、証拠のあるときのみ）、`実行ログURL`（同一案件のチャット/Run/PR/メール証拠）、`最終実行照合日`、`回収検証`（未確認・証拠照合中・請求済・着金確認済・対象外）。`段階`・`次の一手`・`次の一手の期日`・`Hiro判断待ち`・`証拠URL`は既存項目を使用。
- **何が実証値か**：AIが起動・終了した事実と、相手から返信が来たこと、成約、請求、実入金は別の出来事。送信ID/正式な回答原文/契約書/着金証拠にリンクできたときだけ段階を進める。終了コード0、モデルの推定、他AIの未接続セッションは「成功」や「完了」に補完しない。
- **データ経路**：GitHubはコードとCI、Notionはタスク・案件と段階、Gmail等は正規の返信証拠、私的な決済情報は本人確認可能な出所。TCCの公開`/api/state`は匿名では`public_quota_and_heartbeat_only`であり、案件の返信・回収詳細ではない。公開`/data/tasks.json`は2026-10-20生成の過去スナップショット。認証済みプライベートAPIでの実E2Eが済むまでライブ統合を主張しない。
- **実行/送信ガード**：既存顧客への無断連絡、断られた相手への再送、未入金と推測しての督促、同一宛先の重複送信は禁止。各案件の停止・本人承認・契約・支払い・公開の条件を尊重。ウェブ公開用静的JSONに個人メール、会話本文、顧客・銀行情報を出さない。Cloudflare Access/Notion認証を迂回しない。
- **未完了の実装ゲート**：①各AIの実行RunとNotion案件IDの一意紐付け、②private APIに対する接続・本人認証と読み取り専用の集計、③返信/次回確認/回収のUI反映、④Notion→UIの鮮度と一致を本番E2Eで検証。Cloudflare本番配備とそのJS/API検証が終わるまで、GitHubコミットだけで「完成」としない。
