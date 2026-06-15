"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { HistoryStore } = require("../src/core/history-store");
const { PresenceTracker, extractPresence } = require("../src/core/presence-tracker");

test("extracts Discord presence payload variants", () => {
  assert.deepEqual(extractPresence({ user: { id: "123" }, status: "online" }), {
    user: { id: "123" },
    userId: "123",
    status: "online"
  });
  assert.deepEqual(extractPresence({ user_id: "456", status: "offline" }), {
    user: undefined,
    userId: "456",
    status: "offline"
  });
  assert.equal(extractPresence({ user: { id: "123" } }), null);
});

test("records positive presence and the transition to offline", () => {
  let now = 1_800_000_000_000;
  const history = new HistoryStore({ now: () => now });
  const tracker = new PresenceTracker({ history, now: () => now });

  tracker.observe({ user: { id: "123" }, status: "online" });
  assert.equal(history.getLastSeen("123"), now);
  assert.equal(tracker.isOnline("123"), true);

  now += 5_000;
  tracker.observe({ user: { id: "123" }, status: "offline" });
  assert.equal(history.getLastSeen("123"), now);
  assert.equal(tracker.isOnline("123"), false);
});

test("treats invisible like offline and does not invent history", () => {
  const history = new HistoryStore();
  const tracker = new PresenceTracker({ history });

  assert.equal(tracker.observe({ user: { id: "123" }, status: "invisible" }), false);
  assert.equal(history.getLastSeen("123"), null);
});

test("ignores the current user and bots", () => {
  const history = new HistoryStore();
  const tracker = new PresenceTracker({
    history,
    getCurrentUserId: () => "111",
    getUser: userId => userId === "222" ? { id: "222", bot: true } : null
  });

  tracker.observe({ user: { id: "111" }, status: "online" });
  tracker.observe({ user: { id: "222" }, status: "online" });

  assert.equal(history.getLastSeen("111"), null);
  assert.equal(history.getLastSeen("222"), null);
});

test("snapshot records all cached online users and skips offline users", () => {
  const now = 1_800_000_000_000;
  const history = new HistoryStore({ now: () => now });
  const tracker = new PresenceTracker({ history, now: () => now });
  const users = [{ id: "123" }, { id: "456" }, { id: "789", bot: true }];
  const statuses = { "123": "idle", "456": "offline", "789": "online" };

  assert.equal(tracker.snapshot(users, id => statuses[id]), 1);
  assert.equal(history.getLastSeen("123"), now);
  assert.equal(history.getLastSeen("456"), null);
  assert.equal(history.getLastSeen("789"), null);
});

test("snapshot records the boundary when a previously online user becomes offline", () => {
  let now = 1_800_000_000_000;
  const history = new HistoryStore({ now: () => now });
  const tracker = new PresenceTracker({ history, now: () => now });
  const user = { id: "123" };

  tracker.snapshot([user], () => "online");
  now += 5_000;
  assert.equal(tracker.snapshot([user], () => "offline"), 1);
  assert.equal(history.getLastSeen("123"), now);
  assert.equal(tracker.isOnline("123"), false);
});
