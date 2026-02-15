# VRC Quick Open (Zendesk)

A Manifest V3 Chrome extension that injects a draggable floating bubble on:

`https://a8c.zendesk.com/agent/tickets/*`

Click the bubble to reveal two icon-only options:

- Open **with payments** (transactions + payment failures)
- Open **without payments** (standard)

The email is extracted from the Zendesk ticket DOM near: `span[title="Email"]`.

## Install (unpacked)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select this folder

## GitHub update checks (optional)

Open the extension **Details → Extension options** and set:

- Enable update checks
- GitHub repo as `owner/repo`

This only **notifies** you in the options page; it does not auto-install updates.
