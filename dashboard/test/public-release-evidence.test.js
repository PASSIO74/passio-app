import test from "node:test";
import assert from "node:assert/strict";
import { evaluatePublicRelease } from "../server/public-release-evidence.js";

test("public release evidence is LIVE when commit/build proof matches", () => {
  const r = evaluatePublicRelease({
    release: { buildId: "abc123", commit: "1234567890abcdef" },
    expectedCommit: "1234567890ab",
    expectedBuildId: "abc123",
    url: "https://passio.test/release.json",
  });
  assert.equal(r.state, "LIVE");
  assert.equal(r.matches.commit, true);
  assert.equal(r.matches.buildId, true);
});

test("public release evidence is MISMATCH when deployed commit differs", () => {
  const r = evaluatePublicRelease({
    release: { buildId: "abc123", commit: "ffffffffffffffff" },
    expectedCommit: "1234567890ab",
    expectedBuildId: "abc123",
  });
  assert.equal(r.state, "MISMATCH");
  assert.equal(r.matches.commit, false);
});

test("public release evidence is fail-closed on invalid manifest or network error", () => {
  assert.equal(evaluatePublicRelease({ release: { commit: "abc" } }).state, "UNAVAILABLE");
  assert.equal(evaluatePublicRelease({ error: "timeout" }).state, "UNAVAILABLE");
});
