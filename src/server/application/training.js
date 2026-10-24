function createTrainingApplication_(p) {
  const repo = p.repo;
  function item(id) {
    const r = repo.find("items", requireId_(id));
    if (!r) throw new AppError("not_found", "問題が見つかりません。");
    return { ...JSON.parse(r.payload_json), id: r.id };
  }
  function committed(attemptId) {
    return repo
      .all("assessments")
      .filter((a) => a.attempt_id === attemptId)
      .sort(
        (a, b) =>
          a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
      );
  }
  function commit(attempt, problem, result, requestId) {
    return p.lock(() => {
      const id = "assessment-" + requestId,
        existing = repo.find("assessments", id);
      if (existing)
        return {
          ...JSON.parse(existing.result_json),
          attemptId: attempt.id,
          replayed: true,
        };
      const at = p.iso();
      repo.add("evidence", {
        id: "evidence-" + requestId,
        assessment_id: id,
        skill_key: problem.skillKey,
        capability: problem.capability || "RECOGNITION",
        success: String(["pass", "pass_with_note"].includes(result.outcome)),
        created_at: at,
      });
      repo.add("assessments", {
        id,
        attempt_id: attempt.id,
        ai_request_id: result.source === "ai" ? requestId : "",
        result_json: JSON.stringify(result),
        created_at: at,
      });
      return { ...result, attemptId: attempt.id };
    });
  }
  function grade(attempt, problem, requestId, consent) {
    const already = repo.find("assessments", "assessment-" + requestId);
    if (already)
      return {
        ...JSON.parse(already.result_json),
        attemptId: attempt.id,
        replayed: true,
      };
    let outcome,
      observation = null,
      source = "deterministic";
    if (problem.kind === "choice")
      outcome =
        attempt.answer === problem.correct ? "pass" : "fail_communication";
    else if (
      normalizeAnswer(attempt.answer) === normalizeAnswer(problem.expected)
    )
      outcome = "pass";
    else {
      if (consent !== true)
        throw new AppError(
          "consent_required",
          "個人情報・機密情報を含まないことを確認してください。回答は保存済みです。",
        );
      observation = p.ai.run(requestId, "grade", {
        problem,
        answer: attempt.answer,
      });
      AssessmentPolicy.validate(observation);
      outcome = AssessmentPolicy.reduce(observation, problem.targetRequired);
      source = "ai";
    }
    const result = {
      outcome,
      source,
      observation,
      feedback:
        problem.kind === "choice"
          ? outcome === "pass"
            ? "正解です。"
            : "もう一度確認しましょう。"
          : AssessmentPolicy.feedback(outcome, problem, attempt.answer),
      expected:
        problem.kind === "choice"
          ? problem.options.find((o) => o.id === problem.correct).text
          : problem.expected,
    };
    return commit(attempt, problem, result, requestId);
  }
  return {
    next(request = {}) {
      const catalog = p.catalog.current(),
        allItems = repo.all("items").filter((i) => i.kind === "choice");
      const activeIds = new Set(
        catalog.items.filter((i) => i.kind === "choice").map((i) => i.id),
      );
      const reset =
        repo
          .all("review_resets")
          .map((r) => r.created_at)
          .sort()
          .at(-1) || "";
      const assessmentIds = new Set(repo.all("assessments").map((a) => a.id));
      const recalled = repo
        .all("evidence")
        .filter(
          (e) =>
            assessmentIds.has(e.assessment_id) &&
            e.capability === "CONTROLLED_RECALL" &&
            e.success === "true",
        )
        .map((e) => e.skill_key);
      let states = QuizPolicy.states(
        allItems,
        repo.all("attempts"),
        reset,
        p.day,
        p.day(p.now()),
        recalled,
      ).filter((s) => activeIds.has(s.item.id));
      if (request.quiz_type)
        states = states.filter((s) => s.payload.quizType === request.quiz_type);
      const chosen = QuizPolicy.choose(states, p.random);
      return {
        item: chosen
          ? {
              id: chosen.item.id,
              itemKey: chosen.item.item_key,
              prompt: chosen.payload.prompt,
              options: QuizPolicy.shuffle(chosen.payload.options, p.random).map(
                (o) => ({ id: o.id, text: o.text }),
              ),
            }
          : null,
        stableCount: states.filter((s) => s.stable).length,
        itemCount: states.length,
        warnings: catalog.warnings,
        message: chosen
          ? ""
          : states.length
            ? "記録の「覚えたものを再チェック」を押します。"
            : "有効な教材がありません。教材シートを確認してください。",
      };
    },
    practice(request = {}) {
      const catalog = p.catalog.current();
      const choices = catalog.items.filter(
        (i) =>
          i.kind === "free_text" &&
          JSON.parse(i.payload_json).mode ===
            (request.mode || "controlled_recall"),
      );
      const r = choices.length
        ? choices[Math.floor(p.random() * choices.length)]
        : null;
      if (!r) return { item: null, warnings: catalog.warnings };
      const v = JSON.parse(r.payload_json);
      return {
        item: {
          id: r.id,
          prompt: v.prompt,
          form: v.form,
          meaning: v.meaning,
          mode: v.mode,
        },
        warnings: catalog.warnings,
      };
    },
    submit(request) {
      const id = requireId_(request.attempt_id),
        problem = item(request.item_id || request.exercise_instance_id);
      const answer = requireText_(
        request.response_mode === "choice"
          ? request.selected_option_id
          : request.answer_text,
        "回答",
        p.config().limits.answer,
      );
      if (problem.kind !== request.response_mode)
        throw new AppError(
          "validation_error",
          "回答形式が問題と一致しません。",
        );
      if (
        problem.kind === "choice" &&
        !problem.options.some((o) => o.id === answer)
      )
        throw new AppError("validation_error", "選択肢が不正です。");
      const hash = p.hash({
        version: 1,
        item: problem.id,
        mode: problem.kind,
        answer,
      });
      const attempt = p.lock(() => {
        const old = repo.find("attempts", id);
        if (old && old.payload_hash !== hash)
          throw new AppError(
            "request_conflict",
            "同じ回答IDの内容を変更できません。",
          );
        return (
          old ||
          repo.add("attempts", {
            id,
            payload_hash: hash,
            item_id: problem.id,
            response_mode: problem.kind,
            answer,
            created_at: p.iso(),
          })
        );
      });
      return grade(attempt, problem, "grade-" + id, request.consent);
    },
    regrade(request) {
      const attempt = repo.find("attempts", requireId_(request.attempt_id));
      if (!attempt || attempt.response_mode !== "free_text")
        throw new AppError("not_found", "自由記述の回答がありません。");
      const id = "regrade-" + requireId_(request.regrade_id);
      const bound = p.lock(() => {
        const hash = p.hash({ attempt: attempt.id });
        const old = repo.find("operations", id);
        if (old && old.payload_hash !== hash)
          throw new AppError(
            "request_conflict",
            "再判定IDが別の回答に使われています。",
          );
        return (
          old ||
          repo.add("operations", {
            id,
            kind: "regrade",
            payload_hash: hash,
            target_id: attempt.id,
            state: "pending",
            created_at: p.iso(),
            updated_at: p.iso(),
          })
        );
      });
      const inflight = repo
        .all("ai_requests")
        .find(
          (r) =>
            ["running", "unknown"].includes(r.state) &&
            r.id !== id &&
            JSON.parse(r.snapshot_json).input?.answer === attempt.answer &&
            JSON.parse(r.snapshot_json).input?.problem?.id === attempt.item_id,
        );
      if (inflight)
        throw new AppError(
          "ai_pending",
          "先の採点を確認または中止してから再判定してください。",
        );
      const result = grade(attempt, item(attempt.item_id), id, request.consent);
      p.lock(() =>
        repo.update("operations", bound.id, {
          state: "succeeded",
          result_json: JSON.stringify(result),
          updated_at: p.iso(),
        }),
      );
      return result;
    },
    progress() {
      const assessments = repo.all("assessments");
      const latest = new Map();
      for (const a of assessments.sort(
        (a, b) =>
          a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
      ))
        latest.set(a.attempt_id, a);
      const attempts = repo.all("attempts");
      const itemMap = new Map(
        repo.all("items").map((i) => [i.id, JSON.parse(i.payload_json)]),
      );
      const records = attempts
        .slice()
        .reverse()
        .slice(0, 100)
        .map((a) => ({
          ...a,
          answerLabel:
            a.response_mode === "choice"
              ? itemMap.get(a.item_id)?.options.find((o) => o.id === a.answer)
                  ?.text || a.answer
              : a.answer,
          result: latest.has(a.id)
            ? JSON.parse(latest.get(a.id).result_json)
            : null,
        }));
      return {
        total: attempts.length,
        graded: latest.size,
        records,
        ai: p.ai.status(),
        sessions: repo.all("talk_sessions").slice().reverse(),
        candidates: repo.all("candidates"),
      };
    },
    reset(request) {
      return p.lock(() => {
        const id = requireId_(request.request_id);
        repo.add("review_resets", { id, created_at: p.iso() });
        return { reset: true };
      });
    },
  };
}
