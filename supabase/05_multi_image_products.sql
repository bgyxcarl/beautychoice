-- 05: 商品支持多张图片
-- 在 Supabase SQL Editor 里粘贴整段执行一次（01~04 应该已经执行过）。这段是幂等的。

alter table products add column if not exists images jsonb not null default '[]';

-- 回填：把现有的单张封面图 img 塞进 images 数组，这样老商品在新的多图画廊里也能正常显示
update products
set images = jsonb_build_array(img)
where img is not null and img <> '' and (images is null or images = '[]'::jsonb);
