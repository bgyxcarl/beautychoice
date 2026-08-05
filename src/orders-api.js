import { supabase } from './supabase-client.js';

export async function createOrder(order) {
  const { data, error } = await supabase.from('orders').insert({
    paypal_order_id: order.paypalOrderId,
    user_id: order.userId || null,
    customer_name: order.name,
    customer_email: order.email,
    address: order.address,
    city: order.city,
    zip: order.zip,
    country: order.country,
    items: order.items,
    subtotal: order.subtotal,
    shipping: order.shipping,
    total: order.total,
  }).select().single();
  if (error) throw error;
  return data;
}

// Row visibility is entirely controlled by RLS: admins see every order,
// signed-in customers see only their own (see 03_customer_accounts_and_admin_roles.sql).
export async function loadOrders() {
  const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function setOrderStatus(id, status) {
  const { error } = await supabase.from('orders').update({ status }).eq('id', id);
  if (error) throw error;
}

export async function setOrderTracking(id, trackingNumber) {
  const { error } = await supabase.from('orders').update({ tracking_number: trackingNumber }).eq('id', id);
  if (error) throw error;
}
