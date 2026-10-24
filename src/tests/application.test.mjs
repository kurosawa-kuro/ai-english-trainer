import { test } from "node:test";
import assert from "node:assert/strict";
import { createGas } from "./gas-mock.mjs";
export const observation = {
  meaning_match: "yes",
  speech_act_match: "yes",
  comprehensibility: "clear",
  target_pattern_status: "used",
  issues: [],
  reason: "意味と型が合っています。",
  confidence: 0.9,
};
function setup() {
  const g = createGas({ now: "2026-10-25T01:00:00Z" });
  g.run("Seeder.initialize()");
  g.rpc = (n, r = {}) => g.call("rpc", "skill_trainer_" + n, r);
  g.rpc("save_settings_v1", {
    ai_enabled: true,
    daily_limit: 30,
    api_key: "test-key-12345678901234567890",
  });
  return g;
}
function mock(g, result = observation) {
  g.context.aiResult = result;
  g.context.calls = 0;
  g.run(
    'EnglishAiProvider.call=()=>{if(writeLockHeld_)throw Error("外部呼出がロック内");calls++;return {ok:true,result:aiResult,usage:{totalTokenCount:12}}}',
  );
}
function free(g, id = "answer-1") {
  const p = g.rpc("get_practice_v2", { mode: "controlled_recall" }).data.item;
  return {
    attempt_id: id,
    item_id: p.id,
    response_mode: "free_text",
    answer_text: "A different answer.",
    consent: true,
  };
}
function assertOk(r) {
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.data;
}
function count(g, table) {
  return g.run("TrainingRepository.all(" + JSON.stringify(table) + ").length");
}

test("初期化再実行とschema有効後の欠損を区別する", () => {
  const g = setup();
  const size = count(g, "expressions");
  g.run("Seeder.initialize()");
  assert.equal(count(g, "expressions"), size);
  g.sheets.delete("et_attempts");
  assert.equal(g.rpc("get_progress_v2").code, "schema_missing");
  assert.throws(() => g.run("Seeder.initialize()"));
  assert.equal(g.sheets.has("et_attempts"), false);
});
test("初期化前のRPCは明示的に止まる", () => {
  const g = createGas();
  assert.equal(
    g.call("rpc", "skill_trainer_get_progress_v2", {}).code,
    "setup_required",
  );
});
test("クイズ→回答→同ID再送→異内容拒否→記録", () => {
  const g = setup();
  const item = assertOk(g.rpc("quiz_next_v1")).item;
  const r = {
    attempt_id: "choice-1",
    item_id: item.id,
    response_mode: "choice",
    selected_option_id: item.options[0].id,
  };
  assertOk(g.rpc("submit_attempt_v2", r));
  assert.equal(assertOk(g.rpc("submit_attempt_v2", r)).replayed, true);
  assert.equal(count(g, "attempts"), 1);
  assert.equal(count(g, "assessments"), 1);
  assert.equal(
    g.rpc("submit_attempt_v2", { ...r, selected_option_id: item.options[1].id })
      .code,
    "request_conflict",
  );
  assert.equal(assertOk(g.rpc("get_progress_v2")).total, 1);
});
test("自由記述のAIはロック外、同ID成功はAPI再実行しない", () => {
  const g = setup();
  mock(g);
  const r = free(g);
  assert.equal(assertOk(g.rpc("submit_attempt_v2", r)).outcome, "pass");
  assertOk(g.rpc("submit_attempt_v2", r));
  assert.equal(g.context.calls, 1);
  assert.equal(count(g, "assessments"), 1);
  assert.equal(g.rpc("get_settings_v1").data.usage.count, 1);
});
test("完全一致はAIオフでも決定的採点", () => {
  const g = setup();
  mock(g);
  g.rpc("save_settings_v1", { ai_enabled: false, daily_limit: 30 });
  const r = free(g);
  r.answer_text = g.run(
    'JSON.parse(TrainingRepository.find("items",' +
      JSON.stringify(r.item_id) +
      ").payload_json).expected",
  );
  assert.equal(assertOk(g.rpc("submit_attempt_v2", r)).source, "deterministic");
  assert.equal(g.context.calls, 0);
});
test("AIオフでも回答は保存、設定変更後に同IDで採点", () => {
  const g = setup();
  mock(g);
  g.rpc("save_settings_v1", { ai_enabled: false, daily_limit: 30 });
  const r = free(g);
  assert.equal(g.rpc("submit_attempt_v2", r).code, "setting_off");
  assert.equal(count(g, "attempts"), 1);
  g.rpc("save_settings_v1", { ai_enabled: true, daily_limit: 30 });
  assertOk(g.rpc("submit_attempt_v2", r));
  assert.equal(count(g, "attempts"), 1);
});
test("同意なしでは外部送信しない", () => {
  const g = setup();
  mock(g);
  assert.equal(
    g.rpc("submit_attempt_v2", { ...free(g), consent: false }).code,
    "consent_required",
  );
  assert.equal(g.context.calls, 0);
});
test("日次枠は同時要求を予約時点で数える", () => {
  const g = setup();
  g.rpc("save_settings_v1", { ai_enabled: true, daily_limit: 1 });
  const a = free(g, "a"),
    b = free(g, "b");
  g.context.second = b;
  g.context.result = observation;
  g.run(
    'EnglishAiProvider.call=()=>{const nested=rpc("skill_trainer_submit_attempt_v2",second);if(nested.code!=="limit_reached")throw Error("上限超過");return {ok:true,result}}',
  );
  assertOk(g.rpc("submit_attempt_v2", a));
  assert.equal(count(g, "ai_requests"), 1);
});
test("429で当日停止しJST翌日に復帰", () => {
  const g = setup();
  g.run('EnglishAiProvider.call=()=>({ok:false,code:"quota_exceeded"})');
  const a = free(g, "a");
  assert.equal(g.rpc("submit_attempt_v2", a).code, "limit_reached");
  assert.equal(g.rpc("get_settings_v1").data.aiReason, "limit_reached");
  g.clock.advance(86400000);
  assert.equal(g.rpc("get_settings_v1").data.aiReason, null);
});
test("結果不明は自動再実行せず、15分後に中止して別要求", () => {
  const g = setup();
  letCalls(g);
  g.run(
    'EnglishAiProvider.call=()=>{calls++;return {ok:false,code:"transport_or_permission_error"}}',
  );
  const r = free(g);
  assert.equal(g.rpc("submit_attempt_v2", r).code, "ai_unknown");
  assert.equal(g.rpc("submit_attempt_v2", r).code, "ai_unknown");
  assert.equal(g.context.calls, 1);
  assert.equal(
    g.call("rpc", "english_trainer_abandon_ai_v1", {
      ai_request_id: "grade-" + r.attempt_id,
    }).code,
    "busy",
  );
  g.clock.advance(16 * 60000);
  assertOk(
    g.call("rpc", "english_trainer_abandon_ai_v1", {
      ai_request_id: "grade-" + r.attempt_id,
    }),
  );
  mock(g);
  assertOk(
    g.rpc("regrade_attempt_v2", {
      attempt_id: r.attempt_id,
      regrade_id: "r1",
      consent: true,
    }),
  );
});
function letCalls(g) {
  g.context.calls = 0;
}
test("結果保存失敗はrunningを残し、再送でAIを呼ばない", () => {
  const g = setup();
  mock(g);
  const r = free(g);
  g.run(
    'const originalUpdate=TrainingRepository.update;TrainingRepository.update=function(n,id,v){if(n==="ai_requests"&&v.state==="succeeded")throw Error("停止");return originalUpdate.call(this,n,id,v)}',
  );
  assert.equal(g.rpc("submit_attempt_v2", r).ok, false);
  g.run("TrainingRepository.update=originalUpdate");
  assert.equal(g.rpc("submit_attempt_v2", r).code, "ai_running");
  assert.equal(g.context.calls, 1);
  g.clock.advance(16 * 60000);
  assert.equal(g.rpc("submit_attempt_v2", r).code, "ai_unknown");
});
for (const target of ["evidence", "assessments"])
  test(target + "保存前停止から再送して確定・API結果再利用", () => {
    const g = setup();
    mock(g);
    const r = free(g);
    g.context.target = target;
    g.run(
      'const addOriginal=TrainingRepository.add;let fired=false;TrainingRepository.add=function(n,row){if(n===target&&!fired){fired=true;throw Error("停止")}return addOriginal.call(this,n,row)}',
    );
    assert.equal(g.rpc("submit_attempt_v2", r).ok, false);
    g.run("TrainingRepository.add=addOriginal");
    assertOk(g.rpc("submit_attempt_v2", r));
    assert.equal(count(g, "evidence"), 1);
    assert.equal(count(g, "assessments"), 1);
    assert.equal(g.context.calls, 1);
  });
test("再判定は回答を更新せず採点履歴を追加、要求再送は一度だけ", () => {
  const g = setup();
  mock(g);
  const r = free(g);
  assertOk(g.rpc("submit_attempt_v2", r));
  const rr = { attempt_id: r.attempt_id, regrade_id: "re-eval", consent: true };
  assertOk(g.rpc("regrade_attempt_v2", rr));
  assertOk(g.rpc("regrade_attempt_v2", rr));
  assert.equal(count(g, "attempts"), 1);
  assert.equal(count(g, "assessments"), 2);
  assert.equal(g.context.calls, 2);
});
test("教材変更後も回答は元の版で採点する", () => {
  const g = setup();
  const r = free(g);
  const payload = g.run(
    'JSON.parse(TrainingRepository.find("items",' +
      JSON.stringify(r.item_id) +
      ").payload_json)",
  );
  g.run(
    'withLock_(()=>TrainingRepository.update("expressions",' +
      JSON.stringify(payload.skillKey) +
      ',{example_en:"Completely changed."}))',
  );
  g.rpc("get_practice_v2");
  r.answer_text = payload.expected;
  const result = assertOk(g.rpc("submit_attempt_v2", r));
  assert.equal(result.expected, payload.expected);
});
test("不正な教材は警告して除外し、他の教材は動く", () => {
  const g = setup();
  g.run(
    'withLock_(()=>TrainingRepository.update("expressions",INITIAL_EXPRESSIONS[0].key,{quiz_json:"invalid"}))',
  );
  const data = assertOk(g.rpc("quiz_next_v1"));
  assert.equal(data.warnings.length, 1);
  assert.ok(data.item);
});
test("追記台帳はロックなし書込・更新・削除を拒否", () => {
  const g = setup();
  assert.throws(
    () => g.run('SheetStore.append("attempts",[{id:"x"}])'),
    /ロック/,
  );
  assert.throws(
    () => g.run('withLock_(()=>SheetStore.update("attempts","x",{}))'),
    /更新できません/,
  );
  assert.throws(
    () => g.run('withLock_(()=>SheetStore.removeWhere("attempts","id","x"))'),
    /削除できません/,
  );
});
test("不正列と複合キー重複を拒否", () => {
  const g = setup();
  g.sheets
    .get("et_attempts")
    .getRange(1, 1)
    .setValues([["wrong"]]);
  assert.equal(g.rpc("get_progress_v2").code, "schema_mismatch");
});
test("設定レスポンス・失敗にキーを含まない", () => {
  const g = setup();
  assert.equal(
    JSON.stringify(g.rpc("get_settings_v1")).includes("test-key-"),
    false,
  );
  assert.equal(
    g.rpc("save_settings_v1", { ai_enabled: true, daily_limit: 0 }).code,
    "validation_error",
  );
  assertOk(
    g.rpc("save_settings_v1", {
      ai_enabled: true,
      daily_limit: 30,
      api_key: "",
    }),
  );
  assert.equal(g.rpc("get_settings_v1").data.keyConfigured, false);
});
test("G4予約RPCは明示的に未実装", () => {
  const g = setup();
  assert.equal(g.rpc("evaluate_phase_gate_v2").code, "not_implemented");
  assert.equal(g.rpc("not_exists").code, "unknown_rpc");
});
test("AI会話3シナリオ、送信再送、終了と候補記録", () => {
  for (const scenario of ["teacher", "learner", "free_talk"]) {
    const g = setup();
    mock(g, { reply: "Hello! How are you?", feedback: "" });
    const s = assertOk(
      g.rpc("start_talk_session_v2", {
        session_id: "session1",
        scenario,
        consent: true,
      }),
    );
    const r = {
      session_id: s.sessionId,
      turn_id: "turn1",
      message: "I am well.",
      consent: true,
    };
    assertOk(g.rpc("send_talk_message_v2", r));
    assertOk(g.rpc("send_talk_message_v2", r));
    assert.equal(g.context.calls, 2);
    assert.equal(count(g, "talk_turns"), 2);
    mock(g, {
      summary: "練習できました。",
      candidates: [{ pattern: "I am well.", meaning: "元気です。" }],
    });
    assert.equal(
      assertOk(
        g.rpc("end_talk_session_v2", {
          session_id: s.sessionId,
          request_id: "finish1",
          consent: true,
        }),
      ).state,
      "closed",
    );
    assert.equal(count(g, "candidates"), 1);
    assert.equal(
      g.rpc("send_talk_message_v2", { ...r, turn_id: "turn2" }).code,
      "session_closed",
    );
  }
});
test("会話の同ID異入力と未完了ターンの並行送信を拒否", () => {
  const g = setup();
  mock(g, { reply: "Hello", feedback: "" });
  g.rpc("start_talk_session_v2", {
    session_id: "s",
    scenario: "teacher",
    consent: true,
  });
  g.run(
    'EnglishAiProvider.call=()=>({ok:false,code:"transport_or_permission_error"})',
  );
  const r = { session_id: "s", turn_id: "t", message: "Hello", consent: true };
  assert.equal(g.rpc("send_talk_message_v2", r).code, "ai_unknown");
  assert.equal(
    g.rpc("send_talk_message_v2", { ...r, message: "changed" }).code,
    "request_conflict",
  );
  assert.equal(
    g.rpc("send_talk_message_v2", { ...r, turn_id: "t2" }).code,
    "busy",
  );
  assert.equal(
    g.rpc("end_talk_session_v2", {
      session_id: "s",
      request_id: "end",
      consent: true,
    }).code,
    "busy",
  );
});

for (const target of ["evidence", "assessments"])
  test(target + "書込後の応答喪失を再送しても重複しない", () => {
    const g = setup();
    mock(g);
    const r = free(g);
    g.context.target = target;
    g.run(
      'const addAfterOriginal=TrainingRepository.add;let afterFired=false;TrainingRepository.add=function(n,row){const value=addAfterOriginal.call(this,n,row);if(n===target&&!afterFired){afterFired=true;throw Error("書込後停止")}return value}',
    );
    assert.equal(g.rpc("submit_attempt_v2", r).ok, false);
    g.run("TrainingRepository.add=addAfterOriginal");
    assertOk(g.rpc("submit_attempt_v2", r));
    assert.equal(count(g, "evidence"), 1);
    assert.equal(count(g, "assessments"), 1);
    assert.equal(g.context.calls, 1);
  });

test("中止済み要求の遅いAI応答を採用しない", () => {
  const g = setup();
  const r = free(g);
  g.context.answer = r;
  g.context.validObservation = observation;
  g.context.advanceClock = () => g.clock.advance(16 * 60000);
  g.run(
    'EnglishAiProvider.call=()=>{advanceClock();ApplicationComposition.create().ai.abandon("grade-"+answer.attempt_id);return {ok:true,result:validObservation}}',
  );
  assert.equal(g.rpc("submit_attempt_v2", r).code, "ai_unknown");
  assert.equal(count(g, "assessments"), 0);
  assert.equal(
    g.run('TrainingRepository.all("ai_requests")[0].state'),
    "abandoned",
  );
});

test("終了保存途中で候補を承認しても同じAI結果から終了を復旧", () => {
  const g = setup();
  mock(g, { reply: "Hello", feedback: "" });
  assertOk(
    g.rpc("start_talk_session_v2", {
      session_id: "recover",
      scenario: "teacher",
      consent: true,
    }),
  );
  mock(g, {
    summary: "練習完了",
    candidates: [{ pattern: "Hello", meaning: "こんにちは" }],
  });
  g.run(
    'const endAddOriginal=TrainingRepository.add;TrainingRepository.add=function(n,row){if(n==="talk_turns"&&row.sequence==="9999")throw Error("終了保存停止");return endAddOriginal.call(this,n,row)}',
  );
  const r = {
    session_id: "recover",
    request_id: "finish-recover",
    consent: true,
  };
  assert.equal(g.rpc("end_talk_session_v2", r).ok, false);
  assertOk(
    g.rpc("review_candidate_v2", {
      candidate_id: "end-finish-recover-0",
      decision: "approved",
    }),
  );
  g.run("TrainingRepository.add=endAddOriginal");
  assert.equal(assertOk(g.rpc("end_talk_session_v2", r)).state, "closed");
  assert.equal(g.context.calls, 1);
  assert.equal(
    g.run('TrainingRepository.all("candidates")[0].state'),
    "approved",
  );
});

test("静的混同ペアを出題し、記録に選択肢の本文を返す", () => {
  const g = setup();
  const item = assertOk(g.rpc("quiz_next_v1", { quiz_type: "contrast" })).item;
  assert.ok(item);
  assertOk(
    g.rpc("submit_attempt_v2", {
      attempt_id: "contrast-answer",
      item_id: item.id,
      response_mode: "choice",
      selected_option_id: item.options[0].id,
    }),
  );
  assert.equal(
    assertOk(g.rpc("get_progress_v2")).records[0].answerLabel,
    item.options[0].text,
  );
});

test("JSONとして正しいnull教材も警告して除外する", () => {
  const g = setup();
  g.run(
    'withLock_(()=>TrainingRepository.update("expressions",INITIAL_EXPRESSIONS[0].key,{quiz_json:"null"}))',
  );
  const out = assertOk(g.rpc("quiz_next_v1"));
  assert.equal(out.warnings.length, 1);
  assert.ok(out.item);
});
