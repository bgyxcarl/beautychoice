-- 04: 登录用户购物车持久化 + 订单物流单号
-- 在 Supabase SQL Editor 里粘贴整段执行一次（01、02、03 应该已经执行过）。
-- 这段是幂等的，重复执行不会报错。

-- ---- 购物车：每个登录用户一行，只有本人能读写 ----
create table if not exists carts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  items jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

alter table carts enable row level security;

drop policy if exists "carts_owner_all" on carts;
create policy "carts_owner_all" on carts
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---- 订单：加物流单号字段 ----
alter table orders add column if not exists tracking_number text;
