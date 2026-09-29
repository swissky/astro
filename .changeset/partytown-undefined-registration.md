---
'@astrojs/partytown': patch
---

Fixes an unhandled `TypeError` in the inlined Partytown snippet when `navigator.serviceWorker.register()` resolves with `undefined` (e.g. Playwright with `serviceWorkers: 'block'`). Partytown scripts now fall back to the main thread immediately instead of waiting for the fallback timeout.
