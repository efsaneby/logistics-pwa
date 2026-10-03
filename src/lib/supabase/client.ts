import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "https://jozyvxuknencfkeuyyxh.supabase.co";
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_hT32gIdArNTzj-Ie___rlw_2i27IW_l";

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
