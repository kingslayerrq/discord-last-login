# Installation Guide

## Prerequisites

- Discord desktop for Windows, macOS, or Linux
- BetterDiscord installed from <https://betterdiscord.app/>
- The built `LastSeen.plugin.js` file

BetterDiscord is a third-party client modification. Read the policy warning in the main README before installing it.

## Install From A Release

1. Download `LastSeen.plugin.js` from the [latest GitHub release](https://github.com/kingslayerrq/discord-last-login/releases/latest).
2. In Discord, open **User Settings**.
3. Open **BetterDiscord > Plugins**.
4. Select **Open Plugins Folder**.
5. Move `LastSeen.plugin.js` into the opened folder.
6. Return to Discord and enable **LastSeen**.
7. Open a user popout. A `Last seen` row should appear.

The plugin has no history immediately after installation. It learns timestamps only while Discord is running and presence events are available.

## Install A Local Build

From the repository:

```powershell
npm install
npm run check
```

Copy `dist/LastSeen.plugin.js` to the folder opened by **BetterDiscord > Plugins > Open Plugins Folder**.

## Update

1. Download the newer `LastSeen.plugin.js`.
2. Replace the existing file in the BetterDiscord plugins folder.
3. Reload Discord with `Ctrl+R` if BetterDiscord does not reload it automatically.

Stored history is separate from the plugin file and should remain intact across ordinary updates.

## Uninstall

1. Disable **LastSeen** in BetterDiscord's plugin settings.
2. Use **Clear history** first if you want to remove stored timestamps.
3. Delete `LastSeen.plugin.js` from the BetterDiscord plugins folder.

## Troubleshooting

### No Last Seen Row

- Wait until the client has observed the user at least once.
- Reload Discord with `Ctrl+R`.
- Verify that LastSeen is enabled.
- Check the Developer Tools console for missing-module warnings.

### Invisible Users Look Offline

This is expected. Discord intentionally exposes invisible users as offline, and the plugin cannot distinguish the two.

### Member List Looks Crowded

Open the plugin settings and disable the experimental server member-list annotation. It is off by default.

### History Disappeared

Records expire after 90 days. History can also be removed by the settings action, BetterDiscord data cleanup, or a Discord profile reset.
