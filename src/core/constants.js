"use strict";

const ONLINE_STATUSES = new Set(["online", "idle", "dnd"]);
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const SCHEMA_VERSION = 1;

module.exports = {
  ONLINE_STATUSES,
  RETENTION_MS,
  SCHEMA_VERSION
};
