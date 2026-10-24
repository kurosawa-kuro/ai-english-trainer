# ai-english-trainer

GAS・Google Sheets・Geminiで動く、個人用の英語訓練アプリです。選択式クイズ、自由記述のAI採点・再判定、先生／仲間／自由会話の3シナリオ、振り返りと表現候補、学習記録を備えます。

配布モデルA（1人1コピー・本人限定公開・各自のGeminiキー）でG3までローカル実装済みです。永続化はSheets、秘密はScript Properties。音声入出力・関係DB・G4の自動計画や人間観測比較は対象外です。

## 現在地と検証範囲

2026-10-25の直近検証は`npm run check`で71件成功、生成物の整合と整形確認も成功。実ChromiumのPC幅・スマホ幅で操作を確認しました。GAS・Gemini通信は模擬であり、実GAS/Sheets/Geminiでの受入・公開・コピー配布は未実施です。

保存先ID指定、数式風文字列の保存、AI要求の再送・中断復旧、キャッシュ公開とロック解除前の書込確定を実装しています。これらのローカル検証を実環境での同時実行や性能の保証として扱わないでください。

## ローカル開発

Node.js 22以降を使用し、以下はプロジェクトの`src/`で実行します。

```powershell
npm ci
npm run build:data
npm run check
npx playwright install chromium
npm run test:browser
```

`npm run check`は生成物の一致・全テスト・Prettier確認、`npm run test:browser`は実Chromium・模擬通信での画面検証です。env変更後は`npm run build:data`と差分確認を行います。Makefileはテンプレートです。

## 利用開始・配布

1. 自分用のSheetsに紐付くGASへコードを配置する。接続先の設定・認証・送信対象の確認は[配置と受入手順](docs/08_release_runbook.md)に従う。
2. Sheetsの「英語訓練 → 初期設定」、またはGASエディタの`initializeTrainer`を実行する。教材と保存先`ET_SPREADSHEET_ID`を登録する。
3. 自分として実行・本人だけがアクセスできるWebアプリとしてデプロイし、設定画面で自分のキーを登録してAIを有効化する。初期値はAIオフ・30回/日。
4. 実AI採点・会話・同ID再送・コピー先での初期設定を受入確認してから配布する。

コピー先も初期設定・本人限定デプロイ・キー登録が必要です。コピーだけで準備が完了するとは扱いません。利用済みのキーや学習記録を含むファイルは配布しないでください。アプリの日次回数制限はGoogle側の課金停止機能ではありません。

`npm run push`は検証とコード配置までで、Webアプリの公開版更新は別操作です。既存環境の更新・バックアップ・欠損時の復旧もRunbookに従います。

## データと変更箇所

| 場所 | 役割 |
|---|---|
| `src/server/` | Domain、Application、依存の組立、Sheets、Geminiアダプター |
| `src/client/` | HTML Serviceの5タブ画面 |
| `env/config.yaml` | 非機密の初期設定 |
| `env/expressions/` | 初期教材51件。利用開始後の教材正本は`et_expressions`シート |
| `src/tests/` | 業務・障害復旧・GAS制約・画面の回帰検証 |
| `docs/` | 製品方針、現行仕様、運用、作業記録 |

教材を変えても過去回答は保存時の版で扱います。要求IDと内容を照合し、成功済みAI結果を再利用します。結果不明の要求を自動再送して推論を重複させません。復旧条件は[G3仕様](docs/specs/gas-trainer-v1.md)を参照してください。

移植元の`sample/`はユーザー指示で削除済みです。必要な教材・処理は`env/`・`src/`に保持し、旧資料はGit履歴から参照します。ローカル秘密ファイルやDoppler設定を、Script Propertiesへの同期済みの証拠として扱わないでください。

## 次に読む文書

- [文書索引](docs/00_index.md)：製品構想と現行仕様の区別。
- [G3仕様](docs/specs/gas-trainer-v1.md)・[データモデル](docs/05_data_model.md)：実装範囲・状態遷移・参照元との差分。
- [テスト方針](docs/07_test_strategy.md)・[配置と受入](docs/08_release_runbook.md)：検証と運用。
- [AGENTS.md](AGENTS.md)：共通規約と再発防止。[CLAUDE.md](CLAUDE.md)：Claude Codeの入口。
