/** Sheets操作。旧表は読取専用。列不一致では書込を停止する。 */
const SheetStore = {
  ss_: null,
  spreadsheet() {
    if (!this.ss_) this.ss_ = SpreadsheetApp.getActiveSpreadsheet();
    return this.ss_;
  },
  url() {
    return this.spreadsheet().getUrl();
  },
  physical(name) {
    return "et_" + name;
  },
  sheet(name) {
    return this.spreadsheet().getSheetByName(this.physical(name));
  },
  assertHeaders_(headers, expected) {
    if (JSON.stringify(headers.map(String)) !== JSON.stringify(expected))
      throw new AppError(
        "schema_mismatch",
        "表の列が設計と一致しません。管理者による確認が必要です。",
      );
  },
  raw_(name) {
    const sheet = this.sheet(name);
    if (!sheet)
      throw new AppError(
        "schema_missing",
        "必要な表がありません。復元または移行を確認してください。",
      );
    const raw = sheet.getDataRange().getValues();
    this.assertHeaders_(raw[0] || [], TABLES[name].columns);
    return raw;
  },
  rows_(name, raw) {
    const def = TABLES[name];
    return raw
      .slice(1)
      .map((cells) => {
        const row = {};
        def.columns.forEach((c, i) => {
          row[c] = def.text.includes(c)
            ? String(cells[i] == null ? "" : cells[i])
            : cells[i];
        });
        return row;
      })
      .filter((r) => Object.values(r).some((value) => value !== ""));
  },
  read(name) {
    return this.readMany([name])[name];
  },
  readFresh(name) {
    return this.rows_(name, this.raw_(name));
  },
  readManyFresh(names) {
    return Object.fromEntries(names.map((n) => [n, this.readFresh(n)]));
  },
  readMany(names) {
    const generation = TableCache.generation(),
      out = TableCache.getMany(names, generation),
      fresh = {};
    names
      .filter((n) => !(n in out))
      .forEach((n) => {
        out[n] = fresh[n] = this.readFresh(n);
      });
    TableCache.putMany(fresh, generation);
    return out;
  },
  format_(name) {
    const def = TABLES[name];
    return def.columns.map((c) =>
      def.text.includes(c)
        ? "@"
        : c.endsWith("_at")
          ? "yyyy/mm/dd hh:mm:ss"
          : "General",
    );
  },
  assertUnique_(name, rows) {
    for (const columns of TABLE_UNIQUE[name]) {
      const seen = new Set();
      for (const row of rows) {
        if (columns.some((c) => row[c] == null || row[c] === "")) continue;
        const key = JSON.stringify(columns.map((c) => String(row[c])));
        if (seen.has(key))
          throw new AppError(
            "data_conflict",
            "一意キーが重複しています。書込を中止しました。",
          );
        seen.add(key);
      }
    }
  },
  append(name, rows) {
    requireWriteLock_();
    if (!rows.length) return;
    this.headers_(name);
    const def = TABLES[name],
      sheet = this.sheet(name);
    const normalized = rows.map((r) =>
      Object.fromEntries(
        def.columns.map((c) => [
          c,
          def.text.includes(c)
            ? String(r[c] == null ? "" : r[c])
            : r[c] == null
              ? ""
              : r[c],
        ]),
      ),
    );
    if (normalized.some((r) => !r[def.key]))
      throw new AppError("validation_error", "必須IDがありません。");
    this.assertUnique_(name, this.readFresh(name).concat(normalized));
    const token = TableCache.beforeWrite(name),
      start = sheet.getLastRow() + 1,
      needed = start + rows.length - 1 - sheet.getMaxRows();
    if (needed > 0) sheet.insertRowsAfter(sheet.getMaxRows(), needed);
    const range = sheet.getRange(start, 1, rows.length, def.columns.length);
    range.setNumberFormats(rows.map(() => this.format_(name)));
    range.setValues(normalized.map((r) => def.columns.map((c) => r[c])));
    TableCache.afterWrite(token, name, normalized);
  },
  update(name, key, values) {
    requireWriteLock_();
    if (TABLES[name].appendOnly)
      throw new AppError("immutable", "学習台帳は更新できません。");
    const def = TABLES[name],
      raw = this.raw_(name),
      ki = def.columns.indexOf(def.key);
    const matches = raw
      .map((r, i) => (i > 0 && String(r[ki]) === String(key) ? i : -1))
      .filter((i) => i >= 0);
    if (matches.length !== 1)
      throw new AppError("data_conflict", "更新対象が一意に決まりません。");
    const index = matches[0],
      row = this.rows_(name, [raw[0], raw[index]])[0],
      next = { ...row, ...values };
    this.assertUnique_(
      name,
      this.rows_(name, raw).map((r) => (r[def.key] === String(key) ? next : r)),
    );
    const token = TableCache.beforeWrite(name);
    const range = this.sheet(name).getRange(
      index + 1,
      1,
      1,
      def.columns.length,
    );
    range.setNumberFormats([this.format_(name)]);
    range.setValues([def.columns.map((c) => (next[c] == null ? "" : next[c]))]);
    TableCache.afterWrite(token, name);
  },
  removeWhere(name, column, value) {
    requireWriteLock_();
    if (TABLES[name].appendOnly)
      throw new AppError("immutable", "学習台帳は削除できません。");
    const raw = this.raw_(name),
      index = TABLES[name].columns.indexOf(column);
    if (index < 0) throw new Error("不明な列");
    const token = TableCache.beforeWrite(name);
    for (let r = raw.length - 1; r > 0; r--)
      if (String(raw[r][index]) === String(value))
        this.sheet(name).deleteRow(r + 1);
    TableCache.afterWrite(token, name);
  },
  missingTables() {
    return Object.keys(TABLES).filter((n) => !this.sheet(n));
  },
  headers_(name) {
    const sheet = this.sheet(name);
    if (!sheet)
      throw new AppError("schema_missing", "Required table is missing");
    this.assertHeaders_(
      sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0],
      TABLES[name].columns,
    );
  },
  validate() {
    Object.keys(TABLES).forEach((n) => this.headers_(n));
  },
  existingSheets(names) {
    return names.filter((n) => this.spreadsheet().getSheetByName(n));
  },
  ensureTables() {
    requireWriteLock_();
    const created = {};
    Object.keys(TABLES).forEach((name) => {
      if (this.sheet(name)) {
        this.raw_(name);
        return;
      }
      const sheet = this.spreadsheet().insertSheet(this.physical(name));
      sheet
        .getRange(1, 1, 1, TABLES[name].columns.length)
        .setValues([TABLES[name].columns])
        .setFontWeight("bold");
      sheet.setFrozenRows(1);
      created[name] = true;
    });
    if (Object.keys(created).length)
      this.spreadsheet().setSpreadsheetTimeZone(Session.getScriptTimeZone());
    return created;
  },
};
