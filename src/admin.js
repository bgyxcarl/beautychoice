import { CATEGORIES } from './products-data.js';
import { loadProducts, addProduct, updateProduct, deleteProduct } from './products-api.js';
import { loadOrders, setOrderStatus, setOrderTracking } from './orders-api.js';
import { supabase, supabaseConfigured } from './supabase-client.js';

const app = document.getElementById('app');

const state = {
  authLoading: true,
  session: null,
  loginEmail: '',
  loginPassword: '',
  loginError: null,
  loginBusy: false,

  tab: 'products', // 'products' | 'orders'

  products: [],
  productsLoading: false,
  productsError: null,
  categoryFilter: 'all',
  showAddForm: false,
  newName: '',
  newNameEn: '',
  newNameFr: '',
  newCategory: CATEGORIES[0].key,
  newPrice: 25,
  newDescCn: '',
  newDescEn: '',
  newDescFr: '',
  uploadingId: null,
  expandedIds: new Set(),

  orders: [],
  ordersLoading: false,
  ordersError: null,
};

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtDate(iso) {
  try { return new Date(iso).toLocaleString('zh-CN'); } catch { return iso; }
}

// ---- data loading ----
async function loadAllProducts() {
  state.productsLoading = true;
  state.productsError = null;
  render();
  try {
    state.products = await loadProducts();
  } catch (e) {
    console.error('Failed to load products:', e);
    state.productsError = e;
  }
  state.productsLoading = false;
  render();
}

async function loadAllOrders() {
  state.ordersLoading = true;
  state.ordersError = null;
  render();
  try {
    state.orders = await loadOrders();
  } catch (e) {
    console.error('Failed to load orders:', e);
    state.ordersError = e;
  }
  state.ordersLoading = false;
  render();
}

// ---- product actions ----
async function setField(id, field, value) {
  try {
    const updated = await updateProduct(id, { [field]: value });
    const idx = state.products.findIndex((p) => p.id === id);
    if (idx >= 0) state.products[idx] = updated;
  } catch (e) {
    console.error('Failed to update product:', e);
    alert('更新失败：' + e.message);
  }
}

async function deleteRow(id) {
  if (!confirm('确定删除这款商品吗？')) return;
  try {
    await deleteProduct(id);
    state.products = state.products.filter((p) => p.id !== id);
    render();
  } catch (e) {
    console.error('Failed to delete product:', e);
    alert('删除失败：' + e.message);
  }
}

let newProductImageFiles = [];

async function submitNewProduct() {
  const cat = CATEGORIES.find((c) => c.key === state.newCategory) || CATEGORIES[0];
  if (!cat) return;
  const product = {
    id: cat.key + '-new-' + Date.now(),
    category: cat.key,
    categoryLabel: cat.label,
    categoryLabelEn: cat.labelEn,
    categoryLabelFr: cat.labelFr,
    name: state.newName.trim() || (cat.label + ' 新品'),
    nameEn: state.newNameEn.trim(),
    nameFr: state.newNameFr.trim(),
    price: Number(state.newPrice) || 0,
    img: null,
    images: [],
    descCn: state.newDescCn.trim(),
    descEn: state.newDescEn.trim(),
    descFr: state.newDescFr.trim(),
  };
  try {
    const created = await addProduct(product);
    state.products.push(created);
    state.showAddForm = false;
    state.newName = '';
    state.newNameEn = '';
    state.newNameFr = '';
    state.newPrice = 25;
    state.newDescCn = '';
    state.newDescEn = '';
    state.newDescFr = '';
    render();
    if (newProductImageFiles.length) {
      const files = newProductImageFiles;
      newProductImageFiles = [];
      await handleAddImages(created.id, files);
    }
  } catch (e) {
    console.error('Failed to add product:', e);
    alert('添加失败：' + e.message);
  }
}

async function uploadOneImage(id, file) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error: upErr } = await supabase.storage.from('product-images').upload(path, file, { upsert: true, cacheControl: '3600' });
  if (upErr) throw upErr;
  const { data } = supabase.storage.from('product-images').getPublicUrl(path);
  return data.publicUrl;
}

function replaceProductInState(updated) {
  const idx = state.products.findIndex((p) => p.id === updated.id);
  if (idx >= 0) state.products[idx] = updated;
}

// Quick row-cell drop/click: uploads one image and makes it the new cover photo.
async function handleImageFile(id, file) {
  if (!file || !file.type.startsWith('image/')) return;
  state.uploadingId = id;
  render();
  try {
    const url = await uploadOneImage(id, file);
    const product = state.products.find((p) => p.id === id);
    const images = [url, ...((product && product.images) || []).filter((u) => u !== url)];
    const updated = await updateProduct(id, { img: url, images });
    replaceProductInState(updated);
  } catch (e) {
    console.error('Failed to upload image:', e);
    alert('图片上传失败：' + e.message);
  }
  state.uploadingId = null;
  render();
}

// Details panel "+": uploads one or more images, appended to the gallery (cover unchanged unless it was empty).
async function handleAddImages(id, files) {
  const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
  if (!list.length) return;
  state.uploadingId = id;
  render();
  try {
    const urls = [];
    for (const file of list) urls.push(await uploadOneImage(id, file));
    const product = state.products.find((p) => p.id === id);
    const existing = (product && product.images) || [];
    const images = [...existing, ...urls];
    const patch = { images };
    if (!product || !product.img) patch.img = images[0];
    const updated = await updateProduct(id, patch);
    replaceProductInState(updated);
  } catch (e) {
    console.error('Failed to upload images:', e);
    alert('图片上传失败：' + e.message);
  }
  state.uploadingId = null;
  render();
}

async function removeImage(id, index) {
  const product = state.products.find((p) => p.id === id);
  if (!product) return;
  const images = [...(product.images || [])];
  images.splice(index, 1);
  try {
    const updated = await updateProduct(id, { images, img: images[0] || null });
    replaceProductInState(updated);
    render();
  } catch (e) {
    console.error('Failed to remove image:', e);
    alert('删除失败：' + e.message);
  }
}

async function setCoverImage(id, index) {
  const product = state.products.find((p) => p.id === id);
  if (!product) return;
  const images = [...(product.images || [])];
  const [chosen] = images.splice(index, 1);
  if (chosen === undefined) return;
  images.unshift(chosen);
  try {
    const updated = await updateProduct(id, { images, img: chosen });
    replaceProductInState(updated);
    render();
  } catch (e) {
    console.error('Failed to set cover image:', e);
    alert('设置封面失败：' + e.message);
  }
}

// ---- render ----
function imgCell(p) {
  const empty = !p.img;
  const uploading = state.uploadingId === p.id;
  return `
  <div class="img-slot" data-role="imgslot" data-id="${esc(p.id)}" title="点击或拖拽图片到此处上传">
    ${uploading ? `<div class="img-slot-empty">上传中…</div>` : empty ? `<div class="img-slot-empty">上传</div>` : `<img src="${esc(p.img)}" alt="${esc(p.name)}" />`}
    <input type="file" accept="image/*" data-role="imginput" data-id="${esc(p.id)}" style="display:none;" ${uploading ? 'disabled' : ''} />
  </div>`;
}

function sidebar() {
  return `
  <div class="admin-sidebar" style="background:#2b2420;color:#d8cdbd;padding:32px 24px;">
    <div style="font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:700;color:#f1e9df;">beautychoice</div>
    <div style="font-size:12px;color:#8a7f72;margin-top:4px;letter-spacing:0.05em;text-transform:uppercase;">后台管理</div>
    <div style="margin-top:36px;display:flex;flex-direction:column;gap:4px;">
      <div data-action="setTab" data-tab="products" style="cursor:pointer;padding:10px 12px;background:${state.tab === 'products' ? '#3a322c' : 'transparent'};font-size:14px;font-weight:600;color:#f1e9df;">商品管理</div>
      <div data-action="setTab" data-tab="orders" style="cursor:pointer;padding:10px 12px;background:${state.tab === 'orders' ? '#3a322c' : 'transparent'};font-size:14px;font-weight:600;color:#f1e9df;">订单管理</div>
    </div>
    <div style="margin-top:40px;display:flex;flex-direction:column;gap:10px;">
      <a href="index.html" style="font-size:13px;color:#c9a27a;">← 返回商店前台</a>
      <a href="#" data-action="logout" style="font-size:13px;color:#8a7f72;">退出登录（${esc(state.session?.user?.email || '')}）</a>
    </div>
  </div>`;
}

function renderLogin() {
  app.innerHTML = `
  <div style="font-family:'Work Sans',sans-serif;background:#f8f4ef;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;">
    <div class="login-box" style="padding:40px;background:#fff;border:1px solid #e3d9cc;">
      <div style="font-family:'Cormorant Garamond',serif;font-size:26px;font-weight:700;color:#2b2420;">beautychoice</div>
      <div style="font-size:13px;color:#8a7f72;margin-top:4px;margin-bottom:28px;">后台管理登录</div>
      <div style="display:flex;flex-direction:column;gap:14px;">
        <input data-field="loginEmail" type="email" value="${esc(state.loginEmail)}" placeholder="邮箱" style="padding:12px;border:1px solid #e3d9cc;font-size:14px;font-family:'Work Sans',sans-serif;" />
        <input data-field="loginPassword" type="password" value="${esc(state.loginPassword)}" placeholder="密码" style="padding:12px;border:1px solid #e3d9cc;font-size:14px;font-family:'Work Sans',sans-serif;" />
        <button data-action="login" ${state.loginBusy ? 'disabled' : ''} style="padding:13px 0;background:#2b2420;color:#f8f4ef;border:none;font-size:14px;font-weight:600;cursor:pointer;opacity:${state.loginBusy ? 0.6 : 1};">${state.loginBusy ? '登录中…' : '登录'}</button>
        ${state.loginError ? `<div style="font-size:13px;color:#8a4a3f;">${esc(state.loginError)}</div>` : ''}
      </div>
      <div style="margin-top:24px;font-size:12px;color:#a89685;">没有账号？请联系网站负责人为你开通。</div>
    </div>
  </div>`;
}

function renderNotConfigured() {
  app.innerHTML = `<div style="font-family:'Work Sans',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:48px;color:#8a4a3f;font-size:14px;">数据库/登录未配置（VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY），后台暂时无法使用。</div>`;
}

function renderProductsTab() {
  if (state.productsLoading) return `<div style="padding:48px;color:#8a7f72;font-size:14px;">加载中…</div>`;
  if (state.productsError) return `<div style="padding:48px;color:#8a4a3f;font-size:14px;">商品加载失败：${esc(state.productsError.message)}</div>`;

  const products = state.products;
  const filtered = state.categoryFilter === 'all' ? products : products.filter((p) => p.category === state.categoryFilter);

  const filterTabs = [{ key: 'all', label: '全部' }, ...CATEGORIES]
    .map((f) => `<div data-action="setCategoryFilter" data-cat="${f.key}" style="cursor:pointer;font-size:14px;color:${f.key === state.categoryFilter ? '#c9a27a' : '#2b2420'};font-weight:${f.key === state.categoryFilter ? 700 : 500};white-space:nowrap;">${esc(f.label)}</div>`).join('');

  const rows = filtered.map((p) => {
    const expanded = state.expandedIds.has(p.id);
    return `
    <div class="admin-row-min" style="display:grid;grid-template-columns:64px 2fr 1.4fr 1fr 132px;gap:16px;padding:14px 0;${expanded ? '' : 'border-bottom:1px solid #ece3d6;'}align-items:center;">
      <div style="width:56px;height:56px;overflow:hidden;background:#efe6da;">${imgCell(p)}</div>
      <div>
        <input data-field="name" data-id="${esc(p.id)}" value="${esc(p.name)}" placeholder="中文名称" style="width:100%;padding:8px 10px;border:1px solid #e3d9cc;background:#fff;font-size:14px;font-family:'Work Sans',sans-serif;box-sizing:border-box;" />
        <div style="display:flex;gap:6px;margin-top:4px;">
          <input data-field="nameEn" data-id="${esc(p.id)}" value="${esc(p.nameEn)}" placeholder="English name" style="flex:1;min-width:0;padding:6px 8px;border:1px solid #e3d9cc;background:#fff;font-size:12px;font-family:'Work Sans',sans-serif;box-sizing:border-box;" />
          <input data-field="nameFr" data-id="${esc(p.id)}" value="${esc(p.nameFr)}" placeholder="Nom français" style="flex:1;min-width:0;padding:6px 8px;border:1px solid #e3d9cc;background:#fff;font-size:12px;font-family:'Work Sans',sans-serif;box-sizing:border-box;" />
        </div>
      </div>
      <select data-field="category" data-id="${esc(p.id)}" style="padding:10px;border:1px solid #e3d9cc;background:#fff;font-size:13px;font-family:'Work Sans',sans-serif;">
        ${CATEGORIES.map((c) => `<option value="${c.key}" ${c.key === p.category ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}
      </select>
      <div style="display:flex;align-items:center;gap:4px;">
        <span style="font-size:13px;color:#8a7f72;">CA$</span>
        <input type="number" data-field="price" data-id="${esc(p.id)}" value="${p.price}" style="width:70px;padding:10px;border:1px solid #e3d9cc;background:#fff;font-size:14px;font-family:'Work Sans',sans-serif;" />
      </div>
      <div style="display:flex;gap:6px;">
        <button data-action="toggleDetails" data-id="${esc(p.id)}" style="padding:8px 10px;background:none;border:1px solid #e3d9cc;font-size:12px;color:#2b2420;cursor:pointer;white-space:nowrap;">${expanded ? '收起' : '详情'}</button>
        <button data-action="deleteRow" data-id="${esc(p.id)}" style="padding:8px 10px;background:none;border:1px solid #e3d9cc;font-size:12px;color:#8a4a3f;cursor:pointer;">删除</button>
      </div>
    </div>
    ${expanded ? `
    <div class="admin-row-min" style="padding:0 0 20px;border-bottom:1px solid #ece3d6;">
      <div style="font-size:12px;color:#8a7f72;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:10px;">商品图片（第一张是封面图）</div>
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:24px;">
        ${(p.images || []).map((url, i) => `
          <div style="position:relative;width:80px;height:80px;">
            <img src="${esc(url)}" style="width:100%;height:100%;object-fit:cover;border:${i === 0 ? '2px solid #c9a27a' : '1px solid #e3d9cc'};box-sizing:border-box;" />
            ${i !== 0 ? `<button data-action="setCoverImage" data-id="${esc(p.id)}" data-index="${i}" title="设为封面" style="position:absolute;bottom:2px;left:2px;right:2px;font-size:10px;padding:2px 0;background:rgba(255,255,255,0.9);border:1px solid #e3d9cc;cursor:pointer;">设为封面</button>` : ''}
            <button data-action="removeImage" data-id="${esc(p.id)}" data-index="${i}" title="删除" style="position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;background:#8a4a3f;color:#fff;border:none;font-size:11px;cursor:pointer;line-height:1;">×</button>
          </div>`).join('')}
        <label style="width:80px;height:80px;border:1px dashed #c9a27a;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:24px;color:#c9a27a;flex-shrink:0;${state.uploadingId === p.id ? 'opacity:0.5;pointer-events:none;' : ''}">
          ${state.uploadingId === p.id ? '' : '+'}
          <input type="file" accept="image/*" multiple data-role="addImages" data-id="${esc(p.id)}" style="display:none;" />
        </label>
      </div>
      <div style="font-size:12px;color:#8a7f72;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:10px;">商品简介（三语）</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
        <div>
          <div style="font-size:11px;color:#a89685;margin-bottom:4px;">中文</div>
          <textarea data-field="descCn" data-id="${esc(p.id)}" rows="3" style="width:100%;padding:8px;border:1px solid #e3d9cc;background:#fff;font-size:13px;font-family:'Work Sans',sans-serif;box-sizing:border-box;resize:vertical;">${esc(p.descCn)}</textarea>
        </div>
        <div>
          <div style="font-size:11px;color:#a89685;margin-bottom:4px;">English</div>
          <textarea data-field="descEn" data-id="${esc(p.id)}" rows="3" style="width:100%;padding:8px;border:1px solid #e3d9cc;background:#fff;font-size:13px;font-family:'Work Sans',sans-serif;box-sizing:border-box;resize:vertical;">${esc(p.descEn)}</textarea>
        </div>
        <div>
          <div style="font-size:11px;color:#a89685;margin-bottom:4px;">Français</div>
          <textarea data-field="descFr" data-id="${esc(p.id)}" rows="3" style="width:100%;padding:8px;border:1px solid #e3d9cc;background:#fff;font-size:13px;font-family:'Work Sans',sans-serif;box-sizing:border-box;resize:vertical;">${esc(p.descFr)}</textarea>
        </div>
      </div>
    </div>` : ''}`;
  }).join('');

  return `
    <div style="display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:12px;">
      <div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:32px;font-weight:700;">商品管理</div>
        <div style="font-size:14px;color:#8a7f72;margin-top:6px;">共 ${products.length} 款商品 · ${CATEGORIES.length} 个分类</div>
      </div>
      <button data-action="toggleAddForm" style="padding:13px 24px;background:#2b2420;color:#f8f4ef;border:none;font-size:14px;font-weight:600;cursor:pointer;">${state.showAddForm ? '收起表单' : '+ 新增商品'}</button>
    </div>

    ${state.showAddForm ? `
    <div style="background:#efe6da;padding:28px;margin-top:24px;">
      <div style="font-size:13px;color:#8a7f72;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:16px;">新增商品</div>
      <div style="display:grid;grid-template-columns:var(--admin-form-cols);gap:16px;">
        <div>
          <div style="font-size:12px;color:#8a7f72;margin-bottom:6px;">名称（中文）</div>
          <input data-field="newName" value="${esc(state.newName)}" placeholder="例如：珊瑚渐变 No.01" style="width:100%;padding:12px;border:1px solid #d8cdbd;background:#fff;font-size:14px;font-family:'Work Sans',sans-serif;box-sizing:border-box;" />
        </div>
        <div>
          <div style="font-size:12px;color:#8a7f72;margin-bottom:6px;">名称（English）</div>
          <input data-field="newNameEn" value="${esc(state.newNameEn)}" placeholder="e.g. Coral Ombré No.01" style="width:100%;padding:12px;border:1px solid #d8cdbd;background:#fff;font-size:14px;font-family:'Work Sans',sans-serif;box-sizing:border-box;" />
        </div>
        <div>
          <div style="font-size:12px;color:#8a7f72;margin-bottom:6px;">名称（Français）</div>
          <input data-field="newNameFr" value="${esc(state.newNameFr)}" placeholder="ex. Corail Ombré No.01" style="width:100%;padding:12px;border:1px solid #d8cdbd;background:#fff;font-size:14px;font-family:'Work Sans',sans-serif;box-sizing:border-box;" />
        </div>
        <div>
          <div style="font-size:12px;color:#8a7f72;margin-bottom:6px;">分类</div>
          <select data-field="newCategory" style="width:100%;padding:12px;border:1px solid #d8cdbd;background:#fff;font-size:14px;font-family:'Work Sans',sans-serif;box-sizing:border-box;">
            ${CATEGORIES.map((c) => `<option value="${c.key}" ${c.key === state.newCategory ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}
          </select>
        </div>
        <div>
          <div style="font-size:12px;color:#8a7f72;margin-bottom:6px;">价格 (CAD)</div>
          <input type="number" data-field="newPrice" value="${state.newPrice}" style="width:100%;padding:12px;border:1px solid #d8cdbd;background:#fff;font-size:14px;font-family:'Work Sans',sans-serif;box-sizing:border-box;" />
        </div>
        <div>
          <div style="font-size:12px;color:#8a7f72;margin-bottom:6px;">商品图片（可多选，也可以之后再上传）</div>
          <input type="file" accept="image/*" multiple data-role="newProductImages" style="width:100%;padding:10px 0;font-size:13px;font-family:'Work Sans',sans-serif;" />
        </div>
      </div>
      <div style="margin-top:20px;">
        <div style="font-size:12px;color:#8a7f72;margin-bottom:10px;">商品简介（三语，可选）</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
          <textarea data-field="newDescCn" rows="3" placeholder="中文简介" style="width:100%;padding:10px;border:1px solid #d8cdbd;background:#fff;font-size:13px;font-family:'Work Sans',sans-serif;box-sizing:border-box;resize:vertical;">${esc(state.newDescCn)}</textarea>
          <textarea data-field="newDescEn" rows="3" placeholder="English description" style="width:100%;padding:10px;border:1px solid #d8cdbd;background:#fff;font-size:13px;font-family:'Work Sans',sans-serif;box-sizing:border-box;resize:vertical;">${esc(state.newDescEn)}</textarea>
          <textarea data-field="newDescFr" rows="3" placeholder="Description en français" style="width:100%;padding:10px;border:1px solid #d8cdbd;background:#fff;font-size:13px;font-family:'Work Sans',sans-serif;box-sizing:border-box;resize:vertical;">${esc(state.newDescFr)}</textarea>
        </div>
      </div>
      <div style="margin-top:20px;display:flex;gap:12px;">
        <button data-action="submitNewProduct" style="padding:12px 26px;background:#c9a27a;color:#231d19;border:none;font-size:14px;font-weight:600;cursor:pointer;">添加商品</button>
        <button data-action="toggleAddForm" style="padding:12px 26px;background:none;border:1px solid #d8cdbd;font-size:14px;cursor:pointer;">取消</button>
      </div>
      <div style="font-size:12px;color:#8a7f72;margin-top:14px;">这里填的都可以之后在下方列表里随时修改，点"详情"还能补图、改简介。</div>
    </div>` : ''}

    <div style="display:flex;gap:20px;margin-top:32px;border-bottom:1px solid #e3d9cc;padding-bottom:16px;flex-wrap:wrap;">${filterTabs}</div>

    <div class="admin-table-scroll" style="margin-top:8px;">
      <div class="admin-row-min" style="display:grid;grid-template-columns:64px 2fr 1.4fr 1fr 132px;gap:16px;padding:14px 0;border-bottom:1px solid #e3d9cc;font-size:12px;color:#8a7f72;letter-spacing:0.05em;text-transform:uppercase;">
        <div>图片</div><div>名称</div><div>分类</div><div>价格</div><div>操作</div>
      </div>
      ${rows}
    </div>`;
}

function renderOrdersTab() {
  if (state.ordersLoading) return `<div style="padding:48px;color:#8a7f72;font-size:14px;">加载中…</div>`;
  if (state.ordersError) return `<div style="padding:48px;color:#8a4a3f;font-size:14px;">订单加载失败：${esc(state.ordersError.message)}</div>`;

  if (state.orders.length === 0) {
    return `
    <div style="font-family:'Cormorant Garamond',serif;font-size:32px;font-weight:700;">订单管理</div>
    <div style="padding:48px 0;color:#8a7f72;font-size:14px;">还没有订单。</div>`;
  }

  const rows = state.orders.map((o) => {
    const items = Array.isArray(o.items) ? o.items : [];
    const itemsSummary = items.map((it) => `${esc(it.name)} × ${it.qty}（${esc(it.size)}） CA$${Number(it.price).toFixed(2)}`).join('、');
    const shipped = o.status === 'shipped';
    return `
    <div style="border-bottom:1px solid #ece3d6;padding:20px 0;">
      <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:6px;">
        <div style="font-size:14px;font-weight:600;">${esc(o.customer_name)} · ${esc(o.customer_email)}</div>
        <div style="font-size:12px;color:#8a7f72;">#${esc(String(o.id).slice(0, 8))} · ${fmtDate(o.created_at)}</div>
      </div>
      <div style="font-size:13px;color:#4a3f37;margin-top:8px;">${itemsSummary}</div>
      <div style="font-size:13px;color:#8a7f72;margin-top:6px;">${esc(o.address)}, ${esc(o.city)} ${esc(o.zip)}, ${esc(o.country)}</div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;flex-wrap:wrap;gap:10px;">
        <div style="font-size:13px;color:#8a7f72;">PayPal 订单号：${esc(o.paypal_order_id || '-')} · 总计 CA$${Number(o.total).toFixed(2)}</div>
        <button data-action="toggleOrderStatus" data-id="${esc(o.id)}" data-current="${esc(o.status)}" style="padding:8px 14px;background:${shipped ? '#efe6da' : '#2b2420'};color:${shipped ? '#2b2420' : '#f8f4ef'};border:none;font-size:12px;font-weight:600;cursor:pointer;">${shipped ? '已发货' : '标记为已发货'}</button>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:10px;">
        <span style="font-size:12px;color:#8a7f72;white-space:nowrap;">物流单号</span>
        <input data-field="trackingNumber" data-id="${esc(o.id)}" value="${esc(o.tracking_number || '')}" placeholder="填写后客户可在「我的订单」看到" style="flex:1;min-width:160px;padding:8px 10px;border:1px solid #e3d9cc;background:#fff;font-size:13px;font-family:'Work Sans',sans-serif;box-sizing:border-box;" />
      </div>
    </div>`;
  }).join('');

  return `
    <div style="font-family:'Cormorant Garamond',serif;font-size:32px;font-weight:700;">订单管理</div>
    <div style="font-size:14px;color:#8a7f72;margin-top:6px;margin-bottom:24px;">共 ${state.orders.length} 笔订单</div>
    ${rows}`;
}

function render() {
  if (!supabaseConfigured) { renderNotConfigured(); return; }
  if (state.authLoading) {
    app.innerHTML = `<div style="font-family:'Work Sans',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;color:#8a7f72;font-size:14px;">加载中…</div>`;
    return;
  }
  if (!state.session) { renderLogin(); return; }

  const content = state.tab === 'orders' ? renderOrdersTab() : renderProductsTab();
  app.innerHTML = `
  <div class="admin-shell" style="font-family:'Work Sans',sans-serif;background:#f8f4ef;min-height:100vh;color:#2b2420;">
    ${sidebar()}
    <div class="admin-content" style="padding:var(--pad-section-v-md) var(--pad-page);">${content}</div>
  </div>`;
}

// ---- auth events ----
async function login() {
  state.loginBusy = true;
  state.loginError = null;
  render();
  const { error } = await supabase.auth.signInWithPassword({ email: state.loginEmail, password: state.loginPassword });
  state.loginBusy = false;
  if (error) {
    state.loginError = error.message;
    render();
    return;
  }
  state.loginPassword = '';
}

async function logout() {
  await supabase.auth.signOut();
}

// ---- events ----
app.addEventListener('click', (e) => {
  const slot = e.target.closest('[data-role="imgslot"]');
  if (slot && state.uploadingId !== slot.dataset.id) {
    const input = slot.querySelector('[data-role="imginput"]');
    input.click();
    return;
  }
  const el = e.target.closest('[data-action]');
  if (!el) return;
  if (el.tagName === 'A') e.preventDefault();
  switch (el.dataset.action) {
    case 'login': login(); break;
    case 'logout': logout(); break;
    case 'setTab': {
      state.tab = el.dataset.tab;
      render();
      if (state.tab === 'orders' && state.orders.length === 0) loadAllOrders();
      break;
    }
    case 'setCategoryFilter': state.categoryFilter = el.dataset.cat; render(); break;
    case 'toggleAddForm': state.showAddForm = !state.showAddForm; render(); break;
    case 'submitNewProduct': submitNewProduct(); break;
    case 'deleteRow': deleteRow(el.dataset.id); break;
    case 'setCoverImage': setCoverImage(el.dataset.id, Number(el.dataset.index)); break;
    case 'removeImage': removeImage(el.dataset.id, Number(el.dataset.index)); break;
    case 'toggleDetails': {
      const id = el.dataset.id;
      if (state.expandedIds.has(id)) state.expandedIds.delete(id);
      else state.expandedIds.add(id);
      render();
      break;
    }
    case 'toggleOrderStatus': {
      const id = el.dataset.id;
      const next = el.dataset.current === 'shipped' ? 'pending' : 'shipped';
      setOrderStatus(id, next).then(() => {
        const o = state.orders.find((x) => x.id === id);
        if (o) o.status = next;
        render();
      }).catch((err) => { console.error(err); alert('更新失败：' + err.message); });
      break;
    }
  }
});

app.addEventListener('input', (e) => {
  const t = e.target;
  const field = t.dataset.field;
  if (!field) return;
  if (field === 'loginEmail') { state.loginEmail = t.value; return; }
  if (field === 'loginPassword') { state.loginPassword = t.value; return; }
  if (field === 'newName') { state.newName = t.value; return; }
  if (field === 'newNameEn') { state.newNameEn = t.value; return; }
  if (field === 'newNameFr') { state.newNameFr = t.value; return; }
  if (field === 'newPrice') { state.newPrice = t.value; return; }
  if (field === 'newDescCn') { state.newDescCn = t.value; return; }
  if (field === 'newDescEn') { state.newDescEn = t.value; return; }
  if (field === 'newDescFr') { state.newDescFr = t.value; return; }
  const id = t.dataset.id;
  if (!id) return;
  if (field === 'name') setField(id, 'name', t.value);
  else if (field === 'nameEn') setField(id, 'nameEn', t.value);
  else if (field === 'nameFr') setField(id, 'nameFr', t.value);
  else if (field === 'descCn') setField(id, 'descCn', t.value);
  else if (field === 'descEn') setField(id, 'descEn', t.value);
  else if (field === 'descFr') setField(id, 'descFr', t.value);
  else if (field === 'price') setField(id, 'price', Number(t.value) || 0);
});

app.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.target.dataset.field === 'loginEmail' || e.target.dataset.field === 'loginPassword')) login();
});

app.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.role === 'imginput') {
    const file = t.files && t.files[0];
    handleImageFile(t.dataset.id, file);
    return;
  }
  if (t.dataset.role === 'newProductImages') {
    newProductImageFiles = t.files ? Array.from(t.files) : [];
    return;
  }
  if (t.dataset.role === 'addImages') {
    const files = t.files;
    const id = t.dataset.id;
    t.value = '';
    if (files && files.length) handleAddImages(id, files);
    return;
  }
  const field = t.dataset.field;
  if (!field) return;
  if (field === 'newCategory') { state.newCategory = t.value; return; }
  const id = t.dataset.id;
  if (field === 'trackingNumber' && id) {
    setOrderTracking(id, t.value.trim() || null).then(() => {
      const o = state.orders.find((x) => x.id === id);
      if (o) o.tracking_number = t.value.trim() || null;
    }).catch((err) => { console.error(err); alert('更新失败：' + err.message); });
    return;
  }
  if (field === 'category' && id) {
    const cat = CATEGORIES.find((c) => c.key === t.value);
    setField(id, 'category', t.value).then(() => {
      if (cat) {
        setField(id, 'categoryLabel', cat.label);
        setField(id, 'categoryLabelEn', cat.labelEn);
        setField(id, 'categoryLabelFr', cat.labelFr);
      }
      render();
    });
  }
});

app.addEventListener('dragover', (e) => {
  const slot = e.target.closest('[data-role="imgslot"]');
  if (slot) { e.preventDefault(); slot.classList.add('drag-over'); }
});
app.addEventListener('dragleave', (e) => {
  const slot = e.target.closest('[data-role="imgslot"]');
  if (slot) slot.classList.remove('drag-over');
});
app.addEventListener('drop', (e) => {
  const slot = e.target.closest('[data-role="imgslot"]');
  if (!slot || state.uploadingId) return;
  e.preventDefault();
  slot.classList.remove('drag-over');
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  handleImageFile(slot.dataset.id, file);
});

// ---- init ----
init();

async function init() {
  if (!supabaseConfigured) { render(); return; }
  render();
  const { data } = await supabase.auth.getSession();
  state.session = data.session;
  state.authLoading = false;
  if (state.session) await loadAllProducts();
  render();

  supabase.auth.onAuthStateChange((_event, session) => {
    const wasLoggedIn = !!state.session;
    state.session = session;
    render();
    if (session && !wasLoggedIn) loadAllProducts();
  });
}
