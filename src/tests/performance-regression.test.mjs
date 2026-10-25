import { test } from "node:test";
import assert from "node:assert/strict";
import { createGas } from "./gas-mock.mjs";

test("出題は教材版・リセット・未知の問題の間隔を維持し、教材×履歴の走査をしない", (t) => {
  const g = createGas();
  for (const size of [100, 1000]) {
    let keyReads = 0,
      parses = 0;
    const items = Array.from({ length: size }, (_, i) => ({
      id: "i" + i,
      skill_key: "s" + i,
      get item_key() {
        keyReads++;
        return "k" + i;
      },
      get payload_json() {
        parses++;
        return JSON.stringify({ quizType: "form", correct: "yes" });
      },
    }));
    const attempts = Array.from({ length: 10000 }, (_, i) => ({
      item_id: "i" + (i % size),
      response_mode: "choice",
      answer: "yes",
      created_at: i < 5000 ? "2026-01-01" : "2026-10-25",
    }));
    g.context.quizItems = items;
    g.context.quizAttempts = attempts;
    const states = g.run(
      'QuizPolicy.states(quizItems,quizAttempts,"2026-05-01",s=>s,"2026-10-25")',
    );
    assert.equal(states.length, size);
    assert.ok(states.every((s) => s.stable && s.gated));
    assert.ok(
      keyReads <= 3 * attempts.length + 2 * size,
      "キー参照は教材数＋履歴数に比例",
    );
    assert.equal(parses, size, "教材JSONは各版を1回だけ解釈");
    t.diagnostic(
      JSON.stringify({
        items: size,
        attempts: attempts.length,
        keyReads,
        parses,
      }),
    );
  }
  g.context.quizItems = [
    {
      id: "old",
      item_key: "meaning",
      skill_key: "s",
      payload_json: '{"quizType":"meaning","correct":"old-yes"}',
    },
    {
      id: "new",
      item_key: "meaning",
      skill_key: "s",
      payload_json: '{"quizType":"meaning","correct":"new-yes"}',
    },
    {
      id: "form",
      item_key: "form",
      skill_key: "s",
      payload_json: '{"quizType":"form","correct":"yes"}',
    },
  ];
  g.context.quizAttempts = [
    { item_id: "form", answer: "yes", created_at: "2026-01-01" },
    { item_id: "old", answer: "old-yes", created_at: "2026-10-24" },
    ...Array.from({ length: 3 }, () => ({
      item_id: "missing",
      answer: "x",
      created_at: "2026-10-25",
    })),
    { item_id: "new", answer: "new-yes", created_at: "2026-10-25" },
  ].map((a) => ({ ...a, response_mode: "choice" }));
  const states = g.run(
    'QuizPolicy.states(quizItems,quizAttempts,"2026-05-01",s=>s,"2026-10-25",["s"])',
  );
  assert.equal(states[1].stable, true);
  assert.equal(states[2].gated, false);
  assert.deepEqual(Array.from(states[2].rank), [0, 2, 2, 2, 1]);
});

function talkHistory(count) {
  const g = createGas({ now: "2026-10-25T01:00:00Z" });
  g.run("Seeder.initialize()");
  g.rpc = (name, request = {}) =>
    g.call("rpc", "skill_trainer_" + name, request);
  ok(
    g.rpc("save_settings_v1", {
      ai_enabled: true,
      daily_limit: 30,
      api_key: "test-key-12345678901234567890",
    }),
  );
  g.context.provider = (feature) => {
    assert.equal(g.lock.held, false);
    return {
      ok: true,
      result:
        feature === "talk_end"
          ? { summary: "まとめ", candidates: [] }
          : { reply: "Hello", feedback: "" },
    };
  };
  g.run("EnglishAiProvider.call=provider");
  ok(
    g.rpc("start_talk_session_v2", {
      session_id: "perf-talk",
      scenario: "free_talk",
      consent: true,
    }),
  );
  g.context.historyCount = count;
  g.run(`withLock_(()=>{
    const original=TrainingRepository.find("ai_requests","opening-perf-talk");
    SheetStore.append("talk_requests",Array.from({length:historyCount},(_,i)=>({
      id:"past-"+i,session_id:"perf-talk",state:"pending",sequence:"1",message:"old",payload_hash:"old"
    })));
    SheetStore.append("ai_requests",Array.from({length:historyCount},(_,i)=>({
      ...original,id:"turn-past-"+i,feature:"talk_turn",state:i%2?"abandoned":"failed",day_key:"2026-10-24"
    })));
  })`);
  return g;
}

test("失敗・中止後に残った会話要求1000件でも表示・送信・終了のSheets読取は増えない", (t) => {
  let baseline;
  for (const count of [0, 100, 1000]) {
    const g = talkHistory(count);
    let reads = 0,
      locked = 0;
    for (const sheet of g.sheets.values()) {
      const read = sheet.getDataRange;
      sheet.getDataRange = (...args) => {
        reads++;
        if (g.lock.held) locked++;
        return read(...args);
      };
    }
    const measure = (action) => {
      reads = 0;
      locked = 0;
      const result = ok(action());
      return { result, counts: { reads, locked } };
    };
    const get = measure(() =>
      g.call("rpc", "english_trainer_get_talk_v1", { session_id: "perf-talk" }),
    );
    assert.equal(get.result.pendingTurn, null);
    const send = measure(() =>
      g.rpc("send_talk_message_v2", {
        session_id: "perf-talk",
        turn_id: "new-turn",
        message: "Hello",
        consent: true,
      }),
    );
    assert.equal(send.result.turns.length, 2);
    const end = measure(() =>
      g.rpc("end_talk_session_v2", {
        session_id: "perf-talk",
        request_id: "finish",
        consent: true,
      }),
    );
    assert.equal(end.result.state, "closed");
    const counts = { get: get.counts, send: send.counts, end: end.counts };
    if (!baseline) baseline = counts;
    else assert.deepEqual(counts, baseline);
    assert.ok(end.counts.reads < 60 && send.counts.reads < 60);
    t.diagnostic(JSON.stringify({ history: count, ...counts }));
  }
});

test("会話の大量終了済み要求の末尾にあるunknown要求を見落とさない", () => {
  const g = talkHistory(1000);
  g.run(
    'withLock_(()=>TrainingRepository.update("ai_requests","turn-past-999",{state:"unknown"}))',
  );
  const state = ok(
    g.call("rpc", "english_trainer_get_talk_v1", { session_id: "perf-talk" }),
  );
  assert.equal(state.pendingTurn.turn_id, "past-999");
  assert.equal(
    g.rpc("send_talk_message_v2", {
      session_id: "perf-talk",
      turn_id: "blocked",
      message: "Hello",
      consent: true,
    }).code,
    "busy",
  );
  assert.equal(
    g.rpc("end_talk_session_v2", {
      session_id: "perf-talk",
      request_id: "blocked-end",
      consent: true,
    }).code,
    "busy",
  );
});

const observation = {
  meaning_match: "yes",
  speech_act_match: "yes",
  comprehensibility: "clear",
  target_pattern_status: "used",
  issues: [],
  reason: "一致",
  confidence: 1,
};

function ok(result) {
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.data;
}

function setup(count) {
  const g = createGas({ now: "2026-10-25T01:00:00Z" });
  g.run("Seeder.initialize()");
  g.rpc = (name, request = {}) =>
    g.call("rpc", "skill_trainer_" + name, request);
  ok(
    g.rpc("save_settings_v1", {
      ai_enabled: true,
      daily_limit: 30,
      api_key: "test-key-12345678901234567890",
    }),
  );
  g.context.provider = () => {
    assert.equal(g.lock.held, false, "外部呼出はロック外");
    return { ok: true, result: observation };
  };
  g.run("EnglishAiProvider.call=provider");
  const item = ok(g.rpc("get_practice_v2", { mode: "controlled_recall" })).item;
  g.answer = {
    attempt_id: "target",
    item_id: item.id,
    response_mode: "free_text",
    answer_text: "A different answer.",
    consent: true,
  };
  ok(g.rpc("submit_attempt_v2", g.answer));
  g.context.historyCount = count;
  // 再判定のループも検査するため、同じ回答に対する過去の確定済み採点を用意する。
  g.run(`withLock_(() => {
    const original=TrainingRepository.find("ai_requests","grade-target");
    const assessment=TrainingRepository.find("assessments","assessment-grade-target");
    SheetStore.append("ai_requests",Array.from({length:historyCount},(_,i)=>({
      ...original,id:"history-"+i,day_key:"2026-10-24"
    })));
    SheetStore.append("assessments",Array.from({length:historyCount},(_,i)=>({
      ...assessment,id:"assessment-history-"+i,ai_request_id:"history-"+i
    })));
  })`);
  return g;
}

function meter(g) {
  let reads = 0,
    locked = 0;
  const sheet = g.sheets.get("et_assessments"),
    original = sheet.getDataRange;
  sheet.getDataRange = (...args) => {
    reads++;
    if (g.lock.held) locked++;
    return original(...args);
  };
  return {
    result: () => ({ reads, locked }),
    reset() {
      reads = 0;
      locked = 0;
    },
  };
}

test("新規採点・再判定の表読取回数は過去0/100/1000件で増えない", (t) => {
  let baseline;
  for (const count of [0, 100, 1000]) {
    const g = setup(count),
      measured = meter(g);
    const answer = { ...g.answer, attempt_id: "new-answer" };
    assert.equal(ok(g.rpc("submit_attempt_v2", answer)).source, "ai");
    const submit = measured.result();
    measured.reset();
    assert.equal(
      ok(
        g.rpc("regrade_attempt_v2", {
          attempt_id: "target",
          regrade_id: "fresh",
          consent: true,
        }),
      ).source,
      "ai",
    );
    const regrade = measured.result();
    assert.ok(submit.reads < 10 && regrade.reads < 10);
    const actual = { submit, regrade };
    if (!baseline) baseline = actual;
    else
      assert.deepEqual(
        actual,
        baseline,
        "履歴件数に比例するSheets呼出を作らない",
      );
    t.diagnostic(JSON.stringify({ history: count, ...actual }));
    assert.equal(ok(g.rpc("submit_attempt_v2", answer)).replayed, true);
  }
});

test("大量履歴の末尾にある未確定採点も検出し、復旧後に一度だけ再判定する", () => {
  const g = setup(1000);
  // 成功したAI結果だけがあり、assessment確定前に停止した状態。
  g.run(`withLock_(()=>{
    const original=TrainingRepository.find("ai_requests","grade-target");
    TrainingRepository.add("ai_requests",{...original,id:"unfinished"});
  });
  globalThis.savedInput=JSON.parse(TrainingRepository.find("ai_requests","grade-target").snapshot_json).input`);
  assert.throws(
    () =>
      g.run(
        'ApplicationComposition.create().ai.run("parallel","grade",savedInput)',
      ),
    (error) =>
      error.code === "ai_pending" && error.aiRequestId === "unfinished",
  );
  let calls = 0;
  g.context.provider = () => {
    calls++;
    return { ok: true, result: observation };
  };
  g.run("EnglishAiProvider.call=provider");
  const request = {
    attempt_id: "target",
    regrade_id: "after-recovery",
    consent: true,
  };
  ok(g.rpc("regrade_attempt_v2", request));
  assert.equal(
    g.run(
      'TrainingRepository.find("assessments","assessment-unfinished").attempt_id',
    ),
    "target",
  );
  ok(g.rpc("regrade_attempt_v2", request));
  assert.equal(calls, 1, "保存済み結果の復旧と再送ではAIを再実行しない");
});
