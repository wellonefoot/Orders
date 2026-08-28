const ADMIN_CONFIG = {
  supabaseUrl: 'https://wnavzhrkwgnegjdetdno.supabase.co',
  supabaseAnonKey: 'sb_publishable_RbnMrDlHfEijBiejcRNPUg_mop2bqgM',
  // Try a platform-native same-origin relay first, then Netlify's external rewrite,
  // then a Netlify Function. If none is active the client safely falls back direct.
  supabaseRelays: [
    { mode: 'query', path: '/api/supabase-proxy' },
    { mode: 'path', path: '/supabase' },
    { mode: 'query', path: '/.netlify/functions/supabase-proxy' }
  ],
  storageBucket: 'product-images'
};
