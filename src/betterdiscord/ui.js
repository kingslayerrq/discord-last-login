"use strict";

const { ONLINE_STATUSES } = require("../core/constants");
const { formatExactTime, formatRelativeTime } = require("../core/format");

const PROFILE_CANDIDATE_SELECTOR = [
  "[class*=\"userPopoutOuter\"]",
  "[class*=\"userPopout\"]",
  "[class*=\"userProfileOuter\"]",
  "[class*=\"userProfileInner\"]",
  "[class*=\"userProfileModalOuter\"]",
  "[class*=\"userProfileModal\"]",
  "[class*=\"profilePanel\"]",
  "[class*=\"userPanelOuter\"]",
  "[class*=\"userPanelInner\"]",
  "[role=\"dialog\"] [class*=\"profile\"]"
].join(",");

const DM_PROFILE_ROOT_SELECTOR = [
  "[class*=\"profilePanel\"]",
  "[class*=\"userPanelOuter\"]"
].join(",");

const PROFILE_ROOT_SELECTOR = [
  "[class*=\"userPopoutOuter\"]",
  "[class*=\"userProfileModalOuter\"]",
  "[class*=\"userProfileOuter\"]",
  DM_PROFILE_ROOT_SELECTOR,
  "[role=\"dialog\"]"
].join(",");

const MEMBER_CANDIDATE_SELECTOR = [
  "[data-list-item-id^=\"members-\"]",
  "[class*=\"membersWrap\"] [role=\"listitem\"]",
  "[class*=\"membersWrap\"] [class*=\"member_\"]",
  "[class*=\"membersWrap\"] [class^=\"member_\"]"
].join(",");

function findUserIdInValue(value, depth = 0, seen = new Set()) {
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

class LastSeenUI {
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
    this.dmRetryTimers = new Set();
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

    this.observer = new MutationObserver(mutations => {
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
    this.refreshTimer = setInterval(() => this.refresh(), 60_000);
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
      document.querySelectorAll?.(".bd-last-seen-row, .bd-last-seen-member").forEach(node => node.remove());
    }
    this.api.DOM.removeStyle();
  }

  updateSettings(settings) {
    this.settings = settings;
    if (!settings.showMemberList) {
      document.querySelectorAll(".bd-last-seen-member").forEach(node => node.remove());
    }
    this.scan(document.body);
  }

  scan(root) {
    this.diagnostics.scans += 1;
    this.diagnostics.lastScanAt = Date.now();
    const profileRoots = new Set();
    this.scanSelector(root, PROFILE_CANDIDATE_SELECTOR, node => {
      const profileRoot = this.resolveProfileRoot(node);
      if (profileRoot) {
        profileRoots.add(profileRoot);
      }
    });
    profileRoots.forEach(node => this.injectProfile(node));
    this.findDmProfileRoots(root).forEach(node => this.injectProfile(node));

    if (this.settings.showMemberList) {
      const memberRoots = new Set();
      this.scanSelector(root, MEMBER_CANDIDATE_SELECTOR, node => {
        const memberRoot = this.resolveMemberRoot(node);
        if (memberRoot) {
          memberRoots.add(memberRoot);
        }
      });
      memberRoots.forEach(node => this.injectMember(node));
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
      existingRows.slice(1).forEach(row => row.remove());
      if (container.dataset.bdLastSeenDmPanel === "true") {
        const placement = this.resolveDmProfilePlacement(container);
        if (placement) {
          this.placeRow(existingRows[0], placement);
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
        this.diagnostics.lastDmFailure = dmRecipientUserId
          ? `DM recipient ${dmRecipientUserId} is not trackable`
          : "Selected DM recipient could not be resolved";
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
      "[class*=\"nameAndDecorators\"], [class*=\"memberInner\"] [class*=\"content\"], [class*=\"content_\"]"
    );
    if (!host) {
      return;
    }

    const row = document.createElement("span");
    row.className = "bd-last-seen-member";
    row.dataset.userId = userId;
    if (host.matches("[class*=\"nameAndDecorators\"]")) {
      host.insertAdjacentElement("afterend", row);
    } else {
      host.append(row);
    }
    this.diagnostics.injectedMembers += 1;
    this.renderNode(row, userId, false);
  }

  refresh() {
    document.querySelectorAll(".bd-last-seen-row").forEach(node => {
      this.renderNode(node, node.dataset.userId, true);
    });

    document.querySelectorAll(".bd-last-seen-member").forEach(node => {
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
    node.title = online
      ? "This user is currently reported online by Discord."
      : timestamp
        ? `Last observed by this client: ${formatExactTime(timestamp)}. Invisible users appear offline.`
        : "No presence has been observed since installing the plugin.";
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
    const roots = new Set();
    const memberSinceAnchors = this.findTextElements(root, text => text === "Member Since");
    this.diagnostics.dmAnchorsFound += memberSinceAnchors.length;
    for (const anchor of memberSinceAnchors) {
      const panel = this.findDmPanelFromAnchor(anchor);
      if (panel) {
        roots.add(panel);
      }
    }

    const footerCandidates = this.findTextElements(root, text => text === "View Full Profile");
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
    root.querySelectorAll?.("div, span, button").forEach(element => candidates.push(element));

    return candidates.filter(element => predicate(element.textContent?.replace(/\s+/g, " ").trim() ?? ""));
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
      "textarea, [class*=\"channelTextArea\"], [class*=\"messageInput\"], [class*=\"footer\"]"
    );
    if (composer) {
      const composerBlock = composer.closest(
        "[class*=\"channelTextArea\"], [class*=\"messageInput\"], [class*=\"footer\"], form"
      ) ?? composer;
      if (composerBlock.parentElement) {
        return { host: composerBlock.parentElement, before: composerBlock, kind: "profile" };
      }
    }

    const hosts = [...container.querySelectorAll(
      "[class*=\"userPopoutOverlayBackground\"], [class*=\"userProfileOverlayBackground\"], [class*=\"userProfileInner\"]"
    )];
    const host = hosts.find(candidate => candidate.querySelector("[class*=\"body\"]")) ?? hosts.at(-1) ?? container;
    return { host, before: null, kind: "profile" };
  }

  resolveDmProfilePlacement(container) {
    const mutualServers = this.findTextElements(
      container,
      text => /^Mutual Servers(?:\s+—\s+\d+)?$/.test(text)
    ).at(-1);
    const mutualFriends = this.findTextElements(
      container,
      text => /^Mutual Friends(?:\s+—\s+\d+)?$/.test(text)
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

    const memberSinceLabel = this.findTextElements(container, text => text === "Member Since").at(-1);
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
      if (
        hasMutuals &&
        !text.includes("Member Since") &&
        !text.includes("View Full Profile")
      ) {
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
      if (
        text.startsWith("Member Since") &&
        !text.includes("Mutual Servers") &&
        !text.includes("Mutual Friends") &&
        !text.includes("View Full Profile")
      ) {
        candidate = current;
        continue;
      }
      break;
    }
    return candidate;
  }

  findCommonAncestor(first, second, boundary) {
    const ancestors = new Set();
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
        roots.forEach(root => this.injectProfile(root));
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
      "[data-list-item-id^=\"members-\"], [role=\"listitem\"][class*=\"member\"], [class*=\"member_\"]"
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
    roots.forEach(root => this.injectProfile(root));
    const report = {
      recipientUserId: this.getDmRecipientUserId(),
      rootsFound: roots.size,
      rowsInjectedNow: this.diagnostics.dmRowsInjected - before,
      renderedDmRows: document.querySelectorAll(".bd-last-seen-dm-panel").length,
      lastFailure: this.diagnostics.lastDmFailure,
      roots: [...roots].map(root => this.describeNode(root))
    };
    this.logger.info("DM sidebar diagnostic report.", report);
    return report;
  }

  onSelectedChannelChange() {
    document.querySelectorAll(".bd-last-seen-dm-panel").forEach(row => row.remove());
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
      this.visualTestArmedUntil = Date.now() + 60_000;
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
    setTimeout(() => row.remove(), 15_000);
  }
}

module.exports = {
  LastSeenUI,
  findUserIdFromFiber,
  findUserIdInValue,
  parseMemberUserId
};
