# CLAUDE.md

Claude Code向けの入口。最初に[AGENTS.md](AGENTS.md)を読み、共通規約・再発防止・検証手順に従う。ここでは仕様・禁止事項・検証実績を重複管理しない。

## 必要な文書へ進む

| 作業 | 参照先 |
|---|---|
| 機能・導入・現状・検証実績 | [README](README.md) |
| 製品方針・範囲の判断 | [GAS版構想](docs/GAS版AI英会話訓練アプリ構想_ai-english-trainer.md)・[判断日誌](docs/decisions/decision-log.md) |
| 実装範囲・AI状態遷移・参照元との差分 | [G3仕様](docs/specs/gas-trainer-v1.md) |
| データ・障害回復・配置 | [データモデル](docs/05_data_model.md)・[エラー方針](docs/06_error_policy.md)・[Runbook](docs/08_release_runbook.md) |
| 検証・残作業 | [テスト方針](docs/07_test_strategy.md)・[文書索引](docs/00_index.md) |

現行コードはG3ローカル実装済み、配布モデルA。旧文書の「未着手」「srcが空」「A/B/C未決」「初回に決めたAI可否を再確認しない」は実装判断に使わない。sampleは削除済みで、必要な過去資料はGit履歴を参照する。

## Claude Codeでの作業

1. 依頼の目的・範囲・完了条件、Git差分、対象のコードと仕様を確認する。製品構想の履歴と現在の実装を分けて読む。
2. [.claude/README](.claude/README.md)から対象に応じたrules・skillsと[実行手順](docs/specs/runtime-protocol.md)を参照する。Standard/Heavyの新機能は同手順の探索・仕様化・検証を適用し、文書整理に新機能の工程を持ち込まない。
3. 範囲内の最小変更と回帰検証を行い、仕様と運用文書を合わせる。範囲拡大・保護境界への接触は[変更境界](docs/specs/change-boundary.md)に従う。
4. [AGENTSの検証手順](AGENTS.md#検証と反映)に従い、実装・検証・公開の到達点を分けて報告する。

配布モデルB/C、関係DB、Gemini以外への送信、音声、sample再導入、製品方針の踏襲項目削除を通常の実装判断で進めない。既に承認されたモデルA・G3を、古い未決記述を理由に再確認しない。
