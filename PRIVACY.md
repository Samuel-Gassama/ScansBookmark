# Privacy Policy — ScanMark (Manga Chapter Tracker)

**Last updated:** March 23, 2026

## Overview

ScanMark is a Chrome extension that tracks your manga reading progress. Your privacy is important — this extension is designed to work entirely within your browser with no external servers involved.

## Data collected

ScanMark stores the following information **locally in your browser**:

- Manga series name (derived from the page URL)
- Last chapter number read
- URL of the last chapter read
- Website hostname
- Timestamp of when the chapter was read

This data is stored using Chrome's built-in `chrome.storage.sync` API, which syncs across your Chrome devices when you are signed into Chrome.

## Data NOT collected

ScanMark does **not** collect, store, or transmit:

- Personal information (name, email, etc.)
- Browsing history beyond manga chapter URLs
- Cookies or session data
- Analytics or usage statistics
- Any data to external servers or third parties

## Permissions used

| Permission | Purpose |
|------------|---------|
| `storage` | Save your reading progress locally and sync across your Chrome devices |
| `tabs` | Read the active tab's URL to detect manga chapter pages |

## Third-party services

ScanMark does not use any third-party services, APIs, or analytics tools. There are no network requests made by the extension.

## Data deletion

You can delete your data at any time by:
- Clicking the "x" button next to any series in the extension popup
- Uninstalling the extension (all data is removed automatically)

## Changes to this policy

Any changes to this privacy policy will be reflected in this document with an updated date.

## Contact

If you have questions about this privacy policy, you can reach out by opening an issue on the [GitHub repository](https://github.com/Samuel-Gassama/ScansBookmark/issues).
