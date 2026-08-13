# GitHub Favorite Repos

A small Chrome extension that pins your favorite GitHub repositories to a bar
under the header, on every github.com page.

## Features

- Adds a bar directly under GitHub's own header, on every `github.com` page
- Add a favorite from the bar itself (`+` button) or from the extension's
  popup — the popup also detects the repo you're currently viewing and
  offers a one-click "add current repo"
- Drag chips to reorder them, either in the bar or in the popup's list
- Remove a favorite via the small `×` that appears on hover
- Syncs across your Chrome installs via `chrome.storage.sync`

## Installing (unpacked, for development)

1. Clone this repo.
2. Go to `chrome://extensions`.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select this folder.
5. Visit any `github.com` page — the bar should appear under the header.

There's no build step; it's plain HTML/CSS/JS, so any edits take effect after
clicking the reload icon on the extension's card **and then refreshing any
already-open github.com tabs** (existing content scripts are invalidated
when the extension reloads).

## How it works

- `manifest.json` — Manifest V3 config. Content script runs on
  `https://github.com/*`; the popup is the toolbar-icon UI.
- `content.js` — injects the favorites bar. Anchors to
  `header[role="banner"]` (present on every GitHub page) rather than any
  page-specific navigation, so it doesn't interfere with GitHub's own
  layout/overflow scripts and shows up consistently everywhere.
- `content.css` — styling for the bar and its chips.
- `popup.html` / `popup.js` / `popup.css` — the toolbar popup for managing
  favorites from anywhere, including current-repo detection.
- `icons/` — extension icons.

Favorites are stored as a `favorites` array (`{ owner, repo }` objects) in
`chrome.storage.sync`. Both the content script and popup re-check storage
before mutating it (rather than trusting a possibly-stale in-memory copy),
so concurrent edits from different tabs or the popup don't produce
duplicates.

## Notes

- This is an unofficial, community project — not affiliated with or
  endorsed by GitHub.
- Not published to the Chrome Web Store; load it as an unpacked extension
  as described above.

## License

MIT — see [LICENSE](LICENSE).
