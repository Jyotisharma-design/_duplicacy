const exifr = require('exifr');
const sharp = require('sharp');
const fs = require('fs').promises;
const moment = require('moment');

class ExifParser {
  constructor() {
    this.supportedFormats = [
      'image/jpeg',
      'image/jpg', 
      'image/tiff',
      'image/png',
      'image/heic',
      'image/heif',
      'image/webp'
    ];
  }

  // Check if file type is supported
  isSupported(mimeType) {
    return this.supportedFormats.includes(mimeType.toLowerCase());
  }

  // Extract all metadata from image file
  async extractMetadata(filePath, mimeType) {
    try {
      if (!this.isSupported(mimeType)) {
        throw new Error(`Unsupported file type: ${mimeType}`);
      }

      // Extract EXIF data
      const exifData = await this.extractExifData(filePath);
      
      // Get image dimensions and technical info using Sharp
      const imageInfo = await this.getImageInfo(filePath);
      
      // Combine all metadata
      return this.combineMetadata(exifData, imageInfo);
      
    } catch (error) {
      console.error('Error extracting metadata:', error);
      throw new Error(`Failed to extract metadata: ${error.message}`);
    }
  }

  // Extract EXIF data using exifr
  async extractExifData(filePath) {
    try {
      const options = {
        gps: true,
        pick: [
          // Timestamp fields
          'DateTimeOriginal',
          'DateTime', 
          'DateTimeDigitized',
          'CreateDate',
          'ModifyDate',
          
          // GPS fields
          'GPSLatitude',
          'GPSLongitude', 
          'GPSAltitude',
          'GPSTimeStamp',
          'GPSDateStamp',
          
          // Camera info
          'Make',
          'Model',
          'Software',
          'LensModel',
          'LensMake',
          
          // Technical details
          'ExifImageWidth',
          'ExifImageHeight',
          'Orientation',
          'ColorSpace',
          'ISO',
          'FNumber',
          'ExposureTime',
          'FocalLength',
          'Flash',
          'WhiteBalance',
          
          // File info
          'FileSize',
          'FileType',
          'MIMEType'
        ]
      };

      return await exifr.parse(filePath, options);
    } catch (error) {
      console.warn('Could not extract EXIF data:', error.message);
      return {};
    }
  }

  // Get image information using Sharp
  async getImageInfo(filePath) {
    try {
      const metadata = await sharp(filePath).metadata();
      
      return {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        channels: metadata.channels,
        density: metadata.density,
        hasAlpha: metadata.hasAlpha,
        orientation: metadata.orientation,
        size: metadata.size
      };
    } catch (error) {
      console.warn('Could not get image info with Sharp:', error.message);
      
      // Fallback to file stats
      try {
        const stats = await fs.stat(filePath);
        return {
          size: stats.size
        };
      } catch (statError) {
        return {};
      }
    }
  }

  // Combine and normalize metadata from different sources
  combineMetadata(exifData, imageInfo) {
    const metadata = {
      timestamp: this.extractTimestamp(exifData),
      gpsLatitude: this.extractGPSCoordinate(exifData, 'GPSLatitude'),
      gpsLongitude: this.extractGPSCoordinate(exifData, 'GPSLongitude'),
      gpsAltitude: this.extractGPSAltitude(exifData),
      camera: {
        make: exifData.Make || null,
        model: exifData.Model || null,
        software: exifData.Software || null,
        lensModel: exifData.LensModel || null,
        lensMake: exifData.LensMake || null
      },
      technical: {
        width: imageInfo.width || exifData.ExifImageWidth || null,
        height: imageInfo.height || exifData.ExifImageHeight || null,
        orientation: imageInfo.orientation || exifData.Orientation || null,
        colorSpace: exifData.ColorSpace || null,
        iso: exifData.ISO || null,
        aperture: exifData.FNumber || null,
        shutterSpeed: exifData.ExposureTime || null,
        focalLength: exifData.FocalLength || null,
        flash: exifData.Flash || null,
        whiteBalance: exifData.WhiteBalance || null,
        format: imageInfo.format || null,
        channels: imageInfo.channels || null,
        density: imageInfo.density || null,
        hasAlpha: imageInfo.hasAlpha || null
      }
    };

    return metadata;
  }

  // Extract the most reliable timestamp
  extractTimestamp(exifData) {
    // Priority order for timestamp fields
    const timestampFields = [
      'DateTimeOriginal',  // Most reliable for photos
      'CreateDate',
      'DateTime',
      'DateTimeDigitized',
      'ModifyDate'
    ];

    for (const field of timestampFields) {
      if (exifData[field]) {
        const timestamp = this.parseTimestamp(exifData[field]);
        if (timestamp) {
          return timestamp;
        }
      }
    }

    return null;
  }

  // Parse timestamp from various formats
  parseTimestamp(timestampValue) {
    if (!timestampValue) return null;

    try {
      // Handle Date objects
      if (timestampValue instanceof Date) {
        return timestampValue.toISOString();
      }

      // Handle string timestamps
      if (typeof timestampValue === 'string') {
        // Common EXIF format: "YYYY:MM:DD HH:MM:SS"
        const exifFormat = timestampValue.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
        const parsed = moment(exifFormat, 'YYYY-MM-DD HH:mm:ss');
        
        if (parsed.isValid()) {
          return parsed.toISOString();
        }

        // Try other common formats
        const formats = [
          'YYYY-MM-DD HH:mm:ss',
          'YYYY/MM/DD HH:mm:ss',
          'MM/DD/YYYY HH:mm:ss',
          'DD/MM/YYYY HH:mm:ss',
          'YYYY-MM-DDTHH:mm:ss',
          'YYYY-MM-DDTHH:mm:ssZ'
        ];

        for (const format of formats) {
          const attempt = moment(timestampValue, format);
          if (attempt.isValid()) {
            return attempt.toISOString();
          }
        }

        // Last resort: try native Date parsing
        const nativeDate = new Date(timestampValue);
        if (!isNaN(nativeDate.getTime())) {
          return nativeDate.toISOString();
        }
      }

      return null;
    } catch (error) {
      console.warn('Failed to parse timestamp:', timestampValue, error.message);
      return null;
    }
  }

  // Extract GPS coordinates
  extractGPSCoordinate(exifData, field) {
    const value = exifData[field];
    if (value === undefined || value === null) return null;

    try {
      // If it's already a number, return it
      if (typeof value === 'number') {
        return parseFloat(value.toFixed(6));
      }

      // If it's a string, try to parse it
      if (typeof value === 'string') {
        const parsed = parseFloat(value);
        if (!isNaN(parsed)) {
          return parseFloat(parsed.toFixed(6));
        }
      }

      return null;
    } catch (error) {
      console.warn(`Failed to parse GPS ${field}:`, value, error.message);
      return null;
    }
  }

  // Extract GPS altitude
  extractGPSAltitude(exifData) {
    const altitude = exifData.GPSAltitude;
    if (altitude === undefined || altitude === null) return null;

    try {
      const numAltitude = typeof altitude === 'number' ? altitude : parseFloat(altitude);
      if (isNaN(numAltitude)) return null;

      // Check altitude reference (0 = above sea level, 1 = below sea level)
      const altitudeRef = exifData.GPSAltitudeRef;
      const multiplier = altitudeRef === 1 ? -1 : 1;

      return parseFloat((numAltitude * multiplier).toFixed(2));
    } catch (error) {
      console.warn('Failed to parse GPS altitude:', altitude, error.message);
      return null;
    }
  }

  // Validate extracted metadata
  validateMetadata(metadata) {
    const issues = [];

    // Check timestamp
    if (!metadata.timestamp) {
      issues.push('No timestamp found');
    } else if (!moment(metadata.timestamp).isValid()) {
      issues.push('Invalid timestamp format');
    }

    // Check GPS coordinates
    if (metadata.gpsLatitude === null || metadata.gpsLongitude === null) {
      issues.push('No GPS coordinates found');
    } else {
      if (metadata.gpsLatitude < -90 || metadata.gpsLatitude > 90) {
        issues.push('Invalid latitude value');
      }
      if (metadata.gpsLongitude < -180 || metadata.gpsLongitude > 180) {
        issues.push('Invalid longitude value');
      }
    }

    // Check image dimensions
    if (!metadata.technical.width || !metadata.technical.height) {
      issues.push('No image dimensions found');
    }

    return {
      isValid: issues.length === 0,
      issues,
      hasTimestamp: !!metadata.timestamp,
      hasGPS: metadata.gpsLatitude !== null && metadata.gpsLongitude !== null,
      hasDimensions: !!metadata.technical.width && !!metadata.technical.height
    };
  }

  // Create a summary of extracted metadata for logging
  createMetadataSummary(metadata) {
    const validation = this.validateMetadata(metadata);
    
    return {
      timestamp: metadata.timestamp ? moment(metadata.timestamp).format('YYYY-MM-DD HH:mm:ss') : 'Not found',
      gps: metadata.gpsLatitude !== null && metadata.gpsLongitude !== null
        ? `${metadata.gpsLatitude.toFixed(6)}, ${metadata.gpsLongitude.toFixed(6)}`
        : 'Not found',
      dimensions: metadata.technical.width && metadata.technical.height
        ? `${metadata.technical.width}x${metadata.technical.height}`
        : 'Not found',
      camera: [metadata.camera.make, metadata.camera.model].filter(Boolean).join(' ') || 'Unknown',
      validation
    };
  }
}

module.exports = new ExifParser();