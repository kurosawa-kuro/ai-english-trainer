import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import YAML from "yaml";
import { derivePair } from "./reference-content.mjs";
const root = fileURLToPath(new URL("../../", import.meta.url));
const config = YAML.parse(
  readFileSync(path.join(root, "env/config.yaml"), "utf8"),
);
if (
  config.distributionModel !== "A" ||
  config.timeZone !== "Asia/Tokyo" ||
  !/^gemini-[a-z0-9.-]+$/.test(config.ai?.model)
)
  throw Error("設定値が不正です");
for (const value of [
  ...Object.values(config.limits),
  config.ai.maxOutputTokens,
  config.ai.dailyLimit,
  config.ai.runningTimeoutMinutes,
])
  if (!Number.isInteger(value) || value <= 0)
    throw Error("上限は正の整数にしてください");
const expressions = readdirSync(path.join(root, "env/expressions"))
  .filter((f) => f.endsWith(".yaml"))
  .sort()
  .flatMap((f) =>
    YAML.parse(readFileSync(path.join(root, "env/expressions", f), "utf8")),
  );
const keys = new Set();
for (const e of expressions) {
  e.example ??= e.extra_examples?.[0];
  if (
    !e.key ||
    keys.has(e.key) ||
    !e.example?.en ||
    !e.example?.ja ||
    !e.form ||
    !e.meaning
  )
    throw Error("教材の必須項目・重複を確認してください");
  keys.add(e.key);
}
const pairDocument = YAML.parse(
  readFileSync(path.join(root, "env/confusion-pairs.yaml"), "utf8"),
);
const pairs = Array.isArray(pairDocument) ? pairDocument : pairDocument.pairs;
if (!Array.isArray(pairs)) throw Error("混同ペア教材が不正です");
const contrast = pairs.flatMap((pair) =>
  derivePair(pair).quizzes.map((q) => ({
    key: q.itemKey,
    skillKey: "pair-" + q.pairId,
    pairId: q.pairId,
    kind: "choice",
    quizType: "contrast",
    form: pair.a.label + " / " + pair.b.label,
    meaning: "表現の使い分け",
    prompt: q.prompt,
    options: q.options,
    correct: q.correctOptionId,
    capability: "CONTRAST_SELECTION",
  })),
);
const output =
  "// env/から生成。手で編集しない。\nconst APP_CONFIG = " +
  JSON.stringify(config) +
  ";\nconst INITIAL_EXPRESSIONS = " +
  JSON.stringify(expressions) +
  ";\nconst INITIAL_CONTRAST_ITEMS = " +
  JSON.stringify(contrast) +
  ";\n";
const destination = path.join(root, "src/server/config/generated.js");
if (process.argv.includes("--check")) {
  if (readFileSync(destination, "utf8") !== output)
    throw Error("npm run build:data を実行してください");
} else writeFileSync(destination, output);
console.log(
  "教材 " +
    expressions.length +
    "件・設定の生成" +
    (process.argv.includes("--check") ? "整合確認" : "完了"),
);
