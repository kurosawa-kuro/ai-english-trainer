/** 実装の組立。GAS読込順に依存しないよう呼出時に構築する。 */
const ApplicationComposition = {
  create() {
    const shared = {
      repo: TrainingRepository,
      lock: withLock_,
      config: () => APP_CONFIG,
      now: () => Date.now(),
      iso: () => new Date().toISOString(),
      day: (value) =>
        Utilities.formatDate(new Date(value), "Asia/Tokyo", "yyyy-MM-dd"),
      hash: (value) => payloadHash_(stableJson_(value)),
      random: () => Math.random(),
    };
    const ai = createAiApplication_({
      ...shared,
      keyConfigured: () => IntegrationSettings.keyConfigured(),
      provider: (feature, snapshot) =>
        EnglishAiProvider.call(feature, snapshot),
    });
    const catalog = createCatalogApplication_({
      ...shared,
      contrast: () => INITIAL_CONTRAST_ITEMS,
      md5: (value) =>
        Utilities.computeDigest(
          Utilities.DigestAlgorithm.MD5,
          value,
          Utilities.Charset.UTF_8,
        )
          .map((v) => (v & 255).toString(16).padStart(2, "0"))
          .join(""),
    });
    return {
      ai,
      catalog,
      training: createTrainingApplication_({ ...shared, ai, catalog }),
      talk: createTalkApplication_({ ...shared, ai }),
    };
  },
};
