/** 英語訓練のschema初版。JSONは版固定した教材・結果を格納する。 */
function tableDef_(columns, appendOnly = false) {
  return { columns, text: columns, key: columns[0], appendOnly };
}
const TABLES = {
  expressions: tableDef_([
    "id",
    "form",
    "meaning",
    "intent",
    "tier",
    "kind",
    "example_en",
    "example_ja",
    "quiz_json",
    "status",
  ]),
  items: tableDef_(
    [
      "id",
      "item_key",
      "version",
      "skill_key",
      "kind",
      "payload_json",
      "created_at",
    ],
    true,
  ),
  attempts: tableDef_(
    ["id", "payload_hash", "item_id", "response_mode", "answer", "created_at"],
    true,
  ),
  assessments: tableDef_(
    ["id", "attempt_id", "ai_request_id", "result_json", "created_at"],
    true,
  ),
  evidence: tableDef_(
    ["id", "assessment_id", "skill_key", "capability", "success", "created_at"],
    true,
  ),
  operations: tableDef_([
    "id",
    "kind",
    "payload_hash",
    "target_id",
    "state",
    "result_json",
    "created_at",
    "updated_at",
  ]),
  ai_requests: tableDef_([
    "id",
    "feature",
    "payload_hash",
    "snapshot_json",
    "day_key",
    "state",
    "result_json",
    "usage_json",
    "error_code",
    "created_at",
    "updated_at",
  ]),
  usage_events: tableDef_(
    ["id", "ai_request_id", "day_key", "event", "created_at"],
    true,
  ),
  review_resets: tableDef_(["id", "created_at"], true),
  settings: tableDef_(["id", "ai_enabled", "daily_limit"]),
  schema_migrations: tableDef_(["id", "state", "checksum"]),
  talk_sessions: tableDef_([
    "id",
    "scenario",
    "state",
    "created_at",
    "updated_at",
  ]),
  talk_requests: tableDef_([
    "id",
    "session_id",
    "payload_hash",
    "message",
    "sequence",
    "state",
    "created_at",
  ]),
  talk_turns: tableDef_(
    [
      "id",
      "session_id",
      "sequence",
      "user_text",
      "reply",
      "feedback",
      "created_at",
    ],
    true,
  ),
  candidates: tableDef_(["id", "session_id", "pattern", "meaning", "state"]),
};
const TABLE_UNIQUE = Object.fromEntries(
  Object.keys(TABLES).map((k) => [k, [["id"]]]),
);
TABLE_UNIQUE.items.push(["item_key", "version"]);
TABLE_UNIQUE.talk_turns.push(["session_id", "sequence"]);
