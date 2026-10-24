# ai-english-trainer

**AI の採点と会話を目玉に、Google アカウントだけで始められる英語訓練アプリ。**

英会話コミュニティの仲間に配る。相手に求めるのはスプレッドシートのコピーと、AI を使うための鍵だけで、GitHub も Vercel も Supabase も要らない。

- 自由記述で英文を書き、「意味が伝わったか」を AI（Gemini）が判定して返す
- AI と会話して練習する
- 選択式クイズと学習記録は、その土台として間隔反復で回る
- **教材は利用者が自分のスプレッドシートで編集できる**。行を 1 行足せば次の出題から出る

正本は [`docs/GAS版AI英会話訓練アプリ構想_ai-english-trainer.md`](docs/GAS版AI英会話訓練アプリ構想_ai-english-trainer.md)。製品定義・配布・禁止事項・未決は、すべてそこを見る。

## 状態

**アイディア（未着手）。** `src/` は空である。着手の承認も、実装仕様の確定もまだない。

最大の未決は**配布モデル A / B / C**（誰の鍵で AI を動かすか。構想 8.3）で、ここが決まるまで他の設計が確定しない。

## 技術スタック

| レイヤー | 技術 |
|---|---|
| 実行基盤 | Google Apps Script（ウェブアプリ） |
| 画面 | `HtmlService`（単一ページ ＋ クライアント側のタブ切り替え） |
| データ | **Google Sheets**（教材・学習記録・設定・AI の利用回数） |
| 秘密 | `PropertiesService`（Gemini の API キー） |
| AI | Gemini API・Google AI Studio の無料枠（`UrlFetchApp` でサーバー側から呼ぶ） |
| 認証 | Google アカウント（`appsscript.json` の `webapp.access`） |
| **関係データベース** | **使わない。採用禁止**（下記） |

## 関係データベースは採用禁止

永続化は Google Sheets だけである。**Postgres / Supabase / Neon / Turso / Cloud SQL / MySQL を採用しない。** 「今は使わない」ではなく禁止で、将来の機能追加の理由にもしない。

GAS から関係 DB に届く経路は 2 本しかないので、そこを塞ぐ。

| 規則 | 塞がるもの |
|---|---|
| **`Jdbc` サービスを使わない** | Cloud SQL / MySQL / SQL Server / Oracle への直接接続 |
| **`UrlFetchApp` の宛先は `generativelanguage.googleapis.com` のみ** | Supabase の REST、Neon / Turso の HTTP API、その他クラウド DB の API |

理由と、Postgres が担っていた機能の代替、残る損失 3 点は構想 5.2 にある。

## リポジトリ構成

```
.
├── src/                 # GAS + Sheets の配布版。★まだ空。作る物はここだけ
├── sample/speak-kit/    # Next.js 実装の実物コピー。★読む専用。変更しない
├── docs/                # 正本（構想・要件・設計・運用）
├── env/
│   ├── config.yaml      # 非機密設定
│   └── secret.yaml      # ローカル秘密情報（コミット禁止）
└── .claude/             # Claude Code のハーネス一式
```

`sample/speak-kit/` は、挙動・SQL・文言・教材を**読むための参照元**である。書き込まない。丸ごとコピーもしない。読んで GAS 版として書き直す。扱いは構想 3 章。

**このリポジトリの外は見ない。** 他のリポジトリの計画・残作業・未決は引き継がない。

## セットアップ

`src/` が空のため、ビルド・デプロイの手順はまだ無い。開発の道具立て（`clasp` を使うかどうかを含む）は未決で、構想 12 章の優先度A を潰してから決める。

設定は `env/config.yaml`（非機密）、`env/secret.yaml`（ローカル秘密情報）、Doppler（共有・本番）で管理する。`env/secret.yaml` は `.gitignore` で除外されるためコミットしない。**このプロジェクトの秘密は Gemini の API キー 1 本だけ**で、接続文字列は存在しない。

## ドキュメント

- [`docs/GAS版AI英会話訓練アプリ構想_ai-english-trainer.md`](docs/GAS版AI英会話訓練アプリ構想_ai-english-trainer.md) — **正本**。製品定義、踏襲する点と新しくする点、シート構成、配布モデル、禁止事項、未決
- [`docs/00_index.md`](docs/00_index.md) — 索引と権威順位
- [`docs/tasks/`](docs/tasks/) — 作業計画と実行ハブ

`docs/01_requirements.md` 以下の 01〜08 は starter の雛形のままである。構想から昇格させる段で埋める。
