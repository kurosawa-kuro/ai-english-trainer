# ドメイン

現行ルールは[G3仕様](specs/gas-trainer-v1.md)。Expressionから版固定Itemを生成し、Attemptが回答を記録する。Assessmentが採点の確定点、Evidenceが能力別の根拠。再判定は追加履歴となる。

QuizPolicyは間隔、失敗、学習段階等で出題を選ぶ。AssessmentPolicyは観測をpass / pass_with_note / retry_target / retry_form / fail_communicationへ還元する。AI要求状態と会話セッション状態はApplicationで管理する。
