/** 永続世代で読取の書戻し競合を隔離する。 */
const TableCache = {
  PREFIX: "table:et:1:",
  TTL_SECONDS: 21600,
  MAX_BYTES: 90 * 1024,
  SCHEMA_KEY: "schema:et:1:ready",
  cache_: () => CacheService.getScriptCache(),
  generation() {
    try {
      const value =
        PropertiesService.getScriptProperties().getProperty(
          "ET_CACHE_GENERATION",
        ) || "0";
      return value.startsWith("writing:") ? null : value;
    } catch (_error) {
      return null;
    }
  },
  key(name, generation) {
    return this.PREFIX + generation + ":" + name;
  },
  getMany(names, generation = this.generation()) {
    if (generation == null) return {};
    const out = {};
    try {
      const found = this.cache_().getAll(
        names.map((n) => this.key(n, generation)),
      );
      names.forEach((n) => {
        try {
          const v = found[this.key(n, generation)];
          if (v != null) {
            const rows = JSON.parse(v, reviveDate_);
            if (Array.isArray(rows)) out[n] = rows;
          }
        } catch (_error) {}
      });
    } catch (_error) {}
    return out;
  },
  putMany(tables, generation = this.generation()) {
    if (generation == null) return;
    const values = {},
      oversized = [];
    Object.keys(tables).forEach((n) => {
      const json = JSON.stringify(tables[n], encodeDate_);
      if (utf8Bytes_(json) <= this.MAX_BYTES)
        values[this.key(n, generation)] = json;
      else oversized.push(this.key(n, generation));
    });
    try {
      if (oversized.length) this.cache_().removeAll(oversized);
      if (Object.keys(values).length)
        this.cache_().putAll(values, this.TTL_SECONDS);
    } catch (_error) {}
  },
  beforeWrite(name) {
    const old = this.generation(),
      cached = old == null ? {} : this.getMany(Object.keys(TABLES), old),
      next = Utilities.getUuid();
    PropertiesService.getScriptProperties().setProperty(
      "ET_CACHE_GENERATION",
      "writing:" + next,
    );
    const previous = cached[name];
    delete cached[name];
    return { generation: next, previous, cached };
  },
  afterWrite(token, name, rows) {
    const cached = token.cached;
    if (rows && token.previous) cached[name] = token.previous.concat(rows);
    // 書込中に読んだ古い値はキャッシュしない。完了してから新世代を公開する。
    PropertiesService.getScriptProperties().setProperty(
      "ET_CACHE_GENERATION",
      token.generation,
    );
    this.putMany(cached, token.generation);
  },
  clear() {
    PropertiesService.getScriptProperties().setProperty(
      "ET_CACHE_GENERATION",
      Utilities.getUuid(),
    );
    try {
      this.cache_().remove(this.SCHEMA_KEY);
    } catch (_error) {}
  },
  isSchemaReady() {
    try {
      return this.cache_().get(this.SCHEMA_KEY) === "1";
    } catch (_error) {
      return false;
    }
  },
  markSchemaReady() {
    try {
      this.cache_().put(this.SCHEMA_KEY, "1", this.TTL_SECONDS);
    } catch (_error) {}
  },
};
function encodeDate_(key, value) {
  const raw = this[key];
  return raw instanceof Date ? { $date: raw.getTime() } : value;
}
function reviveDate_(_key, value) {
  return value && typeof value === "object" && typeof value.$date === "number"
    ? new Date(value.$date)
    : value;
}
