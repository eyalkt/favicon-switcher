# Favicon Switcher (Chrome Extension)

Override favicons per domain or URL pattern to distinguish environments.

## Install (Dev)
1. Open Chrome → Extensions → Enable Developer mode
2. Load unpacked → select this folder

## Usage (Popup)
- Scope: choose Domain (auto-filled) or URL Pattern
- Source options:
  - Random: generate a colored favicon with a centered shape (40% size, random rotation)
    - Click Generate until you like it
  - URL: paste an `http/https` or `data:` URL
  - Existing: pick from previews of all saved favicons (enabled and disabled)
- Preview shows the selected favicon
- Enabled switch: off by default until you save; toggling applies/clears immediately when possible
- Save: persists the rule and applies to the current page; if scripting is blocked, you’ll be prompted to reload
- Delete: clears the current rule and resets the form

## Manage (Options Page)
- Live list of rules with favicon preview and enabled toggle
- Edit opens a modal to change:
  - Type (domain/pattern) and match value
  - Source: Random (with Generate + preview) or URL
  - Enabled state
- Import/Export JSON
  - Export is disabled when there are no rules
- List auto-refreshes on changes from the popup or other windows

## Notes
- MV3 background service worker injects a content script when a page matches a rule
- The content script replaces icon links, resists page resets, and re-applies on SPA navigation
- Observer updates are throttled and suppressed during our own DOM changes to avoid loops
