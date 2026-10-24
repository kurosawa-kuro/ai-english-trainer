function createCatalogApplication_(p) {
  return {
    current() {
      return p.lock(() => {
        const rows = p.repo.all("expressions"),
          counts = new Map(),
          items = [],
          warnings = [],
          newItems = [];
        const existing = new Map(p.repo.all("items").map((r) => [r.id, r]));
        for (const row of rows)
          counts.set(row.id, (counts.get(row.id) || 0) + 1);
        for (const row of rows) {
          if (row.status !== "active") continue;
          try {
            if (counts.get(row.id) !== 1)
              throw new AppError("invalid_content", "教材IDが重複しています。");
            for (const payload of ContentPolicy.derive(row, p.md5)) {
              const json = stableJson_(payload),
                version = p.hash(json),
                id = "item-" + version;
              let item = existing.get(id);
              if (!item) {
                item = {
                  id,
                  item_key: payload.key,
                  version,
                  skill_key: row.id,
                  kind: payload.kind,
                  payload_json: json,
                  created_at: p.iso(),
                };
                newItems.push(item);
              }
              items.push(item);
            }
          } catch (e) {
            if (e instanceof AppError && e.code === "invalid_content")
              warnings.push(row.id + "：" + e.message);
            else throw e;
          }
        }
        for (const payload of p.contrast()) {
          const json = stableJson_(payload),
            version = p.hash(json),
            id = "item-" + version;
          let item = existing.get(id);
          if (!item) {
            item = {
              id,
              item_key: payload.key,
              version,
              skill_key: payload.skillKey,
              kind: "choice",
              payload_json: json,
              created_at: p.iso(),
            };
            newItems.push(item);
          }
          items.push(item);
        }
        if (newItems.length) p.repo.addMany("items", newItems);
        return { items, warnings };
      });
    },
  };
}
