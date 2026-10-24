import { test } from "node:test";
import assert from "node:assert/strict";
import { createGas } from "./gas-mock.mjs";

test("最外側のロックで一度確定し、入れ子の途中では解除しない", () => {
  const g = createGas();
  let flushes = 0;
  g.context.SpreadsheetApp.flush = () => {
    assert.equal(g.lock.held, true);
    assert.equal(g.run("writeLockHeld_"), true);
    flushes++;
  };
  g.context.checkInner = () => {
    assert.equal(flushes, 0);
    assert.equal(g.lock.held, true);
  };
  assert.equal(
    g.run('withLock_(()=>{withLock_(()=>42);checkInner();return "done"})'),
    "done",
  );
  assert.equal(flushes, 1);
  assert.equal(g.lock.attempts, 1);
  assert.equal(g.lock.releases, 1);
  assert.equal(g.run("writeLockHeld_"), false);
});

test("業務例外・確定失敗でもロックと内部フラグを解放し、成功扱いしない", () => {
  for (const failure of ["action", "flush"]) {
    const g = createGas();
    let flushes = 0;
    g.context.SpreadsheetApp.flush = () => {
      assert.equal(g.lock.held, true);
      flushes++;
      if (failure === "flush") throw Error("flush failed");
    };
    assert.throws(
      () =>
        g.run(
          `withLock_(()=>{${failure === "action" ? 'throw Error("action failed")' : 'return "done"'}})`,
        ),
      new RegExp(failure + " failed"),
    );
    assert.equal(flushes, 1);
    assert.equal(g.lock.held, false);
    assert.equal(g.run("writeLockHeld_"), false);
    g.context.SpreadsheetApp.flush = () => {};
    assert.equal(g.run("withLock_(()=>42)"), 42);
    assert.equal(g.lock.attempts, 2);
  }
});

test("取得失敗時は他の実行のロックを解除せずflushもしない", () => {
  const g = createGas();
  g.lock.held = true;
  g.context.SpreadsheetApp.flush = () => {
    throw Error("呼んではいけない");
  };
  assert.throws(
    () => g.run("withLock_(()=>42)"),
    (e) => e.code === "busy",
  );
  assert.equal(g.lock.held, true);
  assert.equal(g.lock.releases, 0);
  assert.equal(g.run("writeLockHeld_"), false);
});

test("キャッシュ世代は確定後に公開し、確定失敗時は公開を停止する", () => {
  const g = createGas();
  g.run("Seeder.initialize()");
  const token = g.run('TableCache.beforeWrite("attempts")');
  g.context.token = token;
  let flushed = false;
  g.context.SpreadsheetApp.flush = () => {
    assert.equal(g.run("TableCache.generation()"), null);
    flushed = true;
  };
  g.run('TableCache.afterWrite(token,"attempts")');
  assert.equal(flushed, true);
  assert.equal(g.run("TableCache.generation()"), token.generation);
  g.run('token=TableCache.beforeWrite("attempts")');
  g.context.SpreadsheetApp.flush = () => {
    throw Error("flush failed");
  };
  assert.throws(
    () => g.run('TableCache.afterWrite(token,"attempts")'),
    /flush failed/,
  );
  assert.equal(g.run("TableCache.generation()"), null);
});

test("AI会話の予約確定・最終flushの失敗では外部呼出へ進まない", () => {
  for (const phase of ["write", "release"]) {
    const g = createGas();
    g.run("Seeder.initialize()");
    assert.equal(
      g.call("rpc", "skill_trainer_save_settings_v1", {
        ai_enabled: true,
        daily_limit: 30,
        api_key: "test-key-12345678901234567890",
      }).ok,
      true,
    );
    let calls = 0,
      failures = 0;
    g.context.provider = () => {
      calls++;
      return { ok: true, result: { reply: "Hi", feedback: "" } };
    };
    g.run("EnglishAiProvider.call=provider");
    g.context.SpreadsheetApp.flush = () => {
      assert.equal(g.lock.held, true);
      const writing = g.run("TableCache.generation()") === null;
      if (phase === "write" || !writing) {
        failures++;
        throw Error("flush failed");
      }
    };
    const result = g.call("rpc", "skill_trainer_start_talk_session_v2", {
      session_id: "flush-session",
      scenario: "teacher",
      consent: true,
    });
    assert.equal(result.ok, false);
    assert.ok(failures > 0);
    assert.equal(calls, 0);
    assert.equal(g.lock.held, false);
    assert.equal(g.run("writeLockHeld_"), false);
  }
});
