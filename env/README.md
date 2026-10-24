# 設定と教材

config.yamlとexpressions/*.yaml、confusion-pairs.yamlを`src`の`npm run build:data`で生成する。秘密を生成物へ入れない。secret.example.yamlは項目例のみで、実行時のキーはアプリ設定画面からScript Propertiesへ登録する。

初回のみYAML教材を`et_expressions`へ投入する。以降はシートが正本。idは一意の英数字・ハイフン・アンダースコア、form/meaning/example_en/example_jaを入力、statusはactive。quiz_jsonは初期行と同じJSON形式（meaning/intent/formごとのcorrect・near配列（誤答1〜5個））を使う。不正行は出題から除外し警告する。ヘッダ名を変更しない。

初期教材は代表例1件を使用し、extra_examples全件の展開は行わない。静的混同ペアは生成物に同梱するため、その編集には再生成・配置が必要。
