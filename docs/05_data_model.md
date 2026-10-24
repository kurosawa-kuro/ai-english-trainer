# データモデル

正確な列定義・一意制約は`src/server/db/tables.js`。15テーブルを`et_`接頭辞のシートとして保存する。

|分類|テーブル|
|---|---|
|教材|expressions（編集可能）、items（版固定・追記）|
|学習台帳|attempts、assessments、evidence、review_resets（追記）|
|AI運用|ai_requests、operations（更新可能）、usage_events（追記）|
|会話|talk_sessions、talk_requests、candidates（更新可能）、talk_turns（追記）|
|管理|settings、schema_migrations|

すべての値を文字列で保存し、構造化値はJSON列に格納する。IDは必須・一意。itemsにはitem_key+version、talk_turnsにはsession_id+sequenceの複合一意制約。学習台帳のupdate/deleteはコードで拒否する。シートを直接編集できる所有者に対するDBレベルの強制ではない。

初期化は中断後に再実行できる。初期化済みの必須シート欠損・ヘッダ不一致は停止し、自動再作成しない。PropertiesのET_SCHEMA_VERSIONが初期化状態、Geminiキーは別の秘密設定。既存の日記データは移行しない。
