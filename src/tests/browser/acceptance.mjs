import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { createGas, renderIndex } from "../gas-mock.mjs";
const browser = await chromium.launch();
const outcomes = [];
try {
  for (const width of [1440, 390]) {
    const gas = createGas({ now: "2026-10-25T00:00:00Z" });
    gas.run("Seeder.initialize()");
    gas.run(
      'EnglishAiProvider.call=(feature)=>({ok:true,result:feature==="grade"?{meaning_match:"yes",speech_act_match:"yes",comprehensibility:"clear",target_pattern_status:"used",issues:[],reason:"意味が伝わります。",confidence:.9}:feature==="talk_end"?{summary:"よく練習できました。",candidates:[{pattern:"How are you?",meaning:"元気ですか。"}]}:{reply:"Hello! How are you?",feedback:""}})',
    );
    const context = await browser.newContext({
      viewport: { width, height: 950 },
      isMobile: width < 500,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("dialog", (d) => d.accept());
    await page.exposeFunction("testRpc", (name, request) =>
      gas.call("rpc", name, request),
    );
    await page.addInitScript(() => {
      const run = (ok, fail) =>
        new Proxy(
          {},
          {
            get(_, key) {
              if (key === "withSuccessHandler") return (f) => run(f, fail);
              if (key === "withFailureHandler") return (f) => run(ok, f);
              return (name, request) =>
                window.testRpc(name, request).then(ok, fail);
            },
          },
        );
      window.google = {
        script: {
          get run() {
            return run();
          },
          url: { getLocation: (f) => f({ hash: "" }) },
          history: { replace() {}, setChangeHandler() {} },
        },
      };
    });
    await page.route("http://localhost/**", (route) =>
      route.fulfill({ contentType: "text/html", body: renderIndex() }),
    );
    await page.goto("http://localhost/");
    await page.getByRole("button", { name: "設定", exact: true }).click();
    await page.locator("#ai-enabled").check();
    await page.locator("#api-key").fill("test-key-123456789012345");
    await page.locator("#save-settings").click();
    await page.waitForFunction(() =>
      document.querySelector("#ai-status").textContent.includes("登録済み"),
    );
    await page.getByRole("button", { name: "練習", exact: true }).click();
    await page.locator("#next").click();
    await page.locator("#options input").first().check();
    await page.locator("#submit").click();
    await page.waitForFunction(() =>
      document.querySelector("#feedback").textContent.includes("回答例"),
    );
    await page.locator("#mode").selectOption("controlled_recall");
    await page.locator("#next").click();
    await page.locator("#answer").fill("A different phrase.");
    await page.locator("#grade-consent").check();
    await page.locator("#submit").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#feedback")
        .textContent.includes("意味が伝わります"),
    );
    await page.getByRole("button", { name: "会話", exact: true }).click();
    await page.locator("#talk-consent").check();
    await page.locator("#start-talk").click();
    await page.locator("#transcript .bubble").first().waitFor();
    await page.locator("#message").fill("I am fine.");
    await page.locator("#send-talk").click();
    await page.waitForFunction(
      () => document.querySelectorAll("#transcript .bubble").length === 3,
    );
    await page.locator("#end-talk").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#transcript")
        .textContent.includes("よく練習できました"),
    );
    await page.getByRole("button", { name: "記録", exact: true }).click();
    await page.waitForFunction(
      () => document.querySelectorAll("#records-list .record").length === 2,
    );
    assert.equal(await page.locator("#candidates article").count(), 1);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    assert.deepEqual(errors, []);
    mkdirSync("test-results", { recursive: true });
    await page.screenshot({
      path: "test-results/trainer-" + width + ".png",
      fullPage: true,
    });
    outcomes.push({ width, passed: true, scope: "実Chromium・模擬GAS/Gemini" });
    await context.close();
  }
  writeFileSync(
    "test-results/browser-acceptance.json",
    JSON.stringify(outcomes, null, 2),
  );
  console.log(outcomes);
} finally {
  await browser.close();
}
