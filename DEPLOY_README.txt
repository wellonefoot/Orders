WellOne Order Tracking / Receiving v88 — 20-order infinite loading

DATABASE
- v88 performance/login changes require NO new SQL.
- Existing order/admin RPCs require migrations 10 and 11 if they were never installed.

DEPLOY
- Deploy the CONTENTS of this folder to the order receiving/tracking site root.

V88 PERFORMANCE / RELIABILITY
- Removed artificial auth/session timeouts and returned to normal Supabase email/password login behavior.
- Orders no longer load 100/200 at once. Each server request returns 20 visible orders plus one look-ahead row to detect whether another page exists.
- Near the bottom, the next 20 orders load automatically.
- New / History / Cancelled filters are applied on the server before pagination.
- Order/customer/phone search is server-side before pagination instead of filtering a huge downloaded list.
- Realtime order events refresh the current first page with a debounce.
