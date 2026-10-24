# ai-english-trainer

GAS・Google Sheets・Geminiで動く、個人用の英語訓練アプリです。

G3までのローカル実装済み。選択式クイズ、自由記述のAI採点・再判定、3シナリオのテキスト会話、振り返りと表現候補、学習記録、設定を備えます。配布モデルA（1人1コピー・各自のキー）で実装しています。実GAS/Sheets/Geminiでの受入確認・公開は未実施です。

## 開発

`src`で実行します。Node.js 22以降を使用してください。

```powershell
npm ci
npm run build:data
npm run check
npx playwright install chromium
npm run test:browser
```

- `src/server`: Domain / Application / bootstrap / DB / Geminiアダプター
- `src/client`: HtmlServiceの5タブ画面
- `env/config.yaml`: 非機密設定。変更後に`npm run build:data`
- `env/expressions`: 初期教材51件。利用開始後の教材正本は`et_expressions`シート
- 移植元の`sample/`は削除済み。必要な教材・処理は`env`・`src`に保持し、旧資料はGit履歴から参照

導入は[配布手順](docs/08_release_runbook.md)、実装仕様は[G3仕様](docs/specs/gas-trainer-v1.md)、検証範囲は[テスト方針](docs/07_test_strategy.md)を参照してください。Makefileはstarterのままで、上記npmコマンドを使用します。

DBはSheets、秘密はScript Propertiesのみ。音声機能はありません。G4の自動計画・混同ペア登録・人間観測比較・診断は対象外です。既存の日記アプリの接続先や秘密情報は引き継いでいません。
