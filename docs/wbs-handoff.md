# 引き継ぎ書：TCC WBS

- 作成：2026-11-24 ／ Codex ／ 依頼者：Hiro
- 状態：試験中。本番検証の結果はタスクのNotion実行ログを参照。
- 次に触るAIへ：Notionが正本。私的明細を静的JSONや公開ログへ書かない。

## 1. 何をする仕組みか
既存TCCに `#wbs` を追加。Hiroの対応、5本の柱、中項目、期限・止まり、4週間の期限バーを表示する。
未分類タスクを別枠で残し、保留は件数だけ表示する。

## 2. どこで動いているか
| 項目 | 値 |
|---|---|
| 実行場所 | Cloudflare Pages `cloud-local-task-dashboard` |
| スケジュール | 閲覧中60秒ごと。新しい定期タスクなし |
| コード | `univcorp2-ctrl/cloud-local-task-dashboard`, `feature/wbs-master-schedule` |
| 正本（Notion） | https://app.notion.com/p/42210562e58b81bab2fee2ff7df9fa36 |
| 依頼 | https://app.notion.com/p/42210562e58b81b7b051da3bb2da758a |
| 出力先 | https://cloud-local-task-dashboard.pages.dev/#wbs |
| 作業コピー | `C:\AI-Agent\workspace\tmp\2026-11-24-tcc-wbs` |
| Drive | 既存 `Private/Cloud_Artifact_Archive/cloud-local-task-dashboard-20261030/worktrees/2026-11-24-tcc-wbs` |

## 3. 他のAIでの動かし方
`pnpm lint`, `pnpm test`, `pnpm build`。`node scripts/deploy_checked.mjs --dry-run` で配備せず検証。
明示された本番配備では `node scripts/deploy_checked.mjs --confirm-production`。
Pagesの `--branch main` は本番配備先の指定であり、Git mainへのpushではない。コードはfeatureブランチとPRに保存する。
既存の所有者接続（Bearer／オーナーCookie／Cloudflare Access）とNotion設定を再利用する。秘密は既存のPages secretsとPCのDPAPIにあり、値は書かない。

## 4. 入力と出力
`GET /api/private-wbs` は認証後だけKVを読む。キャッシュは取得時刻から180秒未満のみ採用、60秒ポーリングで通常240秒以内＋通信時間を目安に反映。
`?refresh=1` はキャッシュを迂回。期限は `期限` → `期日`、柱は `WBSサマリー` の `柱n｜中項目｜` → 統合カテゴリ。
中項目は取得できた `上位` リレーションのタイトルを優先。不明時はサマリーか未設定。日付のみの期限はJSTの当日末まで超過扱いにしない。

## 5. 禁止・停止条件
認証失敗時は旧データも消す。Notion障害で古いデータを最新として返さない。
個人名・相手名・金額・生のAPI応答をGitHub・公開JSON・検証ログへ出さない。
本番表示・鮮度・Driveのリモート読戻しが未検証なら完了を主張しない。

## 6. 既知の問題・未完了
カレンダーと振り返りログの照合は未接続。画面はNotionに明記された未完了の振り返りタスクだけを表示する。
柱タグ付与はClaude担当。統合カテゴリで振り分けきれないものは未分類へ。取得上限1000行では警告を出す。
本人の実iPhone操作はUNKNOWN。390pxのブラウザ検証を別途記録する。

## 7. 変更履歴
- 2026-11-24 Codex：設計PR #36に基づきWBS/API/テスト/既定dry-runの配備ヘルパーを追加。
