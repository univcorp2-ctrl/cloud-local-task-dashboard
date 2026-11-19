# バックグラウンド処理台帳

設計・実装計画（2026-11-19）: 既存Notion DB `41d10562-e58b-811c-8347-000b90f1531a` を正本とし、所有者認証付きAPIで既存TCC `#automation` に表示する。重複DB・新スケジュール・別サイトは作らない。

1. 既存台帳・Windows Task Scheduler・GitHub Actions・既存TCC jobs/usageを照合する。
2. 最終実行・次回実行・成果・稼働確認・週トークン・品質・実行キー・週開始・補正日時を既存DBに追加する。
3. ログの増分をprovider/run_idで重複排除し、週境界内で集計する。矛盾する同一run_idはエラーで止める。
4. UI・API・集計のテスト、lint/build、匿名401、所有者実データ、モバイル表示を確認する。
5. featureブランチへpush・PR作成、Cloudflareへ公開、Notion・Drive・引き継ぎへ証跡を保存する。

## 使用量

`scripts/background_usage.py --events <sanitized.jsonl> --week-start 2026-11-16 --dry-run`

入力は `provider, process, run_id, at, tokens` のJSONL。tokensは1回の増分。累積カウンターをそのまま投入しない。出力を保存する場合だけ `--apply --confirm --output <path>` を指定する。

`--calibration <json>` はprovider別 `{ "used_percent": 40, "coverage_complete": true }`。同一provider・同一週について、対話を含む全消費の分母が揃っている場合だけ `coverage_complete=true`。部分ログの配分にアカウント全体％を掛けることは禁止。週次枠％は必ず推定扱い。モデル/枠は混ぜずproviderキーを分ける。週1回Hiroの使用量画面の値・観測日時・対象枠を記録し、同じ週の補正日時とともにDBへ反映する。未観測値はnullのままにする。

## 更新する既存の回

新しい定期タスクは作らない。既存の進捗レポート（8/14/20時）の各回で実行履歴と照合し、同じ実行キーの行を更新する。週次点検では使用量画面の実数で補正する。APIはDBを毎回読むので、Notion更新は次回の画面再取得で反映される。

「稼働」は登録上の状態。終了コード0は処理終了の証拠であり、業務成果の完了証拠ではない。最終確認が24時間を超えれば未確認、次回予定が1時間超過なら予定超過。停止・保留は尊重し、自動再開しない。

## セキュリティ

詳細データは `/api/private-background` のowner専用。匿名401、agent403、未設定503、取得失敗502。Cache-Controlはprivate/no-store。秘密・コマンド引数・環境変数・会話本文を静的アセットへ保存しない。公開URLは画面の入口であり、私的台帳の匿名公開ではない。

## 検証・引き継ぎ

`NODE_ENV=test pnpm test`、`pnpm lint`、`pnpm build`、`python -m unittest discover -s scripts -p test_background_usage.py`。

収集範囲・未接続source・デプロイ/PR/Driveの状態はNotion依頼ページとAgent_Orchestrationの同日引き継ぎ書に記録する。実測できない全量性はUNKNOWN。
