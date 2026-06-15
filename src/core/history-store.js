"use strict";

const { RETENTION_MS, SCHEMA_VERSION } = require("./constants");

function createEmptyData() {
  return {
    version: SCHEMA_VERSION,
    records: {}
  };
}

function normalizeData(raw, now = Date.now(), retentionMs = RETENTION_MS) {
  const normalized = createEmptyData();
  if (!raw || typeof raw !== "object" || raw.version !== SCHEMA_VERSION) {
    return normalized;
  }

  if (!raw.records || typeof raw.records !== "object" || Array.isArray(raw.records)) {
    return normalized;
  }

  const cutoff = now - retentionMs;
  for (const [userId, record] of Object.entries(raw.records)) {
    if (!/^\d+$/.test(userId) || !record || typeof record !== "object") {
      continue;
    }

    const lastSeenAt = record.lastSeenAt;
    if (!Number.isFinite(lastSeenAt) || lastSeenAt < cutoff || lastSeenAt > now + 60_000) {
      continue;
    }

    normalized.records[userId] = { lastSeenAt };
  }

  return normalized;
}

class HistoryStore {
  constructor({
    initialData,
    now = () => Date.now(),
    retentionMs = RETENTION_MS,
    onChange = () => {}
  } = {}) {
    this.now = now;
    this.retentionMs = retentionMs;
    this.onChange = onChange;
    this.data = normalizeData(initialData, this.now(), this.retentionMs);
  }

  recordSeen(userId, timestamp = this.now()) {
    if (!/^\d+$/.test(String(userId)) || !Number.isFinite(timestamp)) {
      return false;
    }

    const key = String(userId);
    const previous = this.data.records[key]?.lastSeenAt;
    if (previous === timestamp) {
      return false;
    }

    this.data.records[key] = { lastSeenAt: timestamp };
    this.onChange();
    return true;
  }

  getLastSeen(userId) {
    return this.data.records[String(userId)]?.lastSeenAt ?? null;
  }

  get size() {
    return Object.keys(this.data.records).length;
  }

  prune(timestamp = this.now()) {
    const cutoff = timestamp - this.retentionMs;
    let changed = false;

    for (const [userId, record] of Object.entries(this.data.records)) {
      if (record.lastSeenAt < cutoff) {
        delete this.data.records[userId];
        changed = true;
      }
    }

    if (changed) {
      this.onChange();
    }

    return changed;
  }

  clear() {
    if (Object.keys(this.data.records).length === 0) {
      return false;
    }

    this.data = createEmptyData();
    this.onChange();
    return true;
  }

  serialize() {
    return {
      version: SCHEMA_VERSION,
      records: Object.fromEntries(
        Object.entries(this.data.records).map(([userId, record]) => [
          userId,
          { lastSeenAt: record.lastSeenAt }
        ])
      )
    };
  }
}

module.exports = {
  HistoryStore,
  createEmptyData,
  normalizeData
};
