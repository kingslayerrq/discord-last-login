"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { findUserIdInValue, parseMemberUserId } = require("../src/betterdiscord/ui");

test("finds user IDs in common Discord component prop shapes", () => {
  assert.equal(findUserIdInValue({ user: { id: "123", username: "Example" } }), "123");
  assert.equal(findUserIdInValue({ displayProfile: { userId: "456" } }), "456");
  assert.equal(findUserIdInValue({ member: { user: { id: "789" } } }), "789");
});

test("does not recurse forever through cyclic React props", () => {
  const props = {};
  props.profile = props;
  assert.equal(findUserIdInValue(props), null);
});

test("extracts a Discord user ID from current member-list item IDs", () => {
  const node = {
    getAttribute: name => name === "data-list-item-id"
      ? "members-1226289911410458645-358666317085016076"
      : null
  };

  assert.equal(parseMemberUserId(node), "358666317085016076");
  assert.equal(parseMemberUserId({ getAttribute: () => "channels___home-tab" }), null);
});
