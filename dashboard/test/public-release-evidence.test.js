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

test("public release evidence rejects a commit prefix that is too short to be proof", () => {
  const r = evaluatePublicRelease({
    release: { buildId: "abc123", commit: "1234567" },
    expectedCommit: "1234567890abcdef1234567890abcdef12345678",
  });
  assert.equal(r.state, "MISMATCH");
  assert.equal(r.matches.commit, false);
});

test("public release evidence is MISMATCH when expected commit proof is absent", () => {
  const r = evaluatePublicRelease({
    release: { buildId: "abc123", commit: null },
    expectedCommit: "1234567890ab",
  });
  assert.equal(r.state, "MISMATCH");
  assert.equal(r.matches.commit, false);
  assert.match(r.error, /commit_missing/);
});

test("public release evidence can validate structure without inventing an expected commit", () => {
  const r = evaluatePublicRelease({ release: { buildId: "abc123", commit: null } });
  assert.equal(r.state, "LIVE");
  assert.equal(r.matches.commit, null);
});

test("public release evidence is fail-closed on invalid manifest or network error", () => {
  assert.equal(evaluatePublicRelease({ release: { commit: "abc" } }).state, "UNAVAILABLE");
  assert.equal(evaluatePublicRelease({ error: "timeout" }).state, "UNAVAILABLE");
});
