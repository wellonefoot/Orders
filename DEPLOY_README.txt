WellOne Order Tracking / Receiving v85 — new-order inbox
- Separate deployment; index.html is at ZIP root.
- The opening section shows only new placed orders.
- History and Cancelled are separate; History filters confirmed, paid, packed, out-for-delivery and delivered orders.
- Cards stay compact until full details are opened.
- v85 uses a fresh service-worker/cache namespace and stable static-asset caching.
- Run supabase/10_v85_heavy_commerce_flow.sql once before using this build.
