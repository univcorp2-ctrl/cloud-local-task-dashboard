# Control state API・MCP（2026-10-31）

Task Control Center の「生きている数字」は Cloudflare KV（binding `TCC_STATE`、`wrangler.toml`）に1つのJSON文書として保存され、
PC収集ジョブと各AIエージェントが書き、ダッシュボードが読む。サイトの再ビルド・再デプロイは不要。

| 入口 | 認証 | 用途 |
|---|---|---|
| `GET /api/state` | 任意 | 匿名＝残量4媒体＋エージェント生存のみ。`Authorization: Bearer <TCC_ACCESS_TOKEN or TCC_AGENT_TOKEN>` でKPI・メトリクス・イベントも返す |
| `POST /api/state/ingest` | 必須 | `{"actor":"pc-collector","quotas":[…],"kpis":[…],"metrics":[…],"events":[…],"agents":[…]}` を一括upsert（各50件まで） |
| `POST /api/mcp` | 必須 | MCP（Streamable HTTP, JSON応答）。tools: `get_state` `set_quota` `set_kpi` `set_metric` `log_event` `agent_heartbeat`、オーナートークンのみ `list_private_tasks` `complete_private_task` |
| `GET /api/external/estateboard` / `revenue-agent` | 不要 | 他ダッシュボードの公開APIを同一オリジンで中継（KV 5分キャッシュ、CSP connect-src 'self' のため） |
| `GET/PATCH /api/private-tasks` | オーナー | Notion マスタータスクDB（data source `0f570283-…`）の未完了一覧・完了反映 |
| `GET /api/private-earnlab` | オーナー | Notion 🧪 Earn Lab 実験DB（`de1e04ae-…`）の集計：状態別件数・実入金（累計/今月/7日）・費用・見込み・進行中一覧・Hiroの手順・最近の更新（KV 5分キャッシュ、`?refresh=1`で再取得） |

## 残量（quota）レコード
```json
{"provider":"muse","windows":[{"kind":"weekly","label":"週次無料枠","remainingPercent":67,"resetsAt":"2026-11-06T11:54:00+09:00"},
 {"kind":"additional","label":"追加トークン","remainingPercent":98,"remainingText":"7.8B"}],
 "observedAt":"2026-10-31T00:30:50+09:00","source":"Muse subscription-status via Drive token_status_payload.json","quality":"self_reported","staleAfterMinutes":240}
```
- `provider`: claude | codex | antigravity | muse | chatgpt。`observedAt` は値を読んだ時刻（未来・7日超は拒否／非表示）。
- 表示：残り50%以上=緑、30〜49%=黄、30%未満=赤、未取得=灰「—」。`staleAfterMinutes` を超えると「前回値」。古い値を0%/100%に補完しない。
- 古い観測で新しい観測を上書きしない（収集系が競合しても安全）。

## 収集経路
- PC `scripts/run_quota_push.ps1`（タスク `TCC-Quota-Push`、30分ごと）→ `scripts/push_quota_state.py --apply`
  - Codex: `~/.codex/sessions` の `token_count.rate_limits`
  - Claude: アカウント利用量API（`~/.claude/.credentials.json` のOAuthトークンをローカルで読むだけ。期限切れなら `claude -p` を1回走らせてClaude Code自身に更新させる）→ 7日枠・5時間枠
  - Antigravity: 起動中IDEの language_server `GetUserStatus`（コマンドラインのCSRFトークンをローカルで使用）→ モデル別 quotaInfo（推奨モデル優先、残量の少ない順に最大6件）。IDEを閉じていると前回値
  - Muse: `G:\…\Muse 作業ログ\05_EstateBoard連携\token_status_payload.json`（Museが3時間ごとに更新）
  - トークンは `C:\AI-Agent\Private\tcc-secrets\access.dpapi`（DPAPI）。ログ `G:\…\AI_Agents\Private\automation-control-center\quota-push.log`
- 他エージェント：Drive `AI_Agents/Private/tcc-agent-mcp.json` の MCP 設定で `set_quota` / `log_event` / `agent_heartbeat` を送る。

## オーナー接続
`G:\マイドライブ\AI_Agents\Private\tcc-connect-link.txt` のリンクを端末で1回開く（`?key=` は保存後にURLから除去）。左下「接続（トークン）」から手動入力・切断も可能。トークンはブラウザの localStorage のみ。

## KPI例（Earn Lab）
`set_kpi {"id":"earn-lab-monthly-revenue","label":"Earn Lab 月次売上","unit":"JPY","target":5000000,"actual":120000,"period":"2026-11","source":"notion 現金化DB"}`
→ 全体像の「ゴールに対する進み方」で目標比％バー表示。
