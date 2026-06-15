/**
 * @name LastSeen
 * @author kingslayerrq
 * @version 1.4.2
 * @description Locally records when Discord users were last observed online.
 * @source https://github.com/kingslayerrq/discord-last-login
 * @website https://github.com/kingslayerrq/discord-last-login
 * @updateUrl https://raw.githubusercontent.com/kingslayerrq/discord-last-login/main/dist/LastSeen.plugin.js
 */
"use strict";
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// src/core/constants.js
var require_constants = __commonJS({
  "src/core/constants.js"(exports2, module2) {
    "use strict";
    var ONLINE_STATUSES = /* @__PURE__ */ new Set(["online", "idle", "dnd"]);
    var RETENTION_MS = 90 * 24 * 60 * 60 * 1e3;
    var SCHEMA_VERSION = 1;
    module2.exports = {
      ONLINE_STATUSES,
      RETENTION_MS,
      SCHEMA_VERSION
    };
  }
});

// src/core/history-store.js
var require_history_store = __commonJS({
  "src/core/history-store.js"(exports2, module2) {
    "use strict";
    var { RETENTION_MS, SCHEMA_VERSION } = require_constants();
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
        if (!Number.isFinite(lastSeenAt) || lastSeenAt < cutoff || lastSeenAt > now + 6e4) {
          continue;
        }
        normalized.records[userId] = { lastSeenAt };
      }
      return normalized;
    }
    var HistoryStore = class {
      constructor({
        initialData,
        now = () => Date.now(),
        retentionMs = RETENTION_MS,
        onChange = () => {
        }
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
    };
    module2.exports = {
      HistoryStore,
      createEmptyData,
      normalizeData
    };
  }
});

// src/core/persistence.js
var require_persistence = __commonJS({
  "src/core/persistence.js"(exports2, module2) {
    "use strict";
    var DebouncedPersistence = class {
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
    };
    module2.exports = {
      DebouncedPersistence
    };
  }
});

// src/core/presence-tracker.js
var require_presence_tracker = __commonJS({
  "src/core/presence-tracker.js"(exports2, module2) {
    "use strict";
    var { ONLINE_STATUSES } = require_constants();
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
    var PresenceTracker = class {
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
        this.onlineUsers = /* @__PURE__ */ new Set();
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
    };
    module2.exports = {
      PresenceTracker,
      extractPresence
    };
  }
});

// src/core/format.js
var require_format = __commonJS({
  "src/core/format.js"(exports2, module2) {
    "use strict";
    var UNITS = [
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
      const elapsedSeconds = Math.max(0, Math.floor((now - timestamp) / 1e3));
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
    module2.exports = {
      formatExactTime,
      formatRelativeTime
    };
  }
});

// src/betterdiscord/ui.js
var require_ui = __commonJS({
  "src/betterdiscord/ui.js"(exports2, module2) {
    "use strict";
    var { ONLINE_STATUSES } = require_constants();
    var { formatExactTime, formatRelativeTime } = require_format();
    var PROFILE_CANDIDATE_SELECTOR = [
      '[class*="userPopoutOuter"]',
      '[class*="userPopout"]',
      '[class*="userProfileOuter"]',
      '[class*="userProfileInner"]',
      '[class*="userProfileModalOuter"]',
      '[class*="userProfileModal"]',
      '[class*="profilePanel"]',
      '[class*="userPanelOuter"]',
      '[class*="userPanelInner"]',
      '[role="dialog"] [class*="profile"]'
    ].join(",");
    var DM_PROFILE_ROOT_SELECTOR = [
      '[class*="profilePanel"]',
      '[class*="userPanelOuter"]'
    ].join(",");
    var PROFILE_ROOT_SELECTOR = [
      '[class*="userPopoutOuter"]',
      '[class*="userProfileModalOuter"]',
      '[class*="userProfileOuter"]',
      DM_PROFILE_ROOT_SELECTOR,
      '[role="dialog"]'
    ].join(",");
    var MEMBER_CANDIDATE_SELECTOR = [
      '[data-list-item-id^="members-"]',
      '[class*="membersWrap"] [role="listitem"]',
      '[class*="membersWrap"] [class*="member_"]',
      '[class*="membersWrap"] [class^="member_"]'
    ].join(",");
    function findUserIdInValue(value, depth = 0, seen = /* @__PURE__ */ new Set()) {
      if (!value || typeof value !== "object" || depth > 3 || seen.has(value)) {
        return null;
      }
      seen.add(value);
      if (value.user && typeof value.user === "object" && /^\d+$/.test(String(value.user.id ?? ""))) {
        return String(value.user.id);
      }
      if (/^\d+$/.test(String(value.userId ?? ""))) {
        return String(value.userId);
      }
      const priorityKeys = ["profile", "displayProfile", "guildMember", "member", "message", "channel"];
      for (const key of priorityKeys) {
        const found = findUserIdInValue(value[key], depth + 1, seen);
        if (found) {
          return found;
        }
      }
      return null;
    }
    function findUserIdFromFiber(api, node) {
      let fiber;
      try {
        fiber = api.ReactUtils.getInternalInstance(node);
      } catch {
        return null;
      }
      for (let current = fiber, depth = 0; current && depth < 25; current = current.return, depth += 1) {
        const found = findUserIdInValue(current.memoizedProps) ?? findUserIdInValue(current.pendingProps);
        if (found) {
          return found;
        }
      }
      return null;
    }
    function parseMemberUserId(node) {
      const listItemId = node?.getAttribute?.("data-list-item-id") ?? "";
      const match = listItemId.match(/(\d{15,25})$/);
      return match?.[1] ?? null;
    }
    var LastSeenUI = class {
      constructor({ api, history, tracker, presenceStore, settings, logger, getDmRecipientUserId }) {
        this.api = api;
        this.history = history;
        this.tracker = tracker;
        this.presenceStore = presenceStore;
        this.settings = settings;
        this.logger = logger;
        this.getDmRecipientUserId = getDmRecipientUserId ?? (() => null);
        this.observer = null;
        this.refreshTimer = null;
        this.dmRescanTimer = null;
        this.dmRetryTimers = /* @__PURE__ */ new Set();
        this.visualTestArmedUntil = 0;
        this.diagnostics = {
          scans: 0,
          profileCandidates: 0,
          identifiedProfiles: 0,
          injectedProfiles: 0,
          memberCandidates: 0,
          injectedMembers: 0,
          dmAnchorsFound: 0,
          dmPanelsFound: 0,
          dmRowsInjected: 0,
          lastDmRecipientUserId: null,
          lastDmFailure: "No DM sidebar scanned yet",
          lastScanAt: null,
          lastProfileFailure: "No profile scanned yet"
        };
      }
      start() {
        if (typeof document === "undefined" || typeof MutationObserver === "undefined") {
          this.logger.warn("Document APIs are unavailable; UI injection was skipped.");
          return;
        }
        this.api.DOM.addStyle(`
      .bd-last-seen-row {
        align-items: center;
        background: rgba(17, 18, 20, 0.88);
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.28);
        box-sizing: border-box;
        color: #f2f3f5;
        display: flex;
        font-size: 14px;
        font-weight: 600;
        line-height: 18px;
        margin: 12px 16px;
        min-height: 38px;
        overflow: hidden;
        padding: 9px 11px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .bd-last-seen-member {
        color: var(--text-muted);
        display: block;
        font-size: 11px;
        font-weight: 500;
        line-height: 13px;
        margin-top: 2px;
        max-width: 170px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .bd-last-seen-dm-panel {
        margin-left: 12px;
        margin-right: 12px;
      }
    `);
        this.observer = new MutationObserver((mutations) => {
          let shouldRescanDm = false;
          for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
              if (node?.nodeType === 1) {
                this.scan(node);
                shouldRescanDm = true;
              }
            }
          }
          if (shouldRescanDm) {
            this.scheduleDmRescan("dom-mutation");
          }
        });
        this.observer.observe(document.body, { childList: true, subtree: true });
        this.scan(document.body);
        this.scheduleDmRescan("startup");
        this.refreshTimer = setInterval(() => this.refresh(), 6e4);
        this.logger.info("UI observer started.");
      }
      stop() {
        this.observer?.disconnect();
        this.observer = null;
        if (this.refreshTimer !== null) {
          clearInterval(this.refreshTimer);
          this.refreshTimer = null;
        }
        this.clearDmRescanTimers();
        if (typeof document !== "undefined") {
          document.querySelectorAll?.(".bd-last-seen-row, .bd-last-seen-member").forEach((node) => node.remove());
        }
        this.api.DOM.removeStyle();
      }
      updateSettings(settings) {
        this.settings = settings;
        if (!settings.showMemberList) {
          document.querySelectorAll(".bd-last-seen-member").forEach((node) => node.remove());
        }
        this.scan(document.body);
      }
      scan(root) {
        this.diagnostics.scans += 1;
        this.diagnostics.lastScanAt = Date.now();
        const profileRoots = /* @__PURE__ */ new Set();
        this.scanSelector(root, PROFILE_CANDIDATE_SELECTOR, (node) => {
          const profileRoot = this.resolveProfileRoot(node);
          if (profileRoot) {
            profileRoots.add(profileRoot);
          }
        });
        profileRoots.forEach((node) => this.injectProfile(node));
        this.findDmProfileRoots(root).forEach((node) => this.injectProfile(node));
        if (this.settings.showMemberList) {
          const memberRoots = /* @__PURE__ */ new Set();
          this.scanSelector(root, MEMBER_CANDIDATE_SELECTOR, (node) => {
            const memberRoot = this.resolveMemberRoot(node);
            if (memberRoot) {
              memberRoots.add(memberRoot);
            }
          });
          memberRoots.forEach((node) => this.injectMember(node));
        }
      }
      scanSelector(root, selector, callback) {
        try {
          if (root.matches?.(selector)) {
            callback(root);
          }
          root.querySelectorAll?.(selector).forEach(callback);
        } catch (error) {
          this.logger.warn("A Discord UI scan failed.", error);
        }
      }
      injectProfile(container) {
        const existingRows = [...container.querySelectorAll(".bd-last-seen-row:not(.bd-last-seen-debug-row)")];
        if (existingRows.length > 0) {
          existingRows.slice(1).forEach((row2) => row2.remove());
          if (container.dataset.bdLastSeenDmPanel === "true") {
            const placement2 = this.resolveDmProfilePlacement(container);
            if (placement2) {
              this.placeRow(existingRows[0], placement2);
            }
          }
          return;
        }
        this.diagnostics.profileCandidates += 1;
        this.maybeInsertArmedVisualTest(container);
        const isDmPanel = container.dataset.bdLastSeenDmPanel === "true";
        const dmRecipientUserId = isDmPanel ? this.getDmRecipientUserId() : null;
        if (isDmPanel) {
          this.diagnostics.lastDmRecipientUserId = dmRecipientUserId;
        }
        const userId = dmRecipientUserId ?? findUserIdFromFiber(this.api, container);
        if (!userId || !this.tracker.isTrackable(userId)) {
          this.diagnostics.lastProfileFailure = `No user ID found for ${this.describeNode(container)}`;
          if (isDmPanel) {
            this.diagnostics.lastDmFailure = dmRecipientUserId ? `DM recipient ${dmRecipientUserId} is not trackable` : "Selected DM recipient could not be resolved";
          }
          return;
        }
        const placement = this.resolveProfilePlacement(container);
        if (!placement) {
          this.diagnostics.lastProfileFailure = `Placement not ready for ${this.describeNode(container)}`;
          if (isDmPanel) {
            this.diagnostics.lastDmFailure = "Scrollable DM profile placement is not ready";
            this.scheduleDmRescan("placement-not-ready");
          }
          return;
        }
        this.diagnostics.identifiedProfiles += 1;
        const row = document.createElement("div");
        row.className = "bd-last-seen-row";
        row.dataset.userId = userId;
        if (placement.kind === "dm-panel") {
          row.classList.add("bd-last-seen-dm-panel");
        }
        this.placeRow(row, placement);
        this.diagnostics.injectedProfiles += 1;
        if (isDmPanel) {
          this.diagnostics.dmRowsInjected += 1;
          this.diagnostics.lastDmFailure = "None";
        }
        this.diagnostics.lastProfileFailure = "None";
        this.logger.info(`Injected profile row for user ${userId}.`);
        this.renderNode(row, userId, true);
      }
      injectMember(container) {
        if (container.querySelector(".bd-last-seen-member")) {
          return;
        }
        this.diagnostics.memberCandidates += 1;
        const userId = parseMemberUserId(container) ?? findUserIdFromFiber(this.api, container);
        if (!userId || !this.tracker.isTrackable(userId)) {
          return;
        }
        const host = container.querySelector(
          '[class*="nameAndDecorators"], [class*="memberInner"] [class*="content"], [class*="content_"]'
        );
        if (!host) {
          return;
        }
        const row = document.createElement("span");
        row.className = "bd-last-seen-member";
        row.dataset.userId = userId;
        if (host.matches('[class*="nameAndDecorators"]')) {
          host.insertAdjacentElement("afterend", row);
        } else {
          host.append(row);
        }
        this.diagnostics.injectedMembers += 1;
        this.renderNode(row, userId, false);
      }
      refresh() {
        document.querySelectorAll(".bd-last-seen-row").forEach((node) => {
          this.renderNode(node, node.dataset.userId, true);
        });
        document.querySelectorAll(".bd-last-seen-member").forEach((node) => {
          const userId = node.dataset.userId;
          this.renderNode(node, userId, false);
        });
        if (this.settings.showMemberList) {
          this.scan(document.body);
        }
      }
      isOnline(userId) {
        try {
          const status = this.presenceStore?.getStatus?.(userId);
          return ONLINE_STATUSES.has(status) || this.tracker.isOnline(userId);
        } catch {
          return this.tracker.isOnline(userId);
        }
      }
      renderNode(node, userId, includeLabel) {
        const online = this.isOnline(userId);
        const timestamp = this.history.getLastSeen(userId);
        const value = online ? "Online now" : formatRelativeTime(timestamp);
        node.textContent = includeLabel ? `Last seen: ${value}` : `Last seen ${value}`;
        node.title = online ? "This user is currently reported online by Discord." : timestamp ? `Last observed by this client: ${formatExactTime(timestamp)}. Invisible users appear offline.` : "No presence has been observed since installing the plugin.";
      }
      describeNode(node) {
        const tag = node?.tagName?.toLowerCase?.() ?? "unknown";
        const className = typeof node?.className === "string" ? node.className.slice(0, 120) : "";
        return className ? `${tag}.${className.replace(/\s+/g, ".")}` : tag;
      }
      resolveProfileRoot(node) {
        const explicitRoot = node.closest?.(PROFILE_ROOT_SELECTOR);
        if (explicitRoot) {
          return explicitRoot;
        }
        let root = node;
        while (root.parentElement?.matches?.(PROFILE_CANDIDATE_SELECTOR)) {
          root = root.parentElement;
        }
        return root;
      }
      findDmProfileRoots(root) {
        const roots = /* @__PURE__ */ new Set();
        const memberSinceAnchors = this.findTextElements(root, (text) => text === "Member Since");
        this.diagnostics.dmAnchorsFound += memberSinceAnchors.length;
        for (const anchor of memberSinceAnchors) {
          const panel = this.findDmPanelFromAnchor(anchor);
          if (panel) {
            roots.add(panel);
          }
        }
        const footerCandidates = this.findTextElements(root, (text) => text === "View Full Profile");
        for (const footer of footerCandidates) {
          const panel = this.findDmPanelFromFooter(footer);
          if (panel) {
            roots.add(panel);
          }
        }
        this.diagnostics.dmPanelsFound += roots.size;
        return roots;
      }
      findTextElements(root, predicate) {
        const candidates = [];
        if (root.matches?.("div, span, button")) {
          candidates.push(root);
        }
        root.querySelectorAll?.("div, span, button").forEach((element) => candidates.push(element));
        return candidates.filter((element) => predicate(element.textContent?.replace(/\s+/g, " ").trim() ?? ""));
      }
      findDmPanelFromAnchor(anchor) {
        let current = anchor.parentElement;
        for (let depth = 0; current && depth < 12; current = current.parentElement, depth += 1) {
          const text = current.textContent ?? "";
          const hasMutuals = text.includes("Mutual Servers") || text.includes("Mutual Friends");
          const hasProfileFooter = text.includes("View Full Profile");
          if (hasMutuals && hasProfileFooter) {
            current.dataset.bdLastSeenDmPanel = "true";
            return current;
          }
        }
        return null;
      }
      findDmPanelFromFooter(footer) {
        let current = footer.parentElement;
        for (let depth = 0; current && depth < 10; current = current.parentElement, depth += 1) {
          const text = current.textContent ?? "";
          const hasMemberSince = text.includes("Member Since");
          const hasMutuals = text.includes("Mutual Servers") || text.includes("Mutual Friends");
          if (hasMemberSince && hasMutuals) {
            current.dataset.bdLastSeenDmPanel = "true";
            return current;
          }
        }
        return null;
      }
      resolveProfilePlacement(container) {
        if (container.matches?.(DM_PROFILE_ROOT_SELECTOR) || container.dataset.bdLastSeenDmPanel === "true") {
          return this.resolveDmProfilePlacement(container);
        }
        const composer = container.querySelector(
          'textarea, [class*="channelTextArea"], [class*="messageInput"], [class*="footer"]'
        );
        if (composer) {
          const composerBlock = composer.closest(
            '[class*="channelTextArea"], [class*="messageInput"], [class*="footer"], form'
          ) ?? composer;
          if (composerBlock.parentElement) {
            return { host: composerBlock.parentElement, before: composerBlock, kind: "profile" };
          }
        }
        const hosts = [...container.querySelectorAll(
          '[class*="userPopoutOverlayBackground"], [class*="userProfileOverlayBackground"], [class*="userProfileInner"]'
        )];
        const host = hosts.find((candidate) => candidate.querySelector('[class*="body"]')) ?? hosts.at(-1) ?? container;
        return { host, before: null, kind: "profile" };
      }
      resolveDmProfilePlacement(container) {
        const mutualServers = this.findTextElements(
          container,
          (text) => /^Mutual Servers(?:\s+—\s+\d+)?$/.test(text)
        ).at(-1);
        const mutualFriends = this.findTextElements(
          container,
          (text) => /^Mutual Friends(?:\s+—\s+\d+)?$/.test(text)
        ).at(-1);
        if (mutualServers && mutualFriends) {
          const mutualCard = this.findCommonAncestor(mutualServers, mutualFriends, container);
          if (mutualCard?.parentElement && mutualCard !== container) {
            return { host: mutualCard.parentElement, before: mutualCard, kind: "dm-panel" };
          }
        }
        const singleMutualLabel = mutualServers ?? mutualFriends;
        if (singleMutualLabel) {
          const mutualCard = this.findMutualCard(singleMutualLabel, container);
          if (mutualCard?.parentElement && mutualCard !== container) {
            return { host: mutualCard.parentElement, before: mutualCard, kind: "dm-panel" };
          }
        }
        const memberSinceLabel = this.findTextElements(container, (text) => text === "Member Since").at(-1);
        if (memberSinceLabel) {
          const memberSinceCard = this.findMemberSinceCard(memberSinceLabel, container);
          if (memberSinceCard?.parentElement && memberSinceCard !== container) {
            return {
              host: memberSinceCard.parentElement,
              before: memberSinceCard.nextElementSibling,
              kind: "dm-panel"
            };
          }
        }
        return null;
      }
      findMutualCard(label, boundary) {
        let candidate = null;
        for (let current = label; current && current !== boundary; current = current.parentElement) {
          const text = current.textContent?.replace(/\s+/g, " ").trim() ?? "";
          const hasMutuals = text.includes("Mutual Servers") || text.includes("Mutual Friends");
          if (hasMutuals && !text.includes("Member Since") && !text.includes("View Full Profile")) {
            candidate = current;
            continue;
          }
          break;
        }
        return candidate;
      }
      findMemberSinceCard(label, boundary) {
        let candidate = null;
        for (let current = label; current && current !== boundary; current = current.parentElement) {
          const text = current.textContent?.replace(/\s+/g, " ").trim() ?? "";
          if (text.startsWith("Member Since") && !text.includes("Mutual Servers") && !text.includes("Mutual Friends") && !text.includes("View Full Profile")) {
            candidate = current;
            continue;
          }
          break;
        }
        return candidate;
      }
      findCommonAncestor(first, second, boundary) {
        const ancestors = /* @__PURE__ */ new Set();
        for (let current = first; current; current = current.parentElement) {
          ancestors.add(current);
          if (current === boundary) {
            break;
          }
        }
        for (let current = second; current; current = current.parentElement) {
          if (ancestors.has(current)) {
            return current;
          }
          if (current === boundary) {
            break;
          }
        }
        return null;
      }
      placeRow(row, placement) {
        if (placement.before) {
          if (row.parentElement !== placement.host || row.nextElementSibling !== placement.before) {
            placement.host.insertBefore(row, placement.before);
          }
        } else if (row.parentElement !== placement.host) {
          placement.host.append(row);
        }
      }
      clearDmRescanTimers() {
        if (this.dmRescanTimer !== null) {
          globalThis.clearTimeout(this.dmRescanTimer);
          this.dmRescanTimer = null;
        }
        for (const timer of this.dmRetryTimers) {
          globalThis.clearTimeout(timer);
        }
        this.dmRetryTimers.clear();
      }
      scheduleDmRescan(reason = "unknown") {
        if (typeof document === "undefined" || !this.getDmRecipientUserId()) {
          return;
        }
        if (this.dmRescanTimer !== null) {
          globalThis.clearTimeout(this.dmRescanTimer);
        }
        this.dmRescanTimer = globalThis.setTimeout(() => {
          this.dmRescanTimer = null;
          this.runDmRescanAttempt(reason);
        }, 50);
      }
      runDmRescanAttempt(reason) {
        const delays = [0, 150, 400, 900, 1600];
        for (const delay of delays) {
          const timer = globalThis.setTimeout(() => {
            this.dmRetryTimers.delete(timer);
            const roots = this.findDmProfileRoots(document.body);
            roots.forEach((root) => this.injectProfile(root));
            if (document.querySelector(".bd-last-seen-dm-panel")) {
              this.clearDmRescanTimers();
            }
          }, delay);
          this.dmRetryTimers.add(timer);
        }
        this.logger.info(`Scheduled DM sidebar render retries (${reason}).`);
      }
      resolveMemberRoot(node) {
        return node.closest?.(
          '[data-list-item-id^="members-"], [role="listitem"][class*="member"], [class*="member_"]'
        ) ?? node;
      }
      getDiagnostics() {
        const hasDocument = typeof document !== "undefined";
        return {
          ...this.diagnostics,
          renderedProfileRows: hasDocument ? document.querySelectorAll(".bd-last-seen-row").length : 0,
          renderedMemberRows: hasDocument ? document.querySelectorAll(".bd-last-seen-member").length : 0
        };
      }
      rescanDmSidebar() {
        const before = this.diagnostics.dmRowsInjected;
        const roots = this.findDmProfileRoots(document.body);
        roots.forEach((root) => this.injectProfile(root));
        const report = {
          recipientUserId: this.getDmRecipientUserId(),
          rootsFound: roots.size,
          rowsInjectedNow: this.diagnostics.dmRowsInjected - before,
          renderedDmRows: document.querySelectorAll(".bd-last-seen-dm-panel").length,
          lastFailure: this.diagnostics.lastDmFailure,
          roots: [...roots].map((root) => this.describeNode(root))
        };
        this.logger.info("DM sidebar diagnostic report.", report);
        return report;
      }
      onSelectedChannelChange() {
        document.querySelectorAll(".bd-last-seen-dm-panel").forEach((row) => row.remove());
        this.scheduleDmRescan("selected-channel-change");
      }
      runVisualTest() {
        if (typeof document === "undefined") {
          return {
            success: false,
            message: "Discord's document is unavailable."
          };
        }
        const candidates = [...document.querySelectorAll(PROFILE_CANDIDATE_SELECTOR)];
        const container = candidates.length > 0 ? this.resolveProfileRoot(candidates.at(-1)) : null;
        if (!container) {
          this.visualTestArmedUntil = Date.now() + 6e4;
          return {
            success: true,
            message: "UI test armed for 60 seconds. Close settings and open a user popout or profile."
          };
        }
        this.insertVisualTestRow(container);
        return {
          success: true,
          message: `Inserted a temporary row into ${this.describeNode(container)}.`
        };
      }
      maybeInsertArmedVisualTest(container) {
        if (Date.now() > this.visualTestArmedUntil) {
          return;
        }
        this.visualTestArmedUntil = 0;
        this.insertVisualTestRow(container);
        this.logger.info(`Armed UI test detected ${this.describeNode(container)}.`);
      }
      insertVisualTestRow(container) {
        let row = container.querySelector(".bd-last-seen-debug-row");
        if (!row) {
          row = document.createElement("div");
          row.className = "bd-last-seen-row bd-last-seen-debug-row";
          row.style.background = "#1f8b4c";
          row.style.borderColor = "#45c46f";
          const placement = this.resolveProfilePlacement(container);
          if (!placement) {
            row.remove();
            return;
          }
          this.placeRow(row, placement);
        }
        row.textContent = "LastSeen debug: profile UI detected";
        row.title = "Temporary LastSeen diagnostic row";
        setTimeout(() => row.remove(), 15e3);
      }
    };
    module2.exports = {
      LastSeenUI,
      findUserIdFromFiber,
      findUserIdInValue,
      parseMemberUserId
    };
  }
});

// src/betterdiscord/plugin.js
var require_plugin = __commonJS({
  "src/betterdiscord/plugin.js"(exports2, module2) {
    "use strict";
    var { HistoryStore } = require_history_store();
    var { DebouncedPersistence } = require_persistence();
    var { PresenceTracker } = require_presence_tracker();
    var { LastSeenUI } = require_ui();
    var DEFAULT_SETTINGS = Object.freeze({
      showMemberList: false,
      debugLogging: true
    });
    var LastSeenPlugin2 = class {
      constructor(meta = {}) {
        this.meta = meta;
        this.api = null;
        this.dispatcher = null;
        this.presenceStore = null;
        this.userStore = null;
        this.channelStore = null;
        this.selectedChannelStore = null;
        this.history = null;
        this.persistence = null;
        this.tracker = null;
        this.ui = null;
        this.settings = { ...DEFAULT_SETTINGS };
        this.snapshotTimer = null;
        this.pruneTimer = null;
        this.hasPresenceSubscription = false;
        this.subscriptionMethod = "None";
        this.lastSnapshotAt = null;
        this.lastSnapshotChanges = 0;
        this.onPresenceUpdate = (payload) => this.tracker?.observe(payload);
        this.onPresenceStoreChange = () => this.snapshotCachedUsers();
        this.onSelectedChannelChange = () => this.ui?.onSelectedChannelChange();
      }
      start() {
        this.api = new BdApi("LastSeen");
        this.settings = this.loadSettings();
        this.persistence = new DebouncedPersistence({
          save: (value) => this.saveData("history", value)
        });
        this.history = new HistoryStore({
          initialData: this.loadData("history"),
          onChange: () => this.persistence.schedule(this.history.serialize())
        });
        this.resolveDiscordModules();
        this.tracker = new PresenceTracker({
          history: this.history,
          getCurrentUserId: () => this.userStore?.getCurrentUser?.()?.id,
          getUser: (userId) => this.userStore?.getUser?.(userId)
        });
        this.subscribeToPresence();
        this.snapshotCachedUsers();
        this.history.prune();
        this.snapshotTimer = setInterval(() => this.snapshotCachedUsers(), 6e4);
        this.pruneTimer = setInterval(() => this.history.prune(), 60 * 60 * 1e3);
        this.ui = new LastSeenUI({
          api: this.api,
          history: this.history,
          tracker: this.tracker,
          presenceStore: this.presenceStore,
          settings: this.settings,
          logger: this.api.Logger,
          getDmRecipientUserId: () => this.getSelectedDmRecipientUserId()
        });
        this.ui.start();
        this.subscribeToSelectedChannel();
        if (!this.hasPresenceSubscription || !this.presenceStore || !this.userStore) {
          this.api.UI.showToast(
            "LastSeen started with limited compatibility. Check the console for missing Discord modules.",
            { type: "warning" }
          );
        } else {
          this.api.UI.showToast(
            `LastSeen active via ${this.subscriptionMethod}. Tracking ${this.history.size} stored users.`,
            { type: "success" }
          );
          this.logDebug("Plugin started.", this.getDiagnostics());
        }
      }
      stop() {
        this.snapshotCachedUsers();
        this.ui?.stop();
        this.ui = null;
        if (this.presenceStore?.removeChangeListener) {
          try {
            this.presenceStore.removeChangeListener(this.onPresenceStoreChange);
          } catch (error) {
            this.api?.Logger.warn("Failed to remove the PresenceStore listener.", error);
          }
        } else if (this.dispatcher?.unsubscribe) {
          try {
            this.dispatcher.unsubscribe("PRESENCE_UPDATE", this.onPresenceUpdate);
          } catch (error) {
            this.api?.Logger.warn("Failed to unsubscribe from presence updates.", error);
          }
        }
        if (this.selectedChannelStore?.removeChangeListener) {
          try {
            this.selectedChannelStore.removeChangeListener(this.onSelectedChannelChange);
          } catch (error) {
            this.api?.Logger.warn("Failed to remove the SelectedChannelStore listener.", error);
          }
        }
        if (this.snapshotTimer !== null) {
          clearInterval(this.snapshotTimer);
          this.snapshotTimer = null;
        }
        if (this.pruneTimer !== null) {
          clearInterval(this.pruneTimer);
          this.pruneTimer = null;
        }
        if (this.history && this.persistence) {
          this.persistence.schedule(this.history.serialize());
          this.persistence.flush();
        }
        this.api?.Patcher.unpatchAll();
      }
      resolveDiscordModules() {
        const webpack = this.api.Webpack;
        this.presenceStore = this.tryResolve("PresenceStore", () => webpack.getStore("PresenceStore"));
        this.userStore = this.tryResolve("UserStore", () => webpack.getStore("UserStore"));
        this.channelStore = this.tryResolve("ChannelStore", () => webpack.getStore("ChannelStore"));
        this.selectedChannelStore = this.tryResolve(
          "SelectedChannelStore",
          () => webpack.getStore("SelectedChannelStore")
        );
        this.dispatcher = this.resolveOptional(() => webpack.getByKeys("subscribe", "unsubscribe", "dispatch"));
      }
      tryResolve(name, resolver) {
        try {
          const moduleValue = resolver();
          if (!moduleValue) {
            this.api.Logger.warn(`${name} was not found. Discord may have changed its internals.`);
          }
          return moduleValue ?? null;
        } catch (error) {
          this.api.Logger.warn(`${name} lookup failed.`, error);
          return null;
        }
      }
      resolveOptional(resolver) {
        try {
          return resolver() ?? null;
        } catch {
          return null;
        }
      }
      subscribeToPresence() {
        if (this.presenceStore?.addChangeListener) {
          try {
            this.presenceStore.addChangeListener(this.onPresenceStoreChange);
            this.hasPresenceSubscription = true;
            this.subscriptionMethod = "PresenceStore";
            return;
          } catch (error) {
            this.api.Logger.warn("Could not subscribe to PresenceStore changes.", error);
          }
        }
        if (!this.dispatcher?.subscribe) {
          this.api.Logger.warn(
            "No presence change subscription API was found. LastSeen will use its one-minute polling fallback."
          );
          return;
        }
        try {
          this.dispatcher.subscribe("PRESENCE_UPDATE", this.onPresenceUpdate);
          this.hasPresenceSubscription = true;
          this.subscriptionMethod = "FluxDispatcher";
        } catch (error) {
          this.api.Logger.warn("Could not subscribe to Discord presence events.", error);
        }
      }
      subscribeToSelectedChannel() {
        if (!this.selectedChannelStore?.addChangeListener) {
          this.api.Logger.warn("SelectedChannelStore change notifications are unavailable.");
          return;
        }
        try {
          this.selectedChannelStore.addChangeListener(this.onSelectedChannelChange);
        } catch (error) {
          this.api.Logger.warn("Could not subscribe to selected channel changes.", error);
        }
      }
      snapshotCachedUsers() {
        if (!this.tracker || !this.userStore?.getUsers || !this.presenceStore?.getStatus) {
          return 0;
        }
        try {
          const users = Object.values(this.userStore.getUsers() ?? {});
          const changes = this.tracker.snapshot(users, (userId) => this.presenceStore.getStatus(userId));
          this.lastSnapshotAt = Date.now();
          this.lastSnapshotChanges = changes;
          this.logDebug(
            `Presence snapshot: ${users.length} cached users, ${this.tracker.onlineCount} online, ${changes} timestamp changes.`
          );
          return changes;
        } catch (error) {
          this.api.Logger.warn("Cached presence snapshot failed.", error);
          return 0;
        }
      }
      loadData(key) {
        try {
          return this.api.Data.load(key);
        } catch (error) {
          this.api.Logger.warn(`Stored ${key} data could not be loaded; defaults will be used.`, error);
          return null;
        }
      }
      saveData(key, value) {
        try {
          this.api.Data.save(key, value);
        } catch (error) {
          this.api.Logger.error(`Stored ${key} data could not be saved.`, error);
        }
      }
      loadSettings() {
        const stored = this.loadData("settings");
        return {
          ...DEFAULT_SETTINGS,
          ...stored && typeof stored === "object" ? stored : {}
        };
      }
      saveSettings() {
        this.saveData("settings", this.settings);
      }
      logDebug(message, details) {
        if (this.settings.debugLogging) {
          this.api.Logger.info?.(message, details ?? "");
        }
      }
      getDiagnostics() {
        const selectedDm = this.getSelectedDmDetails();
        return {
          presenceStore: Boolean(this.presenceStore),
          userStore: Boolean(this.userStore),
          channelStore: Boolean(this.channelStore),
          selectedChannelStore: Boolean(this.selectedChannelStore),
          selectedChannelId: selectedDm.channelId,
          selectedDmRecipientUserId: selectedDm.recipientUserId,
          subscribed: this.hasPresenceSubscription,
          subscriptionMethod: this.subscriptionMethod,
          storedRecords: this.history?.size ?? 0,
          observedOnline: this.tracker?.onlineCount ?? 0,
          lastSnapshotAt: this.lastSnapshotAt,
          lastSnapshotChanges: this.lastSnapshotChanges,
          ui: this.ui?.getDiagnostics?.() ?? null
        };
      }
      getSelectedDmDetails() {
        try {
          const channelId = this.selectedChannelStore?.getChannelId?.() ?? this.selectedChannelStore?.getCurrentlySelectedChannelId?.() ?? null;
          const channel = channelId ? this.channelStore?.getChannel?.(channelId) : null;
          if (!channel || channel.guild_id) {
            return { channelId, recipientUserId: null };
          }
          const currentUserId = String(this.userStore?.getCurrentUser?.()?.id ?? "");
          const recipientIds = [
            ...Array.isArray(channel.recipients) ? channel.recipients : [],
            ...Array.isArray(channel.rawRecipients) ? channel.rawRecipients.map((user) => user?.id) : []
          ].filter(Boolean).map(String).filter((userId) => userId !== currentUserId);
          const uniqueRecipientIds = [...new Set(recipientIds)];
          return {
            channelId,
            recipientUserId: uniqueRecipientIds.length === 1 ? uniqueRecipientIds[0] : null
          };
        } catch (error) {
          this.api?.Logger.warn("Selected DM recipient lookup failed.", error);
          return { channelId: null, recipientUserId: null };
        }
      }
      getSelectedDmRecipientUserId() {
        return this.getSelectedDmDetails().recipientUserId;
      }
      clearHistory() {
        if (!this.history) {
          return;
        }
        this.history.clear();
        this.persistence.flush();
        this.ui?.refresh();
        this.api.UI.showToast("Last Seen history cleared.", { type: "success" });
      }
      getSettingsPanel() {
        const panel = document.createElement("div");
        panel.className = "bd-last-seen-settings";
        panel.style.padding = "16px";
        const heading = document.createElement("h3");
        heading.textContent = "Last Seen";
        panel.append(heading);
        const explanation = document.createElement("p");
        explanation.textContent = "Timestamps are local observations. Discord reports invisible users as offline, so this plugin cannot distinguish them.";
        panel.append(explanation);
        const statusHeading = document.createElement("h4");
        statusHeading.textContent = "Live diagnostics";
        statusHeading.style.marginTop = "20px";
        panel.append(statusHeading);
        const status = document.createElement("pre");
        status.style.background = "var(--background-secondary)";
        status.style.borderRadius = "8px";
        status.style.padding = "12px";
        status.style.whiteSpace = "pre-wrap";
        status.style.fontFamily = "var(--font-code)";
        panel.append(status);
        const renderStatus = () => {
          const diagnostics = this.getDiagnostics();
          const ui = diagnostics.ui ?? {};
          status.textContent = [
            `PresenceStore: ${diagnostics.presenceStore ? "found" : "missing"}`,
            `UserStore: ${diagnostics.userStore ? "found" : "missing"}`,
            `ChannelStore: ${diagnostics.channelStore ? "found" : "missing"}`,
            `SelectedChannelStore: ${diagnostics.selectedChannelStore ? "found" : "missing"}`,
            `Subscription: ${diagnostics.subscribed ? diagnostics.subscriptionMethod : "polling fallback"}`,
            `Selected channel: ${diagnostics.selectedChannelId ?? "none"}`,
            `Selected DM recipient: ${diagnostics.selectedDmRecipientUserId ?? "not resolved"}`,
            `Stored records: ${diagnostics.storedRecords}`,
            `Currently observed online: ${diagnostics.observedOnline}`,
            `Last snapshot: ${diagnostics.lastSnapshotAt ? new Date(diagnostics.lastSnapshotAt).toLocaleTimeString() : "never"}`,
            `Profile candidates scanned: ${ui.profileCandidates ?? 0}`,
            `Profiles with user ID: ${ui.identifiedProfiles ?? 0}`,
            `Profile rows injected: ${ui.injectedProfiles ?? 0}`,
            `Profile rows currently rendered: ${ui.renderedProfileRows ?? 0}`,
            `DM anchors found: ${ui.dmAnchorsFound ?? 0}`,
            `DM panels found: ${ui.dmPanelsFound ?? 0}`,
            `DM rows injected: ${ui.dmRowsInjected ?? 0}`,
            `Last DM recipient: ${ui.lastDmRecipientUserId ?? "none"}`,
            `Last DM failure: ${ui.lastDmFailure ?? "unknown"}`,
            `Last profile failure: ${ui.lastProfileFailure ?? "unknown"}`
          ].join("\n");
        };
        renderStatus();
        let statusPanelWasConnected = false;
        const statusTimer = setInterval(() => {
          if (panel.isConnected) {
            statusPanelWasConnected = true;
          } else if (statusPanelWasConnected) {
            clearInterval(statusTimer);
            return;
          }
          renderStatus();
        }, 1e3);
        const memberLabel = document.createElement("label");
        memberLabel.style.display = "flex";
        memberLabel.style.gap = "8px";
        memberLabel.style.alignItems = "center";
        const memberToggle = document.createElement("input");
        memberToggle.type = "checkbox";
        memberToggle.checked = this.settings.showMemberList;
        memberToggle.addEventListener("change", () => {
          this.settings.showMemberList = memberToggle.checked;
          this.saveSettings();
          this.ui?.updateSettings(this.settings);
        });
        const memberText = document.createElement("span");
        memberText.textContent = "Show experimental Last seen text in server member lists";
        memberLabel.append(memberToggle, memberText);
        panel.append(memberLabel);
        const debugLabel = document.createElement("label");
        debugLabel.style.display = "flex";
        debugLabel.style.gap = "8px";
        debugLabel.style.alignItems = "center";
        debugLabel.style.marginTop = "12px";
        const debugToggle = document.createElement("input");
        debugToggle.type = "checkbox";
        debugToggle.checked = this.settings.debugLogging;
        debugToggle.addEventListener("change", () => {
          this.settings.debugLogging = debugToggle.checked;
          this.saveSettings();
        });
        const debugText = document.createElement("span");
        debugText.textContent = "Write detailed LastSeen diagnostics to the console";
        debugLabel.append(debugToggle, debugText);
        panel.append(debugLabel);
        const testButton = document.createElement("button");
        testButton.className = "bd-button bd-button-filled bd-button-color-brand";
        testButton.style.marginTop = "16px";
        testButton.style.marginRight = "8px";
        testButton.textContent = "Arm profile UI test";
        testButton.addEventListener("click", () => {
          const result = this.ui?.runVisualTest() ?? {
            success: false,
            message: "The LastSeen UI adapter is not running."
          };
          this.api.UI.showToast(result.message, { type: result.success ? "success" : "warning" });
          this.logDebug("Profile UI test result.", result);
          renderStatus();
        });
        panel.append(testButton);
        const dmTestButton = document.createElement("button");
        dmTestButton.className = "bd-button bd-button-filled bd-button-color-brand";
        dmTestButton.style.marginTop = "16px";
        dmTestButton.style.marginRight = "8px";
        dmTestButton.textContent = "Rescan DM sidebar";
        dmTestButton.addEventListener("click", () => {
          const report = this.ui?.rescanDmSidebar();
          const success = (report?.renderedDmRows ?? 0) > 0;
          this.api.UI.showToast(
            success ? "DM Last Seen card detected and rendered." : `DM rescan failed: ${report?.lastFailure ?? "UI adapter unavailable"}`,
            { type: success ? "success" : "warning" }
          );
          this.logDebug("Manual DM sidebar rescan.", report);
          renderStatus();
        });
        panel.append(dmTestButton);
        const clearButton = document.createElement("button");
        clearButton.className = "bd-button bd-button-filled bd-button-color-red";
        clearButton.style.marginTop = "20px";
        clearButton.textContent = "Clear history";
        clearButton.addEventListener("click", () => {
          this.api.UI.showConfirmationModal(
            "Clear Last Seen history?",
            "This permanently removes every locally stored timestamp.",
            {
              danger: true,
              confirmText: "Clear history",
              cancelText: "Cancel",
              onConfirm: () => this.clearHistory()
            }
          );
        });
        panel.append(clearButton);
        return panel;
      }
    };
    module2.exports = {
      DEFAULT_SETTINGS,
      LastSeenPlugin: LastSeenPlugin2
    };
  }
});

// src/index.js
var { LastSeenPlugin } = require_plugin();
module.exports = LastSeenPlugin;
