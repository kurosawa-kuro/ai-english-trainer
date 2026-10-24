const Settings = {
  lockWaitMs: () => 5000,
  ai: () => APP_CONFIG.ai,
  limits: () => APP_CONFIG.limits,
};
const IntegrationSettings = {
  geminiApiKey: () =>
    PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY") || "",
  keyConfigured() {
    return Boolean(this.geminiApiKey());
  },
  saveKey(value) {
    const props = PropertiesService.getScriptProperties();
    if (value === "") props.deleteProperty("GEMINI_API_KEY");
    else {
      if (typeof value !== "string" || !/^[A-Za-z0-9_-]{20,200}$/.test(value))
        throw new AppError(
          "validation_error",
          "APIキーの形式を確認してください。",
        );
      props.setProperty("GEMINI_API_KEY", value);
    }
  },
};
