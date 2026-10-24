# Decision Log（判断日誌 / trade journal）

AI エージェント（と人間）が**実行中に下した判断**を時系列で残す append-only の日誌。
トレードで言う「売買日誌」に当たる: 何を・なぜそのサイズで賭けたか、損切りラインはどこか、結果はどうだったか。

## これは何で、ADR / task note と何が違うか

| | レンズ | 寿命 | 例 |
|---|---|---|---|
| `adr/` | **戦略** = アーキ決定（正本） | 長命 | 「runtime state はどこに置くか」 |
| `tasks/` | **個別建玉メモ** = 1タスクの作業記憶 | タスク中 | このタスクの Goal/Scope/証拠 |
| `decisions/`（ここ） | **売買日誌** = 通時の判断の振る舞い | 永続・追記専用 | 「曖昧 Goal にこの既定値で突っ込んだ」「scope外をdeferした」 |

task note は1タスクに閉じるので「最近このエージェントは曖昧スペックにフルレバで入りがち」といった**通時のレビュー**ができない。この日誌はそこを埋める。

## 運用ルール

- **append-only**。過去エントリは書き換えない。結果が後で判明したら `結果` 行だけ追記更新してよい。
- 新しいエントリは**末尾に足す**（古い順・上から下）。
- `--- session boundary <ts> ---` 行はセッション終了時に Stop hook が自動で挿入する。判断ゼロのセッションでは挿入されない。
- 何を書くかの引き金と手順は `.claude/skills/log-decision/` が正本。
- **secret・トークン・cookie・個人パス・実データを書かない**（`.claude/rules/security.md`）。判断の構造だけ残す。

## エントリ形式

```markdown
## <UTCタイムスタンプ> — <判断の一行要約>
- type: default-taken | scope-cut | approach-choice | rollback | risk-accepted | approval-deferred
- 根拠 (why): なぜこの判断か（＝建玉理由 / entry thesis）
- 影響範囲 (blast radius): 何が壊れうるか・可逆性（＝レバ/ロットサイズ）
- 撤退条件 (stop/revert): 何が起きたら戻すか・どう戻すか（＝損切りライン）
- 結果 (outcome): win | loss | open | 塩漬け（後追い更新可）
- link: task note / ADR / PR（任意）
```

---

_まだ判断は記録されていません。`log-decision` が末尾に追記します。_

## 2026-10-24T08:00Z — Gemini 無料枠への切替に伴い、円表示・ドル上限を回数上限と 429 の扱いへ作り替えた
- type: default-taken
- 根拠 (why): owner が AI を Gemini API の無料枠に決めた。無料枠は請求が起きないので、金額の表示・ドル上限は守る対象を失う。不安の中身は「止まらないか・どこへ送られるか」に移るため、回数上限・429 の理由つき停止・個人情報を書かない注意に置き換えた（構想 4.4）
- 影響範囲 (blast radius): 文書のみ（構想・docs 01〜08・README・AGENTS・CLAUDE・env/config.yaml）。`src/` は空でコードへの影響なし。可逆
- 撤退条件 (stop/revert): owner が有料版（課金あり）も併用すると決めたら、金額計算と円表示を 4.4 に戻す
- 結果 (outcome): open
- link: docs/GAS版AI英会話訓練アプリ構想_ai-english-trainer.md 4.4・14


## 2026-10-25 — G3まで実装し、実環境受入を分離
- type: approach-choice
- 根拠 (why): ユーザーが実装を依頼し、到達範囲にAI会話を含むG3を指定。提示済みのモデルAで構築する。
- 影響範囲 (blast radius): src、env、関連文書。既存日記・sample・外部サービスは変更しない。
- 撤退条件 (stop/revert): 実Gemini校正・GAS受入を満たさなければ配布せず改修する。
- 結果 (outcome): open。ローカル検証済み、実環境受入待ち。
- link: ../tasks/03_active/GAS英語訓練_G3実装.md
