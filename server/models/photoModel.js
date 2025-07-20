const moment = require('moment');

class PhotoModel {
  constructor(data = {}) {
    this.id = data.id || null;
    this.filename = data.filename || '';
    this.originalFilename = data.originalFilename || '';
    this.driveFileId = data.driveFileId || null;
    this.downloadUrl = data.downloadUrl || null;
    this.thumbnailUrl = data.thumbnailUrl || null;
    this.fileSize = data.fileSize || 0;
    this.mimeType = data.mimeType || '';
    this.checksum = data.checksum || null;
    
    // Metadata from EXIF
    this.metadata = {
      timestamp: data.metadata?.timestamp || null,
      gpsLatitude: data.metadata?.gpsLatitude || null,
      gpsLongitude: data.metadata?.gpsLongitude || null,
      gpsAltitude: data.metadata?.gpsAltitude || null,
      camera: {
        make: data.metadata?.camera?.make || null,
        model: data.metadata?.camera?.model || null,
        software: data.metadata?.camera?.software || null
      },
      technical: {
        width: data.metadata?.technical?.width || null,
        height: data.metadata?.technical?.height || null,
        orientation: data.metadata?.technical?.orientation || null,
        colorSpace: data.metadata?.technical?.colorSpace || null,
        iso: data.metadata?.technical?.iso || null,
        aperture: data.metadata?.technical?.aperture || null,
        shutterSpeed: data.metadata?.technical?.shutterSpeed || null,
        focalLength: data.metadata?.technical?.focalLength || null
      }
    };
    
    // Duplicate detection related
    this.duplicateGroup = data.duplicateGroup || null;
    this.isDuplicate = data.isDuplicate || false;
    this.duplicateScore = data.duplicateScore || 0;
    this.similarPhotos = data.similarPhotos || [];
    
    // Processing status
    this.processingStatus = data.processingStatus || 'pending';
    this.processingError = data.processingError || null;
    this.processedAt = data.processedAt || null;
    
    // Timestamps
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  // Validate essential data
  isValid() {
    return this.filename && this.fileSize > 0;
  }

  // Check if photo has GPS coordinates
  hasGPSData() {
    return this.metadata.gpsLatitude !== null && 
           this.metadata.gpsLongitude !== null;
  }

  // Check if photo has timestamp
  hasTimestamp() {
    return this.metadata.timestamp !== null;
  }

  // Check if photo has minimum data for duplicate detection
  canDetectDuplicates() {
    return this.hasGPSData() && this.hasTimestamp();
  }

  // Get formatted timestamp
  getFormattedTimestamp() {
    if (!this.metadata.timestamp) return null;
    return moment(this.metadata.timestamp).format('YYYY-MM-DD HH:mm:ss');
  }

  // Get GPS coordinates as string
  getGPSString() {
    if (!this.hasGPSData()) return null;
    return `${this.metadata.gpsLatitude.toFixed(6)}, ${this.metadata.gpsLongitude.toFixed(6)}`;
  }

  // Calculate distance between two photos in meters
  static calculateDistance(photo1, photo2) {
    if (!photo1.hasGPSData() || !photo2.hasGPSData()) {
      return null;
    }

    const R = 6371e3; // Earth's radius in meters
    const φ1 = photo1.metadata.gpsLatitude * Math.PI/180;
    const φ2 = photo2.metadata.gpsLatitude * Math.PI/180;
    const Δφ = (photo2.metadata.gpsLatitude - photo1.metadata.gpsLatitude) * Math.PI/180;
    const Δλ = (photo2.metadata.gpsLongitude - photo1.metadata.gpsLongitude) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // Distance in meters
  }

  // Calculate time difference between two photos in seconds
  static calculateTimeDifference(photo1, photo2) {
    if (!photo1.hasTimestamp() || !photo2.hasTimestamp()) {
      return null;
    }

    const time1 = new Date(photo1.metadata.timestamp);
    const time2 = new Date(photo2.metadata.timestamp);
    
    return Math.abs(time2.getTime() - time1.getTime()) / 1000; // Difference in seconds
  }

  // Check if two photos are duplicates based on criteria
  static areDuplicates(photo1, photo2, tolerances = {}) {
    const {
      timeTolerance = 2, // seconds
      gpsTolerance = 0.0001 // degrees
    } = tolerances;

    // Both photos must have required metadata
    if (!photo1.canDetectDuplicates() || !photo2.canDetectDuplicates()) {
      return false;
    }

    // Check time difference
    const timeDiff = PhotoModel.calculateTimeDifference(photo1, photo2);
    if (timeDiff === null || timeDiff > timeTolerance) {
      return false;
    }

    // Check GPS coordinates difference
    const latDiff = Math.abs(photo1.metadata.gpsLatitude - photo2.metadata.gpsLatitude);
    const lngDiff = Math.abs(photo1.metadata.gpsLongitude - photo2.metadata.gpsLongitude);
    
    if (latDiff > gpsTolerance || lngDiff > gpsTolerance) {
      return false;
    }

    return true;
  }

  // Convert to plain object for JSON serialization
  toJSON() {
    return {
      id: this.id,
      filename: this.filename,
      originalFilename: this.originalFilename,
      driveFileId: this.driveFileId,
      downloadUrl: this.downloadUrl,
      thumbnailUrl: this.thumbnailUrl,
      fileSize: this.fileSize,
      mimeType: this.mimeType,
      checksum: this.checksum,
      metadata: this.metadata,
      duplicateGroup: this.duplicateGroup,
      isDuplicate: this.isDuplicate,
      duplicateScore: this.duplicateScore,
      similarPhotos: this.similarPhotos,
      processingStatus: this.processingStatus,
      processingError: this.processingError,
      processedAt: this.processedAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  // Create from plain object
  static fromJSON(data) {
    return new PhotoModel(data);
  }

  // Validate timestamp format
  static isValidTimestamp(timestamp) {
    if (!timestamp) return false;
    const date = new Date(timestamp);
    return date instanceof Date && !isNaN(date);
  }

  // Validate GPS coordinates
  static isValidGPS(latitude, longitude) {
    return latitude !== null && 
           longitude !== null &&
           latitude >= -90 && 
           latitude <= 90 && 
           longitude >= -180 && 
           longitude <= 180;
  }

  // Generate a simple hash for quick comparison
  generateHash() {
    const hashData = [
      this.fileSize,
      this.metadata.timestamp ? new Date(this.metadata.timestamp).getTime() : '',
      this.metadata.gpsLatitude || '',
      this.metadata.gpsLongitude || '',
      this.metadata.technical.width || '',
      this.metadata.technical.height || ''
    ].join('|');
    
    return this.simpleHash(hashData);
  }

  // Simple hash function
  simpleHash(str) {
    let hash = 0;
    if (str.length === 0) return hash;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString();
  }
}

module.exports = PhotoModel;