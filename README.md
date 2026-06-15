# Last Seen for BetterDiscord

[![CI](https://github.com/kingslayerrq/discord-last-login/actions/workflows/ci.yml/badge.svg)](https://github.com/kingslayerrq/discord-last-login/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/kingslayerrq/discord-last-login)](https://github.com/kingslayerrq/discord-last-login/releases/latest)
[![License](https://img.shields.io/github/license/kingslayerrq/discord-last-login)](LICENSE)

Last Seen is a local-only BetterDiscord plugin that remembers when Discord users were last observed online. It adds Steam-style text such as `Last seen: 24 minutes ago` to user popouts, full profiles, DM profile sidebars, and optionally server member lists.

> [!IMPORTANT]
> This is not an authoritative Discord login tracker. Discord does not expose a last-login timestamp and intentionally reports invisible users as offline. The plugin can only remember presence information delivered to your running desktop client after installation.

## Features

- Records users reported as online, idle, or Do Not Disturb.
- Updates the timestamp when an observed online user goes offline.
- Shows relative time in user popouts and profiles.
- Shows the same card in the persistent profile sidebar on DM pages.
- Shows the exact local timestamp in the native hover tooltip.
- Stores all data locally through BetterDiscord.
- Automatically deletes records older than 90 days.
- Includes an experimental server member-list annotation, disabled by default.
- Provides a confirmation-protected button to clear all history.
- Includes live diagnostics for Discord compatibility changes.
- Makes no network requests and never accesses your Discord token.

## Install

1. Install [BetterDiscord](https://betterdiscord.app/).
2. Download `LastSeen.plugin.js` from the [latest release](https://github.com/kingslayerrq/discord-last-login/releases/latest).
3. Open Discord and go to **User Settings > BetterDiscord > Plugins**.
4. Select **Open Plugins Folder**.
5. Put `LastSeen.plugin.js` in that folder.
6. Enable **LastSeen**.

See [the detailed installation guide](docs/INSTALL.md) for updates and troubleshooting.

## What “Last Seen” Means

The timestamp means:

> The most recent time this desktop client observed Discord reporting the user online, idle, or Do Not Disturb.

The value has these limitations:

- History starts when the plugin is enabled.
- Discord reports invisible and offline users the same way.
- Closed or disconnected Discord clients cannot observe presence.
- Presence may not be delivered for every Discord user.
- A Discord or BetterDiscord update can temporarily break UI placement.
- Reinstalling Discord or clearing BetterDiscord data can remove history.

## Privacy

Stored records contain only:

- Discord user ID
- Last observed timestamp

Records remain in BetterDiscord's local plugin storage. The plugin does not upload, synchronize, export, or share them. Records expire after 90 days, and **Clear history** removes them immediately.

Reloading Discord, disabling and re-enabling LastSeen, or replacing the plugin file with a newer version does not clear history. History can be lost if BetterDiscord's plugin data is cleared, the plugin name changes, stored data becomes unreadable, or the retention period expires.

## Settings

Open **User Settings > BetterDiscord > Plugins**, locate **LastSeen**, and select its settings button.

- **Show experimental Last seen text in server member lists**: Adds compact online/history text beneath identifiable members. Disabled by default because it may add visual clutter and is more sensitive to Discord UI changes.
- **Live diagnostics**: Shows whether Discord stores were found, how many users are tracked, and whether profile rows are being detected and injected.
- **Arm profile UI test**: Arms a 60-second test. Close settings and open a user popout/profile; a temporary green diagnostic row should appear.
- **Rescan DM sidebar**: Forces a compatibility scan of the currently selected one-to-one DM.
- **Clear history**: Permanently removes all stored timestamps after confirmation.

## Development

Requirements:

- Node.js 22 or newer
- npm 10 or newer

```powershell
npm install
npm run check
```

The installable plugin is generated at `dist/LastSeen.plugin.js`.

Source layout:

- `src/core`: Framework-independent history, formatting, presence, and persistence logic.
- `src/betterdiscord`: BetterDiscord module discovery, lifecycle, settings, and UI integration.
- `test`: Unit and degraded-runtime tests using Node's built-in test runner.
- `scripts/build.js`: esbuild configuration and BetterDiscord metadata generation.

## Compatibility

BetterDiscord plugins depend on Discord's private client internals. Last Seen isolates module discovery and UI injection so history collection can continue when possible, but Discord class names and React component shapes can change without notice.

If timestamps stop appearing:

1. Confirm the plugin is enabled.
2. Reload Discord with `Ctrl+R`.
3. Open Developer Tools and look for `LastSeen` warnings.
4. Disable the experimental member-list option.
5. Check for a newer plugin release.

## Policy Warning

BetterDiscord modifies the Discord client. Discord's current terms prohibit modifying its software, so using BetterDiscord may carry account risk. Review the [Discord Terms of Service](https://discord.com/terms) and BetterDiscord's own documentation before installing.

## Contributing And Releases

See [CONTRIBUTING.md](CONTRIBUTING.md) for development expectations, [SUPPORT.md](SUPPORT.md) for troubleshooting and support, [SECURITY.md](SECURITY.md) for vulnerability reporting, and [docs/RELEASING.md](docs/RELEASING.md) for the release process.

## License

[MIT](LICENSE)
