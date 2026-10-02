// ============================================================
//  KHARCHA BOOK SETTINGS: the only file you need to edit
// ============================================================

// 1. Paste your Firebase web config here (Firebase console →
//    Project settings → Your apps → Web app → "firebaseConfig").
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyBPU2aiefOk5SOwdiTvartQEODhsUu4wbo",
  authDomain: "kharcha-book-5759c.firebaseapp.com",
  projectId: "kharcha-book-5759c",
  storageBucket: "kharcha-book-5759c.firebasestorage.app",
  messagingSenderId: "63566473014",
  appId: "1:63566473014:web:993d77c917166b46037597"
};

// 2. Your two login emails, and the name to show for each.
//    Use the same emails in firestore.rules.
window.PEOPLE = {
  "growwithgautami16@gmail.com": "Gautami",
  "akashsiddhpura15@gmail.com": "Akash"
};

// 3. Monthly budget per category (₹). You can also change these
//    inside the app with "Edit budgets".
//    every: 2 means the bill comes every two months.
window.CATEGORIES = [
  { n: "Rent", b: 16000 },
  { n: "Cook", b: 8000 },
  { n: "Groceries", b: 6000 },
  { n: "Eating out", b: 3000 },
  { n: "Light bill", b: 1750, every: 2 },
  { n: "Gas", b: 250, every: 2 },
  { n: "WiFi and subscriptions", b: 1500 },
  { n: "Health and wellbeing", b: 0 },
  { n: "Festivals and repairs", b: 0 },
  { n: "Other", b: 0 }
];
