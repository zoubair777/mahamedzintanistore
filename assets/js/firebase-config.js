/**
 * ============================================================
 *  firebase-config.js — ملف الإعدادات الوحيد الذي تحتاج تعديله
 * ============================================================
 *  1) firebaseConfig   : من Firebase Console › Project settings › Your apps (Web)
 *  2) cloudinaryConfig : من Cloudinary Dashboard (Cloud name + Unsigned upload preset)
 *  3) storeConfig      : بيانات متجرك (الاسم، رقم الواتساب، العملة...)
 *
 *  💡 وضع التجربة (Demo Mode):
 *  إذا تركت firebaseConfig فارغاً سيعمل الموقع ببيانات تجريبية محفوظة
 *  في متصفحك فقط (localStorage) حتى تتمكن من معاينة كل شيء قبل الربط.
 *  دخول لوحة التحكم في وضع التجربة:  admin@demo.com  /  demo1234
 *
 *  ⚠️ ملاحظة أمنية: مفاتيح Firebase للويب ليست سرية بطبيعتها؛
 *  الحماية الحقيقية تتم عبر قواعد الأمان (firestore.rules) المرفقة.
 */

export const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
};

export const cloudinaryConfig = {
  cloudName: "",     // مثال: "dxyz123ab"
  uploadPreset: "",  // اسم الـ Preset من نوع Unsigned، مثال: "catalog_unsigned"
  folder: "catalog", // مجلد حفظ الصور داخل Cloudinary
};

export const storeConfig = {
  name: "محل محمد الزنتاني",
  tagline: "معرض ومحل ملابس شبابية",
  whatsapp: "218915059357", // رقم الواتساب بالصيغة الدولية بدون + أو أصفار بادئة
  phone: "+218 91 505 9357",
  address: "ليبيا",
  currency: "د.ل",
  showPrices: true,         // false = إخفاء الأسعار وإظهار زر "اطلب السعر" فقط
  newBadgeDays: 14,         // المنتجات المضافة خلال هذه المدة تظهر بشارة "جديد"
  lowStockThreshold: 5,     // تنبيه المخزون المنخفض في لوحة التحكم (بالباكيت)
};

/** هل تم إدخال إعدادات Firebase؟ إن لم يكن، يعمل الموقع في وضع التجربة */
export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
export const isCloudinaryConfigured = Boolean(cloudinaryConfig.cloudName && cloudinaryConfig.uploadPreset);
