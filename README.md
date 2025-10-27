# Favicon Switcher (Chrome Extension)

Override favicons per domain or URL pattern to distinguish environments.

## Install (Dev)
1. Open Chrome → Extensions → Enable Developer mode
2. Load unpacked → select this folder

## Usage
- Click the toolbar icon to open the popup
- Choose scope (Domain auto-filled from current tab, or URL Pattern)
- Enter the favicon URL (http/https or data:)
- Save → the favicon updates immediately and persists across visits

## Manage
- Open Options to edit, toggle, delete rules, or import/export JSON

## Notes
- MV3 background service worker injects a content script when a page matches a rule
- Content script ensures the favicon persists against DOM changes and SPA navigation

