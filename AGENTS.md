# AGENTS.md

全コーディングエージェント共通の作業規約。導入・現状・検証実績は[README](README.md)。文言・コメント・文書は日本語で書く。

## 範囲と正本

- 製品方針は[GAS版構想](docs/GAS版AI英会話訓練アプリ構想_ai-english-trainer.md)、実装の事実はコード・テストと[G3仕様](docs/specs/gas-trainer-v1.md)。構想の古い未着手・未決を現状として扱わない。
- G3はローカル実装済み、実環境受入・公開は未実施。配布モデルA（本人限定・1人1コピー・各自のキー）を採用する。B/Cへの共有運用変更は別の判断を要する。
- 中核はAI採点とテキスト会話。選択式クイズが動くだけで製品完成としない。音声入出力とG4は対象外。
- 永続化はSheets、実行時の秘密はPropertiesService。関係DB・`Jdbc`は禁止。`UrlFetchApp`の宛先は`generativelanguage.googleapis.com`のみ。キーは`x-goog-api-key`ヘッダで送り、URL・画面・ログへ出さない。
- `sample/`は削除済み。依存を復活させずGit履歴を参照する。ユーザーが明示した日記基盤の参照・コピーは例外として認められているが、それ以外の他リポジトリ探索や、他プロジェクトの接続先・秘密・計画の持込みはしない。

## 責務とデータ

- 配布コードは`src/`、非機密設定・初期教材は`env/`。利用開始後の教材正本はSheets。envの再生成で利用者の教材を上書きしない。
- Domainは純粋な業務判断、Applicationは注入ポートによる処理順序、bootstrapは依存の組立。具体的GAS・Gemini依存をDomain / Applicationへ入れない。
- Sheets書込は`db/sheet-store.js`へ集約し、`requireWriteLock_`でロック保持を検査する。公開入口はcontrollers、内部の大域関数は末尾`_`。GASの読込順に依存しない。
- 回答・採点・能力証拠は追記台帳。要求IDと入力を照合し、同ID異内容を拒否する。証拠を先に書き、assessmentを確定点にする。最新判定と教材版を維持する。
- キャッシュは表示の高速化用。更新判断・重複照合はfresh読取。スキーマ欠損を初期化で隠さず、バックアップと列定義を照合する。
- 非機密設定は`env/config.yaml`、ローカル秘密はGit除外済み`env/secret.yaml`。実行時のキーは設定画面からScript Propertiesへ保存する。Doppler等の設定ファイルの存在を自動同期の実装と混同しない。

## レビューから得た再発防止

| 壊れやすい前提 | 維持する実装・検証 |
|---|---|
| エディタで動けばWebでも保存先が取れる | 初期設定で`ET_SPREADSHEET_ID`を登録し、Webでは`openById`。activeなし・未設定・コピー先への再登録を検証。保存先変更時は旧コピーのキーを消す |
| 書式`@`だけで入力文字列を保持できる | 文字列スキーマはRichTextで書く。先頭`=`・引用符・先頭ゼロ、セル長、更新時の主キー不変を検証 |
| LockService＋追記なら複数表が原子的になる | キャッシュ新世代公開前と最外側のロック解除前にSheetStore経由でflush。例外時もロックと保持フラグを解放し、途中停止は要求台帳で回復 |
| 予約できたらAIへ送ってよい | 予約確定後にロック外で呼ぶ。flush失敗時の呼出ゼロを検証。未送信pendingの再開時にもAI設定・キー・利用枠・予約日を確認 |
| 応答がなければ同じAIを再実行してよい | 成功結果は再利用。running・unknown・failedを同IDで外部再実行しない。中止は所定の待機後、遅い応答は採用しない |
| ブラウザ保存と時刻順だけで復旧できる | 会話の保留ID・本文・終了要求をサーバー記録から復元。採点確定順と最新判定を守り、旧要求の遅延確定で新結果を上書きしない |
| JSON.stringifyや全テスト成功で安全と言える | 入力・AI出力は表示境界でもデータとして扱う。script内へ埋める場合はHTML終端を無害化。mockが再現しないGAS制約を実環境受入に残す |

主な回帰検証は`src/tests/review.test.mjs`・`lock-safety.test.mjs`・`application.test.mjs`。境界制約は`architecture.test.mjs`。既存の再送・障害回復を壊す変更は、正常系だけで判断しない。

## 検証と反映

コマンドは`src/`で実行する。Makefileはテンプレート。

- 実装変更は関連テストと`npm run check`、画面変更は`npm run test:browser`。変更ファイルをPrettierで整形する。env変更後は`npm run build:data`と生成差分確認を行う。
- 文書だけの変更はリンク・コマンド・実装との整合を確認する。過去のテスト件数を今回の実行結果として報告しない。
- 本人限定の公開・配布・更新は[Runbook](docs/08_release_runbook.md)に従う。`npm run push`は検証と配置を行うが、Webアプリの公開版は更新しない。コピー配布は実環境受入後。
- ローカル単体テスト、実Chromium＋模擬GAS/Gemini、実GAS/Sheets/Geminiを区別して報告する。未実行・失敗・未反映を隠さない。文書更新をpush/deployの依頼と解釈しない。
- 作業開始時のGit差分を確認し、既存変更を破棄しない。コード・文書・生成物へ秘密情報を出さない。

## 文書とツール固有設定

[文書索引](docs/00_index.md)に従い、確定仕様は`docs/specs/`や01〜08、作業経緯は`docs/tasks/`に置く。製品方針を変えたら[判断日誌](docs/decisions/decision-log.md)へ追記する。READMEは導入と現状、本書は共通規約、CLAUDEはツール固有の入口とし、時系列ログを3か所へ複製しない。

[CLAUDE.md](CLAUDE.md)と`.claude/rules/`・`.claude/skills/`はClaude Code用。共通の再発防止をClaude専用設定だけに置かない。AI制御の詳細は[.claude/README](.claude/README.md)、[実行手順](docs/specs/runtime-protocol.md)・[権限境界](docs/specs/capability-boundary.md)・[変更境界](docs/specs/change-boundary.md)・[証拠方針](docs/specs/evidence-policy.md)を参照する。他プロジェクトのpermissionsを流用せず、関係DB用ツールのdenyを緩めない。
