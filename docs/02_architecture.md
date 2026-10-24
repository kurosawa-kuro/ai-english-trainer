# アーキテクチャ

現行仕様は[G3仕様](specs/gas-trainer-v1.md)。`server/domain`は純粋ルール、`server/application`は注入ポートを使うユースケース、`server/bootstrap`は依存の組立。controllerはRPC envelopeを担い、repositoryは論理テーブル、SheetStoreは物理シートを扱う。

書込はScriptLock内、外部AIはロック外。AI結果を保存後、再送可能な確定処理で学習記録へ反映する。キーはPropertiesService、永続化はSheets、外部送信はGeminiのみ。キャッシュに更新判断を依存させない。
