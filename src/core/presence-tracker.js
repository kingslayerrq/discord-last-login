"use strict";

const { ONLINE_STATUSES } = require("./constants");

function extractPresence(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const user = payload.user ?? payload.presence?.user;
  const userId = user?.id ?? payload.userId ?? payload.user_id;
  const status = payload.status ?? payload.presence?.status;

  if (!userId || typeof status !== "string") {
    return null;
  }

  return {
    user,
    userId: String(userId),
    status
  };
}

class PresenceTracker {
  constructor({
    history,
    now = () => Date.now(),
    getCurrentUserId = () => null,
    getUser = () => null
  }) {
    this.history = history;
    this.now = now;
    this.getCurrentUserId = getCurrentUserId;
    this.getUser = getUser;
    this.onlineUsers = new Set();
  }

  isTrackable(userId, eventUser) {
    if (userId === String(this.getCurrentUserId() ?? "")) {
      return false;
    }

    if (eventUser?.bot) {
      return false;
    }

    const cachedUser = this.getUser(userId);
    return !cachedUser?.bot;
  }

  observe(payload) {
    const presence = extractPresence(payload);
    if (!presence || !this.isTrackable(presence.userId, presence.user)) {
      return false;
    }

    const isOnline = ONLINE_STATUSES.has(presence.status);
    const wasOnline = this.onlineUsers.has(presence.userId);

    if (isOnline) {
      this.onlineUsers.add(presence.userId);
      return this.history.recordSeen(presence.userId, this.now());
    }

    this.onlineUsers.delete(presence.userId);
    if (wasOnline) {
      return this.history.recordSeen(presence.userId, this.now());
    }

    return false;
  }

  snapshot(users, getStatus) {
    let changes = 0;
    for (const user of users) {
      if (!user?.id || !this.isTrackable(String(user.id), user)) {
        continue;
      }

      const status = getStatus(String(user.id));
      if (ONLINE_STATUSES.has(status)) {
        this.onlineUsers.add(String(user.id));
        if (this.history.recordSeen(String(user.id), this.now())) {
          changes += 1;
        }
      } else {
        const userId = String(user.id);
        const wasOnline = this.onlineUsers.delete(userId);
        if (wasOnline && this.history.recordSeen(userId, this.now())) {
          changes += 1;
        }
      }
    }

    return changes;
  }

  isOnline(userId) {
    return this.onlineUsers.has(String(userId));
  }

  get onlineCount() {
    return this.onlineUsers.size;
  }
}

module.exports = {
  PresenceTracker,
  extractPresence
};
