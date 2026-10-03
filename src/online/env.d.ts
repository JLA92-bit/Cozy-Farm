/// <reference types="vite/client" />
/** Build-time settings for real online play (see ONLINE.md). Empty or missing = practice mode. */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}
