import { CATEGORIES, UI_STRINGS } from './products-data.js';
import { loadProducts } from './products-api.js';
import { createOrder } from './orders-api.js';
import { loadPayPalSdk, paypalConfigured } from './paypal.js';
import { submitContactForm, formspreeConfigured } from './formspree.js';
import { supabaseConfigured } from './supabase-client.js';

const app = document.getElementById('app');

const state = {
  page: 'home',
  lang: 'zh',
  products: [],
  loading: true,
  loadError: null,
  cart: [], // { id, size, qty }
  categoryFilter: 'all',
  selectedProductId: null,
  detailSize: 'M',
  detailQty: 1,
  addedToast: false,
  orderPlaced: false,
  lastOrderId: null,
  shipping: { name: '', email: '', address: '', city: '', zip: '', country: '' },
  contact: { name: '', email: '', message: '' },
  contactStatus: null, // 'sending' | 'sent' | 'error'
  mobileNavOpen: false,
};

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function T(key, vars) {
  let s = (UI_STRINGS[key] && UI_STRINGS[key][state.lang]) || '';
  if (vars) Object.keys(vars).forEach((k) => { s = s.replace('{' + k + '}', vars[k]); });
  return s;
}

function fmtPrice(n) {
  return 'CA$' + n.toFixed(2);
}

function goTo(page) {
  state.page = page;
  state.mobileNavOpen = false;
  render();
  window.scrollTo(0, 0);
}

function nameFor(p) { return state.lang === 'zh' ? p.name : state.lang === 'en' ? p.nameEn : p.nameFr; }
function descFor(p) { return state.lang === 'zh' ? p.descCn : state.lang === 'en' ? p.descEn : p.descFr; }
function catLabelFor(p) { return state.lang === 'zh' ? p.categoryLabel : state.lang === 'en' ? p.categoryLabelEn : p.categoryLabelFr; }

const SHIPPING_FLAT = 6;
const FREE_SHIP_THRESHOLD = 80;

function getDerived() {
  const allProducts = state.products.map((p) => ({
    ...p,
    priceLabel: fmtPrice(p.price),
    displayName: nameFor(p),
    displayDesc: descFor(p),
    displayCategoryLabel: catLabelFor(p),
  }));

  const uniqueCategories = [];
  allProducts.forEach((p) => { if (!uniqueCategories.find((c) => c.key === p.category)) uniqueCategories.push({ key: p.category, label: p.displayCategoryLabel }); });

  const categoryFilters = [{ key: 'all', label: T('filterAll') }, ...uniqueCategories];
  const filteredShopProducts = state.categoryFilter === 'all' ? allProducts : allProducts.filter((p) => p.category === state.categoryFilter);

  const featuredProducts = uniqueCategories.map((cat) => allProducts.find((p) => p.category === cat.key)).filter(Boolean).slice(0, 3);
  const categoryCards = uniqueCategories.map((cat) => {
    const rep = allProducts.find((p) => p.category === cat.key);
    return { key: cat.key, label: cat.label, count: allProducts.filter((p) => p.category === cat.key).length, thumb: rep ? rep.img : '' };
  });

  const selectedProduct = allProducts.find((p) => p.id === state.selectedProductId) || null;
  const sameCategoryProducts = selectedProduct ? allProducts.filter((p) => p.category === selectedProduct.category && p.id !== selectedProduct.id).slice(0, 3) : [];

  const cart = state.cart || [];
  const cartLines = cart.map((c, i) => {
    const product = allProducts.find((p) => p.id === c.id);
    return { ...c, product, lineTotalLabel: product ? fmtPrice(product.price * c.qty) : '', index: i };
  }).filter((l) => l.product);
  const subtotalNum = cartLines.reduce((s, l) => s + l.product.price * l.qty, 0);
  const cartCount = cart.reduce((s, c) => s + c.qty, 0);
  const isFreeShip = subtotalNum >= FREE_SHIP_THRESHOLD;
  const shippingNum = isFreeShip ? 0 : SHIPPING_FLAT;
  const shippingLabel = isFreeShip ? T('freeShip') : fmtPrice(SHIPPING_FLAT);
  const totalNum = subtotalNum + shippingNum;
  const totalLabel = fmtPrice(totalNum);

  const teaserReviews = state.lang === 'zh' ? [
    { quote: '甲片贴合度很好，戴了一周边缘都没有翘起，摘下来指甲也完好。', name: '@momo' },
    { quote: '尺码选对了直接能戴，客服回复很快，选款的时候帮我推荐了合适的甲型。', name: '@xiaotu' },
    { quote: '细节比照片看到的还精致，镶嵌的部分很牢固，送人也很拿得出手。', name: '@ruru' },
  ] : state.lang === 'en' ? [
    { quote: 'Great fit — wore it a full week with no lifting, and my natural nails were fine after removal.', name: '@momo' },
    { quote: 'Picked the right size and it just worked. The seller helped me choose the shape too.', name: '@xiaotu' },
    { quote: 'Detail is even nicer in person, and the gems stay firmly in place. Great gift too.', name: '@ruru' },
  ] : [
    { quote: 'Excellent tenue — portés une semaine entière sans décollement, mes ongles naturels intacts.', name: '@momo' },
    { quote: "J'ai choisi la bonne taille et tout s'est bien passé, la vendeuse m'a aidée à choisir la forme.", name: '@xiaotu' },
    { quote: "Les détails sont encore plus beaux en vrai, les pierres tiennent bien. Idéal en cadeau aussi.", name: '@ruru' },
  ];
  const reviewCards = Array.from({ length: 6 }, (_, i) => ({ slotId: 'review-' + i }));

  return {
    allProducts, categoryFilters, filteredShopProducts, featuredProducts, categoryCards,
    selectedProduct, sameCategoryProducts, cartLines, subtotalNum, cartCount, shippingNum, shippingLabel, totalNum, totalLabel, isFreeShip,
    teaserReviews, reviewCards,
  };
}

function imgTile(src, alt) {
  if (!src) return `<div class="img-slot" style="cursor:default;"><div class="img-slot-empty">${T('noImage')}</div></div>`;
  return `<img src="${esc(src)}" alt="${esc(alt)}" style="width:100%;height:100%;object-fit:cover;display:block;" />`;
}

function productCard(p, extraStyle) {
  return `
  <div class="card-lift reveal" data-action="openProduct" data-id="${esc(p.id)}" style="cursor:pointer;display:flex;flex-direction:column;gap:16px;width:100%;${extraStyle || ''}">
    <div class="media-zoom" style="position:relative;width:100%;aspect-ratio:1/1;background:#efe6da;">
      ${imgTile(p.img, p.displayName)}
    </div>
    <div>
      <div style="font-family:'Work Sans',sans-serif;font-size:12px;color:#8a7f72;letter-spacing:0.05em;text-transform:uppercase;">${esc(p.displayCategoryLabel)}</div>
      <div class="card-name" style="font-family:'Cormorant Garamond',serif;font-size:22px;color:#2b2420;margin-top:6px;font-weight:600;">${esc(p.displayName)}</div>
      <div style="font-family:'Work Sans',sans-serif;font-size:16px;color:#2b2420;margin-top:8px;">${esc(p.priceLabel)}</div>
    </div>
  </div>`;
}

function renderHeader(d) {
  const navBase = [
    { key: 'home', label: T('navHome'), page: 'home' },
    { key: 'shop', label: T('navShop'), page: 'shop' },
    { key: 'about', label: T('navAbout'), page: 'about' },
    { key: 'reviews', label: T('navReviews'), page: 'reviews' },
    { key: 'contact', label: T('navContact'), page: 'contact' },
  ];
  const navItems = navBase.map((n) => `<div data-action="goTo" data-page="${n.page}" style="cursor:pointer;font-size:15px;color:${n.page === state.page ? '#c9a27a' : '#2b2420'};font-weight:${n.page === state.page ? 700 : 500};">${esc(n.label)}</div>`).join('');
  const mobileNavItems = navBase.map((n) => `<div class="mobile-nav-item" data-action="goTo" data-page="${n.page}" style="color:${n.page === state.page ? '#c9a27a' : '#2b2420'};font-weight:${n.page === state.page ? 700 : 500};">${esc(n.label)}</div>`).join('');
  const langList = [{ key: 'zh', label: '中' }, { key: 'en', label: 'EN' }, { key: 'fr', label: 'FR' }];
  const langOptions = langList.map((l) => `<div data-action="setLang" data-lang="${l.key}" style="cursor:pointer;font-size:12px;padding:4px 8px;color:${l.key === state.lang ? '#c9a27a' : '#2b2420'};font-weight:${l.key === state.lang ? 700 : 500};border:1px solid ${l.key === state.lang ? '#c9a27a' : '#e3d9cc'};">${l.label}</div>`).join('');

  return `
  <div style="background:#2b2420;color:#f1e9df;text-align:center;padding:10px 16px;font-size:13px;letter-spacing:0.02em;">
    ${T('promoBar', { amt: fmtPrice(FREE_SHIP_THRESHOLD) })}
  </div>
  <div style="position:sticky;top:0;z-index:20;background:#f8f4ef;border-bottom:1px solid #e3d9cc;">
    <div style="max-width:1280px;margin:0 auto;padding:var(--pad-header-v) var(--pad-page);display:flex;align-items:center;justify-content:space-between;gap:16px;">
      <div data-action="goTo" data-page="home" style="cursor:pointer;font-family:'Cormorant Garamond',serif;font-size:26px;font-weight:700;letter-spacing:0.01em;color:#2b2420;white-space:nowrap;">beautychoice</div>
      <div class="nav-desktop" style="gap:36px;">${navItems}</div>
      <div style="display:flex;align-items:center;gap:16px;">
        <div class="lang-switch-desktop" style="gap:6px;">${langOptions}</div>
        <div data-action="goTo" data-page="cart" style="cursor:pointer;position:relative;display:flex;align-items:center;gap:8px;font-size:15px;">
          <span>${T('cart')}</span>
          ${d.cartCount > 0 ? `<span style="background:#c9a27a;color:#231d19;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">${d.cartCount}</span>` : ''}
        </div>
        <button class="hamburger-btn" data-action="toggleMobileNav" aria-label="菜单">${state.mobileNavOpen ? '✕' : '☰'}</button>
      </div>
    </div>
    <div class="mobile-nav-panel${state.mobileNavOpen ? ' open' : ''}">
      ${mobileNavItems}
      <div class="mobile-lang-row">${langOptions}</div>
    </div>
  </div>`;
}

function renderHome(d) {
  const hero = d.allProducts.find((p) => p.id === 'almond-015') || d.allProducts[0];
  const trustItems = [T('trustItem1'), T('trustItem2'), T('trustItem3'), T('trustItem4')];
  return `
  <div>
    <div style="position:relative;width:100%;height:var(--hero-height);overflow:hidden;">
      ${hero && hero.img ? `<img src="${esc(hero.img)}" alt="beautychoice" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 35%;" />` : ''}
      <div style="position:absolute;inset:0;background:linear-gradient(180deg, rgba(20,16,14,0.05) 30%, rgba(20,16,14,0.72) 100%);pointer-events:none;"></div>
      <div style="position:absolute;left:var(--pad-page);right:var(--pad-page);bottom:var(--pad-header-v);max-width:560px;">
        <div style="font-size:12px;letter-spacing:0.14em;color:#e8c9a0;text-transform:uppercase;margin-bottom:14px;">${T('heroEyebrow')}</div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:var(--font-hero);font-weight:700;line-height:1.04;letter-spacing:-0.01em;color:#fdfaf6;">${T('heroTitle1')}<br>${T('heroTitle2')}</div>
        <div style="font-size:17px;color:#f1e9df;margin-top:16px;">${T('heroSubtitle')}</div>
        <button class="btn-primary" data-action="goTo" data-page="shop" style="margin-top:28px;padding:15px 34px;background:#c9a27a;color:#231d19;border:none;font-size:14px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;cursor:pointer;">${T('heroButton')} →</button>
      </div>
    </div>

    <div class="trust-strip">
      <div style="max-width:1280px;margin:0 auto;padding:18px var(--pad-page);display:flex;justify-content:center;flex-wrap:wrap;gap:10px 28px;">
        ${trustItems.map((t) => `<div class="trust-strip-item" style="font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:#8a7f72;">${esc(t)}</div>`).join('<div style="color:#d8cdbd;">·</div>')}
      </div>
    </div>

    <div style="max-width:1280px;margin:0 auto;padding:var(--pad-section-v-lg) var(--pad-page) var(--pad-section-v-md);">
      <div class="reveal" style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:var(--gap-md);flex-wrap:wrap;gap:12px;">
        <div>
          <div style="font-size:13px;color:#8a7f72;letter-spacing:0.08em;text-transform:uppercase;">${T('featuredLabel')}</div>
          <div style="font-family:'Cormorant Garamond',serif;font-size:var(--font-section-title);font-weight:600;margin-top:8px;">${T('featuredTitle')}</div>
        </div>
        <a href="#" data-action="goTo" data-page="shop" style="font-size:14px;">${T('viewAll')}</a>
      </div>
      <div style="display:grid;grid-template-columns:var(--cols-3);gap:var(--gap-lg);">
        ${d.featuredProducts.map((p, i) => productCard(p, `transition-delay:${i * 90}ms;`)).join('')}
      </div>
    </div>

    <div style="background:#efe6da;padding:var(--pad-section-v-lg) var(--pad-page);">
      <div style="max-width:1280px;margin:0 auto;">
        <div class="reveal" style="text-align:center;">
          <div style="font-size:13px;color:#8a7f72;letter-spacing:0.08em;text-transform:uppercase;">${T('categoryLabel')}</div>
          <div style="font-family:'Cormorant Garamond',serif;font-size:var(--font-section-title);font-weight:600;margin-top:8px;">${T('categoryTitle')}</div>
          <div class="title-rule center" style="margin-top:16px;"></div>
        </div>
        <div style="display:grid;grid-template-columns:var(--cols-4);gap:var(--gap-md);margin-top:var(--gap-lg);">
          ${d.categoryCards.map((c, i) => `
            <div class="card-lift reveal" data-action="goCategory" data-cat="${c.key}" style="cursor:pointer;background:#f8f4ef;transition-delay:${i * 90}ms;">
              <div class="media-zoom" style="width:100%;aspect-ratio:1/1;">${imgTile(c.thumb, c.label)}</div>
              <div style="padding:18px;">
                <div class="card-name" style="font-family:'Cormorant Garamond',serif;font-size:19px;font-weight:600;">${esc(c.label)}</div>
                <div style="font-size:13px;color:#8a7f72;margin-top:4px;">${c.count}${T('unitCount')}</div>
              </div>
            </div>`).join('')}
        </div>
      </div>
    </div>

    <div style="max-width:1280px;margin:0 auto;padding:var(--pad-section-v-lg) var(--pad-page);">
      <div class="reveal" style="text-align:center;">
        <div style="font-size:13px;color:#8a7f72;letter-spacing:0.08em;text-transform:uppercase;">${T('reviewsLabel')}</div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:var(--font-section-title);font-weight:600;margin-top:8px;">${T('reviewsTitle')}</div>
        <div class="title-rule center" style="margin-top:16px;"></div>
      </div>
      <div style="display:grid;grid-template-columns:var(--cols-3);gap:var(--gap-lg);margin-top:var(--gap-lg);">
        ${d.teaserReviews.map((r, i) => `
          <div class="reveal" style="background:#fff;border:1px solid #e3d9cc;padding:36px 32px 32px;transition-delay:${i * 90}ms;">
            <span class="quote-mark">"</span>
            <div style="font-size:15px;color:#4a3f37;line-height:1.6;margin-top:4px;">${esc(r.quote)}</div>
            <div style="font-size:13px;color:#c9a27a;margin-top:18px;letter-spacing:0.05em;">★★★★★</div>
            <div style="font-size:13px;color:#8a7f72;margin-top:6px;">${esc(r.name)}</div>
          </div>`).join('')}
      </div>
      <div style="text-align:center;margin-top:40px;">
        <a href="#" data-action="goTo" data-page="reviews" style="font-size:14px;">${T('viewAllReviews')}</a>
      </div>
    </div>
  </div>`;
}

function renderShop(d) {
  return `
  <div style="max-width:1280px;margin:0 auto;padding:var(--pad-section-v-md) var(--pad-page) var(--pad-section-v-lg);">
    <div style="font-family:'Cormorant Garamond',serif;font-size:var(--font-page-title);font-weight:600;">${T('shopTitle')}</div>
    <div style="display:flex;gap:20px;margin-top:32px;border-bottom:1px solid #e3d9cc;padding-bottom:20px;flex-wrap:wrap;">
      ${d.categoryFilters.map((f) => `<div data-action="setCategoryFilter" data-cat="${f.key}" style="cursor:pointer;font-size:14px;color:${f.key === state.categoryFilter ? '#c9a27a' : '#2b2420'};font-weight:${f.key === state.categoryFilter ? 700 : 500};white-space:nowrap;">${esc(f.label)}</div>`).join('')}
    </div>
    <div style="display:grid;grid-template-columns:var(--cols-3);gap:var(--gap-lg);margin-top:var(--gap-lg);">
      ${d.filteredShopProducts.map(productCard).join('')}
    </div>
  </div>`;
}

function renderProduct(d) {
  const p = d.selectedProduct;
  if (!p) {
    return `<div style="max-width:1280px;margin:0 auto;padding:var(--pad-section-v-md) var(--pad-page) var(--pad-section-v-lg);">
      <a href="#" data-action="goTo" data-page="shop">${T('breadcrumbHome')}</a>
    </div>`;
  }
  const sizeOptions = ['XS', 'S', 'M', 'L'].map((sz) => `
    <div data-action="setSize" data-size="${sz}" style="cursor:pointer;width:48px;height:48px;display:flex;align-items:center;justify-content:center;border:1px solid ${sz === state.detailSize ? '#c9a27a' : '#e3d9cc'};background:${sz === state.detailSize ? '#c9a27a' : '#fff'};color:${sz === state.detailSize ? '#231d19' : '#2b2420'};font-size:14px;font-weight:600;">${sz}</div>`).join('');

  return `
  <div style="max-width:1280px;margin:0 auto;padding:var(--pad-section-v-md) var(--pad-page) var(--pad-section-v-lg);">
    <div style="font-size:13px;color:#8a7f72;">
      <a href="#" data-action="goTo" data-page="home">${T('breadcrumbHome')}</a> / <a href="#" data-action="goTo" data-page="shop">${T('shopTitle')}</a> / ${esc(p.displayName)}
    </div>
    <div style="display:grid;grid-template-columns:var(--two-col);gap:var(--gap-xl);margin-top:32px;">
      <div style="width:100%;aspect-ratio:1/1;overflow:hidden;">${imgTile(p.img, p.displayName)}</div>
      <div>
        <div style="font-size:13px;color:#8a7f72;letter-spacing:0.05em;text-transform:uppercase;">${esc(p.displayCategoryLabel)}</div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:var(--font-page-title);font-weight:600;margin-top:10px;">${esc(p.displayName)}</div>
        <div style="font-size:22px;margin-top:14px;">${p.priceLabel}</div>
        <div style="font-size:15px;line-height:1.7;color:#4a3f37;margin-top:24px;">${esc(p.displayDesc)}</div>

        <div style="margin-top:32px;">
          <div style="font-size:13px;color:#8a7f72;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:12px;">${T('selectSize')}</div>
          <div style="display:flex;gap:12px;">${sizeOptions}</div>
        </div>

        <div style="margin-top:28px;display:flex;align-items:center;gap:20px;">
          <div style="display:flex;align-items:center;border:1px solid #e3d9cc;">
            <button data-action="decQty" style="width:40px;height:40px;border:none;background:none;font-size:18px;cursor:pointer;">−</button>
            <div style="width:40px;text-align:center;font-size:15px;">${state.detailQty}</div>
            <button data-action="incQty" style="width:40px;height:40px;border:none;background:none;font-size:18px;cursor:pointer;">+</button>
          </div>
          <button data-action="addToCart" style="flex:1;padding:16px 0;background:#2b2420;color:#f8f4ef;border:none;font-size:15px;font-weight:600;letter-spacing:0.02em;cursor:pointer;">${T('addToCart')}</button>
        </div>
        ${state.addedToast ? `<div style="margin-top:14px;font-size:13px;color:#6b8f6f;">${T('addedToast')}</div>` : ''}

        <div style="margin-top:40px;border-top:1px solid #e3d9cc;padding-top:28px;">
          <div style="font-size:13px;color:#8a7f72;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:12px;">${T('careLabel')}</div>
          <div style="font-size:14px;line-height:1.8;color:#4a3f37;">${T('careText')}</div>
        </div>
      </div>
    </div>

    <div style="margin-top:var(--pad-section-v-lg);">
      <div style="font-family:'Cormorant Garamond',serif;font-size:26px;font-weight:600;margin-bottom:var(--gap-md);">${T('sameCategoryTitle')}</div>
      <div style="display:grid;grid-template-columns:var(--cols-3);gap:var(--gap-lg);">
        ${d.sameCategoryProducts.map(productCard).join('')}
      </div>
    </div>
  </div>`;
}

function renderCart(d) {
  if (d.cartCount === 0) {
    return `
    <div style="max-width:1280px;margin:0 auto;padding:var(--pad-section-v-md) var(--pad-page) var(--pad-section-v-lg);">
      <div style="font-family:'Cormorant Garamond',serif;font-size:var(--font-page-title);font-weight:600;">${T('cartTitle')}</div>
      <div style="text-align:center;padding:96px 0;">
        <div style="font-size:16px;color:#8a7f72;">${T('emptyCart')}</div>
        <button data-action="goTo" data-page="shop" style="margin-top:24px;padding:14px 32px;background:#c9a27a;color:#231d19;border:none;font-size:15px;font-weight:600;cursor:pointer;">${T('goShopBtn')}</button>
      </div>
    </div>`;
  }
  return `
  <div style="max-width:1280px;margin:0 auto;padding:var(--pad-section-v-md) var(--pad-page) var(--pad-section-v-lg);">
    <div style="font-family:'Cormorant Garamond',serif;font-size:var(--font-page-title);font-weight:600;">${T('cartTitle')}</div>
    <div style="display:grid;grid-template-columns:var(--cart-col);gap:var(--gap-xl);margin-top:40px;">
      <div>
        ${d.cartLines.map((l) => `
          <div style="display:flex;gap:20px;align-items:center;padding:24px 0;border-bottom:1px solid #e3d9cc;flex-wrap:wrap;">
            <div class="cart-line-img" style="overflow:hidden;">${imgTile(l.product.img, l.product.displayName)}</div>
            <div style="flex:1;min-width:160px;">
              <div style="font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:600;">${esc(l.product.displayName)}</div>
              <div style="font-size:13px;color:#8a7f72;margin-top:6px;">${esc(l.product.displayCategoryLabel)} · ${esc(l.size)}</div>
              <div style="margin-top:14px;display:flex;align-items:center;gap:16px;">
                <div style="display:flex;align-items:center;border:1px solid #e3d9cc;">
                  <button data-action="cartDec" data-index="${l.index}" style="width:32px;height:32px;border:none;background:none;font-size:15px;cursor:pointer;">−</button>
                  <div style="width:32px;text-align:center;font-size:14px;">${l.qty}</div>
                  <button data-action="cartInc" data-index="${l.index}" style="width:32px;height:32px;border:none;background:none;font-size:15px;cursor:pointer;">+</button>
                </div>
                <a href="#" data-action="cartRemove" data-index="${l.index}" style="font-size:13px;color:#8a7f72;">×</a>
              </div>
            </div>
            <div style="font-size:16px;">${l.lineTotalLabel}</div>
          </div>`).join('')}
      </div>
      <div style="background:#efe6da;padding:32px;align-self:start;">
        <div style="display:flex;justify-content:space-between;font-size:15px;">
          <span>${T('subtotal')}</span><span>${fmtPrice(d.subtotalNum)}</span>
        </div>
        <div style="font-size:13px;color:#8a7f72;margin-top:12px;">${T('shippingNote')}</div>
        <button data-action="goTo" data-page="checkout" style="width:100%;margin-top:24px;padding:16px 0;background:#2b2420;color:#f8f4ef;border:none;font-size:15px;font-weight:600;cursor:pointer;">${T('goCheckout')}</button>
      </div>
    </div>
  </div>`;
}

function renderCheckout(d) {
  if (state.orderPlaced) {
    return `
    <div style="max-width:1280px;margin:0 auto;padding:var(--pad-section-v-md) var(--pad-page) var(--pad-section-v-lg);">
      <div style="text-align:center;padding:96px 0;">
        <div style="font-family:'Cormorant Garamond',serif;font-size:34px;font-weight:600;">${T('orderPlacedTitle')}</div>
        <div style="font-size:15px;color:#4a3f37;margin-top:16px;">${T('orderPlacedText')}</div>
        ${state.lastOrderId ? `<div style="font-size:13px;color:#8a7f72;margin-top:12px;">${T('orderRefLabel')} #${esc(String(state.lastOrderId).slice(0, 8))}</div>` : ''}
        <button data-action="goTo" data-page="shop" style="margin-top:28px;padding:14px 32px;background:#c9a27a;color:#231d19;border:none;font-size:15px;font-weight:600;cursor:pointer;">${T('continueShopping')}</button>
      </div>
    </div>`;
  }
  if (d.cartCount === 0) {
    return `
    <div style="max-width:1280px;margin:0 auto;padding:var(--pad-section-v-md) var(--pad-page) var(--pad-section-v-lg);">
      <div style="text-align:center;padding:96px 0;">
        <div style="font-size:16px;color:#8a7f72;">${T('emptyCart')}</div>
        <button data-action="goTo" data-page="shop" style="margin-top:24px;padding:14px 32px;background:#c9a27a;color:#231d19;border:none;font-size:15px;font-weight:600;cursor:pointer;">${T('goShopBtn')}</button>
      </div>
    </div>`;
  }
  const s = state.shipping;
  const wideSpan = 'var(--field-span-wide)';
  const fields = [
    ['name', 'fieldName', wideSpan], ['email', 'fieldEmail', wideSpan], ['address', 'fieldAddress', wideSpan],
    ['city', 'fieldCity', 1], ['zip', 'fieldZip', 1], ['country', 'fieldCountry', wideSpan],
  ];
  return `
  <div style="max-width:1280px;margin:0 auto;padding:var(--pad-section-v-md) var(--pad-page) var(--pad-section-v-lg);">
    <div style="font-family:'Cormorant Garamond',serif;font-size:var(--font-page-title);font-weight:600;">${T('checkoutTitle')}</div>
    <div style="display:grid;grid-template-columns:var(--checkout-col);gap:var(--gap-xl);margin-top:40px;">
      <div>
        <div style="font-size:13px;color:#8a7f72;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:16px;">${T('shippingInfoLabel')}</div>
        <div style="display:grid;grid-template-columns:var(--form-cols);gap:16px;">
          ${fields.map(([f, labelKey, span]) => `<input data-field="${f}" value="${esc(s[f])}" placeholder="${T(labelKey)}" style="grid-column:span ${span};padding:14px;border:1px solid #e3d9cc;background:#fff;font-size:14px;font-family:'Work Sans',sans-serif;" />`).join('')}
        </div>

        <div style="font-size:13px;color:#8a7f72;letter-spacing:0.05em;text-transform:uppercase;margin:32px 0 16px;">${T('paymentLabel')}</div>
        <div style="font-size:13px;color:#8a7f72;margin-bottom:16px;">${T('paypalHint')}</div>
        ${paypalConfigured
          ? `<div id="paypal-button-container" style="max-width:420px;"></div>`
          : `<div style="padding:16px;background:#f3e6d9;color:#8a4a3f;font-size:13px;">${T('paypalNotConfigured')}</div>`}
      </div>

      <div style="background:#efe6da;padding:32px;align-self:start;">
        <div style="font-size:13px;color:#8a7f72;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:16px;">${T('orderSummary')}</div>
        ${d.cartLines.map((l) => `
          <div style="display:flex;justify-content:space-between;font-size:14px;padding:8px 0;">
            <span>${esc(l.product.displayName)} × ${l.qty}</span><span>${l.lineTotalLabel}</span>
          </div>`).join('')}
        <div style="border-top:1px solid #d8cdbd;margin-top:16px;padding-top:16px;display:flex;justify-content:space-between;font-size:14px;">
          <span>${T('subtotal')}</span><span>${fmtPrice(d.subtotalNum)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:14px;margin-top:8px;">
          <span>${T('shippingLabelWord')}</span><span>${d.shippingLabel}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:18px;margin-top:16px;font-weight:600;">
          <span>${T('totalLabel')}</span><span>${d.totalLabel}</span>
        </div>
      </div>
    </div>
  </div>`;
}

function renderAbout() {
  return `
  <div style="max-width:1280px;margin:0 auto;padding:var(--pad-section-v-md) var(--pad-page) var(--pad-section-v-lg);">
    <div style="display:grid;grid-template-columns:var(--two-col-even);gap:var(--gap-xl);align-items:center;">
      <div style="width:100%;aspect-ratio:4/5;overflow:hidden;background:#efe6da;">
        <svg viewBox="0 0 400 500" style="width:100%;height:100%;display:block;">
          <rect width="400" height="500" fill="#efe6da"/>
          <circle cx="200" cy="150" r="90" fill="#e3d4c2" opacity="0.6"/>
          <ellipse cx="150" cy="430" rx="150" ry="18" fill="#dccab3" opacity="0.5"/>
          <g>
            <rect x="90" y="230" width="70" height="150" rx="35" fill="#8a6a49"/>
            <circle cx="125" cy="205" r="38" fill="#e0b592"/>
            <path d="M87 195 Q125 150 163 195 L163 230 Q125 210 87 230 Z" fill="#2b2420"/>
          </g>
          <g>
            <rect x="180" y="200" width="80" height="180" rx="38" fill="#2b2420"/>
            <circle cx="220" cy="172" r="42" fill="#c98f63"/>
            <path d="M176 165 Q220 110 264 165 L264 205 Q220 180 176 205 Z" fill="#4a3020"/>
          </g>
          <g>
            <ellipse cx="300" cy="400" rx="55" ry="38" fill="#c9a27a"/>
            <circle cx="335" cy="365" r="30" fill="#c9a27a"/>
            <ellipse cx="352" cy="358" rx="10" ry="14" fill="#b3875f" transform="rotate(20 352 358)"/>
            <ellipse cx="325" cy="352" rx="9" ry="13" fill="#b3875f" transform="rotate(-15 325 352)"/>
            <circle cx="345" cy="360" r="3" fill="#2b2420"/>
            <ellipse cx="352" cy="372" rx="6" ry="4" fill="#4a3020"/>
            <rect x="325" y="380" width="8" height="30" rx="4" fill="#c9a27a"/>
            <rect x="345" y="380" width="8" height="30" rx="4" fill="#c9a27a"/>
            <circle cx="330" cy="352" r="4" fill="#c9a27a"/>
            <path d="M330 340 Q328 330 335 332" stroke="#c9a27a" stroke-width="4" fill="none" stroke-linecap="round"/>
          </g>
          <text x="200" y="470" text-anchor="middle" font-family="Georgia, serif" font-size="17" fill="#8a7f72" font-style="italic">Two women. One dog.</text>
        </svg>
      </div>
      <div>
        <div style="font-size:13px;color:#8a7f72;letter-spacing:0.08em;text-transform:uppercase;">${T('aboutLabel')}</div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:36px;font-weight:600;margin-top:12px;">${T('aboutTitle')}</div>
        <div style="font-size:15px;line-height:1.8;color:#4a3f37;margin-top:24px;">${T('aboutText1')}</div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:20px;font-style:italic;color:#2b2420;margin-top:20px;">${T('aboutText2')}</div>
        <div style="font-size:13px;color:#8a7f72;letter-spacing:0.05em;text-transform:uppercase;margin-top:24px;">${T('aboutNote')}</div>
      </div>
    </div>
  </div>`;
}

function renderContact() {
  const c = state.contact;
  const sending = state.contactStatus === 'sending';
  return `
  <div style="max-width:1280px;margin:0 auto;padding:var(--pad-section-v-md) var(--pad-page) var(--pad-section-v-lg);">
    <div style="font-family:'Cormorant Garamond',serif;font-size:var(--font-page-title);font-weight:600;">${T('contactTitle')}</div>
    <div style="display:grid;grid-template-columns:var(--two-col-even);gap:var(--gap-xl);margin-top:40px;">
      <div>
        <div style="font-size:13px;color:#8a7f72;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:16px;">${T('directContact')}</div>
        <div style="font-size:15px;line-height:2;color:#4a3f37;">
          ${T('emailValue')}<br>
          ${T('replyTime')}
        </div>
        <div style="font-size:13px;color:#8a7f72;letter-spacing:0.05em;text-transform:uppercase;margin:32px 0 16px;">${T('socialLabel')}</div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;">
          <div style="padding:12px 20px;border:1px solid #e3d9cc;font-size:14px;">Instagram · @beautychoice</div>
          <div style="padding:12px 20px;border:1px solid #e3d9cc;font-size:14px;">小红书 · beautychoice</div>
          <div style="padding:12px 20px;border:1px solid #e3d9cc;font-size:14px;">TikTok · @beautychoice</div>
        </div>
      </div>
      <div>
        <div style="font-size:13px;color:#8a7f72;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:16px;">${T('messageLabel')}</div>
        <div style="display:flex;flex-direction:column;gap:16px;">
          <input data-field="contactName" value="${esc(c.name)}" placeholder="${T('fieldName')}" style="padding:14px;border:1px solid #e3d9cc;background:#fff;font-size:14px;font-family:'Work Sans',sans-serif;" />
          <input data-field="contactEmail" value="${esc(c.email)}" placeholder="${T('fieldEmail')}" style="padding:14px;border:1px solid #e3d9cc;background:#fff;font-size:14px;font-family:'Work Sans',sans-serif;" />
          <textarea data-field="contactMessage" placeholder="${T('fieldQuestion')}" rows="5" style="padding:14px;border:1px solid #e3d9cc;background:#fff;font-size:14px;font-family:'Work Sans',sans-serif;resize:vertical;">${esc(c.message)}</textarea>
          <button data-action="sendMessage" ${sending ? 'disabled' : ''} style="padding:15px 0;background:#2b2420;color:#f8f4ef;border:none;font-size:15px;font-weight:600;cursor:pointer;opacity:${sending ? 0.6 : 1};">${T('sendMessage')}</button>
          ${state.contactStatus === 'sent' ? `<div style="font-size:13px;color:#6b8f6f;">${T('messageSent')}</div>` : ''}
          ${state.contactStatus === 'error' ? `<div style="font-size:13px;color:#8a4a3f;">${T('messageFailed')}</div>` : ''}
          ${!formspreeConfigured ? `<div style="font-size:12px;color:#a89685;">Formspree 未配置（VITE_FORMSPREE_FORM_ID），留言暂时无法真正发送。</div>` : ''}
        </div>
      </div>
    </div>
  </div>`;
}

function renderReviews(d) {
  return `
  <div style="max-width:1280px;margin:0 auto;padding:var(--pad-section-v-md) var(--pad-page) var(--pad-section-v-lg);">
    <div style="font-family:'Cormorant Garamond',serif;font-size:var(--font-page-title);font-weight:600;">${T('reviewsTitle')}</div>
    <div style="font-size:14px;color:#c9a27a;margin-top:12px;">${T('reviewsPlaceholder')}</div>
    <div style="display:grid;grid-template-columns:var(--cols-3);gap:var(--gap-lg);margin-top:40px;">
      ${d.reviewCards.map(() => `
        <div style="background:#efe6da;">
          <div style="width:100%;aspect-ratio:1/1;overflow:hidden;"><div class="img-slot" style="cursor:default;"><div class="img-slot-empty">客户晒单照片</div></div></div>
          <div style="padding:24px;">
            <div style="font-size:14px;color:#c9a27a;">★★★★★</div>
            <div style="font-size:14px;line-height:1.7;color:#4a3f37;margin-top:12px;">在此处替换为真实客户评价文字</div>
            <div style="font-size:13px;color:#8a7f72;margin-top:14px;">客户昵称</div>
          </div>
        </div>`).join('')}
    </div>
  </div>`;
}

function renderFooter() {
  return `
  <div style="background:#2b2420;color:#d8cdbd;padding:var(--pad-section-v-md) var(--pad-page) 40px;">
    <div style="max-width:1280px;margin:0 auto;display:grid;grid-template-columns:var(--footer-col);gap:var(--gap-lg);">
      <div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:700;color:#f1e9df;">beautychoice</div>
        <div style="font-size:14px;margin-top:12px;line-height:1.7;">${T('footerTagline')}<br>${T('footerTagline2')}</div>
      </div>
      <div>
        <div style="font-size:13px;color:#8a7f72;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:16px;">${T('footerNav')}</div>
        <div style="display:flex;flex-direction:column;gap:10px;font-size:14px;">
          <a href="#" data-action="goTo" data-page="home" style="color:#d8cdbd;">${T('navHome')}</a>
          <a href="#" data-action="goTo" data-page="shop" style="color:#d8cdbd;">${T('navShop')}</a>
          <a href="#" data-action="goTo" data-page="about" style="color:#d8cdbd;">${T('navAbout')}</a>
          <a href="#" data-action="goTo" data-page="reviews" style="color:#d8cdbd;">${T('navReviews')}</a>
          <a href="#" data-action="goTo" data-page="contact" style="color:#d8cdbd;">${T('navContact')}</a>
        </div>
      </div>
      <div>
        <div style="font-size:13px;color:#8a7f72;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:16px;">${T('footerPayment')}</div>
        <div style="font-size:14px;">${T('footerPaymentValue')}</div>
      </div>
    </div>
    <div style="max-width:1280px;margin:40px auto 0;border-top:1px solid #4a4038;padding-top:24px;font-size:12px;color:#8a7f72;">
      ${T('footerCopyright')}
    </div>
  </div>`;
}

function renderShell(inner) {
  app.innerHTML = `<div style="font-family:'Work Sans',sans-serif;background:#f8f4ef;min-height:100vh;color:#2b2420;display:flex;align-items:center;justify-content:center;">${inner}</div>`;
}

function render() {
  if (!supabaseConfigured) {
    renderShell(`<div style="text-align:center;padding:48px;font-size:14px;color:#8a4a3f;max-width:480px;">数据库未配置（VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY），网站暂时无法加载商品数据。见 .env.example。</div>`);
    return;
  }
  if (state.loading) {
    renderShell(`<div style="font-size:14px;color:#8a7f72;">${T('loading')}</div>`);
    return;
  }
  if (state.loadError) {
    renderShell(`<div style="text-align:center;padding:48px;font-size:14px;color:#8a4a3f;">${T('loadError')}</div>`);
    return;
  }

  const d = getDerived();
  const pageHtml = {
    home: renderHome, shop: renderShop, product: renderProduct, cart: renderCart,
    checkout: renderCheckout, about: renderAbout, contact: renderContact, reviews: renderReviews,
  }[state.page](d);

  app.innerHTML = `
    <div style="font-family:'Work Sans',sans-serif;background:#f8f4ef;min-height:100vh;color:#2b2420;">
      ${renderHeader(d)}
      ${pageHtml}
      ${renderFooter()}
    </div>`;

  if (state.page === 'checkout' && !state.orderPlaced && d.cartCount > 0 && paypalConfigured) {
    mountPayPalButtons(d);
  }
  mountScrollReveal();
}

// ---- scroll reveal ----
let revealObserver = null;
function mountScrollReveal() {
  const els = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('reveal-visible'));
    return;
  }
  if (revealObserver) revealObserver.disconnect();
  revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('reveal-visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
  els.forEach((el) => revealObserver.observe(el));
}

// ---- PayPal ----
function mountPayPalButtons() {
  const container = document.getElementById('paypal-button-container');
  if (!container) return;
  loadPayPalSdk().then((paypal) => {
    const el = document.getElementById('paypal-button-container');
    if (!el) return; // page navigated away before SDK finished loading
    paypal.Buttons({
      style: { layout: 'vertical', color: 'black', shape: 'rect', label: 'paypal' },
      onClick: (data, actions) => {
        const s = state.shipping;
        const required = ['name', 'email', 'address', 'city', 'zip', 'country'];
        const missing = required.some((f) => !s[f] || !String(s[f]).trim());
        if (missing) {
          alert(T('shippingRequiredAlert'));
          return actions.reject();
        }
        return actions.resolve();
      },
      createOrder: (data, actions) => {
        const fresh = getDerived();
        return actions.order.create({
          purchase_units: [{ amount: { value: fresh.totalNum.toFixed(2), currency_code: 'CAD' } }],
        });
      },
      onApprove: async (data, actions) => {
        await actions.order.capture();
        const fresh = getDerived();
        try {
          const orderRecord = await createOrder({
            paypalOrderId: data.orderID,
            name: state.shipping.name,
            email: state.shipping.email,
            address: state.shipping.address,
            city: state.shipping.city,
            zip: state.shipping.zip,
            country: state.shipping.country,
            items: fresh.cartLines.map((l) => ({ id: l.product.id, name: l.product.displayName, size: l.size, qty: l.qty, price: l.product.price })),
            subtotal: fresh.subtotalNum,
            shipping: fresh.shippingNum,
            total: fresh.totalNum,
          });
          state.lastOrderId = orderRecord.id;
        } catch (e) {
          console.error('Payment succeeded but failed to record order in Supabase:', e);
        }
        state.orderPlaced = true;
        state.cart = [];
        render();
      },
      onError: (err) => {
        console.error('PayPal error:', err);
        alert(T('paymentError'));
      },
    }).render('#paypal-button-container');
  }).catch((e) => {
    console.error('Failed to load PayPal SDK:', e);
  });
}

// ---- actions ----
function openProduct(id) {
  state.page = 'product';
  state.selectedProductId = id;
  state.detailSize = 'M';
  state.detailQty = 1;
  state.addedToast = false;
  state.mobileNavOpen = false;
  render();
  window.scrollTo(0, 0);
}

function goCategory(cat) {
  state.categoryFilter = cat;
  state.page = 'shop';
  state.mobileNavOpen = false;
  render();
  window.scrollTo(0, 0);
}

let toastTimer = null;
function addToCart() {
  const product = state.products.find((p) => p.id === state.selectedProductId);
  if (!product) return;
  const size = state.detailSize;
  const qty = state.detailQty;
  const idx = state.cart.findIndex((c) => c.id === product.id && c.size === size);
  if (idx >= 0) state.cart[idx].qty += qty;
  else state.cart.push({ id: product.id, size, qty });
  state.orderPlaced = false;
  state.addedToast = true;
  render();
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { state.addedToast = false; render(); }, 1800);
}

async function sendMessage() {
  const c = state.contact;
  if (!c.name.trim() || !c.email.trim() || !c.message.trim()) return;
  state.contactStatus = 'sending';
  render();
  try {
    await submitContactForm(c);
    state.contactStatus = 'sent';
    state.contact = { name: '', email: '', message: '' };
  } catch (e) {
    console.error('Failed to submit contact form:', e);
    state.contactStatus = 'error';
  }
  render();
}

app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  if (el.tagName === 'A') e.preventDefault();
  switch (action) {
    case 'goTo': goTo(el.dataset.page); break;
    case 'openProduct': openProduct(el.dataset.id); break;
    case 'goCategory': goCategory(el.dataset.cat); break;
    case 'setLang': state.lang = el.dataset.lang; render(); break;
    case 'toggleMobileNav': state.mobileNavOpen = !state.mobileNavOpen; render(); break;
    case 'setCategoryFilter': state.categoryFilter = el.dataset.cat; render(); break;
    case 'setSize': state.detailSize = el.dataset.size; render(); break;
    case 'incQty': state.detailQty += 1; render(); break;
    case 'decQty': state.detailQty = Math.max(1, state.detailQty - 1); render(); break;
    case 'addToCart': addToCart(); break;
    case 'cartInc': { const i = Number(el.dataset.index); state.cart[i].qty += 1; render(); break; }
    case 'cartDec': { const i = Number(el.dataset.index); state.cart[i].qty = Math.max(1, state.cart[i].qty - 1); render(); break; }
    case 'cartRemove': { const i = Number(el.dataset.index); state.cart.splice(i, 1); render(); break; }
    case 'sendMessage': sendMessage(); break;
  }
});

app.addEventListener('input', (e) => {
  const field = e.target.dataset.field;
  if (!field) return;
  if (field === 'contactName') state.contact.name = e.target.value;
  else if (field === 'contactEmail') state.contact.email = e.target.value;
  else if (field === 'contactMessage') state.contact.message = e.target.value;
  else state.shipping[field] = e.target.value;
});

init();

async function init() {
  if (!supabaseConfigured) { render(); return; }
  render();
  try {
    state.products = await loadProducts();
    state.loading = false;
  } catch (e) {
    console.error('Failed to load products:', e);
    state.loading = false;
    state.loadError = e;
  }
  render();
}
