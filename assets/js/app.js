/**
 * ============================================================
 *  app.js — منطق صفحة الزبائن (المعرض العام)
 * ============================================================
 *  • جلب المنتجات وعرضها في شبكة متجاوبة (الصورة + الاسم + الكود)
 *  • فلترة (تصنيف/موسم) + بحث عربي ذكي + ترتيب
 *  • حفظ حالة الفلاتر في الرابط (#cat=men&season=winter) لمشاركتها
 *  • نافذة تفاصيل المنتج بمعرض صور قابل للسحب
 */
import { storeConfig } from './firebase-config.js';
import { listProducts, mode } from './store.js';
import {
  CATEGORIES, SEASONS, escapeHtml as e, formatNumber,
  normalizeArabic, debounce, isNew, optimizeImg, $, $$,
} from './utils.js';

/* ---------------- الحالة (State) ---------------- */
const state = {
  products: [],
  byId: new Map(),
  cat: 'all',
  season: 'all',
  q: '',
  sort: 'new',
};

/* ---------------- أيقونات ---------------- */
const ICON = {
  close: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  images: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" width="12" height="12"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></svg>',
};

/* =========================================================
 *  التهيئة
 * ========================================================= */
init();

async function init() {
  fillStoreInfo();
  renderSkeleton();
  readHash();
  bindEvents();
  await loadProducts();
  if (mode === 'demo') console.info('%c[Demo Mode] أضف إعدادات Firebase في firebase-config.js للربط بقاعدة البيانات الحقيقية', 'color:#9a3f1f;font-weight:bold');
}

function fillStoreInfo() {
  $$('[data-store-name]').forEach((el) => (el.textContent = storeConfig.name));
  $$('[data-store-tagline]').forEach((el) => (el.textContent = storeConfig.tagline));
  $$('[data-store-address]').forEach((el) => (el.textContent = storeConfig.address));
  $('#year').textContent = new Date().getFullYear();
  document.title = `${storeConfig.name} | ${storeConfig.tagline}`;
}

async function loadProducts() {
  $('#errorState').classList.add('hidden');
  $('#grid').setAttribute('aria-busy', 'true');
  try {
    state.products = await listProducts();
    state.byId = new Map(state.products.map((p) => [p.id, p]));
    $('#statCount').textContent = formatNumber(state.products.length);
    render();
    openFromHash();
  } catch (err) {
    console.error(err);
    $('#grid').innerHTML = '';
    $('#resultsInfo').textContent = '';
    $('#errorState').classList.remove('hidden');
  } finally {
    $('#grid').setAttribute('aria-busy', 'false');
  }
}

/* =========================================================
 *  الفلترة والعرض
 * ========================================================= */
function getFiltered() {
  const terms = normalizeArabic(state.q).split(/\s+/).filter(Boolean);
  const list = state.products.filter((p) => {
    if (state.cat !== 'all' && p.category !== state.cat) return false;
    // المنتجات "كل المواسم" تظهر مع الصيفي والشتوي
    if (state.season !== 'all' && p.season !== state.season && p.season !== 'all') return false;
    if (!terms.length) return true;
    const hay = normalizeArabic([p.name, p.sku, CATEGORIES[p.category]?.label, SEASONS[p.season]?.label].join(' '));
    return terms.every((t) => hay.includes(t));
  });

  const sorters = {
    new: (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
    name: (a, b) => a.name.localeCompare(b.name, 'ar'),
    sku: (a, b) => a.sku.localeCompare(b.sku, 'en', { numeric: true }),
  };
  return list.sort(sorters[state.sort] || sorters.new);
}

function render() {
  const list = getFiltered();
  $('#grid').innerHTML = list.map((p, i) => cardHTML(p, i)).join('');
  const noProducts = state.products.length === 0;
  $('#comingSoon').classList.toggle('hidden', !noProducts);
  $('#emptyState').classList.toggle('hidden', list.length > 0 || noProducts);

  const filtered = state.cat !== 'all' || state.season !== 'all' || state.q;
  $('#clearFilters').classList.toggle('hidden', !filtered);
  $('#resultsInfo').textContent = filtered
    ? `${formatNumber(list.length)} من ${formatNumber(state.products.length)} موديل`
    : `${formatNumber(list.length)} موديل`;

  syncControls();
  writeHash();
}

function cardHTML(p, i) {
  const img1 = p.images?.[0];
  const img2 = p.images?.[1];
  return `
  <article class="card" data-id="${e(p.id)}" style="animation-delay:${Math.min(i, 12) * 30}ms">
    <button class="card-media" data-action="open" aria-label="عرض صور ${e(p.name)}">
      ${img1
        ? `<img src="${e(optimizeImg(img1, 500))}" alt="${e(p.name)}" loading="${i < 4 ? 'eager' : 'lazy'}" decoding="async" />`
        : '<div class="w-full h-full grid place-items-center text-4xl text-slate-300">👕</div>'}
      ${img2 ? `<img class="img-2" src="${e(optimizeImg(img2, 500))}" alt="" loading="lazy" decoding="async" />` : ''}
      ${isNew(p) ? '<span class="badge badge-new absolute top-2 right-2">جديد</span>' : ''}
      ${p.images?.length > 1 ? `<span class="badge badge-dark absolute bottom-2 left-2">${ICON.images} ${p.images.length}</span>` : ''}
    </button>
    <button class="p-3 sm:p-4 text-right w-full" data-action="open">
      <h3 class="font-extrabold text-sm sm:text-base leading-snug line-clamp-2">${e(p.name)}</h3>
      <div class="mt-1.5 inline-flex items-center gap-1.5 text-xs sm:text-sm text-slate-500">
        <span>الكود:</span>
        <span dir="ltr" class="font-bold text-ink tracking-wide">${e(p.sku)}</span>
      </div>
    </button>
  </article>`;
}

function renderSkeleton() {
  $('#grid').innerHTML = Array.from({ length: 8 }, () => `
    <div class="card" style="animation:none">
      <div class="skeleton !rounded-none" style="aspect-ratio:4/5"></div>
      <div class="p-4 space-y-2.5">
        <div class="skeleton h-4 w-4/5"></div>
        <div class="skeleton h-3 w-1/3"></div>
      </div>
    </div>`).join('');
}

function syncControls() {
  $$('#categoryChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cat === state.cat)));
  $$('#seasonSeg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.season === state.season)));
  $('#sortSelect').value = state.sort;
  for (const id of ['#searchDesktop', '#searchMobile']) {
    if (document.activeElement !== $(id)) $(id).value = state.q;
  }
}

/* ---------------- مزامنة الرابط (Hash) ---------------- */
function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  state.cat = CATEGORIES[h.get('cat')] ? h.get('cat') : 'all';
  state.season = ['summer', 'winter'].includes(h.get('season')) ? h.get('season') : 'all';
  state.q = h.get('q') || '';
  state.sort = ['new', 'name', 'sku'].includes(h.get('sort')) ? h.get('sort') : 'new';
  if (state.q) $('#mobileSearch').classList.remove('hidden');
}

function writeHash() {
  const h = new URLSearchParams();
  if (state.cat !== 'all') h.set('cat', state.cat);
  if (state.season !== 'all') h.set('season', state.season);
  if (state.q) h.set('q', state.q);
  if (state.sort !== 'new') h.set('sort', state.sort);
  const cur = new URLSearchParams(location.hash.slice(1));
  if (cur.get('p')) h.set('p', cur.get('p'));
  const str = h.toString();
  history.replaceState(null, '', str ? `#${str}` : location.pathname + location.search);
}

function setHashProduct(id) {
  const h = new URLSearchParams(location.hash.slice(1));
  id ? h.set('p', id) : h.delete('p');
  const str = h.toString();
  history.replaceState(null, '', str ? `#${str}` : location.pathname + location.search);
}

function openFromHash() {
  const id = new URLSearchParams(location.hash.slice(1)).get('p');
  if (id && state.byId.has(id)) openProduct(id);
}

/* =========================================================
 *  الأحداث
 * ========================================================= */
function bindEvents() {
  $('#categoryChips').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-cat]'); if (!b) return;
    state.cat = b.dataset.cat; render();
  });
  $('#seasonSeg').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-season]'); if (!b) return;
    state.season = b.dataset.season; render();
  });
  $('#sortSelect').addEventListener('change', (ev) => { state.sort = ev.target.value; render(); });

  const onSearch = debounce((v) => { state.q = v.trim(); render(); }, 200);
  ['#searchDesktop', '#searchMobile'].forEach((id) => $(id).addEventListener('input', (ev) => onSearch(ev.target.value)));
  $('#searchToggle').addEventListener('click', () => {
    const box = $('#mobileSearch');
    box.classList.toggle('hidden');
    if (!box.classList.contains('hidden')) $('#searchMobile').focus();
  });

  // اختصار لوحة المفاتيح: "/" للبحث
  document.addEventListener('keydown', (ev) => {
    if (ev.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName)) {
      ev.preventDefault();
      (window.innerWidth >= 768 ? $('#searchDesktop') : ($('#mobileSearch').classList.remove('hidden'), $('#searchMobile'))).focus();
    }
  });

  const reset = () => { state.cat = 'all'; state.season = 'all'; state.q = ''; render(); };
  $('#clearFilters').addEventListener('click', reset);
  document.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-action="reset"]')) reset();
    if (ev.target.closest('[data-action="retry"]')) { renderSkeleton(); loadProducts(); }
  });

  $('#grid').addEventListener('click', (ev) => {
    const card = ev.target.closest('.card[data-id]');
    if (card && ev.target.closest('[data-action="open"]')) openProduct(card.dataset.id);
  });

  // إغلاق النافذة: زر الإغلاق أو الضغط على الخلفية
  const dlg = $('#productModal');
  dlg.addEventListener('click', (ev) => {
    if (ev.target === dlg || ev.target.closest('[data-close]')) dlg.close();
  });
  dlg.addEventListener('close', () => {
    document.body.classList.remove('modal-open');
    setHashProduct(null);
  });

  window.addEventListener('hashchange', () => { readHash(); render(); openFromHash(); });
}

/* =========================================================
 *  نافذة المنتج: معرض الصور + الاسم + الكود
 * ========================================================= */
function openProduct(id) {
  const p = state.byId.get(id); if (!p) return;
  const imgs = p.images || [];

  $('#pmBody').innerHTML = `
    <div class="grid md:grid-cols-[1.15fr_1fr]">
    <div>
    <div class="gallery-main">
      ${imgs.length ? `
        <div class="gallery-track no-scrollbar" id="pmTrack">
          ${imgs.map((src, i) => `<img src="${e(optimizeImg(src, 1000))}" alt="${e(p.name)} - صورة ${i + 1}" ${i ? 'loading="lazy"' : ''} />`).join('')}
        </div>
        ${imgs.length > 1 ? `<div class="gallery-dots">${imgs.map((_, i) => `<span class="${i ? '' : 'on'}"></span>`).join('')}</div>` : ''}
      ` : '<div class="w-full h-full grid place-items-center text-6xl text-slate-300">👕</div>'}
      <button class="btn btn-icon absolute top-3 left-3 bg-white/90 shadow" data-close aria-label="إغلاق">${ICON.close}</button>
    </div>
    ${imgs.length > 1 ? `<div class="flex gap-2 px-4 pt-3 md:pb-4 overflow-x-auto no-scrollbar" id="pmThumbs">
      ${imgs.map((src, i) => `<button class="thumb ${i ? '' : 'on'}" data-i="${i}" aria-label="صورة ${i + 1}"><img src="${e(optimizeImg(src, 160))}" alt="" loading="lazy"/></button>`).join('')}
    </div>` : ''}
    </div>
    <div class="p-5 sm:p-6 md:self-center">
      <div class="flex flex-wrap items-center gap-1.5 mb-2">
        <span class="badge badge-soft">${CATEGORIES[p.category]?.icon || ''} ${e(CATEGORIES[p.category]?.label || '')}</span>
        <span class="badge badge-soft">${SEASONS[p.season]?.icon || ''} ${e(SEASONS[p.season]?.label || '')}</span>
        ${isNew(p) ? '<span class="badge badge-new">جديد</span>' : ''}
      </div>
      <h2 id="pmTitle" class="text-xl sm:text-2xl font-extrabold leading-snug">${e(p.name)}</h2>
      <div class="mt-3 inline-flex items-center gap-2 bg-sand rounded-xl px-4 py-2.5">
        <span class="text-sm text-slate-500">كود الصنف:</span>
        <span dir="ltr" class="text-lg font-extrabold tracking-wide">${e(p.sku)}</span>
      </div>
    </div>
    </div>`;

  // معرض الصور: مزامنة النقاط والصور المصغرة مع التمرير
  const track = $('#pmTrack');
  if (track && imgs.length > 1) {
    const dots = $$('.gallery-dots span', $('#pmBody'));
    const thumbs = $$('#pmThumbs .thumb');
    track.addEventListener('scroll', debounce(() => {
      const i = Math.round(Math.abs(track.scrollLeft) / track.clientWidth);
      dots.forEach((d, j) => d.classList.toggle('on', i === j));
      thumbs.forEach((t, j) => t.classList.toggle('on', i === j));
    }, 60), { passive: true });
    $('#pmThumbs').addEventListener('click', (ev) => {
      const t = ev.target.closest('.thumb'); if (!t) return;
      // في RTL يكون التمرير بقيم سالبة
      track.scrollTo({ left: -Number(t.dataset.i) * track.clientWidth, behavior: 'smooth' });
    });
  }

  setHashProduct(id);
  const dlg = $('#productModal');
  if (!dlg.open) dlg.showModal();
  document.body.classList.add('modal-open');
  $('#pmBody').scrollTop = 0;
}
