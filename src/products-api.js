import { supabase } from './supabase-client.js';

const FIELD_MAP = {
  categoryLabel: 'category_label',
  categoryLabelEn: 'category_label_en',
  categoryLabelFr: 'category_label_fr',
  nameEn: 'name_en',
  nameFr: 'name_fr',
  descCn: 'desc_cn',
  descEn: 'desc_en',
  descFr: 'desc_fr',
};

function rowToProduct(row) {
  return {
    id: row.id,
    category: row.category,
    categoryLabel: row.category_label,
    categoryLabelEn: row.category_label_en,
    categoryLabelFr: row.category_label_fr,
    name: row.name,
    nameEn: row.name_en,
    nameFr: row.name_fr,
    price: Number(row.price),
    img: row.img,
    descCn: row.desc_cn,
    descEn: row.desc_en,
    descFr: row.desc_fr,
  };
}

function productToRow(product) {
  const row = {};
  Object.entries(product).forEach(([k, v]) => { row[FIELD_MAP[k] || k] = v; });
  return row;
}

export async function loadProducts() {
  const { data, error } = await supabase.from('products').select('*').order('created_at', { ascending: true });
  if (error) throw error;
  return data.map(rowToProduct);
}

export async function addProduct(product) {
  const { data, error } = await supabase.from('products').insert(productToRow(product)).select().single();
  if (error) throw error;
  return rowToProduct(data);
}

export async function updateProduct(id, patch) {
  const row = {};
  Object.entries(patch).forEach(([k, v]) => { row[FIELD_MAP[k] || k] = v; });
  const { data, error } = await supabase.from('products').update(row).eq('id', id).select().single();
  if (error) throw error;
  return rowToProduct(data);
}

export async function deleteProduct(id) {
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) throw error;
}
