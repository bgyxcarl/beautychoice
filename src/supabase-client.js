import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigured = !!(url && anonKey);

if (!supabaseConfigured) {
  console.warn('[beautychoice] Supabase 环境变量未配置（VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY），商品数据无法加载。见 .env.example。');
}

export const supabase = supabaseConfigured ? createClient(url, anonKey) : null;
