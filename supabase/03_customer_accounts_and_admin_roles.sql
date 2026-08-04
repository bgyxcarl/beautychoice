-- 03: 客户账号支持 + 管理员权限修复
-- 在 Supabase SQL Editor 里粘贴整段执行一次（01、02 应该已经执行过）。
--
-- 为什么需要这个文件：01_schema.sql 里把"能写商品/看订单"的权限设成了
-- "任何登录用户"（to authenticated），这在当时是对的，因为只有店主自己会登录。
-- 但现在要开放客户自己注册账号登录，如果不改，任何注册的客户登录后都会拿到
-- 删商品、改价格、看所有人订单地址邮箱的权限。这段 SQL 把"管理员"和"普通登录客户"
-- 区分开——只有在 admins 表里的用户才有管理权限。

-- 管理员名单：user_id 在这张表里的人才是后台管理员
create table if not exists admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

alter table admins enable row level security;
-- 不给任何人直接读写这张表的权限（只通过下面的 is_admin() 函数间接判断）

create or replace function is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

-- ⚠️ 把下面这行的邮箱换成你自己登录后台用的管理员邮箱，然后执行，
-- 这样你现有的管理员账号才会被正式加进白名单，否则改完权限后你自己也登不进后台了。
insert into admins (user_id)
select id from auth.users where email = '你的管理员邮箱@example.com'
on conflict (user_id) do nothing;

-- ---- products：写权限从"任何登录用户"收紧为"只有管理员" ----
drop policy if exists "products_admin_write" on products;
drop policy if exists "products_admin_update" on products;
drop policy if exists "products_admin_delete" on products;

create policy "products_admin_write" on products
  for insert to authenticated with check (is_admin());
create policy "products_admin_update" on products
  for update to authenticated using (is_admin()) with check (is_admin());
create policy "products_admin_delete" on products
  for delete to authenticated using (is_admin());

-- ---- orders：加 user_id 关联登录下单的客户；读取权限区分管理员/客户本人 ----
alter table orders add column if not exists user_id uuid references auth.users(id) on delete set null;

drop policy if exists "orders_admin_read" on orders;
drop policy if exists "orders_admin_update" on orders;

create policy "orders_admin_read" on orders
  for select to authenticated using (is_admin());
create policy "orders_admin_update" on orders
  for update to authenticated using (is_admin()) with check (is_admin());
-- 新增：登录用户可以读取自己名下的订单（我的订单页要用）
create policy "orders_customer_read_own" on orders
  for select to authenticated using (user_id = auth.uid());

-- ---- product-images 存储桶：写权限同样收紧为"只有管理员" ----
drop policy if exists "product_images_admin_insert" on storage.objects;
drop policy if exists "product_images_admin_update" on storage.objects;
drop policy if exists "product_images_admin_delete" on storage.objects;

create policy "product_images_admin_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'product-images' and is_admin());
create policy "product_images_admin_update" on storage.objects
  for update to authenticated using (bucket_id = 'product-images' and is_admin());
create policy "product_images_admin_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'product-images' and is_admin());
