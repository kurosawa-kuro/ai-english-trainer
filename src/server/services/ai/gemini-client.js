/** Gemini REST通信。秘密値・HTTPエラー本文・例外詳細は返さない。再試行しない。 */
const GeminiClient = {
  generateText({
    model,
    text,
    maxOutputTokens = 256,
    maxChars = 1000,
    schema,
    images = [],
  }) {
    const started = Date.now();
    const fail = (code, httpStatus) => ({
      ok: false,
      code,
      ...(httpStatus ? { httpStatus } : {}),
      elapsedMs: Date.now() - started,
    });
    const key = IntegrationSettings.geminiApiKey();
    if (!key) return fail("missing_api_key");
    if (!/^gemini-[a-z0-9.-]+$/.test(model)) return fail("invalid_model");
    let response;
    try {
      response = UrlFetchApp.fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "post",
          contentType: "application/json",
          headers: { "x-goog-api-key": key },
          payload: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  { text },
                  ...images.map((image) => ({
                    inlineData: {
                      mimeType: image.mimeType,
                      data: image.base64,
                    },
                  })),
                ],
              },
            ],
            generationConfig: {
              maxOutputTokens,
              ...(schema
                ? {
                    responseMimeType: "application/json",
                    responseJsonSchema: schema,
                  }
                : {}),
            },
          }),
          muteHttpExceptions: true,
          followRedirects: false,
        },
      );
    } catch (_error) {
      return fail("transport_or_permission_error");
    }
    const status = response.getResponseCode();
    if (status !== 200) {
      const code = {
        400: "invalid_request_or_key",
        401: "authentication_error",
        403: "permission_denied",
        404: "model_not_found",
        429: "quota_exceeded",
      }[status];
      return fail(
        code || (status >= 500 ? "service_unavailable" : "http_error"),
        status,
      );
    }
    let body;
    try {
      body = JSON.parse(response.getContentText());
    } catch (_error) {
      return fail("invalid_response");
    }
    if (!body || typeof body !== "object") return fail("invalid_response");
    if (body.promptFeedback && body.promptFeedback.blockReason)
      return fail("blocked_response");
    const candidate = Array.isArray(body.candidates) && body.candidates[0];
    if (!candidate) return fail("empty_response");
    if (candidate.finishReason !== "STOP")
      return fail("incomplete_or_blocked_response");
    const parts = candidate.content && candidate.content.parts;
    if (!Array.isArray(parts)) return fail("empty_response");
    const output = parts
      .filter((part) => part && !part.thought && typeof part.text === "string")
      .map((part) => part.text)
      .join("")
      .trim();
    if (!output) return fail("empty_response");
    if (output.length > maxChars) return fail("response_too_long");
    const usage = {};
    for (const name of [
      "promptTokenCount",
      "candidatesTokenCount",
      "totalTokenCount",
      "thoughtsTokenCount",
    ]) {
      const value = body.usageMetadata && body.usageMetadata[name];
      if (Number.isInteger(value) && value >= 0) usage[name] = value;
    }
    return {
      ok: true,
      code: "generation_succeeded",
      model,
      text: output.split(key).join("[REDACTED]"),
      usage,
      elapsedMs: Date.now() - started,
    };
  },
};
