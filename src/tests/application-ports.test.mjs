import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

test("Application単独：GASなしのポート差替えで予約・ロック外通信・成功再利用", () => {
  const ctx = vm.createContext({});
  for (const name of ["core/errors", "application/ai"])
    vm.runInContext(
      readFileSync(
        new URL("../server/" + name + ".js", import.meta.url),
        "utf8",
      ),
      ctx,
    );
  const tables = new Map(
    ["ai_requests", "usage_events", "settings"].map((n) => [n, []]),
  );
  tables
    .get("settings")
    .push({ id: "default", ai_enabled: "true", daily_limit: "1" });
  let locked = false,
    calls = 0;
  const repo = {
    all: (n) => structuredClone(tables.get(n)),
    find(n, id) {
      return this.all(n).find((r) => r.id === id) || null;
    },
    add(n, r) {
      assert.equal(locked, true);
      const old = this.find(n, r.id);
      if (!old) tables.get(n).push(structuredClone(r));
      return old || r;
    },
    update(n, id, v) {
      assert.equal(locked, true);
      Object.assign(
        tables.get(n).find((r) => r.id === id),
        v,
      );
    },
  };
  ctx.ports = {
    repo,
    lock: (fn) => {
      assert.equal(locked, false);
      locked = true;
      try {
        return fn();
      } finally {
        locked = false;
      }
    },
    config: () => ({
      ai: {
        model: "test",
        maxOutputTokens: 100,
        runningTimeoutMinutes: 15,
        dailyLimit: 1,
      },
      limits: { snapshotBytes: 24000 },
    }),
    now: () => 100000,
    day: () => "2026-10-25",
    hash: JSON.stringify,
    keyConfigured: () => true,
    provider: () => {
      assert.equal(locked, false);
      assert.equal(tables.get("ai_requests")[0].state, "running");
      calls++;
      return { ok: true, result: { reply: "hello" } };
    },
  };
  vm.runInContext(
    'const app=createAiApplication_(ports);app.run("one","talk_opening",{scenario:"teacher"});app.run("one","talk_opening",{scenario:"teacher"})',
    ctx,
  );
  assert.equal(calls, 1);
  assert.equal(tables.get("ai_requests").length, 1);
  assert.throws(
    () =>
      vm.runInContext(
        'app.run("two","talk_opening",{scenario:"teacher"})',
        ctx,
      ),
    (e) => e.code === "limit_reached",
  );
  assert.throws(
    () =>
      vm.runInContext(
        'app.run("one","talk_opening",{scenario:"learner"})',
        ctx,
      ),
    (e) => e.code === "request_conflict",
  );
});
