# Contributing

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Workflow

1. Fork the repository and create a focused branch from `main`.
2. Keep core behavior independent from BetterDiscord wherever practical.
3. Add or update tests for behavioral changes.
4. Run `npm run check`.
5. Manually test UI changes in the current Discord desktop client.

Open a pull request using the provided template. Describe any Discord UI surface affected and include screenshots for visual changes.

## Engineering Guidelines

- Do not add network requests, telemetry, token access, or remote data storage.
- Do not claim to detect invisible users or authoritative login times.
- Avoid adding dependencies when platform APIs or existing code are sufficient.
- Keep compatibility fallbacks isolated in `src/betterdiscord`.
- Document any new setting, build step, or environment requirement.

## Bug Reports

Include:

- Discord and BetterDiscord versions
- Operating system
- Plugin version
- Whether the issue affects tracking, popouts, profiles, or member lists
- Relevant `LastSeen` console warnings with personal data removed
