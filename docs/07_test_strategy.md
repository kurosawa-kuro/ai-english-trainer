# 検証

`src`で`npm run check`を実行する。教材生成整合・Nodeテスト・フォーマットを検査する。`npm run test:browser`は実Chromiumで1440px/390px幅の主要導線を試す（GAS/Geminiはモック）。スクリーンショットとJSONは`src/test-results/`に出力する。

Nodeでは出題・5判定・選択肢ID互換、初期化・schema破損、追記制約、二重送信、保存障害、利用枠、429と日跨ぎ、unknown、3シナリオ会話、構造化応答検証、秘密非公開、依存方向・外部宛先制約を検査する。

2026-10-25時点でNode 42件成功・0失敗、生成整合・Prettier成功、PC/モバイル幅のブラウザ検証成功。これは実GASの権限・Sheets遅延・Gemini採点品質の保証ではない。出荷前に[受入チェック](08_release_runbook.md)を行う。実端末の操作と実モデルの採点校正は未実施。
