# 👕 محل محمد الزنتاني — معرض ومحل ملابس شبابية

كتالوج رقمي احترافي لمحل محمد الزنتاني (معرض ومحل ملابس شبابية)، يعمل **مجاناً بالكامل** على GitHub Pages، مع قاعدة بيانات Firebase ورفع صور عبر Cloudinary.

| صفحة الزبائن (`index.html`) | لوحة التحكم (`admin.html`) |
|---|---|
| شبكة منتجات متجاوبة 100% مع الموبايل | دخول آمن عبر Firebase Auth |
| فلاتر: شبابي / بناتي / أطفال + صيفي / شتوي | إحصائيات سريعة (معروض، مخفي، مخزون منخفض) |
| بحث عربي ذكي (يتجاهل الهمزات والتشكيل) | إضافة منتج مع رفع عدة صور (ضغط تلقائي + شريط تقدم) |
| نافذة تفاصيل بمعرض صور قابل للسحب | تعديل السعر والمخزون مباشرة من الجدول |
| زر واتساب لكل منتج برسالة جاهزة بتفاصيله | إظهار/إخفاء، نسخ، حذف المنتجات |
| **قائمة طلب** تُرسل كاملة عبر واتساب | نسخة احتياطية JSON بضغطة |
| روابط قابلة للمشاركة (`#cat=women` / `#p=ID`) | يعمل على الموبايل (الجدول يتحول لبطاقات) |

> 💡 **وضع التجربة:** المشروع يعمل فوراً قبل أي إعداد ببيانات تجريبية محفوظة في متصفحك.
> دخول لوحة التحكم التجريبي: `admin@demo.com` / `demo1234`

---

## 📁 هيكل الملفات

```
wholesale-catalog/
├── index.html              ← صفحة الزبائن (المعرض العام)
├── admin.html              ← لوحة التحكم (محمية بتسجيل الدخول)
├── 404.html                ← صفحة "غير موجود"
├── firestore.rules         ← قواعد أمان قاعدة البيانات (تُنسخ إلى Firebase)
├── robots.txt              ← منع فهرسة لوحة التحكم
├── .nojekyll               ← يخبر GitHub Pages بتقديم الملفات كما هي
├── README.md               ← هذا الدليل
└── assets/
    ├── css/
    │   └── style.css       ← التصميم المخصص (يكمّل Tailwind)
    └── js/
        ├── firebase-config.js  ← ⚙️ الملف الوحيد الذي تعدّله (المفاتيح + بيانات المتجر)
        ├── store.js            ← طبقة البيانات: Firestore + Auth + رفع الصور
        ├── utils.js            ← أدوات مشتركة (تنسيق، بحث عربي، حماية XSS، ضغط الصور)
        ├── app.js              ← منطق صفحة الزبائن
        └── admin.js            ← منطق لوحة التحكم
```

**التقنيات:** HTML5 + Tailwind CSS (CDN) + Vanilla JavaScript (ES Modules) — بدون أي أدوات بناء (Build) أو Node.js.

---

## 🚀 دليل الإعداد خطوة بخطوة

### الخطوة 1: إنشاء مشروع Firebase (قاعدة البيانات + الدخول)

1. ادخل إلى [console.firebase.google.com](https://console.firebase.google.com) بحساب Google.
2. اضغط **Create a project / إنشاء مشروع** ← اكتب اسماً (مثل `my-catalog`) ← يمكنك إيقاف Google Analytics ← **Create**.
3. **تسجيل تطبيق الويب:**
   - من الصفحة الرئيسية للمشروع اضغط أيقونة الويب **`</>`**.
   - اكتب اسماً للتطبيق ← **Register app** (لا تفعّل Firebase Hosting).
   - سيظهر لك كائن `firebaseConfig` — **انسخه**.
4. افتح `assets/js/firebase-config.js` والصق القيم:
   ```js
   export const firebaseConfig = {
     apiKey: "AIzaSy...",
     authDomain: "my-catalog.firebaseapp.com",
     projectId: "my-catalog",
     storageBucket: "my-catalog.appspot.com",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abc123",
   };
   ```

### الخطوة 2: تفعيل قاعدة البيانات Firestore

1. من القائمة الجانبية: **Build › Firestore Database** ← **Create database**.
2. اختر موقعاً قريباً منك (مثل `eur3` أو `me-central1`) ← اختر **Start in production mode** ← **Create**.

### الخطوة 3: إنشاء حساب المدير

1. **Build › Authentication** ← **Get started**.
2. تبويب **Sign-in method** ← اختر **Email/Password** ← فعّل الخيار الأول ← **Save**.
3. تبويب **Users** ← **Add user** ← أدخل بريدك وكلمة مرور قوية ← **Add user**.
4. **انسخ قيمة `User UID`** للمستخدم الذي أنشأته (سلسلة مثل `kD8f3...xY2`).

### الخطوة 4: تطبيق قواعد الأمان 🔒 (خطوة إلزامية)

1. افتح ملف `firestore.rules` واستبدل `PUT_YOUR_ADMIN_UID_HERE` بالـ UID الذي نسخته:
   ```
   && request.auth.uid in ['kD8f3...xY2'];
   ```
   (لإضافة أكثر من مدير: `['UID1', 'UID2']`)
2. في Firebase: **Firestore Database › Rules** ← احذف المحتوى الموجود والصق محتوى الملف كاملاً ← **Publish**.

> ⚠️ **لماذا هذا مهم؟** مفاتيح Firebase تظهر في كود الموقع (وهذا طبيعي وآمن). الحماية الحقيقية هي هذه القواعد: الزبائن يقرؤون المنتجات المعروضة فقط، والكتابة مسموحة **حصرياً** لحسابك.

### الخطوة 5: إعداد Cloudinary لرفع الصور (مجاني 25GB)

> لماذا Cloudinary وليس Firebase Storage؟ منذ أواخر 2024، يتطلب Firebase Storage للمشاريع الجديدة تفعيل خطة Blaze (الدفع حسب الاستخدام وبطاقة ائتمان). Cloudinary مجاني بدون بطاقة، ويحسّن الصور تلقائياً (WebP/AVIF، تغيير المقاس) فيصبح الموقع أسرع.

1. سجّل في [cloudinary.com](https://cloudinary.com/users/register_free) (الخطة المجانية).
2. من **Dashboard** انسخ **Cloud name**.
3. اذهب إلى **Settings (⚙️) › Upload › Upload presets** ← **Add upload preset**:
   - **Signing mode:** `Unsigned`
   - **Preset name:** مثلاً `catalog_unsigned`
   - **Folder:** `catalog`
   - (موصى به) في **Upload Control / Restrictions**: حدّد **Allowed formats** = `jpg, png, webp` و **Max file size** = `5MB`.
   - **Save**.
4. في `firebase-config.js`:
   ```js
   export const cloudinaryConfig = {
     cloudName: "dxyz123ab",
     uploadPreset: "catalog_unsigned",
     folder: "catalog",
   };
   ```

### الخطوة 6: بيانات متجرك

في نفس الملف عدّل `storeConfig`:
```js
export const storeConfig = {
  name: "اسم متجرك",
  tagline: "وصف قصير",
  whatsapp: "201001234567",   // الصيغة الدولية بدون + ولا 00 (مثال مصر: 20، السعودية: 966)
  phone: "+20 100 123 4567",
  address: "العنوان",
  currency: "ج.م",
  showPrices: true,           // false لإخفاء الأسعار وإظهار "السعر عند الطلب"
  newBadgeDays: 14,
  lowStockThreshold: 5,
};
```

---

## 🌐 النشر على GitHub Pages

### الطريقة (أ): من المتصفح — بدون أي برامج

1. سجّل الدخول إلى [github.com](https://github.com) ← زر **+** أعلى الصفحة ← **New repository**.
2. اسم المستودع: مثلاً `catalog` ← اختر **Public** ← **Create repository**.
3. اضغط رابط **uploading an existing file** ← اسحب **كل محتويات** مجلد المشروع (بما فيها مجلد `assets`) ← **Commit changes**.
   > ملاحظة: ملف `.nojekyll` يبدأ بنقطة وقد يكون مخفياً؛ إن لم يُرفع أنشئه من **Add file › Create new file** باسم `.nojekyll` واتركه فارغاً.
4. اذهب إلى **Settings › Pages**:
   - **Source:** `Deploy from a branch`
   - **Branch:** `main` والمجلد `/ (root)` ← **Save**.
5. انتظر دقيقة أو اثنتين، ثم حدّث الصفحة؛ سيظهر الرابط:
   `https://USERNAME.github.io/catalog/`

### الطريقة (ب): عبر سطر الأوامر (Git)

```bash
cd wholesale-catalog
git init
git add .
git commit -m "Initial catalog"
git branch -M main
git remote add origin https://github.com/USERNAME/catalog.git
git push -u origin main
```
ثم فعّل Pages كما في الخطوة 4 أعلاه.

### الخطوة الأخيرة: السماح لنطاق GitHub بتسجيل الدخول

في Firebase: **Authentication › Settings › Authorized domains** ← **Add domain** ← أضف:
```
USERNAME.github.io
```
بدون هذه الخطوة سيفشل تسجيل الدخول في لوحة التحكم على الموقع المنشور.

### ✅ جرّب الآن
- الكتالوج: `https://USERNAME.github.io/catalog/`
- لوحة التحكم: `https://USERNAME.github.io/catalog/admin.html`

لأي تعديل لاحق على الملفات: عدّلها في GitHub (أيقونة القلم ✏️) أو ارفعها من جديد، وسيتحدث الموقع تلقائياً خلال دقيقة.

---

## 🧪 التجربة محلياً

ملفات ES Modules لا تعمل بفتح الملف مباشرة (`file://`)، شغّل خادماً محلياً بسيطاً:
```bash
# Python
python -m http.server 8000
# أو Node
npx serve .
```
ثم افتح `http://localhost:8000`

---

## 🛡️ ملاحظات الأمان وأفضل الممارسات

| الموضوع | التطبيق |
|---|---|
| حماية الكتابة | قواعد Firestore تسمح بالكتابة فقط لـ UID المدير، مع التحقق من شكل البيانات |
| المنتجات المخفية | لا تُرسل للزبائن أصلاً (القواعد + الاستعلام يرفضانها) |
| XSS | كل نص من قاعدة البيانات يمر عبر `escapeHtml()` قبل العرض |
| لوحة التحكم | `noindex` + `robots.txt` لمنع ظهورها في محركات البحث |
| رفع الصور | Preset مقيّد بالصيغ والحجم والمجلد؛ الصور تُضغط في المتصفح قبل الرفع |
| كلمات المرور | تُدار بالكامل من Firebase Auth (مشفّرة، مع حماية من محاولات التخمين) |

**حدود الخطط المجانية (أكثر من كافية لكتالوج):**
- Firestore: 50,000 قراءة و20,000 كتابة يومياً، 1GB تخزين.
- Cloudinary: 25 رصيد شهرياً (~25GB تخزين أو نقل).
- GitHub Pages: 100GB نقل شهرياً.

> ℹ️ حذف منتج يحذفه من قاعدة البيانات، أما صوره فتبقى في Cloudinary (الحذف يتطلب مفتاحاً سرياً لا يجوز وضعه في موقع ثابت). يمكنك حذفها يدوياً من **Media Library** عند الحاجة.

---

## 🔧 تخصيص سريع

- **الألوان:** متغيرات CSS أعلى `assets/css/style.css` (`--brand`, `--accent`, ...) وكائن `tailwind.config` في رأس كل صفحة.
- **التصنيفات والمقاسات:** `CATEGORIES`, `SEASONS`, `SIZE_PRESETS` في `assets/js/utils.js` (عند إضافة تصنيف جديد حدّث أيضاً `sanitizeProduct` في `store.js` و `firestore.rules`).
- **نصوص الصفحة الرئيسية:** مباشرة في `index.html`.
- **للأداء الأقصى (اختياري):** Tailwind CDN مناسب تماماً للبدء، ويمكن لاحقاً توليد ملف CSS ثابت عبر [Tailwind CLI](https://tailwindcss.com/docs/installation) لتقليل حجم التحميل.
