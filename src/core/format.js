"use strict";

const UNITS = [
  { limit: 60, seconds: 1, singular: "second" },
  { limit: 60, seconds: 60, singular: "minute" },
  { limit: 24, seconds: 60 * 60, singular: "hour" },
  { limit: 7, seconds: 24 * 60 * 60, singular: "day" },
  { limit: 5, seconds: 7 * 24 * 60 * 60, singular: "week" },
  { limit: 12, seconds: 30 * 24 * 60 * 60, singular: "month" },
  { limit: Infinity, seconds: 365 * 24 * 60 * 60, singular: "year" }
];

function formatRelativeTime(timestamp, now = Date.now()) {
  if (!Number.isFinite(timestamp)) {
    return "No history yet";
  }

  const elapsedSeconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (elapsedSeconds < 10) {
    return "just now";
  }

  for (const unit of UNITS) {
    const value = Math.floor(elapsedSeconds / unit.seconds);
    if (value < unit.limit) {
      return `${value} ${unit.singular}${value === 1 ? "" : "s"} ago`;
    }
  }

  return "No history yet";
}

function formatExactTime(timestamp) {
  if (!Number.isFinite(timestamp)) {
    return "";
  }

  return new Date(timestamp).toLocaleString();
}

module.exports = {
  formatExactTime,
  formatRelativeTime
};
