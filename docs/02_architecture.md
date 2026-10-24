# 02 アーキテクチャ

正本は [構想](./GAS版AI英会話訓練アプリ構想_ai-english-trainer.md)。ここには構造と境界だけを置く。**まだ実装は無い（`src/` は空）。以下は構想から確定した設計方針であって、動いているコードの記述ではない。**

## 概要

```text
ブラウザ（HtmlService の単一ページ。タブはクライアント側で切り替え）
  -> google.script.run.rpc(name, request)
  -> dispatch（入力の検査。操作の文脈を 1 度だけ作る）
  -> services（業務の処理。書き込みは 1 か所に閉じ、LockService を取る）
       -> Google Sheets（教材・学習記録・設定・AI の利用回数）
       -> ai（UrlFetchApp -> generativelanguage.googleapis.com）※同期
```

- **操作の文脈**: 1 回の操作の最初に、設定の「AI を使う」・鍵の有無・今日の利用回数（自前の上限と 429 の記録）から AI の可否を 1 度だけ決め、サービスへ渡す。操作の途中で読み直さない（構想 4.3）
- **採点は同期**: `UrlFetchApp` は同期で、実行上限は 6 分。参照元の遅延採点・`grading_claims`・2 秒ポーリングは持ち込まない（構想 D4）
- **原子性**: トランザクションが無いので `LockService` ＋ 追記専用で担保する。書き込み関数を 1 か所に閉じる（構想 D3）
- **教材の正本はシート**: 利用者が `expressions` シートを直接編集する。YAML・sync・デプロイは無い（構想 4.8）

## 構成要素

| 構成要素 | 役割 | 担当パス |
|---|---|---|
| ウェブアプリ本体 | `doGet` と `HtmlService`。画面は単一ページ | `src/`（未着手） |
| RPC の入口 | 名前 → サービス。応答は参照元と同じ envelope | `src/`（未着手） |
| 業務の処理 | 出題・回答・採点・会話・記録・設定 | `src/`（未着手） |
| シートアクセス | 読み書きの唯一の窓口。追記専用を守る | `src/`（未着手） |
| AI の窓口 | `UrlFetchApp` で Gemini を呼ぶ**唯一の場所** | `src/`（未着手） |
| 永続化 | Google Sheets（構成は [05_data_model.md](./05_data_model.md)） | スプレッドシート |
| 秘密 | `PropertiesService`（Gemini の鍵） | スクリプトプロパティ |
| 公開範囲 | `appsscript.json` の `webapp.access` / `executeAs` | `src/appsscript.json`（未着手） |
| 参照元 | Next.js 実装の実物コピー。**読む専用** | `sample/speak-kit/` |
| エージェントガイド | Codex / 他エージェント向けの repo ガイド | `AGENTS.md` |
| Claude ガイド | Claude Code の司令ルール | `CLAUDE.md` |
| タスク文書 | 一回性の作業計画・実装タスク | `docs/tasks/` |
| Claude skills | Claude Code で繰り返し使う作業手順 | `.claude/skills/` |

## Golden Path とアーキテクチャ

[01_requirements.md](./01_requirements.md) の Golden Path が通る構成要素。

| Golden Path ステップ | 通る構成要素 | 通る境界 / データ | 単一障害点 |
|---|---|---|---|
| 1. コピーして初期設定 | 初期設定関数、`appsscript.json` | Google の承認、シート生成、初期教材の投入 | **OAuth 承認**。相手が止まると何も始まらない |
| 2. 鍵を入れる | 設定画面、`PropertiesService` | スクリプトプロパティ | **Gemini の鍵**（Google AI Studio で発行）。目玉を開ける唯一の鍵（構想 2.2） |
| 3. 自由記述を採点 | RPC → 操作の文脈 → 採点 → AI の窓口 | `UrlFetchApp` → `generativelanguage.googleapis.com`、実行上限 6 分 | **AI の窓口**。ここが落ちると目玉が止まる |
| 4. 記録に残る | 書き込み関数、回答台帳シート | `LockService`、追記専用 | **書き込み関数**。ロックを取り忘れると静かに二重行（構想 5.2） |
| 5. 利用状況を見る | 利用回数の集計、設定画面 | `ai_usage` シート | — |

単一障害点が 2 と 3 に集中する。**どちらも AI 側である**ことが、この製品の性質を表している。

## 境界

- **作る物は `src/` だけ。** `sample/speak-kit/` は読む専用で、書き込まない・丸ごとコピーしない（構想 3）
- **関係データベースを使わない。** `Jdbc` を使わない。`UrlFetchApp` の宛先は `generativelanguage.googleapis.com` のみ（構想 5.2）
- AI は 1 か所からだけ呼ぶ。出題・記録・RPC の振り分けは AI の窓口を参照しない
- AI の呼び出しは `LockService` を持たずに行う。AI の応答を得てから短く書く
- シートへの書き込みは 1 か所に閉じる。他から `setValue` を呼ばない
- 非機密の設定は `env/config.yaml`。ローカル秘密情報は ignore したまま。共有・本番は Doppler
- Codex が `.claude/rules/` や `.claude/skills/` を読む前提にしない。共通の指針は `AGENTS.md` に置く

## 未決が設計に与える影響

**配布モデル A / B / C**（構想 8.3）が決まるまで固まらないもの:

| 項目 | A（1 人 1 コピー） | B・C（1 インスタンス共有） |
|---|---|---|
| `webapp.access` / `executeAs` | `MYSELF` / `USER_DEPLOYING` | `ANYONE` / `USER_ACCESSING` |
| 学習者の識別 | `learnerKey = "default"` 固定 | `Session.getActiveUser().getEmail()` |
| シートの列 | 学習者の列を持たない | 全シートに学習者の列が要る |
| 鍵の置き場 | 各自の `getScriptProperties()` | B は `getUserProperties()`、C は黒澤の `getScriptProperties()` |

**決まるまでは A を前提に書く。** B・C を勝手に選ばない。

## 関連タスク

- 構造変更、責務移動、依存追加は、実装前に `docs/tasks/03_active/` へ task を作る。
- 確定した設計判断は task から `docs/adr/` またはこの文書へ昇格する。
