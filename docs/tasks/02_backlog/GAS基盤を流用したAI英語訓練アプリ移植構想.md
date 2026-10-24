# GAS基盤を流用したAI英語訓練アプリ移植構想

作成日：2026-10-24
再設計日：2026-10-25（DB v2・Domain/Application分離後の再調査）

## Goal・位置づけ

`ai-photo-diary` の現在のGAS基盤を選択コピーし、`sample/speak-kit/` の英語訓練の挙動・教材をGAS＋Google Sheetsへ移植する。本書は調査に基づく設計案と実装計画であり、アプリの実装・コピー・公開は今回行わない。

製品定義の正本は [GAS版AI英会話訓練アプリ構想](../../GAS版AI英会話訓練アプリ構想_ai-english-trainer.md)。DB・アーキテクチャについては本書で改訂案を示し、実装前に正本と01〜08文書へ反映する。本書だけで確定仕様を置き換えない。

日記アプリの参照はユーザーが明示した今回の範囲として扱う。参照元の残作業は引き継がず、`sample/speak-kit/` は読む専用とする。関係DB・Next.js実行基盤・音声入出力は採用しない。

## 1. 再調査の結論

**旧Service中心の移植案を、Domain／Application／外部アダプターを分ける案へ変更する。DB v2の要求管理・fresh読取・制約検査・キャッシュ世代管理を流用するが、日記の10表は英語訓練の表へ置き換える。**

英語訓練の回答・採点・学習証拠は追記して履歴を残す。一方、要求の実行状態や初期化の進行状態は更新可能な運用台帳として分離する。この区別をせず、日記の保存方式を丸ごとコピーしたり、すべての表を無理に追記専用にしたりしない。

### 現在の実装と前回案の訂正

| 項目 | 今回確認した実装 | 計画の変更 |
|---|---|---|
| 業務の構造 | `domain/` は純粋な判断、`application/` は注入されたポートで手順を実行、`bootstrap/composition.js` が依存を組み立てる | 新アプリも同じ方向で依存を組む。旧Service名は日記の互換窓口なので新規移植に必須ではない |
| Sheets | `readFresh/readManyFresh`、見出し完全一致、`TABLE_UNIQUE` による書込時検査を追加 | 表示用読取と更新判断を分離する。業務参照・状態遷移はApplication/Repositoryでも検証する |
| キャッシュ | 永続世代、書込中の利用停止、遅延読取の旧世代隔離、容量超過時の旧値除去を実装 | 前回の「容量超過時に旧キャッシュが残る」は現行コードでは解消。新アプリには修正後を採用する |
| AI要求 | requestId必須、入力hash、入力snapshot、pending/running/succeeded/failed/unknown、成功結果の再送を実装 | 二重実行防止の手順を新規に考え直す範囲は減った。採点・会話用の入力と結果に置換する |
| AI外部通信 | ロック内で予約→ロック外でprovider実行→ロック内で結果保存 | この手順を採用。外部通信をロック内に戻さない |
| 初期化 | 旧表を自動削除しない。v2有効後の欠損表は自動再作成せず停止 | 前回の「旧表削除を除去」は現行では不要。新規初期化と将来の移行を分ける方針を利用する |
| 保存回復 | 同ID異入力を拒否、親保存後の再送は完了を補修。親なしは未完了childrenを削除して再開 | 要求照合は採用。子削除は追記型の学習台帳には使わない |
| 検証 | Domain/Application単独、構造、障害注入、DB v2、GASモック、画面テストがある | 層ごとの検査と障害注入を移植し、英語訓練の学習結果を検証する |

### 稼働状況の読み分け

日記のAGENTS・DB v2仕様には「本番移行未実施」の記述が残るが、`docs/tasks/03_active/本番DBv2移行_2026-10-25.md` には、移行・v2有効化・公開版@18への更新完了が記録されている。今回は後者を最新の運用記録として扱う。ただしリモート環境を再照会した結果ではなく、公開画面の操作確認も記録上は未実施。

Domain/Applicationの分離が公開@18に含まれるかは、その版のコードとの照合を今回していない。**流用対象は調査時点のローカル実装**であり、公開環境で全検証済みとは扱わない。

## 2. 再設計するアーキテクチャ

```text
client/views → client/core/api → controllers/rpc → application → domain
                                               ↓ 注入ポート
                                      models / db / Gemini adapter
                                               ↑
                                      bootstrap/composition
```

| 層 | 英語訓練での責務 | 禁止する依存・役割 |
|---|---|---|
| Domain | 回答正規化、出題候補の順位、採点観測の判定、利用可否、状態遷移条件 | GAS・Sheets・Gemini・現在時刻・設定の直接参照 |
| Application | 出題、回答受付、採点、再判定、会話、履歴集計の順序と復旧 | 具体的なRepositoryや外部APIを直接組み立てない |
| Models/Repository | 教材・回答・採点・要求台帳の読書き、レコードと業務値の変換 | 出題順位・採点判定をSQL相当の保存処理へ埋め込まない |
| DB | シート名、列、文字列書式、複合一意キー、fresh/表示用読取、世代キャッシュ | 英語訓練の採点や画面文言を持たない |
| AI adapter | Gemini要求、構造化出力、通信エラー、usageの変換 | 日次上限や学習上の合否を決めない |
| Bootstrap | clock、ids、hash、lock、repository、provider、settingsの注入 | 巨大な共通コンテキストを全処理に渡さない |
| Controllers/Presenters | 18 RPCの受付・入力境界・envelope・日時の文字列化 | 業務手順を重複実装しない |
| Client | 5タブ、入力保持、送信ID保持、古い応答の拒否、再送・再判定の導線 | 採点・権限・利用枠をクライアントだけで保証しない |

配置は `src/server/{domain,application,bootstrap,models,db,controllers,presenters,core,config}`、AIアダプターは `src/server/services/ai/`、画面は `src/client/{core,views,vendor}` を案とする。命名は既存構成を利用し、ディレクトリ整理自体を目的にしない。

主なApplicationは Quiz、Attempt、Assessment、Talk、Progress、Settings。注入ポートは必要なものだけ渡す。例：Assessmentには attempts・assessments・aiRequests・usage・provider・clock・ids・hash・lock・settingsを渡す。

## 3. コピー単位の見直し

| 対象（日記側の相対パス） | 扱い |
|---|---|
| `server/core/errors.js`、`lock.js`、`request-hash.js` | 基本処理を流用。要求hashは用途ごとに正規化順序と版を固定する |
| `server/db/sheet-store.js`、`table-cache.js` | 基盤を流用。物理名・設定キーを英語訓練用に変更し、旧表読取処理を除く |
| `server/db/tables.js`、`seeder.js` | 設計方式を流用して新規定義。日記の表・サンプル・写真初期化はコピーしない |
| `server/application/generation.js`、`domain/generation-policy.js` | 予約・実行・状態照合・復旧を見本に採点用へ書き換える。写真・タグ・日記の保持期間は持ち込まない |
| `server/models/generation-repository.js` | 要求照合と成功結果再利用を参考に作る。title/body・画像関連の列は使わない |
| `server/bootstrap/composition.js` | 組立方法を流用し、英語訓練のポートへ置換する |
| `server/services/draft/gemini-client.js` | 通信実装を流用。観測JSONと会話文脈の受け渡しを追加する |
| `client/core/`、admin-pico、入力・要求ID保持の実装 | 共通UI・履歴・古い応答の拒否を流用。日記APIをRPCに変更し、envelopeを落とさない |
| `tests/domain-application.test.mjs`、`architecture.test.mjs`、`failure-helpers.mjs`、GASモック | 検査の仕組みを流用。日記固有の期待値を英語訓練に置換する |
| `scripts/check.mjs`、生成物照合、ブラウザテスト基盤 | ローカル検証の仕組みを流用。診断対象・教材生成・AI dry-runを新アプリ用にする |

コピーしない：日記10表の実データ、assets/Drive/アップロード、旧日記DBの移行処理、旧Service互換窓口、日記プロンプト、30日整理の方針、15分の運用値、秘密ファイル、`.clasp.json`、既存デプロイID、認証情報、node_modules、他プロジェクトのエージェント設定。

新規アプリなので日記v1→v2移行を実行しない。`v2_` 接頭辞と `DB_SCHEMA_VERSION=2` を新アプリの版として盲目的に継承しない。専用ブックで英語訓練schemaの初版を定義する。

## 4. DB再設計案

### 原則

- 永続化はSheets。業務ID、操作ID、AI呼出ID、教材版を区別する。
- 回答・採点・証拠は追記専用。現在の成績は確定済み履歴から導出する。
- 要求状態・設定・schema進行状況は更新可能。追記専用制約を適用する表を明示する。
- 読取キャッシュは表示の最適化に限定。要求照合・利用枠・状態遷移はロック内のfresh読取を使う。
- `TABLE_UNIQUE` は空値を飛ばす実装なので、必須ID・参照先・列型は別途検証する。一意検査だけで業務整合が保証されるとは扱わない。
- SheetStore自身はロックを取得しない。すべての業務書込はApplicationのlockポートを経由し、Repositoryを経由しない書込を検査で禁止する。

### G1〜G2の論理表候補

以下は列の要点でありDDL確定ではない。従来の「G1＝7枚・G2追加3枚」を固定目標にせず、整合性に必要な台帳を分ける。

| 論理表 | 主なID・列 | 更新規則 |
|---|---|---|
| expressions | skill_key、form、meaning、intent、example、status | 利用者が編集。検証後の版を実行用教材へ反映 |
| quiz_items / practice_items | item_key、content_version、prompt、選択肢またはrubric、snapshot/hash | 発行済み版を保持。編集中の表から過去回答を再解釈しない |
| quiz_attempts / training_attempts | attempt_id、learner_key、item_key/version、回答、answered_at、latency | 追記。同ID異回答は拒否。選択式の結果はサーバーで判定 |
| assessments | assessment_id、attempt_id、source、ai_request_id、observation、判定、判定規則版 | 追記。再判定は別assessment_idで追加 |
| capability_evidence | evidence_id、assessment_id、skill_key、能力別結果 | 確定した採点に対応する追記。決定的IDで二重登録防止 |
| operation_requests | request_id、kind、payload_hash、target_id、state、timestamps | 回答保存・再判定等の処理状態を更新。結果の確定点は業務台帳側に置く |
| ai_requests | ai_request_id、operation_id、feature、input_hash、snapshot、model、prompt_version、state、result、usage、error | 外部呼出の予約と結果を保持。同じ成功要求は保存結果を返す |
| ai_usage_events | event_id、ai_request_id、day_key、event_type、tokens、status | 予約・完了・429等を追記。要求IDごとに集約し、イベント数を呼出数と誤認しない |
| review_resets | reset_id、learner_key、requested_at | 追記。履歴削除でリセットしない |
| quiz_promotions | promotion_id、対象、根拠attempt、created_at | 必要なら追記。履歴だけから導出できる範囲は表追加を省略可能 |
| settings | learner_key、ai_enabled、daily_limit等 | 更新可。秘密値は置かない |
| schema_migrations | version、checksum、state、checkpoint | 初期化・将来移行の進行記録。途中を検出して明示的に再開 |

単一列IDを各更新対象に設ける。複合一意キーは別に定義する。教材の表示表・編集表の名前とヘッダ固定の案内を揃え、利用者が誤って列を並べ替えた場合も理由を示して止める。

G3はtalk_sessions・talk_turns・candidatesを追加。turn_idと会話の順番を固定し、同じセッションの並行送信を制御する。G4の計画・混同・診断は後続設計とし、日記の表数に合わせて無理に統合しない。

### 複数表にまたがる保存の確定点

Sheetsにロールバックがあるとは扱わない。次の順序を案とする。

1. ロック内でrequest_idと正規化hashを照合し、操作を予約する。
2. 回答をattempt_idで追記する。既存同内容なら再利用し、異内容なら拒否する。
3. AI結果を保存した後、決定的IDの学習証拠を追記し、最後にassessmentを追記して採点を確定する。
4. 集計は対応するassessmentが存在する証拠だけを採用する。未確定の証拠は見せず、再送で不足分を補う。
5. 操作台帳を完了にする。完了更新に失敗しても、業務台帳の確定済み結果から補修する。

回答が残って採点がない状態は「未判定」として表示する。採点済みの意味をエラー発生と混同しない。再判定は回答を上書きせず、新しい採点要求・採点履歴を作る。現行採点を選ぶ規則（AI再判定・人手観測の優先度、時刻同値の順序）はspeak-kitを再確認して固定する。

## 5. AI採点・会話の実行設計

日記v2の実行手順を採用し、英語訓練用に次を追加する。

1. 操作開始時にAI設定・キー有無・利用枠を確認する。正解・許容解との完全一致は参照元どおり決定的採点し、AI利用枠を消費しない。
2. AIが必要ならロック内で要求を照合し、教材版・rubric・回答・モデル・プロンプト版・上限をsnapshotとして固定する。秘密値はsnapshotに含めない。
3. 同じロック内で日次枠を予約する。snapshot、要求、利用予約の途中失敗も照合可能にし、runningへ進む前に必要な記録を揃える。
4. ロック外でGeminiを呼ぶ。出力のJSON構造だけでなく、enum・必須項目・長さ・数値範囲も検証する。
5. 再びロックを取り、まだrunningかを確認して結果を保存する。その結果から採点台帳を確定する。
6. succeededは再送してもAPIを呼ばない。failedも同IDで自動再実行しない。通信結果不明・結果保存前停止はunknownまたは照合対象とし、勝手に再生成しない。
7. unknownから再判定する場合は新しい要求であることを明示する。遅れて戻った旧要求が新しい結果を上書きしない。

外部APIの厳密な1回実行は保証しない。アプリ側では同じ要求の自動再送による重複呼出を防ぐ。runningの期限と手動中止の条件は英語訓練の運用値として決め、日記の15分を根拠なく固定しない。

利用枠は「送信された可能性がある要求」を保守的に数える案とする。unknownを自動返却せず、送信前失敗が確定した予約だけ解放する。429は構想に従い当日のlimit_reachedへ反映する。日付境界はAsia/Tokyo。日付跨ぎは予約日を記録し、重複完了イベントで二重計上しない。

会話では履歴の採用範囲、役割、長さ上限、応答待ちターン、終了済みセッションへの送信拒否を追加する。日記の単一userメッセージ送信だけでは会話機能は完成しない。

AI要求のsnapshot整理と学習証拠の保持は別設計とする。日記の「30日後に本文を手動整理」をコピーすると学習の再評価材料を失うため、保持方針を決めるまで自動削除しない。

## 6. 残る仕様判断と互換性

- **配布モデルA/B/C**：未決を維持。構想どおりAを暫定設計の基準とするが、公開設定を確定しない。B/Cでは利用者識別・キー保存・データ可視性・枠の単位・ロック範囲を再検討する。
- **追記専用の範囲**：学習履歴は追記、処理台帳は更新可能とする案を正本へ反映してから実装する。
- **教材編集**：誤答選択肢 `quiz.*.near`、教材版、無効行の案内、生成中の教材変更を扱う。1行追加だけで十分な選択肢が作れるとは未確認。
- **初回出荷**：G2のAI採点までを維持。会話を初回に含めるならG3へ変更する。G4の実施は別判断。
- **ハッシュ互換**：初回調査ではspeak-kitの `domain/hash.mjs` はSHA-256、教材の選択肢IDなどはMD5、通常item keyは文字列。新しい要求hashと教材IDの方式を混ぜない。
- **出題互換**：同順位はrandomで選ばれる。候補集合・優先順位を比較し、一意の場合だけ次の1問の一致を要求する。
- **採点5判定**：初回調査で `retry_form` の文面はあるがreduceObservationに返却分岐がないことを確認。校正前に構想と実装のどちらを改めるかを決める。
- **18 RPC**：名称とenvelopeを維持する案。新しい要求状態、利用枠、設定キー登録をどう返すかを契約表にする。段階未実装のRPCを完成扱いにしない。
- **外部仕様**：モデル・無料枠・構造化出力・コピー後のデプロイ手順は実装時に公式資料と実機で再確認する。今回はローカル再設計であり再検証していない。

## 7. 改訂した実装計画

| 順 | 作業 | 完了条件 |
|---|---|---|
| 0 | 設計判断を正本・01〜08へ反映 | 層の責務、追記/更新の区分、要求状態、初回出荷範囲が矛盾しない |
| 1 | 基盤を選択コピー | 日記固有の表・写真・デプロイ先なし。Application/Domain単独テストと依存境界検査が通る |
| 2 | DB・初期化・要求台帳 | 表定義、必須値、一意性、fresh読取、世代キャッシュ、初期化中断・再開を検証。schema有効化後の欠損を自動補完しない |
| 3 | G1：教材・クイズ・記録 | 出題順位、教材版、回答の冪等保存、再チェックを検証。AIなしを出荷完了にはしない |
| 4 | AI要求の土台と採点校正 | ロック外通信、結果再利用、unknown、利用枠、構造化観測を検証。非個人情報の回答セットで実Gemini校正 |
| 5 | G2：自由記述・再判定・UI | 回答→採点→証拠→記録が通る。保存途中失敗から再送しても回答・採点・利用枠が増えない |
| 6 | 新規GAS環境で受入 | コピー、初期設定、キー登録、権限、公開HTML、スマホ実機、最初のAI採点を確認 |
| 7 | G3：会話 | セッション開始・並行送信防止・往復・終了・候補抽出を検証 |
| 8 | G4：計画・混同・診断 | 必要性を確認して実装。参照元の出題・学習証拠の意味を維持 |

日記の本番移行をもう一度実施する工程は含めない。工数はDB境界と互換性の判断後に見積もる。

## 8. Acceptance Criteria・検証方針

- Domainは固定した時刻・入力だけで検証できる。ApplicationはGASモックなしのポート差替えで検証できる。
- DB統合では書込前後の障害注入、ロック競合、同ID異入力、必須ID欠落、複合キー重複、参照不整合を検証する。
- 回答保存後、AI結果保存後、証拠保存後、採点保存後、要求完了前の停止をそれぞれ再送し、確定点と件数を確認する。
- AI実行中の再送、unknown、新要求、手動中止後の遅い結果、429、日付跨ぎ、複数操作の利用枠競合を検証する。
- 表示用キャッシュの破損・容量超過・旧世代書戻しが更新判断を誤らせない。キャッシュなしでも処理が成立する。
- UIは入力・要求IDを保持し、通信エラー後に別回答を同じIDで送らない。タブ変更後の古い採点結果を描画しない。
- Node/GASモック、実Chromiumの模擬RPC、実GAS/Sheets/Gemini、スマホ実機を区別して証跡を残す。
- Jdbc禁止、Gemini以外への外部送信禁止、内側から具体アダプターへの依存禁止、台帳の更新禁止を機械検査にする。

## 9. 今回の調査証跡

参照元：`C:\Users\owner\.ssh\dev\gas\ai-photo-diary`

主な確認ファイル：

- `AGENTS.md`
- `docs/specs/database-v2.md`
- `docs/specs/application-domain-architecture.md`
- `docs/tasks/03_active/本番DBv2移行_2026-10-25.md`
- `src/server/application/generation.js`
- `src/server/bootstrap/composition.js`
- `src/server/domain/generation-policy.js`
- `src/server/models/generation-repository.js`
- `src/server/db/{tables,sheet-store,table-cache,seeder}.js`
- `src/server/core/request-hash.js`
- `src/scripts/check.mjs`、`src/package.json`、`src/tests/README.md`

今回実行したローカル検証（作業ディレクトリ：日記のsrc）：

| コマンド | 結果 |
|---|---|
| `node --test --test-reporter=tap "tests/*.test.mjs"` | 139件成功、失敗0、スキップ0、終了コード0 |
| `node scripts/build-data.mjs --check` | 生成物と入力設定の整合確認成功、終了コード0 |

今回は日記の実コード・本番データを変更せず、実API送信、ブラウザ試験、push/deploy、本番移行を行っていない。テスト件数は網羅率や実環境動作の保証ではない。英語訓練のsrcは今回も未作成である。

## 10. 改訂履歴

- 2026-10-24：GAS基盤とspeak-kitを参照する概略計画を作成。
- 2026-10-25前回：日記保存回復・画面制御・ブラウザ試験を反映。ローカル75件成功。
- 2026-10-25今回：DB v2・Domain/Application分離を基準に本文を再設計。AI要求管理とキャッシュ不整合対策が既に実装されたことを反映し、古い未実装・不具合の記述を置換。学習台帳と運用台帳の分離、採点の確定点、利用枠・unknownの扱いを設計案として追加。