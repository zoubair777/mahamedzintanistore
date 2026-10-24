/**
 * ============================================================
 *  admin.js — منطق لوحة التحكم
 * ============================================================
 *  • تسجيل الدخول عبر Firebase Auth (أو حساب تجريبي)
 *  • إحصائيات سريعة + بحث وفلترة
 *  • جدول المنتجات: تعديل السعر/المخزون مباشرة، إظهار/إخفاء، نسخ، حذف
 *  • نموذج إضافة/تعديل مع رفع صور متعدد (ضغط + شريط تقدم)
 */
import { storeConfig } from './firebase-config.js';
import {
  mode, listProducts, addProduct, updateProduct, deleteProduct, sanitizeProduct,
  signIn, signOut, onAuthChange, sendPasswordReset, authErrorMessage, uploadImage,
} from './store.js';
import {
  CATEGORIES, SEASONS, SIZE_PRESETS, escapeHtml as e, formatPrice, formatNumber,
  normalizeArabic, debounce, optimizeImg, toast, compressImage, $, $$,
} from './utils.js';

/* ---------------- الحالة ---------------- */
let products = [];
let editingId = null;         // null = منتج جديد
let formImages = [];          // [{ key, url, preview, progress, status: 'done'|'uploading'|'error' }]
let selectedSizes = [];
let formDirty = false;
const MAX_IMAGES = 10;

const ICON = {
  edit: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  copy: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
  trash: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
  star: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9Z"/></svg>',
  x: '<svg fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  link: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>',
};

/* =========================================================
 *  المصادقة
 * ========================================================= */
init();

function init() {
  $$('[data-store-name]').forEach((el) => (el.textContent = storeConfig.name));
  if (mode === 'demo') {
    $('#demoNotice').classList.remove('hidden');
    $('#modeBadge').classList.remove('hidden');
  }
  bindLogin();
  bindApp();
  bindForm();

  onAuthChange((user) => {
    $('#bootScreen').classList.add('hidden');
    if (user) showApp(user); else showLogin();
  }).catch((err) => {
    console.error(err);
    $('#bootScreen').innerHTML = '<p class="text-red-600 font-bold p-6 text-center">تعذّر تحميل Firebase. تحقق من الإعدادات والاتصال.</p>';
  });
}

function showLogin() {
  $('#appView').classList.add('hidden');
  $('#loginView').classList.remove('hidden');
  setTimeout(() => $('#loginEmail').focus(), 50);
}

async function showApp(user) {
  $('#loginView').classList.add('hidden');
  $('#appView').classList.remove('hidden');
  $('#userEmail').textContent = user.email || '';
  await refresh();
}

function bindLogin() {
  $('#loginForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const email = $('#loginEmail').value;
    const pass = $('#loginPass').value;
    const errEl = $('#loginError');
    errEl.classList.add('hidden');
    if (!email || !pass) {
      errEl.textContent = 'أدخل البريد الإلكتروني وكلمة المرور.';
      errEl.classList.remove('hidden');
      return;
    }
    setBusy($('#loginBtn'), true, 'جارٍ الدخول...');
    try {
      await signIn(email, pass);
      $('#loginPass').value = '';
    } catch (err) {
      errEl.textContent = authErrorMessage(err);
      errEl.classList.remove('hidden');
    } finally {
      setBusy($('#loginBtn'), false);
    }
  });

  $('#togglePass').addEventListener('click', () => {
    const i = $('#loginPass');
    i.type = i.type === 'password' ? 'text' : 'password';
  });

  $('#forgotBtn').addEventListener('click', async () => {
    const email = $('#loginEmail').value.trim();
    if (!email) { toast('أدخل بريدك الإلكتروني أولاً', 'error'); $('#loginEmail').focus(); return; }
    try {
      await sendPasswordReset(email);
      toast('إذا كان البريد مسجلاً، ستصلك رسالة لإعادة التعيين', 'success', 5000);
    } catch (err) { toast(authErrorMessage(err), 'error'); }
  });

  $('#logoutBtn').addEventListener('click', () => signOut());
}

/* =========================================================
 *  الجدول والإحصائيات
 * ========================================================= */
async function refresh() {
  $('#tbody').innerHTML = Array.from({ length: 5 }, () => `
    <tr><td><div class="skeleton w-12 h-[60px] !rounded-lg"></div></td>
    <td colspan="6"><div class="skeleton h-4 w-1/2 mb-2"></div><div class="skeleton h-3 w-1/4"></div></td></tr>`).join('');
  try {
    products = await listProducts({ includeHidden: true });
    renderAll();
  } catch (err) {
    console.error(err);
    $('#tbody').innerHTML = '';
    toast(authErrorMessage(err), 'error', 6000);
  }
}

function renderAll() { renderStats(); renderTable(); }

function isLow(p) { return Number(p.stock) <= storeConfig.lowStockThreshold; }

function renderStats() {
  const active = products.filter((p) => p.active !== false).length;
  $('#stTotal').textContent = formatNumber(products.length);
  $('#stActive').textContent = formatNumber(active);
  $('#stHidden').textContent = formatNumber(products.length - active);
  $('#stLow').textContent = formatNumber(products.filter(isLow).length);
}

function getFiltered() {
  const q = normalizeArabic($('#adminSearch').value);
  const cat = $('#adminCat').value;
  const status = $('#adminStatus').value;
  return products.filter((p) => {
    if (cat !== 'all' && p.category !== cat) return false;
    if (status === 'active' && p.active === false) return false;
    if (status === 'hidden' && p.active !== false) return false;
    if (status === 'low' && !isLow(p)) return false;
    return !q || normalizeArabic(`${p.name} ${p.sku} ${p.fabric}`).includes(q);
  });
}

function stockBadge(p) {
  const s = Number(p.stock);
  if (s === 0) return '<span class="badge badge-danger">نفد</span>';
  if (isLow(p)) return '<span class="badge badge-warn">منخفض</span>';
  return '';
}

function renderTable() {
  const list = getFiltered();
  $('#tableEmpty').classList.toggle('hidden', list.length > 0);
  $('#tbody').innerHTML = list.map((p) => `
    <tr data-id="${e(p.id)}" class="${p.active === false ? 'is-hidden' : ''}">
      <td data-col="img">
        ${p.images?.[0]
          ? `<img class="thumb-sm" src="${e(optimizeImg(p.images[0], 120))}" alt="" loading="lazy" />`
          : '<div class="thumb-sm grid place-items-center text-xl">👕</div>'}
      </td>
      <td data-col="name">
        <button class="font-bold text-right hover:underline leading-snug" data-act="edit">${e(p.name)}</button>
        <div class="text-xs text-slate-500" dir="ltr" style="text-align:right">${e(p.sku)}</div>
      </td>
      <td data-col="cat">
        <div class="flex flex-wrap gap-1">
          <span class="badge badge-soft">${e(CATEGORIES[p.category]?.label || '')}</span>
          <span class="badge badge-soft">${SEASONS[p.season]?.icon || ''} ${e(SEASONS[p.season]?.label || '')}</span>
          <span class="badge badge-soft">${formatNumber(p.piecesPerPack)} ق/باكيت</span>
        </div>
      </td>
      <td data-col="price" data-label="السعر">
        <input class="inline-input" type="number" min="0" step="0.01" inputmode="decimal" value="${Number(p.price) || 0}" data-field="price" aria-label="سعر ${e(p.name)}" />
      </td>
      <td data-col="stock" data-label="المخزون">
        <input class="inline-input !w-20" type="number" min="0" step="1" inputmode="numeric" value="${Number(p.stock) || 0}" data-field="stock" aria-label="مخزون ${e(p.name)}" />
        ${stockBadge(p)}
      </td>
      <td data-col="status">
        <label class="switch" title="${p.active === false ? 'مخفي' : 'معروض'}">
          <input type="checkbox" data-toggle ${p.active === false ? '' : 'checked'} aria-label="إظهار ${e(p.name)} في الكتالوج" /><span></span>
        </label>
      </td>
      <td data-col="actions" class="whitespace-nowrap text-left">
        <a class="btn btn-ghost btn-sm btn-icon" href="./#p=${encodeURIComponent(p.id)}" target="_blank" title="عرض في الكتالوج">${ICON.link}</a>
        <button class="btn btn-ghost btn-sm btn-icon" data-act="edit" title="تعديل">${ICON.edit}</button>
        <button class="btn btn-ghost btn-sm btn-icon" data-act="dup" title="نسخ كمنتج جديد">${ICON.copy}</button>
        <button class="btn btn-ghost btn-sm btn-icon text-red-600" data-act="del" title="حذف">${ICON.trash}</button>
      </td>
    </tr>`).join('');
}

function bindApp() {
  const rerender = debounce(renderTable, 150);
  $('#adminSearch').addEventListener('input', rerender);
  $('#adminCat').addEventListener('change', renderTable);
  $('#adminStatus').addEventListener('change', renderTable);
  $('#addBtn').addEventListener('click', () => openForm());
  $('#exportBtn').addEventListener('click', exportJSON);

  const tbody = $('#tbody');

  // أزرار الإجراءات
  tbody.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-act]'); if (!btn) return;
    const id = btn.closest('tr').dataset.id;
    const p = products.find((x) => x.id === id);
    if (btn.dataset.act === 'edit') openForm(p);
    if (btn.dataset.act === 'dup') openForm({ ...p, id: null, sku: '', name: `${p.name} (نسخة)` }, { duplicate: true });
    if (btn.dataset.act === 'del') confirmDelete(p);
  });

  // التعديل المباشر للسعر/المخزون
  tbody.addEventListener('change', async (ev) => {
    const input = ev.target;
    const id = input.closest('tr')?.dataset.id;
    const p = products.find((x) => x.id === id);
    if (!p) return;

    if (input.matches('[data-field]')) {
      const field = input.dataset.field;
      const value = field === 'stock' ? Math.max(0, Math.floor(Number(input.value) || 0)) : Math.max(0, Number(input.value) || 0);
      input.value = value;
      if (value === Number(p[field])) return;
      input.classList.remove('saved', 'err'); input.classList.add('saving');
      try {
        await updateProduct(id, { [field]: value });
        p[field] = value;
        input.classList.replace('saving', 'saved');
        setTimeout(() => input.classList.remove('saved'), 1200);
        renderStats();
        if (field === 'stock') {
          const cell = input.closest('td');
          cell.querySelector('.badge')?.remove();
          cell.insertAdjacentHTML('beforeend', stockBadge(p));
        }
      } catch (err) {
        console.error(err);
        input.classList.replace('saving', 'err');
        input.value = p[field];
        toast(authErrorMessage(err), 'error');
      }
    }

    if (input.matches('[data-toggle]')) {
      const active = input.checked;
      try {
        await updateProduct(id, { active });
        p.active = active;
        input.closest('tr').classList.toggle('is-hidden', !active);
        renderStats();
        toast(active ? 'المنتج معروض الآن في الكتالوج' : 'تم إخفاء المنتج من الكتالوج', 'success');
      } catch (err) {
        input.checked = !active;
        toast(authErrorMessage(err), 'error');
      }
    }
  });

  // Enter في الحقل المباشر = حفظ
  tbody.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && ev.target.matches('[data-field]')) ev.target.blur();
  });

  // إغلاق النوافذ
  $$('dialog').forEach((dlg) => {
    dlg.addEventListener('click', (ev) => {
      if (ev.target.closest('[data-close]')) { ev.preventDefault(); requestClose(dlg); }
      else if (ev.target === dlg) requestClose(dlg);
    });
    dlg.addEventListener('cancel', (ev) => { ev.preventDefault(); requestClose(dlg); }); // زر Esc
    dlg.addEventListener('close', () => document.body.classList.remove('modal-open'));
  });
}

function requestClose(dlg) {
  if (dlg.id === 'productDialog') {
    if (formImages.some((i) => i.status === 'uploading') && !confirm('يتم رفع صور الآن. هل تريد الإغلاق وإلغاء التغييرات؟')) return;
    if (formDirty && !confirm('لديك تغييرات غير محفوظة. هل تريد الإغلاق؟')) return;
  }
  dlg.close();
}

function showDialog(dlg) {
  dlg.showModal();
  document.body.classList.add('modal-open');
}

/* ---------------- الحذف ---------------- */
function confirmDelete(p) {
  const dlg = $('#confirmDialog');
  $('#cdText').innerHTML = `سيتم حذف "<strong>${e(p.name)}</strong>" (${e(p.sku)}) نهائياً ولا يمكن التراجع.`;
  const btn = $('#cdConfirm');
  btn.onclick = async () => {
    setBusy(btn, true, 'جارٍ الحذف...');
    try {
      await deleteProduct(p.id);
      products = products.filter((x) => x.id !== p.id);
      renderAll();
      dlg.close();
      toast('تم حذف المنتج', 'success');
    } catch (err) {
      toast(authErrorMessage(err), 'error');
    } finally { setBusy(btn, false); }
  };
  showDialog(dlg);
}

/* ---------------- نسخة احتياطية ---------------- */
function exportJSON() {
  const data = JSON.stringify(products.map(({ id, ...rest }) => ({ id, ...rest })), null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: `catalog-backup-${new Date().toISOString().slice(0, 10)}.json`,
  });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('تم تنزيل النسخة الاحتياطية', 'success');
}

/* =========================================================
 *  نموذج المنتج
 * ========================================================= */
function openForm(p = null, { duplicate = false } = {}) {
  editingId = p && !duplicate ? p.id : null;
  const f = $('#productForm');
  f.reset();
  $('#formError').textContent = '';
  $('#pdTitle').textContent = editingId ? 'تعديل المنتج' : (duplicate ? 'نسخ منتج' : 'منتج جديد');
  $('#saveBtn').textContent = editingId ? 'حفظ التعديلات' : 'إضافة المنتج';

  const d = p || {};
  $('#fName').value = d.name || '';
  $('#fSku').value = d.sku || '';
  $('#fFabric').value = d.fabric || '';
  $('#fCategory').value = d.category || 'men';
  $('#fSeason').value = d.season || 'all';
  $('#fPrice').value = d.price ?? '';
  $('#fPack').value = d.piecesPerPack ?? 12;
  $('#fMoq').value = d.moq ?? 1;
  $('#fStock').value = d.stock ?? 10;
  $('#fColors').value = (d.colors || []).join('، ');
  $('#fActive').checked = d.active !== false;
  $('#fDesc').value = d.description || '';

  selectedSizes = [...(d.sizes || [])];
  formImages = (d.images || []).map((url) => ({ key: uid(), url, preview: url, progress: 100, status: 'done' }));

  if (!editingId && !$('#fSku').value) $('#fSku').value = generateSku($('#fCategory').value);

  renderSizes();
  renderImages();
  updatePackPreview();
  formDirty = false;
  showDialog($('#productDialog'));
  $('#productDialog .modal-body').scrollTop = 0;
  if (window.matchMedia('(min-width: 641px)').matches) setTimeout(() => $('#fName').focus(), 50);
}

function generateSku(cat) {
  const prefix = { men: 'SH', women: 'BN', kids: 'KD' }[cat] || 'PR';
  const used = new Set(products.map((p) => p.sku));
  let sku;
  do { sku = `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`; } while (used.has(sku));
  return sku;
}

function updatePackPreview() {
  const price = Number($('#fPrice').value) || 0;
  const pack = Math.max(1, Number($('#fPack').value) || 1);
  const moq = Math.max(1, Number($('#fMoq').value) || 1);
  $('#packPreview').innerHTML = price > 0
    ? `💡 سعر الباكيت: <strong>${formatPrice(price * pack)}</strong> — أقل طلب: <strong>${formatNumber(moq * pack)} قطعة</strong> بقيمة <strong>${formatPrice(price * pack * moq)}</strong>`
    : `💡 أقل طلب: <strong>${formatNumber(moq * pack)} قطعة</strong> — السعر سيظهر للزبون "عند الطلب"`;
}

/* ---------------- المقاسات ---------------- */
function renderSizes() {
  const presetAll = Object.values(SIZE_PRESETS).flat();
  const custom = selectedSizes.filter((s) => !presetAll.includes(s));
  const group = (label, sizes) => `
    <div class="flex flex-wrap items-center gap-1.5">
      <span class="text-xs text-slate-500 w-12 shrink-0">${e(label)}</span>
      ${sizes.map((s) => `<button type="button" class="size-toggle" data-size="${e(s)}" aria-pressed="${selectedSizes.includes(s)}">${e(s)}</button>`).join('')}
    </div>`;
  $('#sizePresets').innerHTML =
    Object.entries(SIZE_PRESETS).map(([k, v]) => group(k, v)).join('') +
    (custom.length ? group('مخصص', custom) : '');
}

/* ---------------- الصور ---------------- */
function renderImages() {
  $('#imgGrid').innerHTML = formImages.map((img, i) => `
    <div class="img-tile ${img.status}" data-key="${img.key}">
      <img src="${e(img.status === 'done' ? optimizeImg(img.preview, 300) : img.preview)}" alt="" />
      <div class="tile-actions">
        <button type="button" data-img="remove" title="حذف الصورة" class="text-red-600">${ICON.x}</button>
        ${i > 0 && img.status === 'done' ? `<button type="button" data-img="cover" title="اجعلها صورة الغلاف">${ICON.star}</button>` : ''}
      </div>
      ${i === 0 ? '<span class="badge badge-dark cover-tag">الغلاف</span>' : ''}
      ${img.status === 'uploading' ? `<div class="absolute inset-0 grid place-items-center text-white font-extrabold text-sm">${img.progress}%</div><div class="progress"><i style="width:${img.progress}%"></i></div>` : ''}
      ${img.status === 'error' ? '<div class="absolute inset-0 grid place-items-center"><span class="badge badge-danger">فشل الرفع</span></div>' : ''}
    </div>`).join('');
  $('#dropzone').classList.toggle('hidden', formImages.length >= MAX_IMAGES);
}

async function handleFiles(fileList) {
  const files = [...fileList].filter((f) => f.type.startsWith('image/'));
  const room = MAX_IMAGES - formImages.length;
  if (!files.length) return;
  if (files.length > room) toast(`الحد الأقصى ${MAX_IMAGES} صور — سيتم رفع ${room} فقط`, 'error');
  formDirty = true;

  await Promise.all(files.slice(0, room).map(async (file) => {
    const entry = { key: uid(), url: null, preview: URL.createObjectURL(file), progress: 0, status: 'uploading' };
    formImages.push(entry);
    renderImages();
    try {
      // في الوضع التجريبي نصغّر أكثر لأن مساحة المتصفح محدودة (~5MB)
      const compressed = await compressImage(file, mode === 'demo' ? 700 : 1600, mode === 'demo' ? 0.75 : 0.85);
      entry.url = await uploadImage(compressed, (pct) => {
        entry.progress = pct;
        const tile = $(`.img-tile[data-key="${entry.key}"]`);
        if (tile) {
          tile.querySelector('.progress i')?.style.setProperty('width', `${pct}%`);
          const label = tile.querySelector('.absolute.inset-0');
          if (label) label.textContent = `${pct}%`;
        }
      });
      URL.revokeObjectURL(entry.preview);
      entry.preview = entry.url;
      entry.status = 'done';
    } catch (err) {
      console.error(err);
      entry.status = 'error';
      toast(err.message || 'فشل رفع الصورة', 'error', 5000);
    }
    renderImages();
  }));
}

function bindForm() {
  const form = $('#productForm');

  form.addEventListener('input', (ev) => {
    formDirty = true;
    if (['fPrice', 'fPack', 'fMoq'].includes(ev.target.id)) updatePackPreview();
  });

  $('#fCategory').addEventListener('change', () => {
    // تحديث بادئة الكود تلقائياً لو كان مولّداً تلقائياً ولم يُعدّل
    const sku = $('#fSku').value;
    if (!editingId && /^(SH|BN|KD|PR)-\d{4}$/.test(sku)) $('#fSku').value = generateSku($('#fCategory').value);
  });
  $('#genSku').addEventListener('click', () => { $('#fSku').value = generateSku($('#fCategory').value); formDirty = true; });

  // المقاسات
  $('#sizePresets').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-size]'); if (!b) return;
    const s = b.dataset.size;
    selectedSizes = selectedSizes.includes(s) ? selectedSizes.filter((x) => x !== s) : [...selectedSizes, s];
    b.setAttribute('aria-pressed', String(selectedSizes.includes(s)));
    formDirty = true;
  });
  const addCustomSize = () => {
    const v = $('#customSize').value.trim();
    if (!v) return;
    if (!selectedSizes.includes(v)) selectedSizes.push(v);
    $('#customSize').value = '';
    renderSizes();
    formDirty = true;
  };
  $('#addSize').addEventListener('click', addCustomSize);
  $('#customSize').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); addCustomSize(); } });

  // الصور: اختيار + سحب وإفلات
  $('#fileInput').addEventListener('change', (ev) => { handleFiles(ev.target.files); ev.target.value = ''; });
  const dz = $('#dropzone');
  ['dragenter', 'dragover'].forEach((t) => dz.addEventListener(t, (ev) => { ev.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((t) => dz.addEventListener(t, (ev) => { ev.preventDefault(); dz.classList.remove('drag'); }));
  dz.addEventListener('drop', (ev) => handleFiles(ev.dataTransfer.files));

  // لصق صورة من الحافظة (Ctrl+V) داخل النموذج
  $('#productDialog').addEventListener('paste', (ev) => {
    const files = [...(ev.clipboardData?.files || [])];
    if (files.length) { ev.preventDefault(); handleFiles(files); }
  });

  $('#imgGrid').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-img]'); if (!b) return;
    const key = b.closest('.img-tile').dataset.key;
    const i = formImages.findIndex((x) => x.key === key);
    if (b.dataset.img === 'remove') formImages.splice(i, 1);
    if (b.dataset.img === 'cover') formImages.unshift(...formImages.splice(i, 1));
    formDirty = true;
    renderImages();
  });

  form.addEventListener('submit', onSubmit);
}

async function onSubmit(ev) {
  ev.preventDefault();
  const errEl = $('#formError');
  errEl.textContent = '';

  // التحقق من الصحة
  const name = $('#fName').value.trim();
  const sku = $('#fSku').value.trim().toUpperCase();
  if (!name) return fail('اسم الموديل مطلوب', '#fName');
  if (!sku) return fail('كود الصنف مطلوب', '#fSku');
  if (products.some((p) => p.sku === sku && p.id !== editingId)) return fail('كود الصنف مستخدم لمنتج آخر', '#fSku');
  if (!(Number($('#fPack').value) >= 1)) return fail('عدد القطع في الباكيت يجب أن يكون 1 أو أكثر', '#fPack');
  if (formImages.some((i) => i.status === 'uploading')) return fail('انتظر حتى ينتهي رفع الصور');

  const data = sanitizeProduct({
    name, sku,
    fabric: $('#fFabric').value,
    category: $('#fCategory').value,
    season: $('#fSeason').value,
    price: $('#fPrice').value,
    piecesPerPack: $('#fPack').value,
    moq: $('#fMoq').value,
    stock: $('#fStock').value,
    sizes: selectedSizes,
    colors: $('#fColors').value.split(/[,،]/),
    active: $('#fActive').checked,
    description: $('#fDesc').value,
    images: formImages.filter((i) => i.status === 'done').map((i) => i.url),
  });

  if (!data.images.length && !confirm('لم تُضف أي صورة. المنتجات بدون صور تقل مبيعاتها كثيراً. هل تريد الحفظ على أي حال؟')) return;

  setBusy($('#saveBtn'), true, 'جارٍ الحفظ...');
  try {
    if (editingId) {
      await updateProduct(editingId, data);
      const i = products.findIndex((p) => p.id === editingId);
      products[i] = { ...products[i], ...data, updatedAt: Date.now() };
      toast('تم حفظ التعديلات ✓', 'success');
    } else {
      const created = await addProduct(data);
      products.unshift(created);
      toast('تمت إضافة المنتج إلى الكتالوج ✓', 'success');
    }
    formDirty = false;
    $('#productDialog').close();
    renderAll();
  } catch (err) {
    console.error(err);
    fail(err.message && !err.code ? err.message : authErrorMessage(err));
  } finally {
    setBusy($('#saveBtn'), false);
  }

  function fail(msg, focusSel) {
    errEl.textContent = msg;
    if (focusSel) $(focusSel).focus();
  }
}

/* ---------------- أدوات ---------------- */
function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

function setBusy(btn, busy, label) {
  if (busy) {
    btn.dataset.label = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span><span>${label || ''}</span>`;
  } else if (btn.dataset.label) {
    btn.disabled = false;
    btn.innerHTML = btn.dataset.label;
    delete btn.dataset.label;
  }
}
