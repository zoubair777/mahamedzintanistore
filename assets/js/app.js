/**
 * ============================================================
 *  app.js — منطق صفحة الزبائن (المعرض العام)
 * ============================================================
 *  • جلب المنتجات وعرضها في شبكة متجاوبة
 *  • فلترة (تصنيف/موسم) + بحث عربي ذكي + ترتيب
 *  • حفظ حالة الفلاتر في الرابط (#cat=men&season=winter) لمشاركتها
 *  • نافذة تفاصيل المنتج بمعرض صور قابل للسحب
 *  • قائمة طلب (سلة استفسار) تُرسل كاملة عبر واتساب
 */
import { storeConfig } from './firebase-config.js';
import { listProducts, mode } from './store.js';
import {
  CATEGORIES, SEASONS, escapeHtml as e, formatPrice, formatNumber, hasPrice,
  normalizeArabic, debounce, isNew, optimizeImg, toast, whatsappLink, productUrl, $, $$,
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

const ORDER_KEY = 'wc_order_v1';
let order = loadOrder(); // [{ id, packs }]

/* ---------------- أيقونات ---------------- */
const ICON = {
  wa: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 14.4c-.3-.1-1.8-.9-2-1-.3-.1-.5-.1-.7.1-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1-.3-.1-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.4-.5c.2-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.8-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.2-.3-.3-.6-.4ZM12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Z"/></svg>',
  plus: '<svg fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  check: '<svg fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24"><path d="m5 12 5 5L20 7"/></svg>',
  close: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  share: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>',
  trash: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
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
  updateOrderBadge();
  await loadProducts();
  if (mode === 'demo') console.info('%c[Demo Mode] أضف إعدادات Firebase في firebase-config.js للربط بقاعدة البيانات الحقيقية', 'color:#9a3f1f;font-weight:bold');
}

function fillStoreInfo() {
  $$('[data-store-name]').forEach((el) => (el.textContent = storeConfig.name));
  $$('[data-store-tagline]').forEach((el) => (el.textContent = storeConfig.tagline));
  $$('[data-store-address]').forEach((el) => (el.textContent = storeConfig.address));
  $$('[data-store-phone]').forEach((el) => { el.textContent = storeConfig.phone; el.href = `tel:${storeConfig.phone.replace(/\s/g, '')}`; });
  $('#year').textContent = new Date().getFullYear();
  $('#waFab').href = whatsappLink(`مرحباً ${storeConfig.name} 👋\nأود الاستفسار عن الموديلات المتوفرة في المعرض.`);
  document.title = `${storeConfig.name} | ${storeConfig.tagline}`;
}

async function loadProducts() {
  $('#errorState').classList.add('hidden');
  $('#grid').setAttribute('aria-busy', 'true');
  try {
    state.products = await listProducts();
    state.byId = new Map(state.products.map((p) => [p.id, p]));
    // إزالة منتجات من قائمة الطلب لم تعد متوفرة
    order = order.filter((o) => state.byId.has(o.id));
    saveOrder();
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
  const q = normalizeArabic(state.q);
  const terms = q.split(/\s+/).filter(Boolean);
  let list = state.products.filter((p) => {
    if (state.cat !== 'all' && p.category !== state.cat) return false;
    // المنتجات "كل المواسم" تظهر مع الصيفي والشتوي
    if (state.season !== 'all' && p.season !== state.season && p.season !== 'all') return false;
    if (!terms.length) return true;
    const hay = normalizeArabic([p.name, p.sku, p.fabric, p.description, CATEGORIES[p.category]?.label, SEASONS[p.season]?.label, ...(p.colors || [])].join(' '));
    return terms.every((t) => hay.includes(t));
  });

  const price = (p) => Number(p.price) || Infinity; // "السعر عند الطلب" في النهاية
  const sorters = {
    new: (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
    'price-asc': (a, b) => price(a) - price(b),
    'price-desc': (a, b) => (Number(b.price) || 0) - (Number(a.price) || 0),
    name: (a, b) => a.name.localeCompare(b.name, 'ar'),
  };
  return list.sort(sorters[state.sort] || sorters.new);
}

function render() {
  const list = getFiltered();
  const grid = $('#grid');
  grid.innerHTML = list.map((p, i) => cardHTML(p, i)).join('');
  $('#emptyState').classList.toggle('hidden', list.length > 0);

  const filtered = state.cat !== 'all' || state.season !== 'all' || state.q;
  $('#clearFilters').classList.toggle('hidden', !filtered);
  $('#resultsInfo').textContent = filtered
    ? `${formatNumber(list.length)} من ${formatNumber(state.products.length)} موديل`
    : `${formatNumber(list.length)} موديل متوفر`;

  syncControls();
  writeHash();
}

function priceBlock(p, size = 'sm') {
  if (!hasPrice(p)) {
    return `<div class="text-sm font-bold text-brand">السعر عند الطلب</div>`;
  }
  const pack = p.price * (p.piecesPerPack || 1);
  return `
    <div class="flex items-baseline gap-1.5 flex-wrap">
      <span class="price ${size === 'lg' ? 'text-2xl' : 'text-base sm:text-lg'}">${formatPrice(p.price)}</span>
      <span class="text-xs text-slate-500">/ القطعة</span>
    </div>
    <div class="text-xs text-slate-500 mt-0.5">الباكيت: <span class="price price-pack">${formatPrice(pack)}</span></div>`;
}

function cardHTML(p, i) {
  const img1 = p.images?.[0];
  const img2 = p.images?.[1];
  const soldOut = Number(p.stock) === 0;
  const inOrder = order.some((o) => o.id === p.id);
  const sizes = (p.sizes || []);
  const shownSizes = sizes.slice(0, 4).map((s) => `<span class="size-pill">${e(s)}</span>`).join('');
  const moreSizes = sizes.length > 4 ? `<span class="size-pill">+${sizes.length - 4}</span>` : '';

  return `
  <article class="card" data-id="${e(p.id)}" style="animation-delay:${Math.min(i, 12) * 30}ms">
    <button class="card-media" data-action="open" aria-label="عرض تفاصيل ${e(p.name)}">
      ${img1
        ? `<img src="${e(optimizeImg(img1, 500))}" alt="${e(p.name)}" loading="${i < 4 ? 'eager' : 'lazy'}" decoding="async" />`
        : `<div class="w-full h-full grid place-items-center text-4xl text-slate-300">👕</div>`}
      ${img2 ? `<img class="img-2" src="${e(optimizeImg(img2, 500))}" alt="" loading="lazy" decoding="async" />` : ''}
      <div class="absolute top-2 right-2 flex flex-col items-start gap-1">
        ${isNew(p) ? '<span class="badge badge-new">جديد</span>' : ''}
        <span class="badge">${SEASONS[p.season]?.icon || ''} ${e(SEASONS[p.season]?.label || '')}</span>
      </div>
      ${p.images?.length > 1 ? `<span class="badge badge-dark absolute bottom-2 left-2">${ICON.images} ${p.images.length}</span>` : ''}
      ${soldOut ? '<div class="soldout"><span>نفدت الكمية</span></div>' : ''}
    </button>

    <div class="p-3 sm:p-4 flex flex-col gap-2 flex-1">
      <div class="flex items-center justify-between gap-2 text-[11px] sm:text-xs text-slate-500">
        <span dir="ltr" class="font-bold tracking-wide">${e(p.sku)}</span>
        <span>${e(CATEGORIES[p.category]?.label || '')}</span>
      </div>
      <h3 class="font-extrabold text-sm sm:text-base leading-snug line-clamp-2 min-h-[2.6em]">${e(p.name)}</h3>
      <div class="text-xs text-slate-600 flex flex-wrap gap-x-3 gap-y-1">
        ${p.fabric ? `<span>🧵 ${e(p.fabric)}</span>` : ''}
        <span>📦 ${formatNumber(p.piecesPerPack)} قطعة/باكيت</span>
      </div>
      ${sizes.length ? `<div class="flex flex-wrap gap-1" aria-label="المقاسات">${shownSizes}${moreSizes}</div>` : ''}
      <div class="mt-auto pt-2 border-t border-slate-100">
        ${priceBlock(p)}
        <div class="text-[11px] text-slate-500 mt-1">أقل طلب: ${formatNumber(p.moq)} باكيت</div>
      </div>
      <div class="grid grid-cols-[1fr_auto] gap-2">
        <button class="btn btn-sm ${inOrder ? 'btn-outline' : 'btn-primary'}" data-action="add" ${soldOut ? 'disabled' : ''}>
          ${inOrder ? ICON.check + '<span>في الطلب</span>' : ICON.plus + '<span>أضف للطلب</span>'}
        </button>
        <a class="btn btn-sm btn-wa btn-icon" href="${e(whatsappLink(productMessage(p)))}" target="_blank" rel="noopener" aria-label="استفسار واتساب عن ${e(p.name)}">${ICON.wa}</a>
      </div>
    </div>
  </article>`;
}

function renderSkeleton() {
  $('#grid').innerHTML = Array.from({ length: 8 }, () => `
    <div class="card" style="animation:none">
      <div class="skeleton !rounded-none" style="aspect-ratio:4/5"></div>
      <div class="p-4 space-y-2.5">
        <div class="skeleton h-3 w-1/3"></div>
        <div class="skeleton h-4 w-4/5"></div>
        <div class="skeleton h-3 w-2/3"></div>
        <div class="skeleton h-9 w-full !rounded-xl mt-3"></div>
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
  state.sort = h.get('sort') || 'new';
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

  // تفويض الأحداث على شبكة المنتجات
  $('#grid').addEventListener('click', (ev) => {
    const card = ev.target.closest('.card[data-id]'); if (!card) return;
    const id = card.dataset.id;
    const action = ev.target.closest('[data-action]')?.dataset.action;
    if (action === 'open') openProduct(id);
    if (action === 'add') {
      const p = state.byId.get(id);
      if (order.some((o) => o.id === id)) openOrder();
      else addToOrder(id, p.moq || 1);
    }
  });

  $('#orderBtn').addEventListener('click', openOrder);

  // إغلاق النوافذ: زر الإغلاق أو الضغط على الخلفية
  $$('dialog').forEach((dlg) => {
    dlg.addEventListener('click', (ev) => {
      if (ev.target === dlg || ev.target.closest('[data-close]')) dlg.close();
    });
    dlg.addEventListener('close', () => {
      document.body.classList.remove('modal-open');
      if (dlg.id === 'productModal') setHashProduct(null);
    });
  });

  window.addEventListener('hashchange', () => { readHash(); render(); openFromHash(); });

  // مزامنة قائمة الطلب بين التبويبات المفتوحة
  window.addEventListener('storage', (ev) => {
    if (ev.key === ORDER_KEY) { order = loadOrder(); updateOrderBadge(); render(); }
  });
}

function showDialog(dlg) {
  if (!dlg.open) dlg.showModal();
  document.body.classList.add('modal-open');
}

/* =========================================================
 *  نافذة تفاصيل المنتج
 * ========================================================= */
function openProduct(id) {
  const p = state.byId.get(id); if (!p) return;
  const imgs = p.images?.length ? p.images : [];
  const soldOut = Number(p.stock) === 0;
  const inOrder = order.find((o) => o.id === id);
  const minPacks = p.moq || 1;

  const row = (k, v) => v ? `<div class="flex justify-between gap-4 py-2.5 border-b border-slate-100 text-sm"><dt class="text-slate-500">${k}</dt><dd class="font-bold text-left">${v}</dd></div>` : '';

  $('#pmBody').innerHTML = `
    <div class="grid md:grid-cols-2">
      <div class="md:sticky md:top-0 self-start">
        <div class="gallery-main">
          ${imgs.length ? `
            <div class="gallery-track no-scrollbar" id="pmTrack">
              ${imgs.map((src, i) => `<img src="${e(optimizeImg(src, 900))}" alt="${e(p.name)} - صورة ${i + 1}" ${i ? 'loading="lazy"' : ''} />`).join('')}
            </div>
            ${imgs.length > 1 ? `<div class="gallery-dots">${imgs.map((_, i) => `<span class="${i ? '' : 'on'}"></span>`).join('')}</div>` : ''}
          ` : '<div class="w-full h-full grid place-items-center text-6xl text-slate-300">👕</div>'}
          <button class="btn btn-icon absolute top-3 left-3 bg-white/90 shadow" data-close aria-label="إغلاق">${ICON.close}</button>
          ${soldOut ? '<div class="soldout"><span>نفدت الكمية</span></div>' : ''}
        </div>
        ${imgs.length > 1 ? `<div class="hidden md:flex gap-2 p-3 overflow-x-auto no-scrollbar" id="pmThumbs">
          ${imgs.map((src, i) => `<button class="thumb ${i ? '' : 'on'}" data-i="${i}" aria-label="صورة ${i + 1}"><img src="${e(optimizeImg(src, 160))}" alt="" loading="lazy"/></button>`).join('')}
        </div>` : ''}
      </div>

      <div class="p-5 sm:p-7 flex flex-col gap-4">
        <div>
          <div class="flex flex-wrap items-center gap-1.5 mb-2">
            <span class="badge badge-soft">${CATEGORIES[p.category]?.icon || ''} ${e(CATEGORIES[p.category]?.label || '')}</span>
            <span class="badge badge-soft">${SEASONS[p.season]?.icon || ''} ${e(SEASONS[p.season]?.label || '')}</span>
            ${isNew(p) ? '<span class="badge badge-new">جديد</span>' : ''}
          </div>
          <h2 id="pmTitle" class="text-xl sm:text-2xl font-extrabold leading-snug">${e(p.name)}</h2>
          <p class="text-sm text-slate-500 mt-1">كود الصنف: <span dir="ltr" class="font-bold text-ink">${e(p.sku)}</span></p>
        </div>

        <div class="bg-sand rounded-2xl p-4">${priceBlock(p, 'lg')}</div>

        ${p.sizes?.length ? `<div>
          <div class="text-sm font-bold mb-2">المقاسات داخل الباكيت</div>
          <div class="flex flex-wrap gap-1.5">${p.sizes.map((s) => `<span class="size-pill !h-8 !min-w-[40px] !text-sm">${e(s)}</span>`).join('')}</div>
        </div>` : ''}

        <dl>
          ${row('نوع القماش', e(p.fabric))}
          ${row('عدد القطع في الباكيت', `${formatNumber(p.piecesPerPack)} قطعة`)}
          ${row('أقل كمية للطلب', `${formatNumber(p.moq)} باكيت (${formatNumber(p.moq * p.piecesPerPack)} قطعة)`)}
          ${row('الألوان', e((p.colors || []).join('، ')))}
          ${row('التوفر', soldOut ? '<span class="text-red-600">نفدت الكمية</span>' : '<span class="text-green-700">متوفر</span>')}
        </dl>

        ${p.description ? `<p class="text-sm text-slate-600 leading-relaxed whitespace-pre-line">${e(p.description)}</p>` : ''}

        <div class="sticky bottom-0 bg-white pt-3 pb-1 -mx-5 px-5 sm:-mx-7 sm:px-7 border-t border-slate-100 mt-auto space-y-2.5">
          ${soldOut ? '' : `
          <div class="flex items-center gap-3">
            <div class="stepper" data-min="${minPacks}">
              <button type="button" data-step="1" aria-label="زيادة">+</button>
              <input id="pmQty" type="number" inputmode="numeric" min="${minPacks}" value="${inOrder ? inOrder.packs : minPacks}" aria-label="عدد الباكيتات" />
              <button type="button" data-step="-1" aria-label="إنقاص">−</button>
            </div>
            <div class="text-xs text-slate-500 leading-tight">باكيت<br><span id="pmPieces" class="font-bold text-ink"></span></div>
          </div>`}
          <div class="grid grid-cols-[1fr_1fr_auto] gap-2">
            <button class="btn btn-primary" id="pmAdd" ${soldOut ? 'disabled' : ''}>${ICON.plus}<span>${inOrder ? 'تحديث الطلب' : 'أضف للطلب'}</span></button>
            <a class="btn btn-wa" id="pmWa" target="_blank" rel="noopener">${ICON.wa}<span>استفسار</span></a>
            <button class="btn btn-outline btn-icon" id="pmShare" aria-label="مشاركة">${ICON.share}</button>
          </div>
        </div>
      </div>
    </div>`;

  // ربط عناصر النافذة
  const qty = $('#pmQty');
  const updatePieces = () => {
    if (!qty) return;
    const n = Math.max(minPacks, parseInt(qty.value, 10) || minPacks);
    $('#pmPieces').textContent = `= ${formatNumber(n * p.piecesPerPack)} قطعة`;
    $('#pmWa').href = whatsappLink(productMessage(p, n));
  };
  if (qty) {
    $('.stepper', $('#pmBody')).addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-step]'); if (!b) return;
      qty.value = Math.max(minPacks, (parseInt(qty.value, 10) || minPacks) + Number(b.dataset.step));
      updatePieces();
    });
    qty.addEventListener('input', updatePieces);
    qty.addEventListener('blur', () => { qty.value = Math.max(minPacks, parseInt(qty.value, 10) || minPacks); updatePieces(); });
    updatePieces();
  } else {
    $('#pmWa').href = whatsappLink(productMessage(p));
  }

  $('#pmAdd').addEventListener('click', () => {
    const n = Math.max(minPacks, parseInt(qty?.value, 10) || minPacks);
    addToOrder(id, n, { replace: true });
    $('#productModal').close();
  });

  $('#pmShare').addEventListener('click', async () => {
    const url = productUrl(id);
    try {
      if (navigator.share) await navigator.share({ title: p.name, text: `${p.name} — ${p.sku}`, url });
      else { await navigator.clipboard.writeText(url); toast('تم نسخ رابط المنتج ✓', 'success'); }
    } catch { /* المستخدم ألغى المشاركة */ }
  });

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
    $('#pmThumbs')?.addEventListener('click', (ev) => {
      const t = ev.target.closest('.thumb'); if (!t) return;
      const i = Number(t.dataset.i);
      // في RTL يكون التمرير بقيم سالبة
      track.scrollTo({ left: -i * track.clientWidth, behavior: 'smooth' });
    });
  }

  setHashProduct(id);
  showDialog($('#productModal'));
  $('#pmBody').scrollTop = 0;
}

/* =========================================================
 *  قائمة الطلب (سلة الاستفسار)
 * ========================================================= */
function loadOrder() {
  try { return JSON.parse(localStorage.getItem(ORDER_KEY)) || []; } catch { return []; }
}
function saveOrder() {
  try { localStorage.setItem(ORDER_KEY, JSON.stringify(order)); } catch { /* تخزين غير متاح */ }
}

function addToOrder(id, packs, { replace = false } = {}) {
  const p = state.byId.get(id);
  const existing = order.find((o) => o.id === id);
  if (existing) existing.packs = replace ? packs : existing.packs + packs;
  else order.push({ id, packs });
  saveOrder();
  updateOrderBadge(true);
  render();
  toast(`✓ تمت إضافة "${p.name}" إلى قائمة الطلب`, 'success');
}

function updateOrderBadge(animate = false) {
  const badge = $('#orderCount');
  badge.textContent = order.length;
  badge.classList.toggle('hidden', order.length === 0);
  if (animate) { badge.classList.remove('bump'); void badge.offsetWidth; badge.classList.add('bump'); }
}

function orderTotals() {
  let pieces = 0, total = 0, priced = true;
  for (const o of order) {
    const p = state.byId.get(o.id); if (!p) continue;
    const n = o.packs * p.piecesPerPack;
    pieces += n;
    if (hasPrice(p)) total += n * p.price; else priced = false;
  }
  return { pieces, total, priced };
}

function openOrder() {
  renderOrder();
  showDialog($('#orderDrawer'));
}

function renderOrder() {
  const items = $('#odItems');
  const footer = $('#odFooter');

  if (!order.length) {
    items.innerHTML = `
      <div class="h-full grid place-items-center text-center py-16">
        <div>
          <div class="text-5xl mb-3">🛍️</div>
          <p class="font-extrabold">قائمة الطلب فارغة</p>
          <p class="text-sm text-slate-500 mt-1">أضف الموديلات التي تريدها ثم أرسلها عبر واتساب.</p>
          <button class="btn btn-primary mt-5" data-close>تصفح المنتجات</button>
        </div>
      </div>`;
    footer.classList.add('hidden');
    return;
  }

  footer.classList.remove('hidden');
  items.innerHTML = order.map((o) => {
    const p = state.byId.get(o.id); if (!p) return '';
    return `
      <div class="flex gap-3 py-3 border-b border-slate-100" data-oid="${e(p.id)}">
        <img src="${e(optimizeImg(p.images?.[0], 160) || '')}" alt="" class="w-16 h-20 rounded-xl object-cover bg-slate-100 shrink-0" />
        <div class="flex-1 min-w-0">
          <div class="flex justify-between gap-2">
            <div class="min-w-0">
              <p class="font-bold text-sm truncate">${e(p.name)}</p>
              <p class="text-xs text-slate-500" dir="ltr" style="text-align:right">${e(p.sku)}</p>
            </div>
            <button class="btn btn-ghost btn-sm btn-icon text-slate-400 hover:text-red-600" data-remove aria-label="حذف">${ICON.trash}</button>
          </div>
          <div class="flex items-center justify-between gap-2 mt-2">
            <div class="stepper stepper-sm">
              <button type="button" data-ostep="1" aria-label="زيادة">+</button>
              <input type="number" inputmode="numeric" min="${p.moq}" value="${o.packs}" data-oqty aria-label="عدد الباكيتات" />
              <button type="button" data-ostep="-1" aria-label="إنقاص">−</button>
            </div>
            <div class="text-left text-xs">
              <div class="text-slate-500">${formatNumber(o.packs * p.piecesPerPack)} قطعة</div>
              ${hasPrice(p) ? `<div class="price text-sm">${formatPrice(o.packs * p.piecesPerPack * p.price)}</div>` : '<div class="text-brand font-bold">عند الطلب</div>'}
            </div>
          </div>
        </div>
      </div>`;
  }).join('');

  const t = orderTotals();
  footer.innerHTML = `
    <div class="flex justify-between text-sm"><span class="text-slate-500">عدد الموديلات</span><strong>${formatNumber(order.length)}</strong></div>
    <div class="flex justify-between text-sm"><span class="text-slate-500">إجمالي القطع</span><strong>${formatNumber(t.pieces)} قطعة</strong></div>
    ${storeConfig.showPrices ? `<div class="flex justify-between items-baseline"><span class="text-slate-500 text-sm">الإجمالي التقديري${t.priced ? '' : '*'}</span><strong class="price text-xl">${formatPrice(t.total)}</strong></div>
    ${t.priced ? '' : '<p class="text-[11px] text-slate-400">* بعض المنتجات سعرها عند الطلب ولم تُحتسب.</p>'}` : ''}
    <input id="odName" class="input" placeholder="اسمك / اسم المحل (اختياري)" autocomplete="organization" />
    <a id="odSend" class="btn btn-wa w-full !h-12 text-base" target="_blank" rel="noopener">${ICON.wa}<span>إرسال الطلب عبر واتساب</span></a>
    <button id="odClear" class="w-full text-sm text-slate-500 hover:text-red-600 font-semibold py-1">إفراغ القائمة</button>`;

  const nameInput = $('#odName');
  nameInput.value = localStorage.getItem('wc_customer') || '';
  const refreshLink = () => { $('#odSend').href = whatsappLink(orderMessage(nameInput.value)); };
  nameInput.addEventListener('input', () => { try { localStorage.setItem('wc_customer', nameInput.value); } catch {} refreshLink(); });
  refreshLink();

  $('#odClear').onclick = () => {
    if (!confirm('هل تريد إفراغ قائمة الطلب؟')) return;
    order = []; saveOrder(); updateOrderBadge(); render(); renderOrder();
  };
}

// أحداث درج الطلب (تفويض واحد)
$('#odItems').addEventListener('click', (ev) => {
  const row = ev.target.closest('[data-oid]'); if (!row) return;
  const o = order.find((x) => x.id === row.dataset.oid);
  const p = state.byId.get(row.dataset.oid);
  if (ev.target.closest('[data-remove]')) {
    order = order.filter((x) => x !== o);
  } else if (ev.target.closest('[data-ostep]')) {
    o.packs = Math.max(p.moq || 1, o.packs + Number(ev.target.closest('[data-ostep]').dataset.ostep));
  } else return;
  saveOrder(); updateOrderBadge(); renderOrder(); render();
});
$('#odItems').addEventListener('change', (ev) => {
  if (!ev.target.matches('[data-oqty]')) return;
  const id = ev.target.closest('[data-oid]').dataset.oid;
  const o = order.find((x) => x.id === id);
  const p = state.byId.get(id);
  o.packs = Math.max(p.moq || 1, parseInt(ev.target.value, 10) || p.moq || 1);
  saveOrder(); renderOrder();
});

/* =========================================================
 *  رسائل واتساب
 * ========================================================= */
function productMessage(p, packs) {
  const lines = [
    `مرحباً ${storeConfig.name} 👋`,
    'أود الاستفسار عن هذا المنتج:',
    '',
    `▪️ الموديل: ${p.name}`,
    `▪️ كود الصنف: ${p.sku}`,
    p.fabric ? `▪️ القماش: ${p.fabric}` : null,
    `▪️ الباكيت: ${p.piecesPerPack} قطعة`,
    p.sizes?.length ? `▪️ المقاسات: ${p.sizes.join(' / ')}` : null,
    hasPrice(p) ? `▪️ سعر القطعة: ${formatPrice(p.price)}` : null,
    packs ? `▪️ الكمية المطلوبة: ${packs} باكيت (${packs * p.piecesPerPack} قطعة)` : null,
    '',
    `🔗 ${productUrl(p.id)}`,
  ];
  return lines.filter((l) => l !== null).join('\n');
}

function orderMessage(customer = '') {
  const t = orderTotals();
  const lines = [
    `مرحباً ${storeConfig.name} 👋`,
    customer.trim() ? `معك: *${customer.trim()}*` : null,
    'أرغب في طلب الموديلات التالية:',
    '',
  ];
  order.forEach((o, i) => {
    const p = state.byId.get(o.id); if (!p) return;
    lines.push(`*${i + 1}. ${p.name}*`);
    lines.push(`   الكود: ${p.sku}`);
    lines.push(`   الكمية: ${o.packs} باكيت × ${p.piecesPerPack} = ${o.packs * p.piecesPerPack} قطعة`);
    if (hasPrice(p)) lines.push(`   السعر: ${formatPrice(p.price)}/قطعة ← ${formatPrice(o.packs * p.piecesPerPack * p.price)}`);
    lines.push('');
  });
  lines.push('━━━━━━━━━━━━');
  lines.push(`📦 إجمالي القطع: ${t.pieces}`);
  if (storeConfig.showPrices) lines.push(`💰 الإجمالي التقديري: ${formatPrice(t.total)}${t.priced ? '' : ' (+ منتجات سعرها عند الطلب)'}`);
  lines.push('', 'برجاء تأكيد التوفر وتكلفة الشحن. شكراً 🙏');
  return lines.filter((l) => l !== null).join('\n');
}
