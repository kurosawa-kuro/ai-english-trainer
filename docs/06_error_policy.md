# エラーと復旧

|状況|動作・復旧|
|---|---|
|validation_error / request_conflict|入力を修正。保存後の同ID異入力は拒否|
|setup_required|シートの初期設定を実行|
|schema_missing / schema_mismatch|バックアップから復元・列定義を確認。初期化で消去しない|
|setting_off / key_missing|設定後に同じ回答を再送|
|limit_reached|日次上限または429。当日は新規AI停止|
|ai_running / ai_unknown|同IDで状態確認。自動外部再送なし。待機後に設定で中止|
|ai_failed / ai_abandoned|元回答は残る。新IDで再判定・会話再開始|
|internal|同IDで再試行し、保存済み結果から復旧|

詳細な状態遷移は[G3仕様](specs/gas-trainer-v1.md)。失敗しても成功した採点を捏造しない。生の外部応答・秘密キーはUIへ返さない。ローカルのブラウザ保存は同一タブの保留要求を保持する補助であり、ブラウザを閉じた後は記録から復帰する。会話の保留本文・要求IDはサーバーの保存記録から復元し、エラーのai_request_idが手動中止対象を示す。AI予約前のpending中断も同じ要求で再開できる。
