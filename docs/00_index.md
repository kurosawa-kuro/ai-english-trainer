# ドキュメント索引

2026-10-25：G3ローカル実装済み。実GAS/Sheets/Geminiでの受入・公開は未実施。

## 現行仕様

- [G3実装仕様](specs/gas-trainer-v1.md)：実装範囲、状態遷移、参照元との差分
- [要件](01_requirements.md)・[アーキテクチャ](02_architecture.md)・[ドメイン](03_domain_model.md)
- [ワークフロー](04_workflows.md)・[データモデル](05_data_model.md)・[エラー方針](06_error_policy.md)
- [検証](07_test_strategy.md)・[配置と受入](08_release_runbook.md)
- [実装タスク](tasks/03_active/GAS英語訓練_G3実装.md)

## 構想と判断

製品方針の正本は[GAS版構想](GAS版AI英会話訓練アプリ構想_ai-english-trainer.md)。最新追記を優先する。実装の事実はコード・テストとG3仕様を正とし、構想本文の未着手・未決は当時の記録として読む。

[移植構想](tasks/02_backlog/GAS基盤を流用したAI英語訓練アプリ移植構想.md)は後続検討を含む計画。[判断日誌](decisions/decision-log.md)は追記専用。[タスク運用](tasks/README.md)も参照。

DBはSheets、秘密はProperties。Jdbc禁止、外部送信先はGeminiのみ。sampleはユーザー指示で削除済み。旧構想内のsampleへのリンクは削除前のGit履歴を参照する。今回のユーザー指定に限り日記基盤の参照・コピーを許可。配布モデルA（本人限定・各自のキー）でG3を実装し、G4・音声は範囲外とする。

## エージェント運用

[AGENTS.md](../AGENTS.md)は共通ガイド。ハーネス全体は[.claude/README.md](../.claude/README.md)、仕様は[Thin Harness](specs/kurosawa-thin-harness-architecture.md)、[runtime](specs/runtime-protocol.md)、[capability](specs/capability-boundary.md)、[change](specs/change-boundary.md)、[evidence](specs/evidence-policy.md)、[judgment](specs/judgment-memory.md)。[templates](templates/)と[memory](memory/README.md)に補助文書を置く。
