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
  newCategory: CATEGORIES[0].key,
  newPrice: 25,
  uploadingId: null,

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
    nameEn: '', nameFr: '',
    price: Number(state.newPrice) || 0,
    img: null,
    descCn: '', descEn: '', descFr: '',
  };
  try {
    const created = await addProduct(product);
    state.products.push(created);
    state.showAddForm = false;
    state.newName = '';
    state.newPrice = 25;
    render();
  } catch (e) {
    console.error('Failed to add product:', e);
    alert('添加失败：' + e.message);
  }
}

async function handleImageFile(id, file) {
  if (!file || !file.type.startsWith('image/')) return;
  state.uploadingId = id;
  render();
  try {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `${id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('product-images').upload(path, file, { upsert: true, cacheControl: '3600' });
    if (upErr) throw upErr;
    const { data } = supabase.storage.from('product-images').getPublicUrl(path);
    const updated = await updateProduct(id, { img: data.publicUrl });
    const idx = state.products.findIndex((p) => p.id === id);
    if (idx >= 0) state.products[idx] = updated;
  } catch (e) {
    console.error('Failed to upload image:', e);
    alert('图片上传失败：' + e.message);
  }
  state.uploadingId = null;
  render();
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
      <div style="margin-top:24px;font-size:12px;color:#a89685;">管理员账号需要在 Supabase 控制台的 Authentication 面板手动创建。</div>
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

  const rows = filtered.map((p) => `
    <div class="admin-row-min" style="display:grid;grid-template-columns:64px 2fr 1.4fr 1fr 80px;gap:16px;padding:14px 0;border-bottom:1px solid #ece3d6;align-items:center;">
      <div style="width:56px;height:56px;overflow:hidden;background:#efe6da;">${imgCell(p)}</div>
      <div>
        <input data-field="name" data-id="${esc(p.id)}" value="${esc(p.name)}" style="width:100%;padding:8px 10px;border:1px solid #e3d9cc;background:#fff;font-size:14px;font-family:'Work Sans',sans-serif;box-sizing:border-box;" />
        <div style="font-size:11px;color:#a89685;margin-top:4px;padding-left:2px;">${esc(p.nameEn)} · ${esc(p.nameFr)}</div>
      </div>
      <select data-field="category" data-id="${esc(p.id)}" style="padding:10px;border:1px solid #e3d9cc;background:#fff;font-size:13px;font-family:'Work Sans',sans-serif;">
        ${CATEGORIES.map((c) => `<option value="${c.key}" ${c.key === p.category ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}
      </select>
      <div style="display:flex;align-items:center;gap:4px;">
        <span style="font-size:13px;color:#8a7f72;">CA$</span>
        <input type="number" data-field="price" data-id="${esc(p.id)}" value="${p.price}" style="width:70px;padding:10px;border:1px solid #e3d9cc;background:#fff;font-size:14px;font-family:'Work Sans',sans-serif;" />
      </div>
      <button data-action="deleteRow" data-id="${esc(p.id)}" style="padding:8px 14px;background:none;border:1px solid #e3d9cc;font-size:13px;color:#8a4a3f;cursor:pointer;">删除</button>
    </div>`).join('');

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
          <div style="font-size:12px;color:#8a7f72;margin-bottom:6px;">名称</div>
          <input data-field="newName" value="${esc(state.newName)}" placeholder="例如：珊瑚渐变 No.01" style="width:100%;padding:12px;border:1px solid #d8cdbd;background:#fff;font-size:14px;font-family:'Work Sans',sans-serif;box-sizing:border-box;" />
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
      </div>
      <div style="margin-top:20px;display:flex;gap:12px;">
        <button data-action="submitNewProduct" style="padding:12px 26px;background:#c9a27a;color:#231d19;border:none;font-size:14px;font-weight:600;cursor:pointer;">添加商品</button>
        <button data-action="toggleAddForm" style="padding:12px 26px;background:none;border:1px solid #d8cdbd;font-size:14px;cursor:pointer;">取消</button>
      </div>
      <div style="font-size:12px;color:#8a7f72;margin-top:14px;">添加后可在下方列表的图片格里直接拖拽上传商品实拍图。</div>
    </div>` : ''}

    <div style="display:flex;gap:20px;margin-top:32px;border-bottom:1px solid #e3d9cc;padding-bottom:16px;flex-wrap:wrap;">${filterTabs}</div>

    <div class="admin-table-scroll" style="margin-top:8px;">
      <div class="admin-row-min" style="display:grid;grid-template-columns:64px 2fr 1.4fr 1fr 80px;gap:16px;padding:14px 0;border-bottom:1px solid #e3d9cc;font-size:12px;color:#8a7f72;letter-spacing:0.05em;text-transform:uppercase;">
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
  if (field === 'newPrice') { state.newPrice = t.value; return; }
  const id = t.dataset.id;
  if (!id) return;
  if (field === 'name') setField(id, 'name', t.value);
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
