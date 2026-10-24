const AssessmentPolicy = {
  validate(o) {
    if (
      !o ||
      !["yes", "no"].includes(o.meaning_match) ||
      !["yes", "no"].includes(o.speech_act_match) ||
      !["clear", "unclear"].includes(o.comprehensibility) ||
      !["used", "not_used", "not_applicable"].includes(
        o.target_pattern_status,
      ) ||
      !Array.isArray(o.issues) ||
      o.issues.length > 20 ||
      typeof o.reason !== "string" ||
      !o.reason.trim() ||
      o.reason.length > 2000 ||
      typeof o.confidence !== "number" ||
      !Number.isFinite(o.confidence) ||
      o.confidence < 0 ||
      o.confidence > 1
    )
      throw new AppError(
        "invalid_ai_result",
        "採点の応答形式を確認できませんでした。",
      );
    for (const issue of o.issues)
      if (
        !issue ||
        typeof issue.type !== "string" ||
        typeof issue.detail !== "string" ||
        issue.detail.length > 1000 ||
        typeof issue.affects_meaning !== "boolean" ||
        typeof issue.affects_target_skill !== "boolean"
      )
        throw new AppError(
          "invalid_ai_result",
          "採点の指摘形式を確認できませんでした。",
        );
    return o;
  },
  reduce(o, targetRequired) {
    if (
      o.comprehensibility === "unclear" ||
      o.meaning_match !== "yes" ||
      o.speech_act_match !== "yes"
    )
      return "fail_communication";
    if (targetRequired && o.target_pattern_status !== "used")
      return "retry_target";
    if (targetRequired && o.issues.some((i) => i.affects_target_skill))
      return "retry_form";
    return o.issues.length ? "pass_with_note" : "pass";
  },
  feedback(outcome, item, actual) {
    const named =
      "「" + learnerPhrase(item.form) + "」（" + item.meaning + "）";
    const messages = {
      pass: "意味も、今回の言い方" + named + "も合っています。",
      pass_with_note:
        "意味は伝わっていて、今回の言い方" +
        named +
        "も使えています。細かい揺れは次で直せば十分です。",
      retry_target:
        "意味は伝わっています。今回は" +
        named +
        "を使う練習です。「" +
        actual +
        "」ではなく、まずこの形を使ってみましょう。",
      retry_form:
        "意味は伝わっています。今回の言い方は" +
        named +
        "です。この形の一部が足りないので、回答例と同じ形でもう一度書いてみましょう。",
      fail_communication:
        "まだ意味が相手に届いていません。今回は" +
        named +
        "を使う練習です。回答例の形をそのまま使ってみましょう。",
    };
    return messages[outcome];
  },
};
