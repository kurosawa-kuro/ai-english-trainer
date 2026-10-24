# プロジェクトドキュメント索引

`ai-english-trainer` は、英会話コミュニティの仲間へ配る **AI 英語訓練アプリ**（Google Apps Script ＋ Google Sheets）。**状態はアイディア（未着手）で、`src/` は空である。**

`AGENTS.md` は Codex / 他エージェント向けの repo ガイド、`CLAUDE.md` は Claude Code の司令塔、`docs/tasks/` は作業計画・実装タスク・調査ログの実行ハブ、`.claude/skills/` は Claude Code で繰り返し使う作業手順。

## 正本

**[GAS版AI英会話訓練アプリ構想_ai-english-trainer.md](./GAS版AI英会話訓練アプリ構想_ai-english-trainer.md) がこのプロジェクトの正本である。**

製品定義・踏襲する点と新しくする点・シート構成・配布モデル・禁止事項・未決・決定ログは、すべてそこにある。01〜08 はそこから切り出した各面であり、**構想と食い違ったら構想が勝つ**。構想を変えたら、構想の決定ログに 1 行残してから 01〜08 へ反映する。

同じ定義を 2 か所に書かない。

## 権威順位

```text
docs/GAS版AI英会話訓練アプリ構想_ai-english-trainer.md（正本）
> コード / Makefile / config / manifests
> docs 01〜08
> docs/tasks
> README / CLAUDE / AGENTS
> archive
```

コードより構想が上にあるのは、**まだコードが無い**ためである。`src/` が動き始めたら、実装の事実はコードが正になり、構想は製品定義の正本として残る。

## このリポジトリの約束（破らない）

| # | 約束 | 根拠 |
|---|---|---|
| 1 | **関係データベースを採用しない**（Postgres / Supabase / Neon / Turso / Cloud SQL / MySQL）。`Jdbc` を使わない。`UrlFetchApp` の宛先は `generativelanguage.googleapis.com` のみ | 構想 5.2 |
| 2 | **`sample/speak-kit/` は読む専用。** 書き込まない。`src/` へ丸ごとコピーしない | 構想 3 |
| 3 | **このリポジトリの外を見ない。** 他リポジトリの計画・残作業・未決を引き継がない | 構想 3 |
| 4 | **売り物は AI。** AI 無しの状態を完成形として扱わない | 構想 2.2・4.5 |
| 5 | **音声入出力を作らない** | 構想 9 |
| 6 | **配布モデル A / B / C は未決。** 依存する設計を勝手に決めない | 構想 8.3 |
| 7 | **日本語で書く**（画面の文言・ドキュメント・コメント） | 構想 4.10 |

## 毎日使う入口

| 入口 | 用途 |
|---|---|
| [構想 13 章](./GAS版AI英会話訓練アプリ構想_ai-english-trainer.md) | owner 判断待ちの項目。着手してよい範囲の確認 |
| [tasks/README.md](./tasks/README.md) | 今日やること、次にやること、完了したこと |
| [04_workflows.md](./04_workflows.md) | 着手前に潰すこと、作業の流れ、参照元の読み方 |
| [07_test_strategy.md](./07_test_strategy.md) | 実装より先に置く検査 T1〜T8 |

`docs/tasks/` は仕様の正本ではないが、日々の実行順・証跡・未決事項の正本として扱う。確定した仕様は構想と 01〜08 へ、判断理由は `docs/adr/` へ昇格する。

## ドキュメント一覧

| ドキュメント | 役割 | 状態 |
|---|---|---|
| [GAS版AI英会話訓練アプリ構想](./GAS版AI英会話訓練アプリ構想_ai-english-trainer.md) | **正本。** 製品定義・設計方針・配布・禁止・未決・決定ログ | 記述済み |
| [01_requirements.md](./01_requirements.md) | 目的・範囲・ユーザー・ユースケース・Golden Path | 構想から記述 |
| [02_architecture.md](./02_architecture.md) | 構成要素・境界・Golden Path の写像 | 構想から記述（実装前） |
| [03_domain_model.md](./03_domain_model.md) | 用語・状態・出題と採点のルール | 構想から記述 |
| [04_workflows.md](./04_workflows.md) | 着手前に潰すこと・作業の流れ・配布手順 | 構想から記述（コマンドは未定） |
| [05_data_model.md](./05_data_model.md) | シート構成・関係 DB 禁止・教材の正本 | 構想から記述（実装前） |
| [06_error_policy.md](./06_error_policy.md) | エラー分類・AI 失敗時の扱い・ログ | 構想から記述 |
| [07_test_strategy.md](./07_test_strategy.md) | 実装より先に置く検査・品質ゲート | 構想から記述（コマンドは未定） |
| [08_release_runbook.md](./08_release_runbook.md) | 配布・smoke・ロールバック | 構想から記述（コマンドは未定） |
| [tasks/README.md](./tasks/README.md) | 日次運用の実行ハブ | starter 既定 |

**コマンドが「未定」と書いてある箇所を、動く前提で読まない。** `Makefile` は starter の TODO のままである。

## ハーネス（AI 制御）

AI エージェント制御の全体像は `.claude/README.md`。アーキ本体とその repo 固有 instantiation は `docs/specs/` に置く。

| ドキュメント | 役割 |
|---|---|
| [specs/kurosawa-thin-harness-architecture.md](./specs/kurosawa-thin-harness-architecture.md) | Thin Harness アーキ本体（tool-agnostic マスター） |
| [specs/runtime-protocol.md](./specs/runtime-protocol.md) | 実行手順と停止条件（repo 固有） |
| [specs/capability-boundary.md](./specs/capability-boundary.md) | 保護 capability と permissions 写像（脅威モデル） |
| [specs/change-boundary.md](./specs/change-boundary.md) | 保護パスと変更境界 |
| [specs/evidence-policy.md](./specs/evidence-policy.md) | Evidence Level と done の下限 |
| [specs/judgment-memory.md](./specs/judgment-memory.md) | 判断記憶のパイプライン |
| [templates/](./templates/) | 各 Layer のテンプレ（contract / weight-class / reality-check 等） |
| [decisions/decision-log.md](./decisions/decision-log.md) | 判断日誌（trade journal、append-only） |
| [memory/](./memory/) | 蒸留済み判断記憶 |
