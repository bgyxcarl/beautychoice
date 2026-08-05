import { supabase } from './supabase-client.js';

export async function loadCart() {
  const { data, error } = await supabase.from('carts').select('items').maybeSingle();
  if (error) throw error;
  return data && Array.isArray(data.items) ? data.items : [];
}

export async function saveCart(userId, items) {
  const { error } = await supabase.from('carts').upsert({ user_id: userId, items, updated_at: new Date().toISOString() });
  if (error) throw error;
}
