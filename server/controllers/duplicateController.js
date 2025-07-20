const express = require('express');
const { v4: uuidv4 } = require('uuid');
const DuplicateService = require('../services/duplicateService');
const PhotoModel = require('../models/photoModel');
const { 
  emitProcessingComplete,
  emitError 
} = require('../websocket/realTimeUpdates');

const router = express.Router();

// Store detection results in memory (in production, use database)
const detectionResults = new Map();

// POST /api/duplicates/detect - Detect duplicates in provided photos
router.post('/detect', async (req, res) => {
  try {
    const { photos, sessionId, options = {} } = req.body;
    
    if (!photos || !Array.isArray(photos)) {
      return res.status(400).json({
        success: false,
        error: 'Photos array is required'
      });
    }

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID is required'
      });
    }

    const duplicateService = new DuplicateService();
    
    // Validate photos for duplicate detection
    const validation = duplicateService.validatePhotosForDetection(photos);
    
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: 'Photos validation failed',
        issues: validation.issues,
        details: validation
      });
    }

    // Start duplicate detection in background
    detectDuplicatesAsync(duplicateService, photos, sessionId, options);

    res.json({
      success: true,
      sessionId,
      message: 'Duplicate detection started',
      validation,
      status: 'detecting'
    });

  } catch (error) {
    console.error('Error starting duplicate detection:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start duplicate detection',
      message: error.message
    });
  }
});

// GET /api/duplicates/results/:sessionId - Get duplicate detection results
router.get('/results/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const results = detectionResults.get(sessionId);
    
    if (!results) {
      return res.status(404).json({
        success: false,
        error: 'Results not found for this session'
      });
    }

    res.json({
      success: true,
      results,
      sessionId
    });

  } catch (error) {
    console.error('Error getting duplicate results:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get results',
      message: error.message
    });
  }
});

// GET /api/duplicates/export/:sessionId - Export duplicate detection results
router.get('/export/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const { format = 'json' } = req.query;
    
    const results = detectionResults.get(sessionId);
    
    if (!results) {
      return res.status(404).json({
        success: false,
        error: 'Results not found for this session'
      });
    }

    const duplicateService = new DuplicateService();
    const exportData = duplicateService.exportResults(results, format);
    
    // Set appropriate headers based on format
    if (format.toLowerCase() === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="duplicates-${sessionId}.csv"`);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="duplicates-${sessionId}.json"`);
    }

    res.send(exportData);

  } catch (error) {
    console.error('Error exporting results:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export results',
      message: error.message
    });
  }
});

// GET /api/duplicates/statistics/:sessionId - Get detection statistics
router.get('/statistics/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const results = detectionResults.get(sessionId);
    
    if (!results) {
      return res.status(404).json({
        success: false,
        error: 'Results not found for this session'
      });
    }

    const duplicateService = new DuplicateService();
    const statistics = duplicateService.getDetectionStatistics(results);

    res.json({
      success: true,
      statistics,
      sessionId
    });

  } catch (error) {
    console.error('Error getting statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get statistics',
      message: error.message
    });
  }
});

// POST /api/duplicates/validate - Validate photos for duplicate detection
router.post('/validate', (req, res) => {
  try {
    const { photos } = req.body;
    
    if (!photos || !Array.isArray(photos)) {
      return res.status(400).json({
        success: false,
        error: 'Photos array is required'
      });
    }

    const duplicateService = new DuplicateService();
    const validation = duplicateService.validatePhotosForDetection(photos);

    res.json({
      success: true,
      validation
    });

  } catch (error) {
    console.error('Error validating photos:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate photos',
      message: error.message
    });
  }
});

// DELETE /api/duplicates/results/:sessionId - Clear detection results
router.delete('/results/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    
    if (detectionResults.has(sessionId)) {
      detectionResults.delete(sessionId);
    }

    res.json({
      success: true,
      message: 'Results cleared'
    });

  } catch (error) {
    console.error('Error clearing results:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear results',
      message: error.message
    });
  }
});

// GET /api/duplicates/group/:sessionId/:groupId - Get specific duplicate group details
router.get('/group/:sessionId/:groupId', (req, res) => {
  try {
    const { sessionId, groupId } = req.params;
    const results = detectionResults.get(sessionId);
    
    if (!results) {
      return res.status(404).json({
        success: false,
        error: 'Results not found for this session'
      });
    }

    const group = results.duplicateGroups.find(g => g.id === parseInt(groupId));
    
    if (!group) {
      return res.status(404).json({
        success: false,
        error: 'Duplicate group not found'
      });
    }

    res.json({
      success: true,
      group,
      sessionId
    });

  } catch (error) {
    console.error('Error getting duplicate group:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get duplicate group',
      message: error.message
    });
  }
});

// POST /api/duplicates/analyze-sample - Analyze a sample of photos for testing
router.post('/analyze-sample', async (req, res) => {
  try {
    const { samplePhotos } = req.body;
    
    if (!samplePhotos || !Array.isArray(samplePhotos)) {
      return res.status(400).json({
        success: false,
        error: 'Sample photos array is required'
      });
    }

    const duplicateService = new DuplicateService();
    const sessionId = uuidv4();
    
    // Quick analysis without real-time updates
    const results = await duplicateService.detectDuplicates(samplePhotos, sessionId);
    const statistics = duplicateService.getDetectionStatistics(results);

    res.json({
      success: true,
      results: {
        duplicateGroups: results.duplicateGroups,
        counts: results.counts,
        processingTime: results.processingTime,
        tolerances: results.tolerances
      },
      statistics,
      sessionId
    });

  } catch (error) {
    console.error('Error analyzing sample:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze sample',
      message: error.message
    });
  }
});

// POST /api/duplicates/compare-two - Compare two specific photos
router.post('/compare-two', (req, res) => {
  try {
    const { photo1, photo2, tolerances } = req.body;
    
    if (!photo1 || !photo2) {
      return res.status(400).json({
        success: false,
        error: 'Both photos are required for comparison'
      });
    }

    const photoModel1 = PhotoModel.fromJSON(photo1);
    const photoModel2 = PhotoModel.fromJSON(photo2);

    // Check if photos can be compared
    if (!photoModel1.canDetectDuplicates() || !photoModel2.canDetectDuplicates()) {
      return res.status(400).json({
        success: false,
        error: 'Both photos must have timestamp and GPS data for comparison'
      });
    }

    const areDuplicates = PhotoModel.areDuplicates(photoModel1, photoModel2, tolerances);
    const timeDifference = PhotoModel.calculateTimeDifference(photoModel1, photoModel2);
    const distance = PhotoModel.calculateDistance(photoModel1, photoModel2);

    res.json({
      success: true,
      comparison: {
        areDuplicates,
        timeDifference: timeDifference ? `${timeDifference.toFixed(2)} seconds` : null,
        distance: distance ? `${distance.toFixed(2)} meters` : null,
        photo1: {
          filename: photoModel1.filename,
          timestamp: photoModel1.getFormattedTimestamp(),
          gps: photoModel1.getGPSString()
        },
        photo2: {
          filename: photoModel2.filename,
          timestamp: photoModel2.getFormattedTimestamp(),
          gps: photoModel2.getGPSString()
        },
        tolerances: tolerances || {
          timeTolerance: 2,
          gpsTolerance: 0.0001
        }
      }
    });

  } catch (error) {
    console.error('Error comparing photos:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to compare photos',
      message: error.message
    });
  }
});

// Async function to detect duplicates
async function detectDuplicatesAsync(duplicateService, photos, sessionId, options = {}) {
  try {
    // Run duplicate detection
    const results = await duplicateService.detectDuplicates(photos, sessionId);
    
    // Store results
    detectionResults.set(sessionId, results);
    
    // Emit completion event
    emitProcessingComplete(sessionId, {
      totalPhotos: results.counts.total,
      uniquePhotos: results.counts.unique,
      duplicatePhotos: results.counts.duplicates,
      duplicateGroups: results.counts.duplicateGroups,
      processingTime: results.processingTime,
      duplicateGroupsData: results.duplicateGroups
    });

  } catch (error) {
    console.error('Error in duplicate detection:', error);
    
    // Store error in results for later retrieval
    detectionResults.set(sessionId, {
      error: error.message,
      status: 'failed',
      timestamp: new Date().toISOString()
    });
    
    emitError(sessionId, error, { stage: 'duplicate_detection' });
  }
}

module.exports = router;