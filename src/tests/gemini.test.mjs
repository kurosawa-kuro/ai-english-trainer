import { test } from "node:test";
import assert from "node:assert/strict";
import { createGas } from "./gas-mock.mjs";
const observation = {
  meaning_match: "yes",
  speech_act_match: "yes",
  comprehensibility: "clear",
  target_pattern_status: "used",
  issues: [],
  reason: "意味と型が合っています。",
  confidence: 0.9,
};
function gas(status, body) {
  const g = createGas();
  g.props.set("GEMINI_API_KEY", "secret-test-key-123456789");
  g.context.requests = [];
  g.context.UrlFetchApp = {
    fetch: (url, options) => {
      g.context.requests.push({ url, options });
      return {
        getResponseCode: () => status,
        getContentText: () =>
          typeof body === "string" ? body : JSON.stringify(body),
      };
    },
  };
  return g;
}
test("構造化採点の要求・キーのヘッダ送信・usage", () => {
  const g = gas(200, {
    candidates: [
      {
        finishReason: "STOP",
        content: { parts: [{ text: JSON.stringify(observation) }] },
      },
    ],
    usageMetadata: { totalTokenCount: 5 },
  });
  const out = g.run(
    'EnglishAiProvider.call("grade",{input:{answer:"hello",problem:{}},model:APP_CONFIG.ai.model,maxOutputTokens:4096})',
  );
  assert.equal(out.ok, true);
  assert.equal(out.usage.totalTokenCount, 5);
  const r = g.context.requests[0];
  assert.equal(r.url.includes("secret"), false);
  assert.equal(r.options.followRedirects, false);
  assert.equal(
    r.options.headers["x-goog-api-key"],
    "secret-test-key-123456789",
  );
  assert.ok(JSON.parse(r.options.payload).generationConfig.responseJsonSchema);
});
for (const [status, code] of [
  [401, "authentication_error"],
  [403, "permission_denied"],
  [429, "quota_exceeded"],
  [503, "service_unavailable"],
])
  test("HTTP " + status + "は安全なコードで返り再送しない", () => {
    const g = gas(status, "secret-test-key-123456789");
    const r = g.run(
      'GeminiClient.generateText({model:APP_CONFIG.ai.model,text:"test"})',
    );
    assert.equal(r.code, code);
    assert.equal(g.context.requests.length, 1);
    assert.equal(JSON.stringify(r).includes("secret"), false);
  });
test("途中出力・不正JSON・壊れた観測を成功扱いしない", () => {
  for (const b of [
    {
      candidates: [
        { finishReason: "MAX_TOKENS", content: { parts: [{ text: "{}" }] } },
      ],
    },
    {
      candidates: [
        { finishReason: "STOP", content: { parts: [{ text: "{}" }] } },
      ],
    },
  ]) {
    const g = gas(200, b);
    assert.equal(
      g.run(
        'EnglishAiProvider.call("grade",{input:{},model:APP_CONFIG.ai.model,maxOutputTokens:4096})',
      ).ok,
      false,
    );
  }
});
