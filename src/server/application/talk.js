function createTalkApplication_(p) {
  const repo = p.repo;
  function session(id) {
    const s = repo.find("talk_sessions", requireId_(id));
    if (!s) throw new AppError("not_found", "会話がありません。");
    return s;
  }
  function history(id) {
    return repo
      .all("talk_turns")
      .filter((t) => t.session_id === id)
      .sort((a, b) => Number(a.sequence) - Number(b.sequence));
  }
  function consent(value) {
    if (value !== true)
      throw new AppError(
        "consent_required",
        "個人情報・機密情報を含まないことを確認してください。",
      );
  }
  return {
    start(request) {
      consent(request.consent);
      const id = requireId_(request.session_id),
        scenario = request.scenario;
      if (!["teacher", "learner", "free_talk"].includes(scenario))
        throw new AppError("validation_error", "シナリオを選択してください。");
      p.lock(() => {
        const s = repo.find("talk_sessions", id);
        if (s && s.scenario !== scenario)
          throw new AppError(
            "request_conflict",
            "同じIDのシナリオが異なります。",
          );
        if (!s)
          repo.add("talk_sessions", {
            id,
            scenario,
            state: "open",
            created_at: p.iso(),
            updated_at: p.iso(),
          });
      });
      const existing = repo.find("talk_turns", "opening-" + id);
      if (existing)
        return { sessionId: id, turns: history(id), state: session(id).state };
      if (session(id).state !== "open")
        throw new AppError("session_closed", "会話は終了しています。");
      const result = p.ai.run("opening-" + id, "talk_opening", { scenario });
      p.lock(() => {
        if (session(id).state !== "open")
          throw new AppError("session_closed", "終了した会話です。");
        repo.add("talk_turns", {
          id: "opening-" + id,
          session_id: id,
          sequence: "0",
          user_text: "",
          reply: result.reply,
          feedback: result.feedback,
          created_at: p.iso(),
        });
      });
      return { sessionId: id, turns: history(id), state: "open" };
    },
    send(request) {
      consent(request.consent);
      const sid = requireId_(
          request.session_id || request.conversation_session_id,
        ),
        id = requireId_(request.turn_id),
        message = requireText_(
          request.message,
          "メッセージ",
          p.config().limits.answer,
        );
      const hash = p.hash({ version: 1, session: sid, message });
      const prepared = p.lock(() => {
        const s = session(sid),
          old = repo.find("talk_requests", id);
        if (old && old.payload_hash !== hash)
          throw new AppError(
            "request_conflict",
            "同じターンの入力が変更されています。",
          );
        const done = repo.find("talk_turns", id);
        if (done) return { done: true };
        if (s.state !== "open")
          throw new AppError("session_closed", "会話は終了しています。");
        const turns = history(sid);
        if (!turns.length)
          throw new AppError("busy", "会話開始の応答を確認してください。");
        for (const pending of repo
          .all("talk_requests")
          .filter(
            (r) => r.session_id === sid && r.id !== id && r.state === "pending",
          )) {
          if (repo.find("talk_turns", pending.id)) {
            repo.update("talk_requests", pending.id, { state: "succeeded" });
            continue;
          }
          const ai = repo.find("ai_requests", "turn-" + pending.id);
          if (ai && ["failed", "abandoned"].includes(ai.state))
            repo.update("talk_requests", pending.id, { state: ai.state });
          else
            throw new AppError(
              "busy",
              "前のメッセージを再送して結果を確認してください。結果不明なら中止後に送信できます。",
            );
        }
        if (turns.length > p.config().limits.talkTurns)
          throw new AppError(
            "turn_limit",
            "会話上限です。終了して振り返ってください。",
          );
        const sequence = old
          ? old.sequence
          : String(Math.max(...turns.map((t) => Number(t.sequence))) + 1);
        if (!old)
          repo.add("talk_requests", {
            id,
            session_id: sid,
            payload_hash: hash,
            message,
            sequence,
            state: "pending",
            created_at: p.iso(),
          });
        // 同ID再送でも予約時点より後の履歴を含めない。
        return {
          scenario: s.scenario,
          sequence,
          history: turns
            .filter((t) => Number(t.sequence) < Number(sequence))
            .slice(-p.config().limits.historyTurns)
            .map((t) => ({ user: t.user_text, assistant: t.reply })),
        };
      });
      if (!prepared.done) {
        let result;
        try {
          result = p.ai.run("turn-" + id, "talk_turn", {
            scenario: prepared.scenario,
            history: prepared.history,
            message,
          });
        } catch (e) {
          if (["setting_off", "key_missing", "limit_reached"].includes(e.code))
            p.lock(() => repo.update("talk_requests", id, { state: "failed" }));
          throw e;
        }
        p.lock(() => {
          if (session(sid).state !== "open")
            throw new AppError("session_closed", "終了した会話です。");
          repo.add("talk_turns", {
            id,
            session_id: sid,
            sequence: prepared.sequence,
            user_text: message,
            reply: result.reply,
            feedback: result.feedback,
            created_at: p.iso(),
          });
          repo.update("talk_requests", id, { state: "succeeded" });
        });
      }
      return { sessionId: sid, state: session(sid).state, turns: history(sid) };
    },
    end(request) {
      consent(request.consent);
      const sid = requireId_(
          request.session_id || request.conversation_session_id,
        ),
        rid = "end-" + requireId_(request.request_id);
      const prepared = p.lock(() => {
        const s = session(sid);
        if (s.state === "closed") return { closed: true };
        if (repo.find("talk_turns", "summary-" + sid)) {
          repo.update("talk_sessions", sid, {
            state: "closed",
            updated_at: p.iso(),
          });
          return { closed: true };
        }
        const pending = repo
          .all("talk_requests")
          .filter(
            (r) =>
              r.session_id === sid &&
              r.state === "pending" &&
              !repo.find("talk_turns", r.id),
          );
        for (const r of pending) {
          const ai = repo.find("ai_requests", "turn-" + r.id);
          if (!ai || !["failed", "abandoned"].includes(ai.state))
            throw new AppError(
              "busy",
              "応答待ちのメッセージを解決してから終了してください。",
            );
        }
        const opening = repo.find("ai_requests", "opening-" + sid);
        if (
          opening &&
          ["pending", "running", "unknown"].includes(opening.state)
        )
          throw new AppError(
            "busy",
            "開始要求の結果を確認または中止してください。",
          );
        if (!opening && !history(sid).length)
          throw new AppError("busy", "会話開始の応答を先に確認してください。");
        const opId = "closing-" + sid,
          old = repo.find("operations", opId);
        let effectiveId = rid;
        if (old) {
          const ai = repo.find("ai_requests", old.target_id);
          if (!ai || !["failed", "abandoned"].includes(ai.state))
            effectiveId = old.target_id;
          else
            repo.update("operations", opId, {
              target_id: rid,
              updated_at: p.iso(),
            });
        } else
          repo.add("operations", {
            id: opId,
            kind: "talk_end",
            target_id: rid,
            state: "pending",
            payload_hash: p.hash({ session: sid }),
            created_at: p.iso(),
            updated_at: p.iso(),
          });
        repo.update("talk_sessions", sid, {
          state: "closing",
          updated_at: p.iso(),
        });
        return {
          effectiveId,
          scenario: s.scenario,
          history: history(sid)
            .slice(-p.config().limits.historyTurns)
            .map((t) => ({ user: t.user_text, assistant: t.reply })),
        };
      });
      if (prepared.closed)
        return {
          sessionId: sid,
          state: "closed",
          turns: history(sid),
          candidates: repo
            .all("candidates")
            .filter((c) => c.session_id === sid),
        };
      const result = p.ai.run(prepared.effectiveId, "talk_end", {
        sessionId: sid,
        scenario: prepared.scenario,
        history: prepared.history,
      });
      return p.lock(() => {
        result.candidates.forEach((c, i) => {
          const id = prepared.effectiveId + "-" + i;
          if (!repo.find("candidates", id))
            repo.add("candidates", {
              id,
              session_id: sid,
              pattern: c.pattern,
              meaning: c.meaning,
              state: "pending",
            });
        });
        repo.add("talk_turns", {
          id: "summary-" + sid,
          session_id: sid,
          sequence: "9999",
          user_text: "",
          reply: result.summary,
          feedback: "振り返り",
          created_at: p.iso(),
        });
        repo.update("talk_sessions", sid, {
          state: "closed",
          updated_at: p.iso(),
        });
        return {
          sessionId: sid,
          state: "closed",
          turns: history(sid),
          candidates: repo
            .all("candidates")
            .filter((c) => c.session_id === sid),
        };
      });
    },
    review(request) {
      return p.lock(() => {
        const c = repo.find("candidates", requireId_(request.candidate_id));
        if (!c || !["approved", "rejected"].includes(request.decision))
          throw new AppError(
            "validation_error",
            "候補と判断を確認してください。",
          );
        repo.update("candidates", c.id, { state: request.decision });
        return { candidateId: c.id, state: request.decision };
      });
    },
    get(id) {
      const s = session(id);
      return {
        sessionId: s.id,
        scenario: s.scenario,
        state: s.state,
        turns: history(id),
        openingState:
          repo.find("ai_requests", "opening-" + id)?.state || "unreserved",
      };
    },
  };
}
