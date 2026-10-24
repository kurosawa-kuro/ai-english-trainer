import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
function files(dir) {
  return readdirSync(new URL(dir + "/", root), { withFileTypes: true }).flatMap(
    (e) => (e.isDirectory() ? files(dir + "/" + e.name) : [dir + "/" + e.name]),
  );
}
test("Domain/Applicationは具体的GAS・Repository実装に依存しない", () => {
  for (const f of [...files("server/domain"), ...files("server/application")])
    assert.doesNotMatch(
      read(f),
      /SpreadsheetApp|PropertiesService|CacheService|LockService|UrlFetchApp|Utilities\.|TrainingRepository|SheetStore|GeminiClient/,
      f,
    );
});
test("外部送信はGemini窓口のみ、DB経路を持ち込まない", () => {
  for (const f of files("server")) {
    assert.doesNotMatch(
      read(f),
      /\bJdbc\b|api\.anthropic\.com|supabase\.co/,
      f,
    );
    if (f !== "server/services/ai/gemini-client.js")
      assert.doesNotMatch(read(f), /UrlFetchApp/, f);
  }
  const transport = read("server/services/ai/gemini-client.js");
  assert.match(transport, /generativelanguage\.googleapis\.com/);
  assert.match(transport, /followRedirects: false/);
  assert.match(transport, /x-goog-api-key/);
});
test("Sheets書込・クライアントRPCの窓口を集約", () => {
  for (const f of files("server"))
    if (f !== "server/db/sheet-store.js")
      assert.doesNotMatch(
        read(f),
        /\.setValues?\(|\.setRichTextValues?\(|\.deleteRow\(/,
        f,
      );
  for (const f of files("client"))
    if (f !== "client/core/api.html")
      assert.doesNotMatch(read(f), /google\.script\.run/, f);
});
test("日記の接続先を持ち込まず公開は本人のみ", () => {
  const manifest = JSON.parse(read("appsscript.json"));
  assert.equal(manifest.webapp.access, "MYSELF");
  assert.equal(manifest.webapp.executeAs, "USER_DEPLOYING");
  assert.doesNotMatch(read("package.json"), /AKfycb|update-deployment/);
  const ignore = read(".claspignore");
  assert.match(ignore, /!server\/\*\*\/\*\.js/);
});
