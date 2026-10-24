import { createHash } from "node:crypto";
// テスト用の模擬 GAS。gas/server.js を Node の vm で動かし、SpreadsheetApp などをメモリ上の表で置き換える。
// 本物の Sheets と同じく、書式が "@"（書式なしテキスト）でないセルに数字だけの文字列を書くと数値に変わる。
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

export const GAS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

function makeSheet(name) {
  const cells = []; // cells[r][c] = { v, f }
  const at = (r, c) => {
    cells[r] = cells[r] || [];
    cells[r][c] = cells[r][c] || { v: "", f: "" };
    return cells[r][c];
  };
  const sheet = {
    name,
    maxRows: 1000,
    frozen: 0,
    get rows() {
      return cells.map((row) =>
        (row || []).map((cell) => (cell ? cell.v : "")),
      );
    },
    getLastRow: () =>
      cells.reduce(
        (last, row, i) =>
          row && row.some((c) => c && c.v !== "") ? i + 1 : last,
        0,
      ),
    getLastColumn: () =>
      cells.reduce((m, row) => Math.max(m, row ? row.length : 0), 0),
    getMaxRows: () => sheet.maxRows,
    insertRowsAfter: (_after, n) => {
      sheet.maxRows += n;
    },
    setFrozenRows: (n) => {
      sheet.frozen = n;
    },
    deleteRow: (n) => {
      cells.splice(n - 1, 1);
    },
    getDataRange: () =>
      sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()),
    getRange: (r, c, nr = 1, nc = 1) => {
      if (r + nr - 1 > sheet.maxRows) throw new Error("範囲がシートの外です");
      const range = {
        getValues: () =>
          Array.from({ length: nr }, (_, i) =>
            Array.from({ length: nc }, (_, j) => {
              const row = cells[r - 1 + i];
              const cell = row && row[c - 1 + j];
              return cell ? cell.v : "";
            }),
          ),
        getFormulas: () =>
          Array.from({ length: nr }, (_, i) =>
            Array.from(
              { length: nc },
              (_, j) => at(r - 1 + i, c - 1 + j).formula || "",
            ),
          ),
        setValues: (values) => {
          values.forEach((row, i) =>
            row.forEach((v, j) => {
              const cell = at(r - 1 + i, c - 1 + j);
              cell.formula =
                typeof v === "string" && v.startsWith("=") ? v : "";
              cell.v =
                cell.f !== "@" &&
                typeof v === "string" &&
                /^-?\d+(\.\d+)?$/.test(v)
                  ? Number(v)
                  : v;
            }),
          );
          return range;
        },
        setRichTextValues: (values) => {
          values.forEach((row, i) =>
            row.forEach((v, j) => {
              at(r - 1 + i, c - 1 + j).v = v.text;
              at(r - 1 + i, c - 1 + j).formula = "";
            }),
          );
          return range;
        },
        setNumberFormat: (f) => {
          for (let i = 0; i < nr; i++)
            for (let j = 0; j < nc; j++) at(r - 1 + i, c - 1 + j).f = f;
          return range;
        },
        setNumberFormats: (formats) => {
          formats.forEach((row, i) =>
            row.forEach((f, j) => {
              at(r - 1 + i, c - 1 + j).f = f;
            }),
          );
          return range;
        },
        setFontWeight: () => range,
      };
      return range;
    },
  };
  return sheet;
}

/** 新しい模擬 GAS を作る。sheets に既存のシートを入れておける。 */
export function createGas({ existingSheets = [], now } = {}) {
  const sheets = new Map(existingSheets.map((n) => [n, makeSheet(n)]));
  const cache = new Map();
  const props = new Map();
  let currentTime = now == null ? null : new Date(now).getTime();
  if (currentTime !== null && !Number.isFinite(currentTime))
    throw Error("模擬時刻が不正です");
  const clock = {
    now: () => (currentTime === null ? Date.now() : currentTime),
    advance(ms) {
      if (currentTime === null || !Number.isFinite(ms) || ms < 0)
        throw Error("固定時刻と非負の経過時間を指定してください");
      currentTime += ms;
    },
  };
  class MockDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [clock.now()]));
    }
    static now() {
      return clock.now();
    }
    static [Symbol.hasInstance](value) {
      return value instanceof Date;
    }
  }
  const lock = { held: false, attempts: 0, releases: 0 };
  const expires = new Map();
  const cached = (k) => {
    if (expires.has(k) && clock.now() >= expires.get(k)) {
      cache.delete(k);
      expires.delete(k);
    }
    return cache.has(k) ? cache.get(k) : null;
  };
  let uuid = 0;
  let tz = "Etc/UTC";
  const pad = (n) => String(n).padStart(2, "0");
  const jst = (d) => new Date(d.getTime() + 9 * 3600e3); // Asia/Tokyo 固定の簡易版
  const ss = {
    getId: () => "test-sheet",
    getSheetByName: (n) => sheets.get(n) || null,
    insertSheet: (n) => {
      const s = makeSheet(n);
      sheets.set(n, s);
      return s;
    },
    deleteSheet: (s) => sheets.delete(s.name),
    getUrl: () => "https://docs.google.com/spreadsheets/d/test/edit",
    getSpreadsheetTimeZone: () => tz,
    setSpreadsheetTimeZone: (t) => {
      tz = t;
    },
  };
  const context = vm.createContext({
    console: {
      log() {},
      error(e) {
        console.error("SERVER", e);
      },
    },
    Date: MockDate,
    JSON,
    Map,
    Set,
    Number,
    String,
    Object,
    Array,
    Math,
    Error,
    RegExp,
    isFinite,
    SpreadsheetApp: {
      flush() {},
      getActiveSpreadsheet: () => ss,
      openById: (id) => {
        if (id !== "test-sheet") throw Error("保存先が異なります");
        return ss;
      },
      newRichTextValue: () => {
        let text = "";
        return {
          setText(v) {
            text = v;
            return this;
          },
          build: () => ({ text }),
        };
      },
    },
    Session: { getScriptTimeZone: () => "Asia/Tokyo" },
    Utilities: {
      Charset: { UTF_8: "UTF_8" },
      DigestAlgorithm: { SHA_256: "SHA_256", MD5: "MD5" },
      computeDigest: (algorithm, value) => [
        ...createHash(algorithm === "MD5" ? "md5" : "sha256")
          .update(typeof value === "string" ? value : Buffer.from(value))
          .digest(),
      ],
      getUuid: () => `uuid-${++uuid}`,
      formatDate: (d, _tz, f) => {
        const j = jst(d);
        const ymd = `${j.getUTCFullYear()}-${pad(j.getUTCMonth() + 1)}-${pad(j.getUTCDate())}`;
        const hm = `${pad(j.getUTCHours())}:${pad(j.getUTCMinutes())}`;
        if (f === "yyyy-MM-dd'T'HH:mm:ssXXX")
          return `${ymd}T${hm}:${pad(j.getUTCSeconds())}+09:00`;
        if (f === "yyyy-MM-dd") return ymd;
        return `${ymd} ${hm}`;
      },
    },
    LockService: {
      getScriptLock: () => {
        let acquired = false;
        return {
          tryLock() {
            lock.attempts++;
            if (lock.held) return false;
            acquired = true;
            lock.held = true;
            return true;
          },
          releaseLock() {
            if (acquired) {
              lock.releases++;
              lock.held = false;
              acquired = false;
            }
          },
        };
      },
    },
    // 本物と同じく、値は文字列だけ・1 つの値は 100KB まで
    CacheService: {
      getScriptCache: () => {
        const put = (k, v, ttl = 600) => {
          if (typeof v !== "string") throw new Error("Cache の値は文字列だけ");
          if (Buffer.byteLength(v, "utf8") > 100 * 1024)
            throw new Error("Argument too large");
          cache.set(k, v);
          expires.set(k, clock.now() + ttl * 1000);
        };
        return {
          get: cached,
          getAll: (keys) =>
            Object.fromEntries(
              keys.map((k) => [k, cached(k)]).filter(([, v]) => v !== null),
            ),
          put,
          putAll: (values, ttl) =>
            Object.entries(values).forEach(([k, v]) => put(k, v, ttl)),
          remove: (k) => cache.delete(k),
          removeAll: (keys) => keys.forEach((k) => cache.delete(k)),
        };
      },
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => props.get(k) ?? null,
        setProperty: (k, v) => {
          props.set(k, v);
        },
        deleteProperty: (k) => props.delete(k),
      }),
    },
    HtmlService: {},
  });
  // GAS と同じく、server/ の全ファイルを 1 つの大域に読み込む（生成物 server/config/generated.js が先。npm run build:data で作る）
  serverFiles().forEach((file) =>
    vm.runInContext(readFileSync(join(GAS_DIR, file), "utf8"), context, {
      filename: file,
    }),
  );
  return {
    clock,
    lock,
    sheets,
    props,
    cache, // CacheService の中身（テストで覗く・消すため）
    run: (code) => vm.runInContext(code, context),
    // google.script.run と同じく、引数と戻り値はシリアライズして受け渡す。Date が混ざっていたら落とす（GAS では渡せない）
    call: (fn, ...args) => {
      const result = context[fn](...JSON.parse(JSON.stringify(args)));
      assertNoDate(result, fn);
      return JSON.parse(JSON.stringify(result));
    },
    context,
  };
}

/** GAS に上がるサーバーのファイル。.clasp.json の filePushOrder に従い、残りは名前の順。 */
export function serverFiles() {
  const walk = (dir) =>
    readdirSync(join(GAS_DIR, dir), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? walk(`${dir}/${e.name}`)
        : e.name.endsWith(".js")
          ? [`${dir}/${e.name}`]
          : [],
    );
  return walk("server").sort();
}

function assertNoDate(value, where) {
  if (value instanceof Date)
    throw new Error(
      `${where} の戻り値に Date が含まれている（google.script.run では渡せない）`,
    );
  if (value && typeof value === "object")
    Object.values(value).forEach((v) => assertNoDate(v, where));
}

/** doGet と同じ形で index.html を展開した HTML を返す（google.script.* は含まない）。 */
export function renderIndex(config) {
  const read = (n) => readFileSync(join(GAS_DIR, `${n}.html`), "utf8");
  return read("client/index")
    .replace(/<\?!= include_\("([^"]+)"\) \?>/g, (_, n) => read(n))
    .replace("<?!= JSON.stringify(config) ?>", JSON.stringify(config));
}
