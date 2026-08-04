-- beautychoice 数据库结构
-- 在 Supabase 项目的 SQL Editor 里粘贴整段执行一次即可。

create table if not exists products (
  id text primary key,
  category text not null,
  category_label text not null,
  category_label_en text not null,
  category_label_fr text not null,
  name text not null,
  name_en text default '',
  name_fr text default '',
  price numeric not null default 0,
  img text,
  desc_cn text default '',
  desc_en text default '',
  desc_fr text default '',
  created_at timestamptz not null default now()
);

alter table products enable row level security;

create policy "products_public_read" on products
  for select using (true);

create policy "products_admin_write" on products
  for insert to authenticated with check (true);

create policy "products_admin_update" on products
  for update to authenticated using (true) with check (true);

create policy "products_admin_delete" on products
  for delete to authenticated using (true);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  paypal_order_id text,
  status text not null default 'pending', -- pending | shipped
  customer_name text not null default '',
  customer_email text not null default '',
  address text not null default '',
  city text not null default '',
  zip text not null default '',
  country text not null default '',
  items jsonb not null default '[]', -- [{id, name, size, qty, price}]
  subtotal numeric not null default 0,
  shipping numeric not null default 0,
  total numeric not null default 0,
  created_at timestamptz not null default now()
);

alter table orders enable row level security;

-- 任何访客都能下单（写入订单），但不能读取别人的订单
create policy "orders_public_insert" on orders
  for insert with check (true);

create policy "orders_admin_read" on orders
  for select to authenticated using (true);

create policy "orders_admin_update" on orders
  for update to authenticated using (true) with check (true);

-- 商品图片存储桶：公开可读，只有登录的管理员能上传/替换/删除
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

create policy "product_images_public_read" on storage.objects
  for select using (bucket_id = 'product-images');

create policy "product_images_admin_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'product-images');

create policy "product_images_admin_update" on storage.objects
  for update to authenticated using (bucket_id = 'product-images');

create policy "product_images_admin_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'product-images');
