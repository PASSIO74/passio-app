import test from "node:test";
import assert from "node:assert/strict";
import { config } from "../server/config.js";
import {
  evaluatePublicRelease,
  refreshPublicReleaseEvidence,
  publicEvidenceExpectationKey,
} from "../server/public-release-evidence.js";

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

test("expectation key changes whenever commit or build expectation changes", () => {
  const a = publicEvidenceExpectationKey({ expectedCommit: "aaaaaaaaaaaa", expectedBuildId: "build-a" });
  assert.equal(a, publicEvidenceExpectationKey({ expectedCommit: "AAAAAAAAAAAA", expectedBuildId: "build-a" }));
  assert.notEqual(a, publicEvidenceExpectationKey({ expectedCommit: "bbbbbbbbbbbb", expectedBuildId: "build-a" }));
  assert.notEqual(a, publicEvidenceExpectationKey({ expectedCommit: "aaaaaaaaaaaa", expectedBuildId: "build-b" }));
});

test("changed expectations never reuse an in-flight proof for the previous commit", async () => {
  const originalUrl = config.passioPublicUrl;
  const originalFetch = globalThis.fetch;
  config.passioPublicUrl = "https://passio.test";
  const calls = [];
  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });

  globalThis.fetch = async () => {
    const n = calls.length + 1;
    calls.push(n);
    if (n === 1) await firstGate;
    return {
      ok: true,
      async json() {
        return n === 1
          ? { buildId: "build-a", commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
          : { buildId: "build-b", commit: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" };
      },
    };
  };

  try {
    const first = refreshPublicReleaseEvidence({ force: true, expectedCommit: "aaaaaaaaaaaa" });
    await new Promise((resolve) => setImmediate(resolve));
    const second = refreshPublicReleaseEvidence({ force: true, expectedCommit: "bbbbbbbbbbbb" });
    releaseFirst();

    const a = await first;
    const b = await second;
    assert.equal(a.state, "LIVE");
    assert.equal(a.expected.commit, "aaaaaaaaaaaa");
    assert.equal(b.state, "LIVE");
    assert.equal(b.expected.commit, "bbbbbbbbbbbb");
    assert.equal(b.release.buildId, "build-b");
    assert.equal(calls.length, 2);
  } finally {
    config.passioPublicUrl = originalUrl;
    globalThis.fetch = originalFetch;
  }
});

test("public release evidence is fail-closed on invalid manifest or network error", () => {
  assert.equal(evaluatePublicRelease({ release: { commit: "abc" } }).state, "UNAVAILABLE");
  assert.equal(evaluatePublicRelease({ error: "timeout" }).state, "UNAVAILABLE");
});
