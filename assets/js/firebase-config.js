/**
 * ============================================================
 *  firebase-config.js — ملف الإعدادات الوحيد الذي تحتاج تعديله
 * ============================================================
 *  1) firebaseConfig   : من Firebase Console › Project settings › Your apps (Web)
 *  2) cloudinaryConfig : من Cloudinary Dashboard (Cloud name + Unsigned upload preset)
 *  3) storeConfig      : بيانات متجرك (الاسم، الوصف، العنوان)
 *
 *  💡 قبل ربط Firebase: صفحة الزبائن تعرض منتجات تجريبية،
 *  ولوحة التحكم مقفلة تماماً (لا يمكن لأحد الدخول) حتى يتم الربط.
 *
 *  ⚠️ ملاحظة أمنية: مفاتيح Firebase للويب ليست سرية بطبيعتها؛
 *  الحماية الحقيقية تتم عبر قواعد الأمان (firestore.rules) المرفقة.
 */

export const firebaseConfig = {
  apiKey: "AIzaSyCS-THiBHsEx7jmL5C_LZKJgZs5srOfeJw",
  authDomain: "zintanistore-ecf05.firebaseapp.com",
  projectId: "zintanistore-ecf05",
  storageBucket: "zintanistore-ecf05.firebasestorage.app",
  messagingSenderId: "226373163715",
  appId: "1:226373163715:web:ed3924ae0b033e24822076",
};

export const cloudinaryConfig = {
  cloudName: "",     // مثال: "dxyz123ab"
  uploadPreset: "",  // اسم الـ Preset من نوع Unsigned، مثال: "catalog_unsigned"
  folder: "catalog", // مجلد حفظ الصور داخل Cloudinary
};

export const storeConfig = {
  name: "محل محمد الزنتاني",
  tagline: "معرض ومحل ملابس شبابية",
  address: "ليبيا",
  newBadgeDays: 14, // المنتجات المضافة خلال هذه المدة تظهر بشارة "جديد"
};

/** هل تم إدخال إعدادات Firebase؟ إن لم يكن، يعمل الموقع في وضع التجربة */
export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
export const isCloudinaryConfigured = Boolean(cloudinaryConfig.cloudName && cloudinaryConfig.uploadPreset);
