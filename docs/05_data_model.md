# 05 データモデル

正本は [構想](./GAS版AI英会話訓練アプリ構想_ai-english-trainer.md) 6 章。ここには確定した方針と、現時点のシート構成案を置く。**まだ実装は無い。**

## 永続化は Google Sheets だけ

| 置き場 | 内容 |
|---|---|
| Google Sheets | 教材、学習記録、設定、AI 使用額 |
| `PropertiesService` | Anthropic の API キー |

**関係データベースは採用禁止**（構想 5.2）。Postgres / Supabase / Neon / Turso / Cloud SQL / MySQL を使わない。「今は使わない」ではなく禁止で、将来の機能追加の理由にもしない。

到達経路を 2 つとも塞ぐ:

- **`Jdbc` サービスを使わない**
- **`UrlFetchApp` の宛先は `api.anthropic.com` のみ**

## 教材の正本は利用者のスプレッドシート

参照元は YAML を検査・導出して DB に流していた。ここでは **`expressions` シートそのものが正本**である（構想 4.8）。

- 利用者が行を 1 行足すと、次の出題から出る
- 配布時の初期教材は `sample/speak-kit/data/` の YAML から生成した JSON を同梱し、「初期設定」で投入する。**投入は 1 回だけ**
- `key` は一度決めたら変えない
- 教材（表現・クイズ）と学習の状態（回答・取り違えた回数）を同じシートに混ぜない

**利用者が壊せる前提で書く。** 検査関数を初期設定と出題の前に通し、壊れた行は飛ばして警告する。

## シート構成（案）

段階ごとに必要な分だけ作る。JSON 列を使ってシート数を抑える。

### G1（土台）

| シート | 主な列 |
|---|---|
| `expressions` | **利用者が編集する正本。** key, form, meaning, intent, tier, kind, example_en, example_ja, status |
| `quiz_items` | item_key, option_set_version, skill_key, quiz_type, prompt, options(JSON), correct_option_id, status（`expressions` から導出・再生成） |
| `quiz_attempts` | attempt_id, answered_at, item_key, skill_key, quiz_type, selected_option_id, outcome, latency_ms ← **追記専用** |
| `quiz_promotions` | item_key, promoted_at |
| `review_resets` | requested_at |
| `settings` | learner_key, ai_enabled, updated_at |
| `ai_usage` | called_at, feature, model, input_tokens, output_tokens, cost_usd |

### G2 以降

- G2（AI 採点）: `practice_items`、`training_attempts`（観測と採点結果は JSON 列に畳む）、`capability_evidence` の簡約版
- G3（会話）: `talk_sessions`、`talk_turns`、`candidates`
- G4（計画・混同・診断）: `confusion_pairs`、`confusion_probes`、`confusion_state`、`training_plans`、`plan_items`、`weakness_diagnoses`

全段で 19 枚。参照元の 30 表からの縮小は、ビュー・クレーム表・ポリシー版管理・監査用の表を落として出す。

## 関係 DB を捨てて失うもの

代替が無いのは次の 3 点だけである（構想 5.2）。**どれも関係 DB を戻す理由にならないが、コード側で引き受ける。**

| 失うもの | 引き受け方 |
|---|---|
| **一意制約** | 冪等性（`attempt_id` の再送）は `LockService` 下で走査してから追記する。ロックを忘れると**エラー無しで二重行**が入る |
| **トリガによる追記専用の強制** | 書き込み関数を 1 か所に閉じる。さらに**利用者はシートを開いて履歴を直接書き換えられる**（参照元では不可能だった）。台帳シートの非表示と保護で緩和するが、所有者は解除できる。「本人が壊せる自分の記録」と割り切る |
| **外部キー** | 参照の整合はコードで保つ |

## 設定と秘密

| 種別 | 方針 |
|---|---|
| 非機密設定 | `env/config.yaml` |
| ローカル秘密情報 | `env/secret.yaml`（`.gitignore` で除外。コミット禁止） |
| 共有・本番の秘密情報 | Doppler |
| 配布先の実行時の鍵 | 各自の GAS スクリプトプロパティ |

**このプロジェクトの秘密は Anthropic の API キー 1 本だけ**で、接続文字列は存在しない。

## 未決

- 配布モデル B・C を採る場合、全シートに学習者の列が要る（構想 8.3）
- 回答台帳のローテーション閾値と方式（行数が数千を超えたとき）
- 利用者が足した表現から、クイズの選択肢（誤答）をどう作るか

## 関連タスク

- シート構成、移行、永続化方式の変更は task に目的・移行手順・検証方法を残す。
- 確定した手順は `docs/runbooks/` または [08_release_runbook.md](./08_release_runbook.md) へ昇格する。
