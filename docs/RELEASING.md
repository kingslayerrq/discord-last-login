# Release Guide

## Release Checklist

1. Update the version in `package.json`.
2. Add the release notes to `CHANGELOG.md`.
3. Run:

   ```powershell
   npm ci
   npm run check
   ```

4. Install `dist/LastSeen.plugin.js` in BetterDiscord and complete the manual test matrix below.
5. Commit the source, lockfile, documentation, and generated `dist/LastSeen.plugin.js`.
6. Commit and push the release changes to `main`.
7. Run the **Release** GitHub Actions workflow with the matching version, such as `1.4.2`.
8. Confirm the workflow creates tag `v1.4.2`, publishes the GitHub release, and attaches `LastSeen.plugin.js`.

## Manual Test Matrix

- Enable and disable the plugin without console errors.
- Open a user popout and full profile.
- Confirm online, idle, DND, and offline transitions using a second account.
- Restart Discord and confirm history persists.
- Confirm exact time appears on hover.
- Toggle member-list annotations on and off.
- Clear history and confirm the UI changes to `No history yet`.
- Leave a record beyond the configured boundary in a test build and confirm expiry.
- Temporarily simulate a missing BetterDiscord module and confirm startup remains non-fatal.

## BetterDiscord Submission

Before submitting to a public plugin directory:

- Review the current BetterDiscord addon guidelines.
- Confirm metadata fields and repository URLs are valid.
- Ensure the plugin makes no external requests.
- Include the policy and invisible-status limitations in the listing.
- Keep the unminified distribution available for review.
