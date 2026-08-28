WellOne Order Receiving v89 — admin access reliability fix

WHAT WAS FIXED
- Admin Auth/REST requests no longer depend on the phone/browser reaching *.supabase.co directly.
- The page now sends Supabase HTTP traffic through /supabase/* on the same deployed order-site origin.
- _redirects relays /supabase/* to the fixed WellOne Supabase project from Netlify.
- Login no longer gets stuck forever on “Checking…”. It has timeout/retry-safe handling and a usable error message.
- A temporary network error no longer automatically signs out an already-valid admin session.
- Old service-worker caches are replaced with v89 and secure auth/API relay requests are never cached.
- Supabase-hosted product images on the order page are also rewritten through the relay.
- Realtime is still attempted, with a lightweight 3.5-second change check as a fallback so new orders stay live even if direct WebSocket connectivity is unavailable.

DEPLOY (NETLIFY)
1. Deploy the CONTENTS of this folder to the existing WellOne order receiving site root.
2. Make sure the root files _redirects and _headers are included in the deployment. Do not upload only index.html/js/css.
3. After deploy, open the order page normally and log in with the existing authorized WellOne admin email/password.
4. No password change is required for this fix.

QUICK RELAY CHECK
- Open: https://YOUR-ORDER-SITE/supabase/auth/v1/settings
- A JSON/auth response (including 401/403 when opened without headers) proves the Netlify rewrite exists.
- A normal site 404/HTML page means _redirects was not deployed at the site publish root.

DATABASE
- v89 itself needs NO new SQL.
- Existing order/admin RPCs still require the previous order migrations if they were never installed.
