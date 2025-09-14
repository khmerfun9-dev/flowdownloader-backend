const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin SDK
let db;

try {
  // In production, use environment variables for Firebase config
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: process.env.FIREBASE_DATABASE_URL
    });
  } else {
    // For development, you can use a service account key file
    // Make sure to add firebase-service-account.json to .gitignore
    const serviceAccountPath = path.join(__dirname, 'firebase-service-account.json');
    try {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccountPath),
        databaseURL: process.env.FIREBASE_DATABASE_URL || 'https://flowdownloader-default-rtdb.firebaseio.com/'
      });
    } catch (error) {
      console.warn('Firebase service account file not found. Using environment variables.');
      // Fallback to environment variables
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
        }),
        databaseURL: process.env.FIREBASE_DATABASE_URL
      });
    }
  }

  db = admin.firestore();
  console.log('✅ Firebase initialized successfully');
} catch (error) {
  console.error('❌ Firebase initialization failed:', error.message);
  console.log('📝 Please set up Firebase configuration in environment variables or service account file');
}

// Collections
const COLLECTIONS = {
  USERS: 'users',
  LICENSES: 'licenses',
  PAYMENTS: 'payments',
  DOWNLOAD_HISTORY: 'download_history'
};

// License types and pricing
const LICENSE_TYPES = {
  FREE: {
    name: 'Free',
    price: 0,
    downloads_per_day: 5,
    max_quality: '720p',
    features: ['Basic downloads', '720p quality', '5 downloads/day']
  },
  BASIC: {
    name: 'Basic',
    price: 9.99,
    downloads_per_day: 50,
    max_quality: '1080p',
    features: ['HD downloads', '1080p quality', '50 downloads/day', 'No ads']
  },
  PRO: {
    name: 'Pro',
    price: 19.99,
    downloads_per_day: 200,
    max_quality: 'original',
    features: ['Unlimited quality', '200 downloads/day', 'Batch downloads', 'Priority support']
  },
  UNLIMITED: {
    name: 'Unlimited',
    price: 39.99,
    downloads_per_day: -1, // -1 means unlimited
    max_quality: 'original',
    features: ['Unlimited downloads', 'Original quality', 'Batch downloads', 'Priority support', 'API access']
  }
};

module.exports = {
  admin,
  db,
  COLLECTIONS,
  LICENSE_TYPES
};