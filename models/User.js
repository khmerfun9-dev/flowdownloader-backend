const { db, COLLECTIONS, LICENSE_TYPES } = require('../config/firebase');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

class User {
  constructor(data) {
    this.id = data.id;
    this.email = data.email;
    this.password = data.password;
    this.firstName = data.firstName;
    this.lastName = data.lastName;
    this.licenseType = data.licenseType || 'FREE';
    this.licenseKey = data.licenseKey;
    this.licenseExpiry = data.licenseExpiry;
    this.downloadsToday = data.downloadsToday || 0;
    this.lastDownloadDate = data.lastDownloadDate;
    this.isActive = data.isActive !== undefined ? data.isActive : true;
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  // Create a new user
  static async create(userData) {
    try {
      // Check if user already exists
      const existingUser = await User.findByEmail(userData.email);
      if (existingUser) {
        throw new Error('User already exists with this email');
      }

      // Hash password
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(userData.password, saltRounds);

      // Generate license key for free tier
      const licenseKey = User.generateLicenseKey('FREE');

      const newUser = {
        email: userData.email.toLowerCase(),
        password: hashedPassword,
        firstName: userData.firstName,
        lastName: userData.lastName,
        licenseType: 'FREE',
        licenseKey: licenseKey,
        licenseExpiry: null, // Free license doesn't expire
        downloadsToday: 0,
        lastDownloadDate: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const docRef = await db.collection(COLLECTIONS.USERS).add(newUser);
      return new User({ id: docRef.id, ...newUser });
    } catch (error) {
      throw new Error(`Failed to create user: ${error.message}`);
    }
  }

  // Find user by email
  static async findByEmail(email) {
    try {
      const snapshot = await db.collection(COLLECTIONS.USERS)
        .where('email', '==', email.toLowerCase())
        .limit(1)
        .get();

      if (snapshot.empty) {
        return null;
      }

      const doc = snapshot.docs[0];
      return new User({ id: doc.id, ...doc.data() });
    } catch (error) {
      throw new Error(`Failed to find user: ${error.message}`);
    }
  }

  // Find user by ID
  static async findById(userId) {
    try {
      const doc = await db.collection(COLLECTIONS.USERS).doc(userId).get();
      if (!doc.exists) {
        return null;
      }
      return new User({ id: doc.id, ...doc.data() });
    } catch (error) {
      throw new Error(`Failed to find user: ${error.message}`);
    }
  }

  // Find user by license key
  static async findByLicenseKey(licenseKey) {
    try {
      const snapshot = await db.collection(COLLECTIONS.USERS)
        .where('licenseKey', '==', licenseKey)
        .limit(1)
        .get();

      if (snapshot.empty) {
        return null;
      }

      const doc = snapshot.docs[0];
      return new User({ id: doc.id, ...doc.data() });
    } catch (error) {
      throw new Error(`Failed to find user by license key: ${error.message}`);
    }
  }

  // Authenticate user
  static async authenticate(email, password) {
    try {
      const user = await User.findByEmail(email);
      if (!user) {
        throw new Error('Invalid email or password');
      }

      if (!user.isActive) {
        throw new Error('Account is deactivated');
      }

      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        throw new Error('Invalid email or password');
      }

      return user;
    } catch (error) {
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }

  // Generate JWT token
  generateToken() {
    const payload = {
      userId: this.id,
      email: this.email,
      licenseType: this.licenseType
    };

    return jwt.sign(payload, process.env.JWT_SECRET || 'fallback-secret-key', {
      expiresIn: '7d'
    });
  }

  // Generate license key
  static generateLicenseKey(licenseType) {
    const prefix = {
      'FREE': 'FL',
      'BASIC': 'BL',
      'PRO': 'PL',
      'UNLIMITED': 'UL'
    }[licenseType] || 'FL';

    const randomPart = crypto.randomBytes(8).toString('hex').toUpperCase();
    const timestamp = Date.now().toString(36).toUpperCase();
    
    return `${prefix}-${randomPart.slice(0, 4)}-${timestamp}-${randomPart.slice(4)}`;
  }

  // Update user license
  async updateLicense(licenseType, duration = null) {
    try {
      const licenseKey = User.generateLicenseKey(licenseType);
      let licenseExpiry = null;

      if (duration && licenseType !== 'FREE') {
        licenseExpiry = new Date();
        licenseExpiry.setDate(licenseExpiry.getDate() + duration);
      }

      const updateData = {
        licenseType,
        licenseKey,
        licenseExpiry,
        updatedAt: new Date()
      };

      await db.collection(COLLECTIONS.USERS).doc(this.id).update(updateData);
      
      // Update local instance
      Object.assign(this, updateData);
      
      return this;
    } catch (error) {
      throw new Error(`Failed to update license: ${error.message}`);
    }
  }

  // Check if user can download (rate limiting)
  async canDownload() {
    try {
      const today = new Date().toDateString();
      const lastDownload = this.lastDownloadDate ? new Date(this.lastDownloadDate.toDate()).toDateString() : null;
      
      // Reset daily counter if it's a new day
      if (lastDownload !== today) {
        this.downloadsToday = 0;
      }

      const licenseInfo = LICENSE_TYPES[this.licenseType];
      const dailyLimit = licenseInfo.downloads_per_day;
      
      // -1 means unlimited
      if (dailyLimit === -1) {
        return { canDownload: true, remaining: -1 };
      }

      const remaining = Math.max(0, dailyLimit - this.downloadsToday);
      return {
        canDownload: remaining > 0,
        remaining,
        dailyLimit
      };
    } catch (error) {
      throw new Error(`Failed to check download permission: ${error.message}`);
    }
  }

  // Increment download count
  async incrementDownloadCount() {
    try {
      const today = new Date();
      const lastDownload = this.lastDownloadDate ? new Date(this.lastDownloadDate.toDate()).toDateString() : null;
      const todayString = today.toDateString();
      
      let newCount = this.downloadsToday;
      
      // Reset counter if it's a new day
      if (lastDownload !== todayString) {
        newCount = 1;
      } else {
        newCount += 1;
      }

      const updateData = {
        downloadsToday: newCount,
        lastDownloadDate: today,
        updatedAt: new Date()
      };

      await db.collection(COLLECTIONS.USERS).doc(this.id).update(updateData);
      
      // Update local instance
      this.downloadsToday = newCount;
      this.lastDownloadDate = today;
      this.updatedAt = new Date();
      
      return this;
    } catch (error) {
      throw new Error(`Failed to increment download count: ${error.message}`);
    }
  }

  // Get user info without sensitive data
  toJSON() {
    return {
      id: this.id,
      email: this.email,
      firstName: this.firstName,
      lastName: this.lastName,
      licenseType: this.licenseType,
      licenseKey: this.licenseKey,
      licenseExpiry: this.licenseExpiry,
      downloadsToday: this.downloadsToday,
      lastDownloadDate: this.lastDownloadDate,
      isActive: this.isActive,
      createdAt: this.createdAt,
      licenseInfo: LICENSE_TYPES[this.licenseType]
    };
  }
}

module.exports = User;