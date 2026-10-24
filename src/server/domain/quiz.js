/** SQL優先キーの純粋な比較。乱数とJST日付は外側から渡す。 */
const QuizPolicy = {
  states(items, attempts, resetAt, dayOf, today, recalled = []) {
    const sorted = attempts.filter((a) => a.response_mode === "choice").slice();
    const current = sorted.filter((a) => a.created_at > resetAt);
    const byId = new Map(items.map((i) => [i.id, i]));
    const enriched = current.map((a, index) => ({
      ...a,
      seq: index + 1,
      item: byId.get(a.item_id),
    }));
    const recent = enriched.slice(-3).map((a) => a.item?.skill_key);
    return items.map((item) => {
      const payload = JSON.parse(item.payload_json);
      const history = enriched.filter(
        (a) => a.item?.item_key === item.item_key,
      );
      const last = history.at(-1),
        prev = history.at(-2);
      const success = (a) =>
        a && a.item && a.answer === JSON.parse(a.item.payload_json).correct;
      const stable = Boolean(
        success(last) && success(prev) && last.seq - prev.seq - 1 >= 3,
      );
      const gated =
        payload.quizType === "form" &&
        !enriched.some(
          (a) =>
            a.item?.skill_key === item.skill_key &&
            ["meaning", "intent"].includes(
              JSON.parse(a.item.payload_json).quizType,
            ) &&
            success(a),
        );
      const beforeReset = sorted.some(
        (a) =>
          a.created_at <= resetAt &&
          byId.get(a.item_id)?.item_key === item.item_key &&
          a.answer === JSON.parse(byId.get(a.item_id).payload_json).correct,
      );
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
        recalled.includes(item.skill_key) ? 2 : 1,
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
