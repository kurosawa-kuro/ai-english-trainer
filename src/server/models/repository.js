/** Application用の保存ポート。全照合はfresh。追記の同ID異内容を拒否する。 */
const TrainingRepository = {
  all: (name) => SheetStore.readFresh(name),
  find(name, id) {
    return this.all(name).find((r) => r.id === id) || null;
  },
  add(name, row) {
    requireWriteLock_();
    const existing = this.find(name, row.id);
    if (existing) {
      const columns = TABLES[name].columns.filter(
        (c) => !["created_at", "updated_at"].includes(c),
      );
      if (
        columns.some((c) => String(existing[c] ?? "") !== String(row[c] ?? ""))
      )
        throw new AppError(
          "request_conflict",
          "同じIDの内容が変更されています。",
        );
      return existing;
    }
    if (!row.id) throw new AppError("validation_error", "IDがありません。");
    SheetStore.append(name, [row]);
    return row;
  },
  update(name, id, values) {
    SheetStore.update(name, id, values);
  },
  addMany(name, rows) {
    requireWriteLock_();
    SheetStore.append(name, rows);
  },
};
