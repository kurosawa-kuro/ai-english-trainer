/** 正規化済み入力を版とともにハッシュ化する。 */
function payloadHash_(value) {
  return Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    JSON.stringify(value),
    Utilities.Charset.UTF_8,
  )
    .map((v) => (v & 255).toString(16).padStart(2, "0"))
    .join("");
}
