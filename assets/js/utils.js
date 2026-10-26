/**
 * utils.js — أدوات مشتركة بين صفحة العرض ولوحة التحكم
 */
import { storeConfig } from './firebase-config.js';
import { isStoredImage, resolveImage } from './store.js';

/* ---------- القواميس (التصنيفات والمواسم) ---------- */
export const CATEGORIES = {
  men:   { label: 'شبابي',  icon: '👕' },
  women: { label: 'بناتي',  icon: '👗' },
  kids:  { label: 'أطفال',  icon: '🧸' },
};

export const SEASONS = {
  summer: { label: 'صيفي',      icon: '☀️' },
  winter: { label: 'شتوي',      icon: '❄️' },
  all:    { label: 'كل المواسم', icon: '🔄' },
};


/* ---------- الحماية من XSS: كل نص من قاعدة البيانات يمر من هنا ---------- */
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/* ---------- التنسيق ---------- */
const nf = new Intl.NumberFormat('ar-EG-u-nu-latn', { maximumFractionDigits: 2 });
export const formatNumber = (n) => nf.format(Number(n) || 0);

/** توحيد الحروف العربية لبحث أذكى: (أ إ آ ← ا) (ة ← ه) (ى ← ي) وحذف التشكيل */
export function normalizeArabic(str = '') {
  return String(str)
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .trim();
}

export function debounce(fn, wait = 250) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

export const isNew = (p) =>
  p.createdAt && Date.now() - p.createdAt < storeConfig.newBadgeDays * 86400000;

/** تحسين صور Cloudinary تلقائياً (صيغة وجودة وعرض مناسب) لتسريع التحميل */
export function optimizeImg(url, width = 600) {
  if (!url || !url.includes('res.cloudinary.com') || !url.includes('/upload/')) return url;
  return url.replace('/upload/', `/upload/f_auto,q_auto,c_limit,w_${width}/`);
}

/* ---------- عرض الصور المحفوظة في Firestore ---------- */
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

/** خصائص src لوسم <img>: الصور المحفوظة في Firestore تُحمَّل لاحقاً عبر hydrateImages */
export function imgAttrs(url, width = 600) {
  if (isStoredImage(url)) return `src="${BLANK}" data-fsimg="${escapeHtml(url)}" data-small="${width <= 500 ? 1 : 0}"`;
  return `src="${escapeHtml(optimizeImg(url, width))}"`;
}

const io = 'IntersectionObserver' in window
  ? new IntersectionObserver((entries) => entries.forEach((en) => {
      if (en.isIntersecting) { io.unobserve(en.target); loadImg(en.target); }
    }), { rootMargin: '400px' })
  : null;

function loadImg(img) {
  resolveImage(img.dataset.fsimg, img.dataset.small === '1')
    .then((src) => { if (src) img.src = src; })
    .catch((err) => console.error('image load failed', err));
}

/** تحميل الصور داخل عنصر معيّن (بشكل كسول عند الاقتراب من الشاشة) */
export function hydrateImages(root = document) {
  root.querySelectorAll('img[data-fsimg]').forEach((img) => {
    if (img.dataset.eager === '1' || !io) loadImg(img); else io.observe(img);
  });
}

/* ---------- رسائل التنبيه (Toast) ---------- */
export function toast(message, type = 'info', ms = 3200) {
  let host = document.getElementById('toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toast-host';
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.textContent = message;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-in'));
  setTimeout(() => {
    el.classList.remove('is-in');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
  }, ms);
}

/** رابط مباشر للمنتج داخل الكتالوج (يفتح نافذة المنتج تلقائياً) */
export function productUrl(id) {
  const base = location.href.replace(/admin\.html.*$/, '').split('#')[0];
  return `${base}#p=${encodeURIComponent(id)}`;
}

/* ---------- ضغط الصور قبل الرفع (أسرع رفعاً + توفير المساحة) ---------- */
export async function compressImage(file, maxSize = 1600, quality = 0.85) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // خلفية بيضاء للصور الشفافة
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file; // لا فائدة من الضغط
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
