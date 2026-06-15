# Changelog

All notable changes to this project are documented here.

## [1.4.2] - 2026-06-15

### Fixed

- Place the DM Last Seen card consistently outside the bio/member-since card when a profile has only one mutual-connections section.

## [1.4.1] - 2026-06-15

### Fixed

- Retry DM sidebar rendering after Discord finishes its asynchronous first render.
- Rescan immediately when the selected DM channel changes.
- Place the DM card only inside scrolling profile content, removing the sticky-footer fallback.

## [1.4.0] - 2026-06-15

### Added

- Resolve the selected DM recipient through `SelectedChannelStore` and `ChannelStore` instead of relying on sidebar React props.
- Detect DM sidebars from `Member Since`, mutual-connections, and footer text anchors.
- Add DM-specific live diagnostics and a manual sidebar rescan action.

## [1.3.1] - 2026-06-15

### Fixed

- Detect DM profile sidebars structurally from their `View Full Profile`, member-since, and mutual-connections content when Discord class names do not expose profile identifiers.

## [1.3.0] - 2026-06-15

### Added

- Display the high-contrast Last Seen card in the persistent profile sidebar on DM pages.

### Changed

- Prefer placing the DM sidebar card between member-since information and mutual connections.

## [1.2.0] - 2026-06-15

### Fixed

- Deduplicate nested profile matches so each popout or full profile receives one row.
- Place profile rows at the bottom, preferably directly above the message composer.
- Use a high-contrast card that remains readable over personalized profile themes.
- Detect current Discord member-list items through their role and `data-list-item-id`.

### Changed

- Member-list rows now show online, historical, and no-history states without opening profiles.

## [1.1.0] - 2026-06-15

### Added

- Startup confirmation toast showing the active presence subscription.
- Live settings diagnostics for stores, tracking, profile scans, and UI injection.
- Optional detailed console logging enabled by default.
- A temporary profile UI placement test.

### Changed

- Expanded profile selectors for newer Discord popout and profile class names.

## [1.0.1] - 2026-06-15

### Fixed

- Subscribe directly to `PresenceStore` when Discord no longer exposes the expected `FluxDispatcher` module.
- Preserve the correct receiver for Discord's wrapped browser timers.
- Record the final boundary when a cached user changes from online to offline.

## [1.0.0] - 2026-06-15

### Added

- Local tracking of observed online, idle, and Do Not Disturb presence.
- Offline transition timestamps and 90-day retention.
- User popout and profile display with relative and exact timestamps.
- Optional server member-list annotation.
- BetterDiscord settings and confirmation-protected history clearing.
- Unit tests, linting, bundling, installation documentation, and release guidance.
