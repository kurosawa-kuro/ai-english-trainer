const RPC_NAMES = [
  "skill_trainer_get_today_plan_v2",
  "skill_trainer_get_practice_v2",
  "skill_trainer_submit_attempt_v2",
  "skill_trainer_register_confusion_pair_v2",
  "skill_trainer_regrade_attempt_v2",
  "skill_trainer_record_human_observation_v2",
  "skill_trainer_compare_observations_v2",
  "skill_trainer_get_progress_v2",
  "skill_trainer_reset_review_v2",
  "skill_trainer_quiz_next_v1",
  "skill_trainer_start_talk_session_v2",
  "skill_trainer_send_talk_message_v2",
  "skill_trainer_end_talk_session_v2",
  "skill_trainer_get_trace_v2",
  "skill_trainer_evaluate_phase_gate_v2",
  "skill_trainer_review_candidate_v2",
  "skill_trainer_get_settings_v1",
  "skill_trainer_save_settings_v1",
];
function rpc(name, request) {
  const envelope = (ok, code, data, error, replayed = false) => ({
    api_version: "job-control.v1",
    ok,
    code,
    command_id: null,
    replayed,
    data,
    error,
  });
  try {
    Seeder.ensure();
    if (!request || typeof request !== "object" || Array.isArray(request))
      request = {};
    const app = ApplicationComposition.create();
    let data;
    switch (name) {
      case "skill_trainer_quiz_next_v1":
        data = app.training.next(request);
        break;
      case "skill_trainer_get_practice_v2":
        data = app.training.practice(request);
        break;
      case "skill_trainer_submit_attempt_v2":
        data = app.training.submit(request);
        break;
      case "skill_trainer_regrade_attempt_v2":
        data = app.training.regrade(request);
        break;
      case "skill_trainer_get_progress_v2":
        data = app.training.progress();
        break;
      case "skill_trainer_get_today_plan_v2":
        data = {
          ...app.training.progress(),
          message:
            "クイズ、自由記述、会話から今日の練習を選んでください。高度な自動計画はG4で追加予定です。",
        };
        break;
      case "skill_trainer_reset_review_v2":
        data = app.training.reset(request);
        break;
      case "skill_trainer_start_talk_session_v2":
        data = app.talk.start(request);
        break;
      case "skill_trainer_send_talk_message_v2":
        data = app.talk.send(request);
        break;
      case "skill_trainer_end_talk_session_v2":
        data = app.talk.end(request);
        break;
      case "skill_trainer_review_candidate_v2":
        data = app.talk.review(request);
        break;
      case "english_trainer_get_talk_v1":
        data = app.talk.get(requireId_(request.session_id));
        break;
      case "english_trainer_abandon_ai_v1":
        data = app.ai.abandon(request.ai_request_id);
        break;
      case "skill_trainer_get_settings_v1":
        data = { ...app.ai.status(), model: APP_CONFIG.ai.model };
        break;
      case "skill_trainer_save_settings_v1":
        data = withLock_(() => {
          if (
            typeof request.ai_enabled !== "boolean" ||
            !Number.isInteger(request.daily_limit) ||
            request.daily_limit < 1 ||
            request.daily_limit > 1000
          )
            throw new AppError(
              "validation_error",
              "AI設定と1〜1000の回数上限を指定してください。",
            );
          if (Object.prototype.hasOwnProperty.call(request, "api_key"))
            IntegrationSettings.saveKey(request.api_key);
          TrainingRepository.update("settings", "default", {
            ai_enabled: String(request.ai_enabled),
            daily_limit: String(request.daily_limit),
          });
          return { ...app.ai.status(), model: APP_CONFIG.ai.model };
        });
        break;
      default:
        throw new AppError(
          RPC_NAMES.includes(name) ? "not_implemented" : "unknown_rpc",
          RPC_NAMES.includes(name)
            ? "この機能は今回のG3実装の対象外です。"
            : "APIが見つかりません。",
        );
    }
    return envelope(
      true,
      data?.replayed ? "idempotent_replay" : "ok",
      data,
      null,
      Boolean(data?.replayed),
    );
  } catch (error) {
    return envelope(
      false,
      error instanceof AppError ? error.code : "internal",
      {},
      {
        ai_request_id: error instanceof AppError ? error.aiRequestId : null,
        message:
          error instanceof AppError
            ? error.message
            : "処理を完了できませんでした。同じ要求で再試行してください。",
      },
    );
  }
}
