/**
 * ============================================================
 *  store.js — طبقة البيانات (Data Layer)
 * ============================================================
 *  واجهة موحدة تستخدمها الصفحتان، وتعمل بأحد وضعين:
 *   • Firebase  : Firestore للبيانات + Firebase Auth للدخول + Cloudinary للصور
 *   • Demo      : localStorage (عند عدم إدخال إعدادات Firebase) للمعاينة الفورية
 *
 *  يتم تحميل مكتبات Firebase ديناميكياً عند الحاجة فقط (Lazy Loading)
 *  لذا صفحة الزبائن لا تحمّل مكتبة Auth إطلاقاً → موقع أسرع.
 */
import {
  firebaseConfig, cloudinaryConfig,
  isFirebaseConfigured, isCloudinaryConfigured,
} from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.14.1';
const COLLECTION = 'products';

export const mode = isFirebaseConfigured ? 'firebase' : 'demo';

/* =========================================================
 *  Firebase (تحميل كسول)
 * ========================================================= */
let _app, _db, _fs, _auth, _authMod;

async function getApp() {
  if (_app) return _app;
  const { initializeApp } = await import(`${SDK}/firebase-app.js`);
  _app = initializeApp(firebaseConfig);
  return _app;
}

async function getDb() {
  if (_db) return { db: _db, fs: _fs };
  const app = await getApp();
  _fs = await import(`${SDK}/firebase-firestore.js`);
  _db = _fs.getFirestore(app);
  return { db: _db, fs: _fs };
}

async function getAuthBundle() {
  if (_auth) return { auth: _auth, a: _authMod };
  const app = await getApp();
  _authMod = await import(`${SDK}/firebase-auth.js`);
  _auth = _authMod.getAuth(app);
  return { auth: _auth, a: _authMod };
}

/** تحويل مستند Firestore إلى كائن JS عادي */
function fromDoc(d) {
  const data = d.data();
  return {
    ...data,
    id: d.id,
    createdAt: data.createdAt?.toMillis?.() ?? data.createdAt ?? 0,
    updatedAt: data.updatedAt?.toMillis?.() ?? data.updatedAt ?? 0,
  };
}

/** تنظيف وتوحيد بيانات المنتج قبل الحفظ (أنواع صحيحة + حدود منطقية) */
export function sanitizeProduct(p) {
  const num = (v, min = 0) => Math.max(min, Number(v) || 0);
  const out = {
    name: String(p.name ?? '').trim().slice(0, 120),
    sku: String(p.sku ?? '').trim().toUpperCase().slice(0, 40),
    category: ['men', 'women', 'kids'].includes(p.category) ? p.category : 'men',
    season: ['summer', 'winter', 'all'].includes(p.season) ? p.season : 'all',
    fabric: String(p.fabric ?? '').trim().slice(0, 80),
    description: String(p.description ?? '').trim().slice(0, 1000),
    price: num(p.price),
    piecesPerPack: num(p.piecesPerPack, 1),
    moq: num(p.moq, 1),
    stock: Math.floor(num(p.stock)),
    sizes: (p.sizes ?? []).map((s) => String(s).trim()).filter(Boolean).slice(0, 30),
    colors: (p.colors ?? []).map((s) => String(s).trim()).filter(Boolean).slice(0, 20),
    images: (p.images ?? []).filter((u) => typeof u === 'string' && u).slice(0, 10),
    active: p.active !== false,
  };
  return out;
}

/* =========================================================
 *  الوضع التجريبي (localStorage)
 * ========================================================= */
const DEMO_KEY = 'wc_demo_products_v2';
const DEMO_AUTH = 'wc_demo_auth';
const demoListeners = new Set();

/** صورة SVG بديلة جميلة (لا تحتاج إنترنت) للمنتجات التجريبية */
function placeholder(hue, kind = 'shirt') {
  const shapes = {
    shirt: 'M70 40 L100 28 Q120 44 140 28 L170 40 L196 78 L170 92 L164 82 L164 200 L76 200 L76 82 L70 92 L44 78 Z',
    dress: 'M96 26 Q120 40 144 26 L150 62 L140 84 L184 204 L56 204 L100 84 L90 62 Z',
    hoodie: 'M84 40 Q120 10 156 40 L188 62 L204 150 L182 156 L170 104 L170 204 L70 204 L70 104 L58 156 L36 150 L52 62 Z',
    kids: 'M82 58 L104 48 Q120 60 136 48 L158 58 L178 86 L160 96 L156 90 L156 176 L84 176 L84 90 L80 96 L62 86 Z',
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 300">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue},45%,92%)"/><stop offset="1" stop-color="hsl(${hue},40%,80%)"/>
    </linearGradient></defs>
    <rect width="240" height="300" fill="url(#g)"/>
    <g transform="translate(0,30)"><path d="${shapes[kind]}" fill="hsl(${hue},38%,42%)" opacity=".9"/></g>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function seedDemo() {
  const day = 86400000, now = Date.now();
  const items = [
    ['تيشيرت أوفر سايز قطن', 'SH-1024', 'men', 'summer', 'قطن 100% ثقيل', 45, 6, 1, 40, ['M','L','XL','2XL'], ['أسود','أبيض','بيج'], 210, 'shirt', 2],
    ['هودي شبابي مطبوع', 'SH-2210', 'men', 'winter', 'قطن مبطن 320 جرام', 95, 6, 1, 18, ['L','XL','2XL','3XL'], ['أسود','كحلي','رمادي'], 0, 'hoodie', 5],
    ['فستان بناتي صيفي', 'BN-3301', 'women', 'summer', 'شيفون مع بطانة', 120, 4, 1, 12, ['S','M','L','XL'], ['نبيتي','زيتي'], 330, 'dress', 1],
    ['بلوزة بناتي كاجوال', 'BN-3415', 'women', 'all', 'كريب', 70, 6, 1, 3, ['S','M','L'], ['أسود','وردي'], 20, 'shirt', 30],
    ['جاكيت بومبر شبابي', 'SH-4002', 'men', 'winter', 'جلد صناعي مبطن', 180, 4, 1, 25, ['M','L','XL'], ['أسود','زيتي'], 28, 'hoodie', 40],
    ['طقم رياضي أطفال', 'KD-5120', 'kids', 'summer', 'قطن مسرّح', 40, 6, 1, 60, ['4-5','6-7','8-9','10-11'], ['متعدد'], 190, 'kids', 3],
    ['هودي أطفال شتوي', 'KD-5208', 'kids', 'winter', 'مخمل ناعم', 55, 6, 1, 0, ['4-5','6-7','8-9','10-11'], ['أزرق','رمادي'], 260, 'kids', 50],
    ['قميص بولو شبابي', 'SH-1130', 'men', 'summer', 'بيكيه قطن', 0, 12, 1, 35, ['S','M','L','XL','2XL'], ['أبيض','أسود','أخضر'], 150, 'shirt', 60],
  ];
  const products = items.map(([name, sku, category, season, fabric, price, piecesPerPack, moq, stock, sizes, colors, hue, kind, ageDays], i) => ({
    id: `demo-${i + 1}`,
    name, sku, category, season, fabric, price, piecesPerPack, moq, stock, sizes, colors,
    description: 'موديل شبابي بخامة عالية الجودة وتشطيب ممتاز. متوفر في المعرض، والألوان حسب المخزون.',
    images: [placeholder(hue, kind), placeholder(hue + 25, kind), placeholder(hue - 25, kind)],
    active: true,
    createdAt: now - ageDays * day,
    updatedAt: now - ageDays * day,
  }));
  localStorage.setItem(DEMO_KEY, JSON.stringify(products));
  return products;
}

function demoRead() {
  try {
    const raw = localStorage.getItem(DEMO_KEY);
    return raw ? JSON.parse(raw) : seedDemo();
  } catch { return seedDemo(); }
}
function demoWrite(list) {
  try { localStorage.setItem(DEMO_KEY, JSON.stringify(list)); }
  catch { throw new Error('مساحة التخزين في المتصفح ممتلئة (الوضع التجريبي). احذف بعض الصور.'); }
}

/* =========================================================
 *  الواجهة العامة (Public API)
 * ========================================================= */

/** جلب المنتجات. includeHidden=true للوحة التحكم فقط */
export async function listProducts({ includeHidden = false } = {}) {
  let list;
  if (mode === 'demo') {
    list = demoRead();
  } else {
    const { db, fs } = await getDb();
    const col = fs.collection(db, COLLECTION);
    // الزبائن يجلبون المنتجات المفعّلة فقط (متوافق مع قواعد الأمان)
    const q = includeHidden ? col : fs.query(col, fs.where('active', '==', true));
    const snap = await fs.getDocs(q);
    list = snap.docs.map(fromDoc);
  }
  if (!includeHidden) list = list.filter((p) => p.active !== false);
  return list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function addProduct(data) {
  const clean = sanitizeProduct(data);
  if (mode === 'demo') {
    const list = demoRead();
    const item = { ...clean, id: `demo-${Date.now()}`, createdAt: Date.now(), updatedAt: Date.now() };
    list.unshift(item); demoWrite(list);
    return item;
  }
  const { db, fs } = await getDb();
  const ref = await fs.addDoc(fs.collection(db, COLLECTION), {
    ...clean, createdAt: fs.serverTimestamp(), updatedAt: fs.serverTimestamp(),
  });
  return { ...clean, id: ref.id, createdAt: Date.now(), updatedAt: Date.now() };
}

/** تحديث جزئي (مثلاً السعر أو المخزون فقط) */
export async function updateProduct(id, patch) {
  if (mode === 'demo') {
    const list = demoRead();
    const i = list.findIndex((p) => p.id === id);
    if (i === -1) throw new Error('المنتج غير موجود');
    list[i] = { ...list[i], ...patch, updatedAt: Date.now() };
    demoWrite(list);
    return list[i];
  }
  const { db, fs } = await getDb();
  await fs.updateDoc(fs.doc(db, COLLECTION, id), { ...patch, updatedAt: fs.serverTimestamp() });
}

export async function deleteProduct(id) {
  if (mode === 'demo') {
    demoWrite(demoRead().filter((p) => p.id !== id));
    return;
  }
  const { db, fs } = await getDb();
  await fs.deleteDoc(fs.doc(db, COLLECTION, id));
}

/* ---------- المصادقة ---------- */
export async function signIn(email, password) {
  if (mode === 'demo') {
    if (email.trim().toLowerCase() === 'admin@demo.com' && password === 'demo1234') {
      sessionStorage.setItem(DEMO_AUTH, '1');
      demoListeners.forEach((cb) => cb({ email: 'admin@demo.com', uid: 'demo' }));
      return;
    }
    throw Object.assign(new Error('demo'), { code: 'auth/invalid-credential' });
  }
  const { auth, a } = await getAuthBundle();
  await a.setPersistence(auth, a.browserLocalPersistence);
  await a.signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function signOut() {
  if (mode === 'demo') {
    sessionStorage.removeItem(DEMO_AUTH);
    demoListeners.forEach((cb) => cb(null));
    return;
  }
  const { auth, a } = await getAuthBundle();
  await a.signOut(auth);
}

export async function sendPasswordReset(email) {
  if (mode === 'demo') return;
  const { auth, a } = await getAuthBundle();
  await a.sendPasswordResetEmail(auth, email.trim());
}

/** مراقبة حالة الدخول: cb(user | null) */
export async function onAuthChange(cb) {
  if (mode === 'demo') {
    demoListeners.add(cb);
    cb(sessionStorage.getItem(DEMO_AUTH) ? { email: 'admin@demo.com', uid: 'demo' } : null);
    return () => demoListeners.delete(cb);
  }
  const { auth, a } = await getAuthBundle();
  return a.onAuthStateChanged(auth, cb);
}

/** ترجمة أخطاء Firebase إلى رسائل عربية مفهومة */
export function authErrorMessage(err) {
  const map = {
    'auth/invalid-credential': 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
    'auth/invalid-email': 'صيغة البريد الإلكتروني غير صحيحة.',
    'auth/user-disabled': 'هذا الحساب موقوف.',
    'auth/too-many-requests': 'محاولات كثيرة. انتظر قليلاً ثم حاول مجدداً.',
    'auth/network-request-failed': 'تعذّر الاتصال بالإنترنت.',
    'permission-denied': 'ليست لديك صلاحية. تأكد من إضافة UID حسابك في قواعد الأمان.',
  };
  return map[err?.code] || 'حدث خطأ غير متوقع. حاول مرة أخرى.';
}

/* ---------- رفع الصور ---------- */
/**
 * رفع صورة مع شريط تقدم.
 *  • Cloudinary (موصى به – مجاني 25GB): رفع مباشر من المتصفح عبر Unsigned Preset
 *  • الوضع التجريبي: تحويل الصورة إلى Data URL وحفظها محلياً
 * @returns {Promise<string>} رابط الصورة
 */
export function uploadImage(file, onProgress = () => {}) {
  if (isCloudinaryConfigured) {
    return new Promise((resolve, reject) => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('upload_preset', cloudinaryConfig.uploadPreset);
      if (cloudinaryConfig.folder) fd.append('folder', cloudinaryConfig.folder);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/image/upload`);
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
      xhr.onload = () => {
        try {
          const res = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300 && res.secure_url) resolve(res.secure_url);
          else reject(new Error(res.error?.message || 'فشل رفع الصورة'));
        } catch { reject(new Error('استجابة غير صالحة من خادم الصور')); }
      };
      xhr.onerror = () => reject(new Error('تعذّر الاتصال بخادم الصور'));
      xhr.send(fd);
    });
  }
  if (mode === 'demo') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
      reader.onload = () => { onProgress(100); resolve(reader.result); };
      reader.onerror = () => reject(new Error('تعذّرت قراءة الصورة'));
      reader.readAsDataURL(file);
    });
  }
  return Promise.reject(new Error('لم يتم إعداد Cloudinary بعد. أضف cloudName و uploadPreset في firebase-config.js'));
}
