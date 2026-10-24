import { test } from "node:test";
import assert from "node:assert/strict";
import { createGas } from "./gas-mock.mjs";
const observation = {
  meaning_match: "yes",
  speech_act_match: "yes",
  comprehensibility: "clear",
  target_pattern_status: "used",
  issues: [],
  reason: "一致",
  confidence: 1,
};
function setup() {
  const g = createGas({ now: "2026-10-25T01:00:00Z" });
  g.run("Seeder.initialize()");
  g.rpc = (name, r = {}) => g.call("rpc", "skill_trainer_" + name, r);
  ok(
    g.rpc("save_settings_v1", {
      ai_enabled: true,
      daily_limit: 100,
      api_key: "test-key-12345678901234567890",
    }),
  );
  mock(g, observation);
  return g;
}
function ok(r) {
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.data;
}
function mock(g, result) {
  g.context.result = result;
  g.context.calls = 0;
  g.run("EnglishAiProvider.call=()=>{calls++;return {ok:true,result}}");
}
function free(g, id = "a") {
  return {
    attempt_id: id,
    item_id: ok(g.rpc("get_practice_v2", { mode: "controlled_recall" })).item
      .id,
    response_mode: "free_text",
    answer_text: "Something different.",
    consent: true,
  };
}
function start(g) {
  mock(g, { reply: "Hello.", feedback: "" });
  ok(
    g.rpc("start_talk_session_v2", {
      session_id: "s",
      scenario: "teacher",
      consent: true,
    }),
  );
}
function getTalk(g) {
  return ok(g.call("rpc", "english_trainer_get_talk_v1", { session_id: "s" }));
}
function stopReservation(g, r) {
  g.run(
    'const beforeReservedAdd=TrainingRepository.add;TrainingRepository.add=function(n,row){if(n==="usage_events")throw Error("予約後停止");return beforeReservedAdd.call(this,n,row)}',
  );
  assert.equal(g.rpc("submit_attempt_v2", r).ok, false);
  g.run("TrainingRepository.add=beforeReservedAdd");
}

test("Webアプリでactiveがなくても初期設定したIDでSheetsを開く", () => {
  const g = setup();
  g.run("SheetStore.ss_=null;SpreadsheetApp.getActiveSpreadsheet=()=>null");
  ok(g.rpc("get_progress_v2"));
  assert.equal(g.props.get("ET_SPREADSHEET_ID"), "test-sheet");
  g.props.delete("ET_SPREADSHEET_ID");
  g.run("SheetStore.ss_=null");
  assert.equal(g.rpc("get_progress_v2").code, "setup_required");
});
test("コピー先初期設定は保存先を再登録して旧コピーのキーを捨てる", () => {
  const g = setup();
  g.props.set("ET_SPREADSHEET_ID", "source-sheet");
  g.run("Seeder.initialize()");
  assert.equal(g.props.get("ET_SPREADSHEET_ID"), "test-sheet");
  assert.equal(g.props.has("GEMINI_API_KEY"), false);
});
test("数式風の回答とAI応答を文字列のまま保存して再送できる", () => {
  const g = setup();
  const r = { ...free(g), answer_text: "=1+1" };
  ok(g.rpc("submit_attempt_v2", r));
  ok(g.rpc("submit_attempt_v2", r));
  assert.equal(ok(g.rpc("get_progress_v2")).records[0].answer, "=1+1");
  start(g);
  mock(g, {
    reply: '=IMPORTXML("https://invalid.example","x")',
    feedback: "'quoted",
  });
  ok(
    g.rpc("send_talk_message_v2", {
      session_id: "s",
      turn_id: "t",
      message: "=1+1",
      consent: true,
    }),
  );
  assert.equal(getTalk(g).turns[1].reply, g.context.result.reply);
  for (const name of ["et_attempts", "et_talk_turns"])
    assert.ok(
      g.sheets
        .get(name)
        .getDataRange()
        .getFormulas()
        .flat()
        .every((f) => f === ""),
    );
});
test("pending予約の再開はAIオフ・キー削除を無視しない", () => {
  for (const setting of [{ ai_enabled: false }, { api_key: "" }]) {
    const g = setup(),
      r = free(g);
    stopReservation(g, r);
    ok(
      g.rpc("save_settings_v1", {
        ai_enabled: true,
        daily_limit: 100,
        ...setting,
      }),
    );
    assert.equal(
      g.rpc("submit_attempt_v2", r).code,
      setting.api_key === "" ? "key_missing" : "setting_off",
    );
    assert.equal(g.context.calls, 0);
  }
});
test("前日の未送信pendingは今日の利用枠をすり抜けない", () => {
  const g = setup(),
    r = free(g);
  stopReservation(g, r);
  g.clock.advance(86400000);
  assert.equal(g.rpc("submit_attempt_v2", r).code, "ai_failed");
  assert.equal(g.context.calls, 0);
  assert.equal(ok(g.rpc("get_settings_v1")).usage.count, 0);
});
test("pendingの採点が残る間は別の再判定を予約しない", () => {
  const g = setup(),
    r = free(g);
  stopReservation(g, r);
  const out = g.rpc("regrade_attempt_v2", {
    attempt_id: r.attempt_id,
    regrade_id: "r",
    consent: true,
  });
  assert.equal(out.code, "ai_pending");
  assert.equal(out.error.ai_request_id, "grade-a");
  assert.equal(g.context.calls, 0);
  ok(g.rpc("submit_attempt_v2", r));
  assert.equal(g.context.calls, 1);
});
test("同じ回答の並行再判定はAI予約内で拒否する", () => {
  const g = setup(),
    r = free(g);
  ok(g.rpc("submit_attempt_v2", r));
  g.context.observation = observation;
  g.run(
    'EnglishAiProvider.call=()=>{const other=rpc("skill_trainer_regrade_attempt_v2",{attempt_id:"a",regrade_id:"other",consent:true});if(other.code!=="ai_pending")throw Error("重複予約");return {ok:true,result:observation}}',
  );
  ok(
    g.rpc("regrade_attempt_v2", {
      attempt_id: "a",
      regrade_id: "first",
      consent: true,
    }),
  );
  assert.equal(g.run('TrainingRepository.all("ai_requests").length'), 2);
});
test("期限切れrunningをunknownにした直後も元の開始時刻から中止できる", () => {
  const g = setup(),
    r = free(g);
  g.run(
    'const updateBefore=TrainingRepository.update;TrainingRepository.update=function(n,id,v){if(n==="ai_requests"&&v.state==="succeeded")throw Error("停止");return updateBefore.call(this,n,id,v)}',
  );
  assert.equal(g.rpc("submit_attempt_v2", r).ok, false);
  g.run("TrainingRepository.update=updateBefore");
  g.clock.advance(16 * 60000);
  assert.equal(g.rpc("submit_attempt_v2", r).code, "ai_unknown");
  assert.equal(
    ok(
      g.call("rpc", "english_trainer_abandon_ai_v1", {
        ai_request_id: "grade-a",
      }),
    ).state,
    "abandoned",
  );
});
test("会話の未送信予約をブラウザの保存なしで再開できる", () => {
  const g = setup();
  start(g);
  g.run(
    'const aiBefore=EnglishAiProvider.call;const addBefore=TrainingRepository.add;TrainingRepository.add=function(n,row){if(n==="ai_requests")throw Error("AI予約前停止");return addBefore.call(this,n,row)}',
  );
  const r = {
    session_id: "s",
    turn_id: "t",
    message: "My original message.",
    consent: true,
  };
  assert.equal(g.rpc("send_talk_message_v2", r).ok, false);
  g.run("TrainingRepository.add=addBefore");
  assert.equal(getTalk(g).pendingTurn.message, r.message);
  ok(g.rpc("send_talk_message_v2", r));
  assert.equal(getTalk(g).pendingTurn, null);
});
test("送信前に失敗した旧ターンIDは後のターンと同じ順番で再実行しない", () => {
  const g = setup();
  start(g);
  ok(g.rpc("save_settings_v1", { ai_enabled: false, daily_limit: 100 }));
  const r = { session_id: "s", turn_id: "old", message: "Old", consent: true };
  assert.equal(g.rpc("send_talk_message_v2", r).code, "setting_off");
  ok(g.rpc("save_settings_v1", { ai_enabled: true, daily_limit: 100 }));
  ok(g.rpc("send_talk_message_v2", { ...r, turn_id: "new", message: "New" }));
  const count = g.context.calls;
  assert.equal(g.rpc("send_talk_message_v2", r).code, "ai_failed");
  assert.equal(g.context.calls, count);
});
test("長い会話でも最新発話を保持して古い文脈を送信上限内に縮める", () => {
  const g = setup();
  start(g);
  mock(g, { reply: "あ".repeat(2900), feedback: "" });
  for (let i = 0; i < 12; i++)
    ok(
      g.rpc("send_talk_message_v2", {
        session_id: "s",
        turn_id: "t" + i,
        message: "い".repeat(1900),
        consent: true,
      }),
    );
  const snapshot = JSON.parse(
    g.run('TrainingRepository.find("ai_requests","turn-t11").snapshot_json'),
  );
  assert.equal(snapshot.input.message, "い".repeat(1900));
  assert.ok(snapshot.input.history.length < 10);
  assert.ok(Buffer.byteLength(JSON.stringify(snapshot)) <= 24000);
});
test("終了要求の正しいIDを復元し失敗確定後は新しい終了要求を許す", () => {
  const g = setup();
  start(g);
  g.run(
    'EnglishAiProvider.call=()=>({ok:false,code:"transport_or_permission_error"})',
  );
  const r = { session_id: "s", request_id: "original", consent: true };
  assert.equal(g.rpc("end_talk_session_v2", r).code, "ai_unknown");
  assert.equal(getTalk(g).closingRequestId, "original");
  g.clock.advance(16 * 60000);
  ok(
    g.call("rpc", "english_trainer_abandon_ai_v1", {
      ai_request_id: "end-original",
    }),
  );
  assert.equal(getTalk(g).closingRequestId, null);
  mock(g, { summary: "完了", candidates: [] });
  assert.equal(
    ok(g.rpc("end_talk_session_v2", { ...r, request_id: "new" })).state,
    "closed",
  );
});
test("同時刻の再判定でも後から確定した判定を表示する", () => {
  const g = setup(),
    r = free(g);
  ok(g.rpc("submit_attempt_v2", r));
  mock(g, { ...observation, meaning_match: "no" });
  ok(
    g.rpc("regrade_attempt_v2", {
      attempt_id: "a",
      regrade_id: "z",
      consent: true,
    }),
  );
  mock(g, observation);
  ok(
    g.rpc("regrade_attempt_v2", {
      attempt_id: "a",
      regrade_id: "a",
      consent: true,
    }),
  );
  assert.equal(ok(g.rpc("get_progress_v2")).records[0].result.outcome, "pass");
});
test("同時刻の再チェック後に追加した回答は新しい復習履歴に含む", () => {
  const g = setup();
  const item = ok(g.rpc("quiz_next_v1")).item;
  ok(g.rpc("reset_review_v2", { request_id: "reset" }));
  ok(
    g.rpc("submit_attempt_v2", {
      attempt_id: "after",
      item_id: item.id,
      response_mode: "choice",
      selected_option_id: item.options[0].id,
    }),
  );
  assert.equal(
    g.run(
      'TrainingRepository.all("attempts")[0].created_at > TrainingRepository.all("review_resets")[0].created_at',
    ),
    true,
  );
});
test("必須の対象表現をnot_applicableで合格扱いしない", () => {
  const g = setup();
  g.context.o = { ...observation, target_pattern_status: "not_applicable" };
  assert.equal(g.run("AssessmentPolicy.reduce(o,true)"), "retry_target");
});
test("キャッシュの破損・容量超過・旧世代書戻しはfresh値を壊さない", () => {
  const g = setup();
  g.run('SheetStore.read("settings")');
  const old = g.run("TableCache.generation()");
  const key = g.run('TableCache.key("settings",TableCache.generation())');
  g.cache.set(key, "invalid-json");
  assert.equal(g.run('SheetStore.read("settings")[0].daily_limit'), "100");
  g.run('TableCache.putMany({settings:[{huge:"x".repeat(100000)}]})');
  assert.equal(g.cache.has(key), false);
  ok(g.rpc("save_settings_v1", { ai_enabled: true, daily_limit: 77 }));
  g.context.old = old;
  g.run('TableCache.putMany({settings:[{daily_limit:"1"}]},old)');
  assert.equal(g.run('SheetStore.read("settings")[0].daily_limit'), "77");
});
test("ScriptLock競合時は書込せず、IDの変更・複合一意キーの衝突も拒否", () => {
  const g = setup();
  g.lock.held = true;
  assert.equal(
    g.rpc("save_settings_v1", { ai_enabled: true, daily_limit: 7 }).ok,
    false,
  );
  g.lock.held = false;
  assert.equal(ok(g.rpc("get_settings_v1")).dailyLimit, 100);
  assert.throws(() =>
    g.run(
      'withLock_(()=>TrainingRepository.update("settings","default",{id:""}))',
    ),
  );
  start(g);
  assert.throws(() =>
    g.run(
      'withLock_(()=>TrainingRepository.add("talk_turns",{id:"duplicate",session_id:"s",sequence:"0"}))',
    ),
  );
});

test("再判定で置き換えられた能力証拠を成功件数へ二重計上しない", () => {
  const g = setup(),
    r = free(g);
  ok(g.rpc("submit_attempt_v2", r));
  mock(g, { ...observation, meaning_match: "no" });
  ok(
    g.rpc("regrade_attempt_v2", {
      attempt_id: "a",
      regrade_id: "replacement",
      consent: true,
    }),
  );
  assert.deepEqual(
    ok(g.rpc("get_progress_v2")).capabilities.CONTROLLED_RECALL,
    { attempts: 1, successes: 0 },
  );
});
test("残り1問でも安定済みの問題を挟んで3問間隔を作る", () => {
  const g = setup();
  g.context.states = [
    {
      item: { id: "remaining" },
      stable: false,
      gated: false,
      rank: [1, 0, 1, 0, 0],
    },
    {
      item: { id: "spacer" },
      stable: true,
      gated: false,
      rank: [0, 4, 1, 0, 0],
    },
  ];
  assert.equal(g.run("QuizPolicy.choose(states,()=>0).item.id"), "spacer");
  g.context.states[0].rank[0] = 0;
  assert.equal(g.run("QuizPolicy.choose(states,()=>0).item.id"), "remaining");
  g.context.states[0].stable = true;
  assert.equal(g.run("QuizPolicy.choose(states,()=>0)"), null);
});
test("初期教材の保存中断後も再初期化で重複しない", () => {
  const g = createGas();
  g.run(
    'const initialAdd=TrainingRepository.add;let initialCount=0;TrainingRepository.add=function(n,r){if(n==="expressions"&&++initialCount===5)throw Error("中断");return initialAdd.call(this,n,r)}',
  );
  assert.throws(() => g.run("Seeder.initialize()"));
  g.run("TrainingRepository.add=initialAdd;Seeder.initialize()");
  assert.equal(g.run('TrainingRepository.all("expressions").length'), 51);
  assert.equal(g.props.get("ET_SCHEMA_VERSION"), "1");
});

test("内部の接頭辞で長さ超過する要求IDは回答保存前に拒否", () => {
  const g = setup(),
    r = free(g, "x".repeat(101));
  assert.equal(g.rpc("submit_attempt_v2", r).code, "validation_error");
  assert.equal(g.run('TrainingRepository.all("attempts").length'), 0);
});

test("保存済みだが未確定の旧採点を先に復旧してから新しい再判定を行う", () => {
  const g = setup(),
    r = free(g);
  g.run(
    'const deferredAdd=TrainingRepository.add;TrainingRepository.add=function(n,row){if(n==="assessments")throw Error("採点確定前停止");return deferredAdd.call(this,n,row)}',
  );
  assert.equal(g.rpc("submit_attempt_v2", r).ok, false);
  g.run("TrainingRepository.add=deferredAdd");
  mock(g, { ...observation, meaning_match: "no" });
  ok(
    g.rpc("regrade_attempt_v2", {
      attempt_id: "a",
      regrade_id: "new-result",
      consent: true,
    }),
  );
  assert.equal(g.context.calls, 1);
  ok(g.rpc("submit_attempt_v2", r));
  assert.equal(
    ok(g.rpc("get_progress_v2")).records[0].result.outcome,
    "fail_communication",
  );
});

test("AI予約ロックは成功結果の採点確定待ちも並行採点から保護する", () => {
  const g = setup(),
    r = free(g);
  g.run(
    'const beforeCommitAdd=TrainingRepository.add;TrainingRepository.add=function(n,row){if(n==="assessments")throw Error("未確定");return beforeCommitAdd.call(this,n,row)}',
  );
  assert.equal(g.rpc("submit_attempt_v2", r).ok, false);
  g.run("TrainingRepository.add=beforeCommitAdd");
  g.context.original = JSON.parse(
    g.run('TrainingRepository.find("ai_requests","grade-a").snapshot_json'),
  ).input;
  assert.throws(
    () =>
      g.run(
        'ApplicationComposition.create().ai.run("regrade-direct","grade",original)',
      ),
    (e) => e.code === "ai_pending" && e.aiRequestId === "grade-a",
  );
  assert.equal(g.context.calls, 1);
});
