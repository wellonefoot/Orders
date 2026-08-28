WellOne Order Tracking / Receiving v92 — ADMIN ACCESS FIX

DEPLOY
- Deploy the CONTENTS of this folder to the order receiving site root.
- Keep netlify.toml, _redirects, netlify/functions/, functions/api/, sw.js, js/ and all assets.
- Do not upload only index.html.

WHAT CHANGED
- Real multi-route transport is now implemented. v91 only showed a fallback message but still depended on one route.
- Login/Auth/REST tries a Netlify Function first, then the forced Netlify rewrite, then Cloudflare Pages Function, then direct Supabase.
- Website HTML returned by a bad rewrite is rejected and the next route is tried.

DATABASE
- No new SQL is required for v92.

AFTER DEPLOY
- Close old Order Receiving tabs/PWA windows and reopen.
- If login still fails, open /connection-test.html and send the result.
