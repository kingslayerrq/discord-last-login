"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { formatExactTime, formatRelativeTime } = require("../src/core/format");

test("formats missing, recent, and elapsed timestamps", () => {
  const now = 1_800_000_000_000;
  assert.equal(formatRelativeTime(null, now), "No history yet");
  assert.equal(formatRelativeTime(now - 5_000, now), "just now");
  assert.equal(formatRelativeTime(now - 60_000, now), "1 minute ago");
  assert.equal(formatRelativeTime(now - 2 * 60 * 60 * 1000, now), "2 hours ago");
  assert.equal(formatRelativeTime(now - 14 * 24 * 60 * 60 * 1000, now), "2 weeks ago");
});

test("exact formatter handles missing and valid timestamps", () => {
  assert.equal(formatExactTime(null), "");
  assert.notEqual(formatExactTime(1_800_000_000_000), "");
});
