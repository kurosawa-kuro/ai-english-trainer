/** 要求IDを永続化し、外部呼出をロックの外で行う。 */
function createAiApplication_(p) {
  const repo = p.repo;
  function usage(day) {
    const requests = repo.all("ai_requests").filter((r) => r.day_key === day);
    return {
      count: requests.length,
      blocked:
        requests.some((r) => r.error_code === "quota_exceeded") ||
        repo
          .all("usage_events")
          .some((e) => e.day_key === day && e.event === "quota_exceeded"),
    };
  }
  function settings() {
    const s = repo.find("settings", "default");
    return {
      aiEnabled: s?.ai_enabled === "true",
      dailyLimit: Number(s?.daily_limit || p.config().ai.dailyLimit),
    };
  }
  return {
    status() {
      const s = settings(),
        u = usage(p.day(p.now()));
      return {
        ...s,
        keyConfigured: p.keyConfigured(),
        usage: u,
        aiReason: !s.aiEnabled
          ? "setting_off"
          : !p.keyConfigured()
            ? "key_missing"
            : u.blocked || u.count >= s.dailyLimit
              ? "limit_reached"
              : null,
      };
    },
    run(id, feature, input) {
      requireId_(id);
      const inputHash = p.hash({ version: 1, feature, input });
      const prepared = p.lock(() => {
        let r = repo.find("ai_requests", id);
        if (r) {
          if (r.payload_hash !== inputHash)
            throw new AppError(
              "request_conflict",
              "同じAI要求の入力が変更されています。",
            );
          if (r.state === "succeeded")
            return { cached: JSON.parse(r.result_json) };
          if (
            r.state === "running" &&
            p.now() - Number(r.updated_at) >
              p.config().ai.runningTimeoutMinutes * 60000
          ) {
            repo.update("ai_requests", id, {
              state: "unknown",
            });
            r = { ...r, state: "unknown" };
          }
          if (r.state !== "pending")
            throw new AppError(
              "ai_" + r.state,
              r.state === "running"
                ? "AIが処理中です。同じ要求で確認してください。"
                : "この要求は再実行しません。結果不明なら時間を置いて中止し、新しい要求でやり直してください。",
              id,
            );
          const status = this.status();
          if (!status.aiEnabled || !status.keyConfigured)
            throw new AppError(
              !status.aiEnabled ? "setting_off" : "key_missing",
              "AI設定とキーを確認してから同じ要求を再送してください。",
              id,
            );
          if (r.day_key !== p.day(p.now())) {
            repo.update("ai_requests", id, {
              state: "failed",
              error_code: "reservation_expired",
              updated_at: String(p.now()),
            });
            throw new AppError(
              "ai_failed",
              "前日の未送信予約は失効しました。新しい要求でやり直してください。",
              id,
            );
          }
          if (status.usage.blocked || status.usage.count > status.dailyLimit)
            throw new AppError(
              "limit_reached",
              "今日のAI利用上限に達しました。",
              id,
            );
        } else {
          if (feature === "grade") {
            // 同じロック内で一度だけ読み、過去要求ごとのSheets全表読取を避ける。
            const confirmed = new Set(repo.all("assessments").map((a) => a.id));
            const inflight = repo.all("ai_requests").find((other) => {
              if (
                other.feature !== "grade" ||
                !(
                  ["pending", "running", "unknown"].includes(other.state) ||
                  (other.state === "succeeded" &&
                    !confirmed.has("assessment-" + other.id))
                )
              )
                return false;
              const previous = JSON.parse(other.snapshot_json).input;
              return previous.attemptId === input.attemptId;
            });
            if (inflight)
              throw new AppError(
                "ai_pending",
                "先の採点を確認または中止してから再判定してください。",
                inflight.id,
              );
          }
          const s = this.status();
          if (s.aiReason)
            throw new AppError(
              s.aiReason,
              {
                setting_off: "設定でAIを有効にしてください。",
                key_missing: "設定画面でGeminiキーを登録してください。",
                limit_reached: "今日のAI利用上限に達しました。",
              }[s.aiReason],
            );
          const snapshot = {
            input: JSON.parse(JSON.stringify(input)),
            model: p.config().ai.model,
            maxOutputTokens: p.config().ai.maxOutputTokens,
            promptVersion: "english-v1",
          };
          // 会話の新しい発話は残し、古い文脈から削って送信上限内に収める。
          while (
            snapshot.input.history?.length &&
            utf8Bytes_(JSON.stringify(snapshot)) >
              p.config().limits.snapshotBytes
          )
            snapshot.input.history.shift();
          if (
            utf8Bytes_(JSON.stringify(snapshot)) >
            p.config().limits.snapshotBytes
          )
            throw new AppError(
              "validation_error",
              "AIに送る内容が長すぎます。",
            );
          r = {
            id,
            feature,
            payload_hash: inputHash,
            snapshot_json: JSON.stringify(snapshot),
            day_key: p.day(p.now()),
            state: "pending",
            created_at: String(p.now()),
            updated_at: String(p.now()),
          };
          repo.add("ai_requests", r);
        }
        // 新規予約の後で停止しても、同IDのpendingからここだけ再開できる。
        repo.add("usage_events", {
          id: id + "-reserved",
          ai_request_id: id,
          day_key: r.day_key,
          event: "reserved",
          created_at: String(p.now()),
        });
        repo.update("ai_requests", id, {
          state: "running",
          updated_at: String(p.now()),
        });
        return { snapshot: JSON.parse(r.snapshot_json), day: r.day_key };
      });
      if (prepared.cached) return prepared.cached;
      let response;
      try {
        response = p.provider(feature, prepared.snapshot);
      } catch {
        response = { ok: false, code: "transport_or_permission_error" };
      }
      return p.lock(() => {
        const r = repo.find("ai_requests", id);
        if (!r || r.state !== "running")
          throw new AppError(
            "ai_unknown",
            "AI要求の状態が変更されました。旧応答は採用しません。",
          );
        if (!response.ok) {
          const unknown = response.code === "transport_or_permission_error";
          repo.update("ai_requests", id, {
            state: unknown ? "unknown" : "failed",
            error_code: response.code,
            updated_at: String(p.now()),
          });
          repo.add("usage_events", {
            id: id + "-finished",
            ai_request_id: id,
            day_key: r.day_key,
            event: response.code,
            created_at: String(p.now()),
          });
          throw new AppError(
            response.code === "quota_exceeded"
              ? "limit_reached"
              : unknown
                ? "ai_unknown"
                : "ai_failed",
            "AIの結果を確認できませんでした。回答は保持されています。",
            id,
          );
        }
        // 外部結果の保存が失敗した場合はrunningのまま残す。自動再送しない。
        repo.update("ai_requests", id, {
          state: "succeeded",
          result_json: JSON.stringify(response.result),
          usage_json: JSON.stringify(response.usage || {}),
          updated_at: String(p.now()),
        });
        repo.add("usage_events", {
          id: id + "-finished",
          ai_request_id: id,
          day_key: r.day_key,
          event: "succeeded",
          created_at: String(p.now()),
        });
        return response.result;
      });
    },
    abandon(id) {
      return p.lock(() => {
        const r = repo.find("ai_requests", requireId_(id));
        if (!r) throw new AppError("not_found", "AI要求がありません。");
        if (!["pending", "running", "unknown"].includes(r.state))
          return { state: r.state };
        if (
          p.now() - Number(r.updated_at) <
          p.config().ai.runningTimeoutMinutes * 60000
        )
          throw new AppError(
            "busy",
            "処理が終了するまで待ってから中止してください。",
          );
        repo.update("ai_requests", id, {
          state: "abandoned",
          updated_at: String(p.now()),
        });
        return { state: "abandoned" };
      });
    },
  };
}
