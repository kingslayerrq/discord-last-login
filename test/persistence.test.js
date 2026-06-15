"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { DebouncedPersistence } = require("../src/core/persistence");

test("debounces saves and flushes the newest value", () => {
  const saves = [];
  const timers = new Map();
  let nextTimer = 1;
  const persistence = new DebouncedPersistence({
    save: value => saves.push(value),
    setTimer: callback => {
      const id = nextTimer;
      nextTimer += 1;
      timers.set(id, callback);
      return id;
    },
    clearTimer: id => timers.delete(id)
  });

  persistence.schedule({ value: 1 });
  persistence.schedule({ value: 2 });
  assert.equal(timers.size, 1);
  assert.equal(persistence.flush(), true);
  assert.equal(timers.size, 0);
  assert.deepEqual(saves, [{ value: 2 }]);
  assert.equal(persistence.flush(), false);
});

test("cancel drops pending data", () => {
  const saves = [];
  const persistence = new DebouncedPersistence({
    save: value => saves.push(value),
    setTimer: () => 1,
    clearTimer: () => {}
  });

  persistence.schedule("pending");
  persistence.cancel();
  assert.equal(persistence.flush(), false);
  assert.deepEqual(saves, []);
});

test("default timers are invoked without DebouncedPersistence as their receiver", () => {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const receivers = [];

  globalThis.setTimeout = function fakeSetTimeout() {
    receivers.push(this);
    return 7;
  };
  globalThis.clearTimeout = function fakeClearTimeout() {
    receivers.push(this);
  };

  try {
    const persistence = new DebouncedPersistence({ save: () => {} });
    persistence.schedule("pending");
    persistence.cancel();
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }

  assert.deepEqual(receivers, [globalThis, globalThis]);
});
