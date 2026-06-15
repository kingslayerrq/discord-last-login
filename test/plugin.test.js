"use strict";

const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
const { LastSeenPlugin } = require("../src/betterdiscord/plugin");

const originalBdApi = globalThis.BdApi;

afterEach(() => {
  globalThis.BdApi = originalBdApi;
});

test("starts and stops safely when Discord internals are unavailable", () => {
  const saved = [];
  const warnings = [];
  const toasts = [];

  globalThis.BdApi = class FakeBdApi {
    constructor() {
      this.Data = {
        load: () => "corrupt",
        save: (key, value) => saved.push([key, value])
      };
      this.Webpack = {
        getStore: () => null,
        getByKeys: () => null
      };
      this.Logger = {
        warn: (...args) => warnings.push(args),
        error: (...args) => warnings.push(args)
      };
      this.UI = {
        showToast: message => toasts.push(message)
      };
      this.Patcher = {
        unpatchAll: () => {}
      };
      this.DOM = {
        addStyle: () => {},
        removeStyle: () => {}
      };
      this.ReactUtils = {
        getInternalInstance: () => null
      };
    }
  };

  const plugin = new LastSeenPlugin();
  plugin.start();
  plugin.stop();

  assert.ok(warnings.length >= 3);
  assert.equal(toasts.length, 1);
  assert.equal(saved.at(-1)[0], "history");
  assert.deepEqual(saved.at(-1)[1].records, {});
});

test("prefers PresenceStore change listeners over FluxDispatcher", () => {
  let listener = null;
  let removedListener = null;
  const presenceStore = {
    addChangeListener: callback => {
      listener = callback;
    },
    removeChangeListener: callback => {
      removedListener = callback;
    },
    getStatus: () => "offline"
  };
  const userStore = {
    getCurrentUser: () => ({ id: "999" }),
    getUser: () => null,
    getUsers: () => ({})
  };

  globalThis.BdApi = class FakeBdApi {
    constructor() {
      this.Data = { load: () => null, save: () => {} };
      this.Webpack = {
        getStore: name => name === "PresenceStore" ? presenceStore : userStore,
        getByKeys: () => null
      };
      this.Logger = { warn: () => {}, error: () => {} };
      this.UI = { showToast: () => {} };
      this.Patcher = { unpatchAll: () => {} };
      this.DOM = { addStyle: () => {}, removeStyle: () => {} };
      this.ReactUtils = { getInternalInstance: () => null };
    }
  };

  const plugin = new LastSeenPlugin();
  plugin.start();
  assert.equal(typeof listener, "function");
  plugin.stop();
  assert.equal(removedListener, listener);
});

test("resolves the other user from the selected one-to-one DM channel", () => {
  const stores = {
    PresenceStore: {
      addChangeListener: () => {},
      removeChangeListener: () => {},
      getStatus: () => "offline"
    },
    UserStore: {
      getCurrentUser: () => ({ id: "111" }),
      getUser: () => null,
      getUsers: () => ({})
    },
    ChannelStore: {
      getChannel: channelId => ({
        id: channelId,
        guild_id: null,
        recipients: ["222"],
        rawRecipients: [{ id: "222" }]
      })
    },
    SelectedChannelStore: {
      getChannelId: () => "333"
    }
  };

  globalThis.BdApi = class FakeBdApi {
    constructor() {
      this.Data = { load: () => null, save: () => {} };
      this.Webpack = {
        getStore: name => stores[name] ?? null,
        getByKeys: () => null
      };
      this.Logger = { info: () => {}, warn: () => {}, error: () => {} };
      this.UI = { showToast: () => {} };
      this.Patcher = { unpatchAll: () => {} };
      this.DOM = { addStyle: () => {}, removeStyle: () => {} };
      this.ReactUtils = { getInternalInstance: () => null };
    }
  };

  const plugin = new LastSeenPlugin();
  plugin.start();

  assert.deepEqual(plugin.getSelectedDmDetails(), {
    channelId: "333",
    recipientUserId: "222"
  });

  plugin.stop();
});
