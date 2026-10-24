# AGENTS.md

AI コーディングエージェント（Claude Code / Codex / GitHub Copilot 等）共通の作業ガイド。
Codex は作業前にこのファイルを読むため、ここには repo 共通方針のみ記す。
ツール固有の指示は各ツールのファイル（例: Claude Code は `CLAUDE.md`）に置く。

## プロジェクト概要

- 目的: 英会話コミュニティの仲間へ配る **AI 英語訓練アプリ**。自由記述を AI（Gemini）が採点し、AI と会話して練習する。選択式クイズと学習記録がその土台になる
- 主要技術: Google Apps Script ＋ Google Sheets ＋ `HtmlService` ＋ Gemini API（Google AI Studio の無料枠）
- 配布: スプレッドシートの「コピーを作成」。相手に求めるのは Google アカウントと Gemini の鍵（AI Studio で発行。カード不要）だけ
- **正本**: [`docs/GAS版AI英会話訓練アプリ構想_ai-english-trainer.md`](docs/GAS版AI英会話訓練アプリ構想_ai-english-trainer.md)。製品定義・禁止事項・未決はすべてそこ。このファイルに重複させない
- **状態: G3ローカル実装済み。実環境受入・公開は未実施。現行仕様は `docs/specs/gas-trainer-v1.md`**

## 絶対に破らない制約

1. **関係データベースを採用しない**（構想 5.2）。Postgres / Supabase / Neon / Turso / Cloud SQL / MySQL は禁止。永続化は Google Sheets、秘密は `PropertiesService` だけ
   - **`Jdbc` サービスを使わない**
   - **`UrlFetchApp` の宛先は `generativelanguage.googleapis.com` のみ**
2. **`sample/speak-kit/` は読む専用**（構想 3）。書き込まない。`src/` へ丸ごとコピーせず、読んで GAS 版として書き直す
3. ユーザーが指定したAI日記アプリの基盤参照・コピーは今回の明示的例外。それ以外は **このリポジトリの外を見ない**（構想 3）。他リポジトリのパスを書かず、向こうの計画・残作業・未決を引き継がない
4. **売り物は AI**（構想 2.2）。AI 無しの状態を完成形として扱わない
5. **音声入出力を作らない**（構想 9）
6. **現行実装は配布モデルA（本人限定・各自のキー）**。B/Cの共有運用へ勝手に変更しない
7. **日本語で書く**（画面の文言・ドキュメント・コメント）

## リポジトリ構成

```
src/                 # GAS + Sheets の配布版。G3実装。配布コードはここ
sample/speak-kit/    # Next.js 実装の実物コピー。★読む専用
docs/                # 正本（構想が最上位）
```

## セットアップ / 主要コマンド

`src`で`npm run check`と`npm run test:browser`を実行する。env変更時は`npm run build:data`。Makefileはstarterのままなので使用しない。

## コーディング規約

- 既存のコード・命名・パターンに合わせる。新規導入より既存の再利用を優先する。
- 変更後はテストとフォーマッタを実行してから完了とする。
- 禁止事項は文書だけで守らない。検査（`Jdbc` の出現ゼロ、`UrlFetchApp` の宛先、ロック無しの追記）を置く。
- 原子性は `LockService` ＋ 追記専用で担保する。書き込み関数を 1 か所に閉じる。
- 非機密の設定値は `env/config.yaml`、ローカル秘密情報は `env/secret.yaml`、チーム共有・本番クレデンシャルは Doppler (`doppler.yaml`)。秘密情報をコミットしない。このプロジェクトの秘密は Gemini の API キー 1 本だけで、接続文字列は存在しない。

## ドキュメント

設計・仕様・運用は `docs/` 配下を参照。更新規約と権威順位は `docs/00_index.md` に従う。
仕様レベルの変更は連動するドキュメントを同一 PR でまとめて直し、構想を変えたら決定ログに 1 行残す。

`docs/01_requirements.md` 〜 `docs/08_release_runbook.md`は現行G3実装に更新済み。実環境受入は別途必要。

## Codex / Claude Code

- `AGENTS.md` は Codex / 他エージェント共通ガイド。
- `CLAUDE.md` は Claude Code の司令塔。
- `.claude/rules/` と `.claude/skills/` は Claude Code 用。Codex が読む前提にしない。
- Codex 向けに永続させたい recurring な指摘やミス防止は、この `AGENTS.md` または nested `AGENTS.md` に小さく追加する。

## Harness（AI 制御一式）

- このリポジトリの AI 制御の全体像は `.claude/README.md`（Kurosawa Thin Harness Architecture の実装）。
- アーキ本体（tool-agnostic マスター）は `docs/specs/kurosawa-thin-harness-architecture.md`、repo 固有の脅威モデルは `docs/specs/{capability-boundary,change-boundary,runtime-protocol,evidence-policy,judgment-memory}.md`。
- permissions の ask/deny と保護パスは脅威モデルで決める。**他プロジェクトの設定をそのまま移植しない**。
- このリポジトリでは `psql` / `supabase` / `turso` を **deny** にしてある（上記の制約 1 の機械ゲート）。ask へ戻さない。

## Task / Skill

- 一回性の作業計画・調査メモ・実装タスクは `docs/tasks/` に置く。
- Claude Code で繰り返し使う作業手順は `.claude/skills/` に置く（classify-task → create-task → scan-decisions → plan-skeleton → execute-task → verify-completion → review-task のライフサイクル）。
- Codex repo skills を本格運用する場合は `.agents/skills/` を任意追加する。標準生成物には含めない。
- task note を仕様の正本にしない。確定した仕様は `docs/specs/`、判断理由は `docs/adr/`、運用手順は `docs/runbooks/` に昇格する。
