const Seeder = {
  ensure() {
    const state =
      PropertiesService.getScriptProperties().getProperty("ET_SCHEMA_VERSION");
    if (state === "1") {
      SheetStore.validate();
      return;
    }
    throw new AppError(
      "setup_required",
      "スプレッドシートの「英語訓練 → 初期設定」を実行してください。",
    );
  },
  initialize() {
    return withLock_(() => {
      SheetStore.bindActive();
      const props = PropertiesService.getScriptProperties();
      if (props.getProperty("ET_SCHEMA_VERSION") === "1") {
        SheetStore.validate();
        return { ready: true };
      }
      SheetStore.ensureTables();
      const checksum = payloadHash_(INITIAL_EXPRESSIONS);
      const marker = TrainingRepository.find("schema_migrations", "1");
      if (marker && marker.checksum !== checksum)
        throw new AppError(
          "schema_mismatch",
          "初期化途中の教材が変更されています。",
        );
      if (!marker)
        TrainingRepository.add("schema_migrations", {
          id: "1",
          state: "running",
          checksum,
        });
      for (const e of INITIAL_EXPRESSIONS)
        TrainingRepository.add("expressions", {
          id: e.key,
          form: e.form,
          meaning: e.meaning,
          intent: e.intent || "",
          tier: e.tier,
          kind: e.kind,
          example_en: e.example.en,
          example_ja: e.example.ja,
          quiz_json: JSON.stringify(e.quiz || {}),
          status: e.status || "active",
        });
      TrainingRepository.add("settings", {
        id: "default",
        ai_enabled: "false",
        daily_limit: String(APP_CONFIG.ai.dailyLimit),
      });
      TrainingRepository.update("schema_migrations", "1", {
        state: "succeeded",
      });
      props.setProperty("ET_SCHEMA_VERSION", "1");
      TableCache.clear();
      return { ready: true };
    });
  },
};
