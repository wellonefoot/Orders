WellOne Order Tracking / Receiving v90 — ADMIN ACCESS FIX

WHAT THIS FIXES
- The raw browser error `Unexpected token '<' ... is not valid JSON` was caused by the v89 same-origin route returning the site's HTML instead of a Supabase JSON response.
- v90 validates relay responses and automatically tries another supported route instead of parsing that HTML as JSON.

DEPLOY
- Deploy the CONTENTS of this folder to the order receiving/tracking site root.
- Keep `_redirects`, `functions/`, `netlify/`, `netlify.toml`, `sw.js`, `js/` and all normal site files.
- Do not upload only index.html.

HOSTING SUPPORT
- Netlify static deploy: `_redirects` provides the Supabase rewrite.
- Netlify Git/build deploy: the included Netlify Function is an additional fallback.
- Cloudflare Pages with Functions: the included `functions/api/supabase-proxy.js` route is used.
- If no relay feature is active, the browser falls back to direct Supabase instead of throwing the HTML/JSON parsing error.

DATABASE
- v90 requires NO new SQL.
- Existing order/admin RPCs still require migrations 10 and 11 if they were never installed.

CACHE
- v90 uses a new service-worker cache version and never caches auth/API relay traffic.
- After deploying, close the current order page/PWA and reopen it once.
