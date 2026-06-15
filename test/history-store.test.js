"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { RETENTION_MS, SCHEMA_VERSION } = require("../src/core/constants");
const { HistoryStore, normalizeData } = require("../src/core/history-store");

test("normalizes valid records and drops malformed, expired, and future records", () => {
  const now = 1_800_000_000_000;
  const data = normalizeData({
    version: SCHEMA_VERSION,
    records: {
      "123": { lastSeenAt: now - 1_000 },
      "bad-id": { lastSeenAt: now },
      "456": { lastSeenAt: now - RETENTION_MS - 1 },
      "789": { lastSeenAt: now + 60_001 },
      "999": { lastSeenAt: "yesterday" }
    }
  }, now);

  assert.deepEqual(data, {
    version: SCHEMA_VERSION,
    records: {
      "123": { lastSeenAt: now - 1_000 }
    }
  });
});

test("unknown schema and corrupt storage safely reset", () => {
  assert.deepEqual(normalizeData(null), { version: SCHEMA_VERSION, records: {} });
  assert.deepEqual(normalizeData("broken"), { version: SCHEMA_VERSION, records: {} });
  assert.deepEqual(normalizeData({ version: 999, records: { "123": { lastSeenAt: 1 } } }), {
    version: SCHEMA_VERSION,
    records: {}
  });
});

test("records timestamps, prunes after 90 days, and clears history", () => {
  let now = 1_800_000_000_000;
  let changes = 0;
  const history = new HistoryStore({
    now: () => now,
    onChange: () => {
      changes += 1;
    }
  });

  assert.equal(history.recordSeen("123"), true);
  assert.equal(history.recordSeen("123"), false);
  assert.equal(history.getLastSeen("123"), now);

  now += RETENTION_MS;
  assert.equal(history.prune(), false, "the exact retention boundary remains valid");

  now += 1;
  assert.equal(history.prune(), true);
  assert.equal(history.getLastSeen("123"), null);
  assert.equal(history.clear(), false);
  assert.equal(changes, 2);
});

test("serialize returns a copy that callers cannot mutate", () => {
  const now = 1_800_000_000_000;
  const history = new HistoryStore({ now: () => now });
  history.recordSeen("123");

  const serialized = history.serialize();
  serialized.records["123"].lastSeenAt = 0;

  assert.equal(history.getLastSeen("123"), now);
});
