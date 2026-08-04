// One-off script: generates supabase/02_seed_products.sql from the current
// default catalog in src/products-data.js. Run with: node scripts/generate-seed-sql.mjs
import { writeFileSync } from 'node:fs';
import { CATEGORIES } from '../src/products-data.js';
import { buildDefaultProducts } from './default-catalog.mjs';

function sqlStr(v) {
  if (v == null) return 'null';
  return "'" + String(v).replace(/'/g, "''") + "'";
}

const products = buildDefaultProducts();

const values = products.map((p) => {
  return `(${sqlStr(p.id)}, ${sqlStr(p.category)}, ${sqlStr(p.categoryLabel)}, ${sqlStr(p.categoryLabelEn)}, ${sqlStr(p.categoryLabelFr)}, ${sqlStr(p.name)}, ${sqlStr(p.nameEn)}, ${sqlStr(p.nameFr)}, ${p.price}, ${sqlStr(p.img)}, ${sqlStr(p.descCn)}, ${sqlStr(p.descEn)}, ${sqlStr(p.descFr)})`;
}).join(',\n');

const sql = `-- 自动生成：beautychoice 默认 60 款商品种子数据
-- 建完表结构（01_schema.sql）之后，在 Supabase SQL Editor 里粘贴整段执行一次。
-- 由 scripts/generate-seed-sql.mjs 从 src/products-data.js 生成，请勿手改。

insert into products (id, category, category_label, category_label_en, category_label_fr, name, name_en, name_fr, price, img, desc_cn, desc_en, desc_fr)
values
${values}
on conflict (id) do nothing;
`;

writeFileSync(new URL('../supabase/02_seed_products.sql', import.meta.url), sql, 'utf-8');
console.log(`Wrote ${products.length} products to supabase/02_seed_products.sql (categories: ${CATEGORIES.length})`);
