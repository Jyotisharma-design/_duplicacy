const PhotoModel = require('../models/photoModel');
const { 
  emitPhotoProcessed, 
  emitDuplicateFound, 
  emitCountUpdate,
  emitProgressUpdate,
  emitBatchComplete 
} = require('../websocket/realTimeUpdates');

class DuplicateService {
  constructor() {
    this.tolerances = {
      timeTolerance: parseInt(process.env.TIME_TOLERANCE_SECONDS) || 2,
      gpsTolerance: parseFloat(process.env.GPS_TOLERANCE_DEGREES) || 0.0001
    };
    
    this.batchSize = parseInt(process.env.BATCH_SIZE) || 50;
    this.maxConcurrent = parseInt(process.env.MAX_CONCURRENT_PROCESSING) || 5;
  }

  // Main method to detect duplicates in a collection of photos
  async detectDuplicates(photos, sessionId) {
    const startTime = Date.now();
    
    // Convert to PhotoModel instances if needed
    const photoModels = photos.map(photo => 
      photo instanceof PhotoModel ? photo : PhotoModel.fromJSON(photo)
    );

    // Initialize counts
    const counts = {
      total: photoModels.length,
      processed: 0,
      unique: 0,
      duplicates: 0,
      duplicateGroups: 0
    };

    // Emit initial progress
    emitProgressUpdate(sessionId, {
      current: 0,
      total: photoModels.length,
      stage: 'initializing',
      message: 'Starting duplicate detection...'
    });

    // Filter photos that can be analyzed for duplicates
    const analyzablePhotos = photoModels.filter(photo => photo.canDetectDuplicates());
    const unanalyzablePhotos = photoModels.filter(photo => !photo.canDetectDuplicates());

    if (analyzablePhotos.length === 0) {
      throw new Error('No photos have the required metadata (timestamp and GPS) for duplicate detection');
    }

    // Sort photos by timestamp for more efficient comparison
    analyzablePhotos.sort((a, b) => {
      const timeA = new Date(a.metadata.timestamp).getTime();
      const timeB = new Date(b.metadata.timestamp).getTime();
      return timeA - timeB;
    });

    // Detect duplicates
    const duplicateGroups = await this._findDuplicateGroups(
      analyzablePhotos, 
      sessionId, 
      counts
    );

    // Mark photos as duplicates and assign group IDs
    this._assignDuplicateGroups(analyzablePhotos, duplicateGroups);

    // Update final counts
    counts.processed = photoModels.length;
    counts.unique = photoModels.filter(p => !p.isDuplicate).length;
    counts.duplicates = photoModels.filter(p => p.isDuplicate).length;
    counts.duplicateGroups = duplicateGroups.length;

    // Emit final count update
    emitCountUpdate(sessionId, counts);

    const processingTime = Date.now() - startTime;

    return {
      photos: photoModels,
      duplicateGroups: this._formatDuplicateGroups(duplicateGroups, analyzablePhotos),
      analyzablePhotos: analyzablePhotos.length,
      unanalyzablePhotos: unanalyzablePhotos.length,
      counts,
      processingTime,
      tolerances: this.tolerances
    };
  }

  // Find duplicate groups using efficient algorithm
  async _findDuplicateGroups(photos, sessionId, counts) {
    const duplicateGroups = [];
    const processedIndices = new Set();
    let groupId = 1;

    emitProgressUpdate(sessionId, {
      current: 0,
      total: photos.length,
      stage: 'analyzing',
      message: 'Analyzing photos for duplicates...'
    });

    // Process photos in batches to emit progress updates
    for (let i = 0; i < photos.length; i++) {
      if (processedIndices.has(i)) {
        continue;
      }

      const currentPhoto = photos[i];
      const duplicateGroup = {
        id: groupId++,
        photos: [currentPhoto],
        indices: [i]
      };

      // Find all duplicates of the current photo
      for (let j = i + 1; j < photos.length; j++) {
        if (processedIndices.has(j)) {
          continue;
        }

        const comparePhoto = photos[j];
        
        // Optimize: skip if time difference is too large
        const timeDiff = PhotoModel.calculateTimeDifference(currentPhoto, comparePhoto);
        if (timeDiff > this.tolerances.timeTolerance + 60) { // Add 60 second buffer
          break; // Since photos are sorted by time, no need to check further
        }

        if (PhotoModel.areDuplicates(currentPhoto, comparePhoto, this.tolerances)) {
          duplicateGroup.photos.push(comparePhoto);
          duplicateGroup.indices.push(j);
          processedIndices.add(j);
        }
      }

      // Only consider it a duplicate group if it has more than one photo
      if (duplicateGroup.photos.length > 1) {
        duplicateGroups.push(duplicateGroup);
        processedIndices.add(i);

        // Emit duplicate found event
        emitDuplicateFound(sessionId, {
          groupId: duplicateGroup.id,
          photoCount: duplicateGroup.photos.length,
          firstPhoto: duplicateGroup.photos[0].filename
        }, {
          ...counts,
          duplicateGroups: duplicateGroups.length
        });
      }

      // Update progress every 10 photos or when complete
      if (i % 10 === 0 || i === photos.length - 1) {
        counts.processed = i + 1;
        
        emitProgressUpdate(sessionId, {
          current: i + 1,
          total: photos.length,
          stage: 'analyzing',
          message: `Analyzed ${i + 1} of ${photos.length} photos...`
        });

        emitCountUpdate(sessionId, counts);
      }
    }

    return duplicateGroups;
  }

  // Assign duplicate group IDs to photos
  _assignDuplicateGroups(photos, duplicateGroups) {
    // Reset all photos
    photos.forEach(photo => {
      photo.isDuplicate = false;
      photo.duplicateGroup = null;
      photo.duplicateScore = 0;
    });

    // Assign group IDs and mark as duplicates
    duplicateGroups.forEach(group => {
      group.photos.forEach((photo, index) => {
        photo.isDuplicate = true;
        photo.duplicateGroup = group.id;
        photo.duplicateScore = this._calculateDuplicateScore(photo, group.photos);
        
        // Add references to other photos in the group
        photo.similarPhotos = group.photos
          .filter(p => p.id !== photo.id)
          .map(p => ({
            id: p.id,
            filename: p.filename,
            timestamp: p.metadata.timestamp,
            gps: p.getGPSString()
          }));
      });
    });
  }

  // Calculate a duplicate score based on metadata similarity
  _calculateDuplicateScore(photo, groupPhotos) {
    if (groupPhotos.length <= 1) return 0;

    let totalScore = 0;
    let comparisons = 0;

    groupPhotos.forEach(otherPhoto => {
      if (photo.id === otherPhoto.id) return;

      let score = 0;
      
      // Time similarity (closer = higher score)
      const timeDiff = PhotoModel.calculateTimeDifference(photo, otherPhoto);
      if (timeDiff !== null) {
        score += Math.max(0, 100 - (timeDiff * 10)); // Max 100 points, -10 per second
      }

      // GPS similarity (closer = higher score)
      const distance = PhotoModel.calculateDistance(photo, otherPhoto);
      if (distance !== null) {
        score += Math.max(0, 100 - (distance / 10)); // Max 100 points, -10 per meter
      }

      // Same camera model
      if (photo.metadata.camera.model && 
          photo.metadata.camera.model === otherPhoto.metadata.camera.model) {
        score += 20;
      }

      // Similar file size
      const sizeDiff = Math.abs(photo.fileSize - otherPhoto.fileSize);
      const sizeRatio = sizeDiff / Math.max(photo.fileSize, otherPhoto.fileSize);
      if (sizeRatio < 0.1) { // Less than 10% difference
        score += 15;
      }

      // Similar dimensions
      if (photo.metadata.technical.width && otherPhoto.metadata.technical.width &&
          photo.metadata.technical.height && otherPhoto.metadata.technical.height) {
        const widthRatio = Math.abs(photo.metadata.technical.width - otherPhoto.metadata.technical.width) / 
                          Math.max(photo.metadata.technical.width, otherPhoto.metadata.technical.width);
        const heightRatio = Math.abs(photo.metadata.technical.height - otherPhoto.metadata.technical.height) / 
                           Math.max(photo.metadata.technical.height, otherPhoto.metadata.technical.height);
        
        if (widthRatio < 0.05 && heightRatio < 0.05) { // Less than 5% difference
          score += 10;
        }
      }

      totalScore += score;
      comparisons++;
    });

    return comparisons > 0 ? Math.round(totalScore / comparisons) : 0;
  }

  // Format duplicate groups for response
  _formatDuplicateGroups(duplicateGroups, photos) {
    return duplicateGroups.map(group => ({
      id: group.id,
      photoCount: group.photos.length,
      photos: group.photos.map(photo => ({
        id: photo.id,
        filename: photo.filename,
        originalFilename: photo.originalFilename,
        thumbnailUrl: photo.thumbnailUrl,
        fileSize: photo.fileSize,
        timestamp: photo.getFormattedTimestamp(),
        gps: photo.getGPSString(),
        camera: [photo.metadata.camera.make, photo.metadata.camera.model]
          .filter(Boolean).join(' ') || 'Unknown',
        duplicateScore: photo.duplicateScore,
        metadata: {
          timestamp: photo.metadata.timestamp,
          gpsLatitude: photo.metadata.gpsLatitude,
          gpsLongitude: photo.metadata.gpsLongitude,
          technical: photo.metadata.technical
        }
      })),
      metadata: {
        averageTimestamp: this._calculateAverageTimestamp(group.photos),
        averageGPS: this._calculateAverageGPS(group.photos),
        timeSpan: this._calculateTimeSpan(group.photos),
        maxDistance: this._calculateMaxDistance(group.photos)
      }
    }));
  }

  // Calculate average timestamp for a group
  _calculateAverageTimestamp(photos) {
    const timestamps = photos
      .map(p => new Date(p.metadata.timestamp).getTime())
      .filter(t => !isNaN(t));
    
    if (timestamps.length === 0) return null;
    
    const average = timestamps.reduce((sum, t) => sum + t, 0) / timestamps.length;
    return new Date(average).toISOString();
  }

  // Calculate average GPS coordinates for a group
  _calculateAverageGPS(photos) {
    const validGPS = photos.filter(p => p.hasGPSData());
    if (validGPS.length === 0) return null;

    const avgLat = validGPS.reduce((sum, p) => sum + p.metadata.gpsLatitude, 0) / validGPS.length;
    const avgLng = validGPS.reduce((sum, p) => sum + p.metadata.gpsLongitude, 0) / validGPS.length;

    return {
      latitude: parseFloat(avgLat.toFixed(6)),
      longitude: parseFloat(avgLng.toFixed(6))
    };
  }

  // Calculate time span for a group
  _calculateTimeSpan(photos) {
    const timestamps = photos
      .map(p => new Date(p.metadata.timestamp))
      .filter(t => !isNaN(t.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());

    if (timestamps.length < 2) return 0;

    return (timestamps[timestamps.length - 1].getTime() - timestamps[0].getTime()) / 1000; // seconds
  }

  // Calculate maximum distance between photos in a group
  _calculateMaxDistance(photos) {
    const validGPS = photos.filter(p => p.hasGPSData());
    if (validGPS.length < 2) return 0;

    let maxDistance = 0;
    for (let i = 0; i < validGPS.length; i++) {
      for (let j = i + 1; j < validGPS.length; j++) {
        const distance = PhotoModel.calculateDistance(validGPS[i], validGPS[j]);
        if (distance > maxDistance) {
          maxDistance = distance;
        }
      }
    }

    return maxDistance;
  }

  // Validate photos for duplicate detection
  validatePhotosForDetection(photos) {
    const issues = [];
    const analyzable = photos.filter(photo => {
      const model = photo instanceof PhotoModel ? photo : PhotoModel.fromJSON(photo);
      return model.canDetectDuplicates();
    });

    if (photos.length === 0) {
      issues.push('No photos provided');
    }

    if (analyzable.length === 0) {
      issues.push('No photos have the required metadata (timestamp and GPS coordinates)');
    }

    if (analyzable.length < 2) {
      issues.push('At least 2 photos with metadata are required for duplicate detection');
    }

    return {
      isValid: issues.length === 0,
      issues,
      totalPhotos: photos.length,
      analyzablePhotos: analyzable.length,
      unanalyzablePhotos: photos.length - analyzable.length
    };
  }

  // Get statistics about duplicate detection results
  getDetectionStatistics(results) {
    const { photos, duplicateGroups } = results;
    
    const stats = {
      totalPhotos: photos.length,
      uniquePhotos: photos.filter(p => !p.isDuplicate).length,
      duplicatePhotos: photos.filter(p => p.isDuplicate).length,
      duplicateGroups: duplicateGroups.length,
      averageGroupSize: duplicateGroups.length > 0 
        ? duplicateGroups.reduce((sum, group) => sum + group.photoCount, 0) / duplicateGroups.length
        : 0,
      largestGroupSize: duplicateGroups.length > 0 
        ? Math.max(...duplicateGroups.map(group => group.photoCount))
        : 0,
      spaceSaved: this._calculateSpaceSaved(duplicateGroups),
      tolerances: this.tolerances
    };

    return stats;
  }

  // Calculate potential space saved by removing duplicates
  _calculateSpaceSaved(duplicateGroups) {
    return duplicateGroups.reduce((totalSaved, group) => {
      // Keep the largest file in each group, remove others
      const fileSizes = group.photos.map(p => p.fileSize).sort((a, b) => b - a);
      const spaceSaved = fileSizes.slice(1).reduce((sum, size) => sum + size, 0);
      return totalSaved + spaceSaved;
    }, 0);
  }

  // Export duplicate groups to various formats
  exportResults(results, format = 'json') {
    const { photos, duplicateGroups, counts, processingTime } = results;

    const exportData = {
      summary: {
        generatedAt: new Date().toISOString(),
        processingTime,
        totalPhotos: counts.total,
        uniquePhotos: counts.unique,
        duplicatePhotos: counts.duplicates,
        duplicateGroups: counts.duplicateGroups,
        tolerances: this.tolerances
      },
      duplicateGroups,
      unanalyzablePhotos: photos
        .filter(p => !p.canDetectDuplicates())
        .map(p => ({
          filename: p.filename,
          issues: this._getPhotoIssues(p)
        }))
    };

    switch (format.toLowerCase()) {
      case 'json':
        return JSON.stringify(exportData, null, 2);
      case 'csv':
        return this._exportToCSV(exportData);
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  // Export to CSV format
  _exportToCSV(data) {
    const csvLines = [];
    csvLines.push('Group ID,Photo Filename,File Size,Timestamp,GPS Coordinates,Camera,Duplicate Score');

    data.duplicateGroups.forEach(group => {
      group.photos.forEach(photo => {
        csvLines.push([
          group.id,
          `"${photo.filename}"`,
          photo.fileSize,
          `"${photo.timestamp}"`,
          `"${photo.gps || 'N/A'}"`,
          `"${photo.camera}"`,
          photo.duplicateScore
        ].join(','));
      });
    });

    return csvLines.join('\n');
  }

  // Get issues with a photo that prevent duplicate detection
  _getPhotoIssues(photo) {
    const issues = [];
    
    if (!photo.hasTimestamp()) {
      issues.push('No timestamp');
    }
    
    if (!photo.hasGPSData()) {
      issues.push('No GPS coordinates');
    }
    
    return issues;
  }
}

module.exports = DuplicateService;