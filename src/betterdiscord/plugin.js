"use strict";

const { HistoryStore } = require("../core/history-store");
const { DebouncedPersistence } = require("../core/persistence");
const { PresenceTracker } = require("../core/presence-tracker");
const { LastSeenUI } = require("./ui");

const DEFAULT_SETTINGS = Object.freeze({
  showMemberList: false,
  debugLogging: true
});

class LastSeenPlugin {
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
    this.onPresenceUpdate = payload => this.tracker?.observe(payload);
    this.onPresenceStoreChange = () => this.snapshotCachedUsers();
    this.onSelectedChannelChange = () => this.ui?.onSelectedChannelChange();
  }

  start() {
    this.api = new BdApi("LastSeen");
    this.settings = this.loadSettings();

    this.persistence = new DebouncedPersistence({
      save: value => this.saveData("history", value)
    });

    this.history = new HistoryStore({
      initialData: this.loadData("history"),
      onChange: () => this.persistence.schedule(this.history.serialize())
    });

    this.resolveDiscordModules();

    this.tracker = new PresenceTracker({
      history: this.history,
      getCurrentUserId: () => this.userStore?.getCurrentUser?.()?.id,
      getUser: userId => this.userStore?.getUser?.(userId)
    });

    this.subscribeToPresence();
    this.snapshotCachedUsers();
    this.history.prune();

    this.snapshotTimer = setInterval(() => this.snapshotCachedUsers(), 60_000);
    this.pruneTimer = setInterval(() => this.history.prune(), 60 * 60 * 1000);

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
      const changes = this.tracker.snapshot(users, userId => this.presenceStore.getStatus(userId));
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
      ...(stored && typeof stored === "object" ? stored : {})
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
      const channelId =
        this.selectedChannelStore?.getChannelId?.() ??
        this.selectedChannelStore?.getCurrentlySelectedChannelId?.() ??
        null;
      const channel = channelId ? this.channelStore?.getChannel?.(channelId) : null;
      if (!channel || channel.guild_id) {
        return { channelId, recipientUserId: null };
      }

      const currentUserId = String(this.userStore?.getCurrentUser?.()?.id ?? "");
      const recipientIds = [
        ...(Array.isArray(channel.recipients) ? channel.recipients : []),
        ...(Array.isArray(channel.rawRecipients) ? channel.rawRecipients.map(user => user?.id) : [])
      ]
        .filter(Boolean)
        .map(String)
        .filter(userId => userId !== currentUserId);

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
    explanation.textContent =
      "Timestamps are local observations. Discord reports invisible users as offline, so this plugin cannot distinguish them.";
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
    }, 1_000);

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
        success
          ? "DM Last Seen card detected and rendered."
          : `DM rescan failed: ${report?.lastFailure ?? "UI adapter unavailable"}`,
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
}

module.exports = {
  DEFAULT_SETTINGS,
  LastSeenPlugin
};
