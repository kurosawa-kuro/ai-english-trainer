# GAS英語訓練 G3実装仕様

2026-10-25。ユーザーの実装依頼と「G3：AI会話まで含める」に対応する現行仕様。製品構想の未着手記述より本節を優先し、実装の事実はコード・テストを正とする。

## 境界と構成

配布モデルAを実装上の前提とする。本人実行・本人アクセスのWebアプリ。1コピーで1利用者、1キー、1日次利用枠。複数利用者の共有運用は対象外。

`rpc → Application → 注入ポート → Repository / Gemini`。Domainは純粋関数。bootstrapで組み立て、Sheets書込はSheetStoreに集約。学習履歴は追記、設定・要求状態は更新可能。書込時にScriptLockを必須とし、Gemini呼出はロックを解放して行う。複数シートのトランザクションは存在しないため、IDと確定点で復旧する。キャッシュは世代管理し、更新判断にはfresh readを使う。

## 学習機能

初期表現51件と混同ペアの静的クイズを同梱。選択肢IDのMD5生成・正規化は参照元を移植。意味/意図の成功後にformを出題し、3問以上の間隔を空けた2回成功で安定。間隔・失敗・日跨ぎ・再チェック・学習段階・直近表現の順で優先度を比較する。

自由記述はrecognition、controlled_recall、free_production、slot_replacement、contrast_drill。完全一致は正規化後に決定的採点、その他は同意後にGeminiの構造化観測を取得する。意味・発話意図・明瞭さ・対象表現から5判定へ還元する。参照元で実質到達しなかったretry_formも、対象スキルに影響するissueがある場合に返す。

`items`は出題内容のハッシュ版を追記保存する。回答はその版を参照し、教材を後から編集しても旧回答の採点対象を変えない。回答IDの異内容再利用は拒否。再判定は元回答を変えず新しいassessmentを追加する。evidenceを先に書き、assessment保存を確定点とする。未確定evidenceは出題判断に使わない。

## AI要求と復旧

`pending → running → succeeded / failed / unknown`。要求IDごとに入力ハッシュ、モデル、出力上限、プロンプト版、入力snapshotを保存する。成功済みは保存結果を返す。pendingは再開可能。running・unknown・failedを同じIDで外部再実行しない。

日次回数はJSTの予約日で要求を数える。失敗も利用枠を消費する。429で当日の新規AIを止め、翌日復帰。既定は30回/日。これはアプリ内制限でありGoogleの課金設定を制御しない。キーはScript Propertiesのみで、画面・ログへ返さない。

unknownは最終更新から15分後に設定画面で中止可能。runningの時間超過を検出するとunknownに更新するため、その場合は更新後さらに待機が必要。中止後の遅い応答は破棄する。中止はGoogle側の処理取消ではない。回答は再判定、新しい会話メッセージは新IDで実行する。

## 会話

teacher（先生）、learner（仲間）、free_talkの3シナリオ。開始応答、最大30ユーザーターン、直近10ターンの文脈、終了時の振り返りと最大5表現候補。会話内で未確定ターンを並行追加しない。終了要求はsessionごとに固定し、AI成功後の保存失敗では同じ結果を再利用する。候補承認は候補の記録であり、教材への自動追加ではない。

## G3における差分と対象外

- 参照元のRPC名18個を登録するが、G4の混同ペア登録・人間観測・観測比較・trace・phase gateは`not_implemented`。同名RPCの完全な入出力互換は保証しない。
- 今日の画面は学習件数と練習導線。自動計画、能力別ダッシュボード、昇格・診断、混同状態からの動的優先度はG4。
- 教材は各表現の代表例1件を使用。代表例がない教材はextra_examplesの先頭を使用し、追加例の網羅出題は未実装。
- 表現候補抽出はGeminiの構造化出力。参照元の全会話メトリクス・freeze規則は未移植。
- 静的混同ペアはenv由来で、シート編集対象は表現教材。音声入出力・関係DBは導入しない。

## RPC境界

入口は`rpc(name, request)`。`job-control.v1` envelopeのok/code/data/errorを返す。回答要求はattempt_id・item_id・response_modeとanswer_textまたはselected_option_id。再判定はattempt_id・regrade_id。会話はsession_idに加えturn_id/messageまたはrequest_id。AI送信時はconsentが必要。

独自拡張は`english_trainer_get_talk_v1`と`english_trainer_abandon_ai_v1`。詳細なフィールドと実例は`src/server/controllers/api.js`、`src/tests/application.test.mjs`を参照。
