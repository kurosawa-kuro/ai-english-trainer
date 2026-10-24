/** 編集行から教材を導出。暗号処理はポートで渡す。 */
const ContentPolicy = {
  derive(row, md5) {
    for (const k of ["id", "form", "meaning", "example_en", "example_ja"])
      if (typeof row[k] !== "string" || !row[k].trim() || row[k].length > 2000)
        throw new AppError("invalid_content", k + "が不正です。");
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(row.id))
      throw new AppError("invalid_content", "教材IDが不正です。");
    let quiz;
    try {
      quiz = JSON.parse(row.quiz_json || "{}");
    } catch {
      throw new AppError("invalid_content", "quiz_jsonが不正です。");
    }
    if (!quiz || typeof quiz !== "object" || Array.isArray(quiz))
      throw new AppError(
        "invalid_content",
        "quiz_jsonはオブジェクトで指定してください。",
      );
    const base = {
      skillKey: row.id,
      form: row.form,
      meaning: row.meaning,
      tier: row.tier,
    };
    const items = [];
    for (const [type, prefix] of [
      ["meaning", "ME"],
      ["intent", "IN"],
      ["form", "FO"],
    ]) {
      const q = quiz[type];
      if (!q) continue;
      if (
        !Array.isArray(q.near) ||
        q.near.length < 1 ||
        q.near.length > 5 ||
        q.near.some(
          (t) => typeof t !== "string" || !t.trim() || t.length > 2000,
        )
      )
        throw new AppError(
          "invalid_content",
          "誤答選択肢を1〜5個指定してください。",
        );
      const correct =
        type === "meaning"
          ? (q.correct ?? row.example_ja)
          : type === "intent"
            ? q.correct
            : row.example_en;
      if (
        typeof correct !== "string" ||
        !correct.trim() ||
        new Set([correct, ...q.near]).size !== q.near.length + 1
      )
        throw new AppError(
          "invalid_content",
          "選択肢が空または重複しています。",
        );
      const opts = [correct, ...q.near].map((text, i) => ({
        id: md5(type + row.id + "|" + (i === 0 ? "correct" : "near" + i)).slice(
          0,
          8,
        ),
        text,
      }));
      items.push({
        ...base,
        key: "QZ-" + prefix + "-" + row.id,
        kind: "choice",
        quizType: type,
        prompt:
          type === "meaning"
            ? row.example_en
            : type === "intent"
              ? "「" + row.meaning + "」とき、使う形はどれ？"
              : (q.prompt ?? row.example_ja),
        options: opts,
        correct: opts[0].id,
      });
    }
    const modes = [
      [
        "controlled_recall",
        "思い出して英語で答えてください：" + row.example_ja,
        row.example_en,
        "CONTROLLED_RECALL",
      ],
      [
        "recognition",
        "次の英文の意味を日本語で答えてください：" + row.example_en,
        row.example_ja,
        "RECOGNITION",
      ],
      [
        "free_production",
        "架空の場面で「" + row.meaning + "」を表す英文を作ってください。",
        row.example_en,
        "FREE_PRODUCTION",
      ],
    ];
    if (row.kind === "pattern")
      modes.push([
        "slot_replacement",
        "型「" + row.form + "」を使って英語にしてください：" + row.example_ja,
        row.example_en,
        "SLOT_REPLACEMENT",
      ]);
    modes.push([
      "contrast_drill",
      "時制・意図に注意して英語全文で答えてください：" + row.example_ja,
      row.example_en,
      "CONTRAST_SELECTION",
    ]);
    for (const [mode, prompt, expected, capability] of modes)
      items.push({
        ...base,
        key: row.id + "-" + mode,
        kind: "free_text",
        mode,
        prompt,
        expected,
        capability,
        targetRequired: mode !== "recognition",
      });
    return items;
  },
};
