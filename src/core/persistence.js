"use strict";

class DebouncedPersistence {
  constructor({
    save,
    delayMs = 500,
    setTimer = (...args) => globalThis.setTimeout(...args),
    clearTimer = (...args) => globalThis.clearTimeout(...args)
  }) {
    this.save = save;
    this.delayMs = delayMs;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.timer = null;
    this.pendingValue = null;
  }

  schedule(value) {
    this.pendingValue = value;
    if (this.timer !== null) {
      this.clearTimer(this.timer);
    }

    this.timer = this.setTimer(() => {
      this.timer = null;
      this.flush();
    }, this.delayMs);
  }

  flush() {
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
    }

    if (this.pendingValue === null) {
      return false;
    }

    const value = this.pendingValue;
    this.pendingValue = null;
    this.save(value);
    return true;
  }

  cancel() {
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
    this.pendingValue = null;
  }
}

module.exports = {
  DebouncedPersistence
};
