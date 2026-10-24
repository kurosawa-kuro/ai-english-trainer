# CLAUDE.md

このファイルは Claude Code がこのリポジトリで作業する際の最小ガイド。

## このリポジトリ

`ai-english-trainer` は、英会話コミュニティの仲間へ配る **AI 英語訓練アプリ**。Google Apps Script ＋ Google Sheets で作り、相手に求めるのはスプレッドシートのコピーと AI の鍵だけにする。

**正本は [`docs/GAS版AI英会話訓練アプリ構想_ai-english-trainer.md`](docs/GAS版AI英会話訓練アプリ構想_ai-english-trainer.md)。** 製品定義・踏襲する点・禁止事項・未決は、この README でも CLAUDE.md でもなく構想を見る。ここに重複させない。

**状態はアイディア（未着手）で、`src/` は空である。** 着手の承認はまだ出ていない。

## 絶対に破らない制約

構想から来る。迷ったら構想の該当節を読む。

1. **関係データベースを採用しない**（構想 5.2）。Postgres / Supabase / Neon / Turso / Cloud SQL / MySQL は禁止。永続化は Google Sheets、秘密は `PropertiesService` だけ
   - **`Jdbc` サービスを使わない**
   - **`UrlFetchApp` の宛先は `api.anthropic.com` のみ**。他の外部ホストへ出さない
2. **`sample/speak-kit/` は読む専用**（構想 3）。書き込まない。`src/` へ丸ごとコピーしない。読んで GAS 版として書き直す
3. **このリポジトリの外を見ない**（構想 3）。他のリポジトリのパスを書かない。向こうの計画・残作業・未決を引き継がない
4. **売り物は AI**（構想 2.2・4.5）。「AI 無しでもコアが通る」は鍵が切れても落ちないための床であって、AI 無しの状態を完成形として扱わない
5. **音声入出力を作らない**（構想 9）。読み上げ・録音・再生比較・STT・TTS すべて非対象
6. **配布モデル A / B / C は未決**（構想 8.3）。**これが最大の owner 判断**で、`learnerKey` の持ち方・シート構成・鍵の置き場がここに従属する。決まるまでは A を前提に書き、B・C を勝手に選ばない
7. **画面の文言・ドキュメント・コメントは日本語。** 文言は 1 か所に集める

## 踏襲するもの / 新しくするもの

構想 4 章が正本。要点だけ：

- **踏襲**（`sample/speak-kit/` から意味を変えずに移す）— 出題選択の規則（間隔 3・連続 2 回成功での昇格・`form` のゲート・混同優先）、追記型台帳と冪等な再送、採点の 5 判定と学習者向け文面、AI の可否 3 理由（`setting_off` / `key_missing` / `limit_reached`）、1 日 2 ドル・1 か月 20 ドルの上限と円表示
- **新しくする** — 教材の正本を**利用者のスプレッドシート**に置く（構想 4.8）。YAML・sync・デプロイを廃止する。データモデルは Sheets ネイティブに平坦化する（30 表 → 7 枚から）

AI のオン・オフ、円表示、利用上限は**課金不安を軽くするための装置**であり（構想 4.4）、「AI は任意だから」の根拠に使わない。

## Source of Truth

- **製品の正本**: `docs/GAS版AI英会話訓練アプリ構想_ai-english-trainer.md`
- Project overview: `README.md`
- Documentation index: `docs/00_index.md`
- Harness 全体像: `.claude/README.md`
- Harness アーキ本体: `docs/specs/kurosawa-thin-harness-architecture.md`（tool-agnostic マスター）＋ repo 固有 instantiation（`docs/specs/{runtime-protocol,capability-boundary,change-boundary,evidence-policy,judgment-memory}.md`）
- 判断日誌 / 蒸留記憶: `docs/decisions/decision-log.md` / `docs/memory/`
- Feature spec（実装前・1 機能ごと）: `SPEC.md`
- Task notes: `docs/tasks/`

`docs/01_requirements.md` 〜 `docs/08_release_runbook.md` は starter の雛形のままである。**埋まっていないものを既定の仕様として読まない。** 構想から昇格させる段で埋める。

**spec の使い分け（混同しない）**: `SPEC.md` = 今から作る 1 機能の使い捨て実装スペック。`docs/specs/` = 恒久アーキ設計マスター。`docs/tasks/` = タスク台帳。

## コマンド

`src/` が空のため、`Makefile` は starter の TODO のままである。**書いてあるコマンドが動く前提で作業しない。** 開発の道具立て（`clasp` を使うかどうかを含む）は未決で、構想 12 章の優先度A を潰してから決める。

## アーキテクチャ

- 作る物は `src/` だけ。参照元は `sample/speak-kit/`（読む専用）
- 永続化は Google Sheets。構成案は構想 6 章（G1 で 7 枚、全段で 19 枚）
- AI は 1 か所からだけ呼ぶ。出題・記録・RPC の振り分けは AI の窓口を参照しない
- AI の可否は 1 回の操作の**最初に 1 度だけ**決める。操作の途中で読み直さない
- 採点は**同期**で行う（`UrlFetchApp` は同期、実行上限 6 分）。参照元の遅延採点・`grading_claims`・2 秒ポーリングは持ち込まない
- 原子性は `LockService` ＋ 追記専用で担保する。**書き込み関数を 1 か所に閉じる**
- 非機密の設定は `env/config.yaml`、ローカル秘密情報は `env/secret.yaml`、共有・本番は Doppler (`doppler.yaml`)
- パス別ルールは `.claude/rules/`、一回性の作業計画は `docs/tasks/`、繰り返す手順は `.claude/skills/`

## 作業ルール

- 推測でコードを書かない。コマンドを書いたら実際に実行して確認する。
- 仕様変更は連動する `docs/` とテストを同一 PR で直す。drift を作らない。**構想を変えたら決定ログに 1 行残す。**
- 既存の関数・ユーティリティ・パターンを優先的に再利用する。
- 禁止事項は文書だけで守らない。検査（`Jdbc` の出現ゼロ、`UrlFetchApp` の宛先、ロック無しの追記）を置く。
- task note を仕様の正本にしない。確定内容は `docs/specs`、`docs/adr/`、`docs/runbooks/` に昇格する。
- **Scope invariant（常時）**: 作業中に Goal/Scope 外の変更・前提崩れ・追加副作用・docs と実装の矛盾を見つけたら即実装しない。`control-change` で分類するか follow-up task に残す。「ついで修正/共通化/改名」は scope creep。

## AI Runtime Protocol（薄い・常時）

Thin Harness の常時手順。詳細は `.claude/README.md` と `docs/specs/runtime-protocol.md`、停止条件は同 §「停止して owner に確認する」。

> **このハーネスは重い既定で出荷されている。** 新規生成直後は、まず skill `harness-trim` を1回回し、このプロジェクトの脅威モデルに合わせて hooks / rules / permissions / agents / skills を keep・delete・adjust する（削除は想定手順で scope creep ではない）。以降は下記の常時手順に従う。

1. Goal / Scope / Done を言い直す。
2. Weight Class を判定（Light / Standard / Heavy → `classify-task`）。Light は以降の重い手順をスキップしてよい。
3. owner-only 判断・保護 capability・allowed/forbidden paths を確認（`scan-decisions` / `capability-boundary.md` / `change-boundary.md`）。
4. Standard/Heavy の新機能は **plan モードで探索（編集せず読む）→ `SPEC.md` を自己完結で記述（触るファイル/IF 名指し・Non-scope・末尾 E2E 検証）→ 可能なら新セッションで実行**。その後 skeleton + TDD contract を先に固める（`plan-skeleton`）。
5. scope 内で最小変更を当てる。複数 attempt が要るなら停止条件付きで回す（`reconcile-task`）。
6. 必要 Evidence Level（≥2、本番は4）で検証（`verify-completion` / `evidence-policy.md`）。
7. scope 拡大・保護境界接触・二度違う理由で検証失敗 → 停止して owner へ。
8. 非自明な判断を下した時だけ記録（`log-decision`）。

## 停止して owner に確認する

上記に加えて、このリポジトリ固有のもの。

- 配布モデル A / B / C に依存する設計を決めようとしたとき（構想 8.3・13-1）
- 関係データベース、`Jdbc`、`api.anthropic.com` 以外への通信が必要に見えたとき（**まず設計が間違っている**と疑う）
- 構想 4 章の踏襲項目を落とす必要が出たとき（落とす項目を名指しして owner へ）
- `sample/speak-kit/` を変更したくなったとき
