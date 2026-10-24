# Capability Boundary（このプロジェクトの instantiation）

**Layer 4: Capability Boundary**（§12）の repo 固有 instantiation。マスター文書 [`kurosawa-thin-harness-architecture.md`](./kurosawa-thin-harness-architecture.md) は保護対象を一般的に列挙する。このファイルは*このリポジトリ*のツールと `.claude/settings.json` の強制層へ写像する。Skill: `assess-risk`。

> **使い方（厚いメニュー → 削る）**: 下表は「個人プロジェクトでよく出る保護対象」を**安全既定で厚く列挙**したもの。**このプロジェクトに該当しない行は削る**。薄い TODO から足すのでなく、厚い既定から削る運用にする（テンプレ＝最厚、コピー先で削る）。

## 脅威モデルを先に（このプロジェクトで壊れたら困るもの）

**loss-critical 資産は 2 つだけ。**

| 資産 | なぜ致命的か |
|---|---|
| **Anthropic の API キー** | 流出すると第三者に課金される。これが売り物（AI）を動かす唯一の鍵でもある（構想 2.2） |
| **配った相手のスプレッドシート** | 学習記録と教材が入る。黒澤からは触れないが、**壊しても復旧してあげられない** |

**コードは loss-critical ではない。** `src/` は git で可逆、GAS のデプロイ履歴で戻せる。`sample/speak-kit/` は読む専用のコピーで、失っても取り直せる。

**インフラも loss-critical ではない。** このプロジェクトはクラウドリソースを一切持たない。サーバーも DB も課金アカウントも無く、実行基盤は利用者の Google アカウントの上にある。

したがって重心は「**秘密の書き込み**」と「**関係 DB の採用**」の 2 点に寄せ、それ以外のインフラ系ツールは出番が無いので deny してよい。

## 強制マップ（settings.json と一致させる。該当しない行は削る）

| Capability | よくあるツール | 既定 | 備考 |
|---|---|---|---|
| 安全な開発ループ | `make test`/`lint`/`build`、`cargo *`/`npm test`/`pytest`、read-only git | **allow** | 常に allow |
| ファイル検索/閲覧 | `rg`/`grep`/`ls`/`find`/`cat`/`head`/`tail` | **allow** | |
| **関係 DB ツール** | `psql`/`supabase`/`turso` | **deny** | **構想 5.2 で採用禁止。** 承認すれば使ってよいものではない。`.claude/settings.json` の `deny` と一致させる |
| 生インフラツール | `gcloud`/`aws`/`az`/`terraform`/`pulumi`/`kubectl`/`mysql`/`mongosh` | **ask** | このプロジェクトはクラウドリソースを持たない。必要に見えたら設計が間違っている |
| secret 注入ランナー | `doppler run`/`vault`/`op run` | **allow** | ランナー自体は allow。ask にすると非対話/auto で classifier hard-block になり標準ランナーが全滅する。注入は無害で、危険は次行の secret write と実行先コマンド側（allow/deny で別途 governed） |
| secret push/同期 | GCP Secret Manager / AWS SM / `doppler secrets set` | **ask** | secret の**書き込み**はここ（`doppler run` の read 注入と区別する） |
| 本番デプロイ | `gcloud run deploy`/`vercel --prod`/`fly deploy`/`kubectl apply`/`serverless deploy` | **ask** | |
| DB schema/migration | `*-migrate`/`alembic`/`prisma migrate`/`sqlx migrate`/`drizzle push` | **ask** | 本番なら owner approval |
| 課金/quota 変更 | billing API、plan 変更、quota 引き上げ | **ask** | |
| paid AI API 実行 | LLM/画像/音声の有料呼び出し（バルク） | **ask** | budget gate 併用 |
| 外部通知送信 | Slack/Discord/email/webhook/LINE 送信 | **ask** | dry-run があれば allow |
| パッケージ公開 | `npm publish`/`cargo publish`/`pypi upload`/`gh release` | **ask** | |
| DNS/ドメイン | DNS レコード変更、ドメイン購入 | **ask** | |
| オブジェクトストレージ | 本番バケットへの write/delete（`gsutil`/`aws s3`） | **ask** | |
| 保護ファイルパス編集 | `env/secret/**`、`infra/**`、`terraform/**`、`.github/workflows/**`、`**/migrations/**` | **`detect-safety-boundary` hook (exit 2)** | `change-boundary.md` と一致させる |
| 不可逆なコード/履歴破壊 | `rm -rf`、`git push --force*`、`git reset --hard`、`git clean -fdx` | **deny** | 常に deny |

## 保護 capability チェックリスト（`assess-risk` / `docs/templates/capability-boundary.md`）

- [ ] 本番デプロイ
- [ ] DB migration / schema 変更
- [ ] secret read/write
- [ ] IAM / 権限変更
- [ ] クラウドリソース作成/削除
- [ ] 課金 / quota
- [ ] 破壊的コマンド
- [ ] 本番 / マスターデータアクセス
- [ ] 認証 / 認可ロジック
- [ ] パッケージ公開 / リリース

## ルール

- `ask`/`deny` は*コマンド*の正本。`detect-safety-boundary` hook は*ファイル編集*をカバーする（コマンド層が見ない隙間）。
- この設定は**このプロジェクト固有**。脅威モデルが違う他プロジェクトへそのまま移植しない。
- メニューを削った/緩めた理由は `docs/decisions/decision-log.md` に1行残す。
- **関係 DB の deny を ask へ戻さない。** 構想 5.2 の採用禁止と対になっている。緩めるなら先に構想を変える。
- コマンド層の禁止だけでは足りない。アプリ側の経路（GAS の `Jdbc` サービス、`api.anthropic.com` 以外への `UrlFetchApp`）は [`../07_test_strategy.md`](../07_test_strategy.md) の T1 / T2 で塞ぐ。
