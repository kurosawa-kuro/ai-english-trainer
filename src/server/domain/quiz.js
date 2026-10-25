/** SQL優先キーの純粋な比較。乱数とJST日付は外側から渡す。 */
const QuizPolicy = {
  states(items, attempts, resetAt, dayOf, today, recalled = []) {
    const sorted = attempts.filter((a) => a.response_mode === "choice").slice();
    const current = sorted.filter((a) => a.created_at > resetAt);
    const byId = new Map(items.map((i) => [i.id, i]));
    // 教材×全履歴の再走査を避け、教材版を保持したまま一度だけ集計する。
    const payloads = new Map(
      items.map((i) => [i.id, JSON.parse(i.payload_json)]),
    );
    const historyByKey = new Map(),
      unlocked = new Set(),
      beforeResetKeys = new Set();
    const recalledKeys = new Set(recalled);
    const success = (a) =>
      a && a.item && a.answer === payloads.get(a.item.id).correct;
    const recent = current.slice(-3).map((a) => byId.get(a.item_id)?.skill_key);
    current.forEach((a, index) => {
      const item = byId.get(a.item_id);
      if (!item) return;
      const entry = { ...a, seq: index + 1, item };
      const last = historyByKey.get(item.item_key)?.last;
      historyByKey.set(item.item_key, { last: entry, prev: last });
      if (
        ["meaning", "intent"].includes(payloads.get(item.id).quizType) &&
        success(entry)
      )
        unlocked.add(item.skill_key);
    });
    for (const a of sorted) {
      const item = byId.get(a.item_id);
      if (a.created_at <= resetAt && item && success({ ...a, item }))
        beforeResetKeys.add(item.item_key);
    }
    return items.map((item) => {
      const payload = payloads.get(item.id);
      const { last, prev } = historyByKey.get(item.item_key) || {};
      const stable = Boolean(
        success(last) && success(prev) && last.seq - prev.seq - 1 >= 3,
      );
      const gated =
        payload.quizType === "form" && !unlocked.has(item.skill_key);
      const beforeReset = beforeResetKeys.has(item.item_key);
      const rank = [
        !last || current.length - last.seq >= 3 ? 0 : 1,
        last && !success(last)
          ? 0
          : last && dayOf(last.created_at) < today
            ? 1
            : !last && beforeReset
              ? 2
              : !last
                ? 3
                : 4,
        recalledKeys.has(item.skill_key) ? 2 : 1,
        ["meaning", "intent"].includes(payload.quizType)
          ? 0
          : payload.quizType === "contrast"
            ? 1
            : 2,
        recent.includes(item.skill_key) ? 1 : 0,
      ];
      return { item, payload, stable, gated, rank };
    });
  },
  choose(states, random) {
    const unfinished = states.filter((s) => !s.stable && !s.gated);
    if (!unfinished.length) return null;
    // 残りが少ない時も3問の間隔を作れるよう、安定済みの問題を間に挟む。
    const spacers = unfinished.every((s) => s.rank[0] === 1)
      ? states.filter((s) => s.stable && !s.gated && s.rank[0] === 0)
      : [];
    const eligible = (spacers.length ? spacers : unfinished).map((s) => ({
      ...s,
      tie: random(),
    }));
    eligible.sort((a, b) => {
      for (let i = 0; i < a.rank.length; i++)
        if (a.rank[i] !== b.rank[i]) return a.rank[i] - b.rank[i];
      return a.tie - b.tie;
    });
    return eligible[0] || null;
  },
  shuffle(options, random) {
    const copy = options.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  },
};
