const { db, COLLECTIONS, LICENSE_TYPES } = require('../config/firebase');
const crypto = require('crypto');

class License {
  constructor(data) {
    this.id = data.id;
    this.userId = data.userId;
    this.licenseKey = data.licenseKey;
    this.licenseType = data.licenseType;
    this.status = data.status; // 'active', 'expired', 'suspended', 'cancelled'
    this.purchaseDate = data.purchaseDate;
    this.expiryDate = data.expiryDate;
    this.paymentId = data.paymentId;
    this.paymentMethod = data.paymentMethod; // 'stripe', 'paypal'
    this.amount = data.amount;
    this.currency = data.currency || 'USD';
    this.autoRenew = data.autoRenew || false;
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  // Create a new license
  static async create(licenseData) {
    try {
      const licenseKey = License.generateLicenseKey(licenseData.licenseType);
      
      const newLicense = {
        userId: licenseData.userId,
        licenseKey,
        licenseType: licenseData.licenseType,
        status: 'active',
        purchaseDate: new Date(),
        expiryDate: licenseData.expiryDate,
        paymentId: licenseData.paymentId,
        paymentMethod: licenseData.paymentMethod,
        amount: licenseData.amount,
        currency: licenseData.currency || 'USD',
        autoRenew: licenseData.autoRenew || false,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const docRef = await db.collection(COLLECTIONS.LICENSES).add(newLicense);
      return new License({ id: docRef.id, ...newLicense });
    } catch (error) {
      throw new Error(`Failed to create license: ${error.message}`);
    }
  }

  // Find license by key
  static async findByKey(licenseKey) {
    try {
      const snapshot = await db.collection(COLLECTIONS.LICENSES)
        .where('licenseKey', '==', licenseKey)
        .limit(1)
        .get();

      if (snapshot.empty) {
        return null;
      }

      const doc = snapshot.docs[0];
      return new License({ id: doc.id, ...doc.data() });
    } catch (error) {
      throw new Error(`Failed to find license: ${error.message}`);
    }
  }

  // Find licenses by user ID
  static async findByUserId(userId) {
    try {
      const snapshot = await db.collection(COLLECTIONS.LICENSES)
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .get();

      return snapshot.docs.map(doc => new License({ id: doc.id, ...doc.data() }));
    } catch (error) {
      throw new Error(`Failed to find user licenses: ${error.message}`);
    }
  }

  // Verify license key
  static async verify(licenseKey) {
    try {
      const license = await License.findByKey(licenseKey);
      
      if (!license) {
        return {
          valid: false,
          reason: 'License key not found'
        };
      }

      // Check if license is active
      if (license.status !== 'active') {
        return {
          valid: false,
          reason: `License is ${license.status}`,
          license
        };
      }

      // Check if license has expired
      if (license.expiryDate && new Date() > new Date(license.expiryDate.toDate())) {
        // Auto-update status to expired
        await license.updateStatus('expired');
        return {
          valid: false,
          reason: 'License has expired',
          license
        };
      }

      return {
        valid: true,
        license,
        licenseInfo: LICENSE_TYPES[license.licenseType]
      };
    } catch (error) {
      throw new Error(`License verification failed: ${error.message}`);
    }
  }

  // Generate license key
  static generateLicenseKey(licenseType) {
    const prefix = {
      'FREE': 'FL',
      'BASIC': 'BL',
      'PRO': 'PL',
      'UNLIMITED': 'UL'
    }[licenseType] || 'FL';

    // Generate a more secure license key
    const randomBytes = crypto.randomBytes(16);
    const timestamp = Date.now().toString(36).toUpperCase();
    const hash = crypto.createHash('sha256')
      .update(randomBytes + timestamp + licenseType)
      .digest('hex')
      .substring(0, 12)
      .toUpperCase();
    
    // Format: PREFIX-XXXX-XXXX-XXXX
    const formatted = hash.match(/.{1,4}/g).join('-');
    return `${prefix}-${formatted}`;
  }

  // Update license status
  async updateStatus(newStatus) {
    try {
      const updateData = {
        status: newStatus,
        updatedAt: new Date()
      };

      await db.collection(COLLECTIONS.LICENSES).doc(this.id).update(updateData);
      
      // Update local instance
      this.status = newStatus;
      this.updatedAt = new Date();
      
      return this;
    } catch (error) {
      throw new Error(`Failed to update license status: ${error.message}`);
    }
  }

  // Extend license
  async extend(days) {
    try {
      const currentExpiry = this.expiryDate ? new Date(this.expiryDate.toDate()) : new Date();
      const newExpiry = new Date(currentExpiry.getTime() + (days * 24 * 60 * 60 * 1000));
      
      const updateData = {
        expiryDate: newExpiry,
        status: 'active',
        updatedAt: new Date()
      };

      await db.collection(COLLECTIONS.LICENSES).doc(this.id).update(updateData);
      
      // Update local instance
      this.expiryDate = newExpiry;
      this.status = 'active';
      this.updatedAt = new Date();
      
      return this;
    } catch (error) {
      throw new Error(`Failed to extend license: ${error.message}`);
    }
  }

  // Cancel license
  async cancel() {
    try {
      await this.updateStatus('cancelled');
      return this;
    } catch (error) {
      throw new Error(`Failed to cancel license: ${error.message}`);
    }
  }

  // Check if license is valid
  isValid() {
    if (this.status !== 'active') {
      return false;
    }

    if (this.expiryDate && new Date() > new Date(this.expiryDate.toDate())) {
      return false;
    }

    return true;
  }

  // Get days until expiry
  getDaysUntilExpiry() {
    if (!this.expiryDate) {
      return null; // No expiry (lifetime license)
    }

    const now = new Date();
    const expiry = new Date(this.expiryDate.toDate());
    const diffTime = expiry - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return Math.max(0, diffDays);
  }

  // Get license info
  getLicenseInfo() {
    return LICENSE_TYPES[this.licenseType] || LICENSE_TYPES.FREE;
  }

  // Convert to JSON (safe for API responses)
  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      licenseKey: this.licenseKey,
      licenseType: this.licenseType,
      status: this.status,
      purchaseDate: this.purchaseDate,
      expiryDate: this.expiryDate,
      amount: this.amount,
      currency: this.currency,
      autoRenew: this.autoRenew,
      createdAt: this.createdAt,
      isValid: this.isValid(),
      daysUntilExpiry: this.getDaysUntilExpiry(),
      licenseInfo: this.getLicenseInfo()
    };
  }
}

module.exports = License;