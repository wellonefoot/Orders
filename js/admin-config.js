const ADMIN_CONFIG = {
  // The real Supabase project is kept only so stored public URLs can be recognized.
  projectUrl: 'https://wnavzhrkwgnegjdetdno.supabase.co',
  // IMPORTANT: browser auth/database calls go through the WellOne site's own Netlify URL.
  // This route intentionally does NOT use /supabase because /supabase is also a real
  // folder in this deploy and can shadow a Netlify proxy rewrite.
  supabaseUrl: `${location.origin}/wellone-db`,
  supabaseAnonKey: 'sb_publishable_RbnMrDlHfEijBiejcRNPUg_mop2bqgM',
  storageBucket: 'product-images'
};
