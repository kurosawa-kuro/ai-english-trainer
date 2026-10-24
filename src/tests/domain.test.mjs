import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { deriveSkillQuizzes } from "../scripts/reference-content.mjs";
const observation = {
  meaning_match: "yes",
  speech_act_match: "yes",
  comprehensibility: "clear",
  target_pattern_status: "used",
  issues: [],
  reason: "意味が合う",
  confidence: 0.9,
};
function context() {
  const c = vm.createContext({});
  for (const f of [
    "core/errors",
    "domain/normalize",
    "domain/content",
    "domain/assessment",
    "domain/quiz",
  ])
    vm.runInContext(
      readFileSync(new URL("../server/" + f + ".js", import.meta.url), "utf8"),
      c,
    );
  return c;
}
test("純粋な5判定はGASなしで動く", () => {
  const c = context();
  for (const [patch, expected] of [
    [{}, "pass"],
    [{ issues: [{ affects_target_skill: false }] }, "pass_with_note"],
    [{ target_pattern_status: "not_used" }, "retry_target"],
    [{ issues: [{ affects_target_skill: true }] }, "retry_form"],
    [{ meaning_match: "no" }, "fail_communication"],
  ]) {
    c.o = { ...observation, ...patch };
    assert.equal(
      vm.runInContext("AssessmentPolicy.reduce(o,true)", c),
      expected,
    );
  }
});
test("選択肢IDと生成内容が参照元と一致する", () => {
  const c = context();
  const e = {
    key: "TEST",
    form: "I like {x}.",
    meaning: "好み",
    intent: "LIKE",
    tier: "CORE",
    kind: "pattern",
    example: { en: "I like tea.", ja: "お茶が好きです。" },
    quiz: {
      meaning: { near: ["違う意味"] },
      intent: { correct: "I like ...", near: ["I need ..."] },
      form: { near: ["I tea like."] },
    },
  };
  c.row = {
    id: e.key,
    form: e.form,
    meaning: e.meaning,
    intent: e.intent,
    tier: e.tier,
    kind: e.kind,
    example_en: e.example.en,
    example_ja: e.example.ja,
    quiz_json: JSON.stringify(e.quiz),
  };
  c.md5 = (s) => createHash("md5").update(s).digest("hex");
  const actual = JSON.parse(
    JSON.stringify(
      vm.runInContext(
        'ContentPolicy.derive(row,md5).filter(i=>i.kind==="choice")',
        c,
      ),
    ),
  );
  const expected = deriveSkillQuizzes(e);
  assert.deepEqual(
    actual.map((i) => ({ key: i.key, options: i.options, correct: i.correct })),
    expected.map((i) => ({
      key: i.itemKey,
      options: i.options.map(({ id, text }) => ({ id, text })),
      correct: i.correctOptionId,
    })),
  );
});
test("観測の不正boolean・数値範囲を拒否", () => {
  const c = context();
  c.o = { ...observation, confidence: 2 };
  assert.throws(() => vm.runInContext("AssessmentPolicy.validate(o)", c));
  c.o = {
    ...observation,
    issues: [
      {
        type: "x",
        detail: "x",
        affects_meaning: "false",
        affects_target_skill: false,
      },
    ],
  };
  assert.throws(() => vm.runInContext("AssessmentPolicy.validate(o)", c));
});
test("出題はformゲートと3問間隔・2回成功で安定", () => {
  const c = context();
  c.items = ["meaning", "form"].map((t, i) => ({
    id: "i" + i,
    item_key: "k" + i,
    skill_key: "s",
    payload_json: JSON.stringify({ quizType: t, correct: "yes" }),
  }));
  c.attempts = [];
  c.day = (s) => s.slice(0, 10);
  let states = vm.runInContext(
    'QuizPolicy.states(items,attempts,"",day,"2026-10-25")',
    c,
  );
  assert.equal(states[1].gated, true);
  c.attempts = [0, 1, 2, 3, 4].map((i) => ({
    id: "a" + i,
    item_id: i === 0 || i === 4 ? "i0" : "unrelated",
    response_mode: "choice",
    answer: "yes",
    created_at: "2026-10-25T00:00:0" + i + "Z",
  }));
  states = vm.runInContext(
    'QuizPolicy.states(items,attempts,"",day,"2026-10-25")',
    c,
  );
  assert.equal(states[0].stable, true);
  assert.equal(states[1].gated, false);
});
