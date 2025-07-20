const express = require('express');
const { v4: uuidv4 } = require('uuid');
const GoogleDriveService = require('../services/googleDriveService');
const PhotoModel = require('../models/photoModel');
const exifParser = require('../utils/exifParser');
const { 
  emitProcessingStarted, 
  emitPhotoProcessed, 
  emitProgressUpdate,
  emitError 
} = require('../websocket/realTimeUpdates');

const router = express.Router();

// Store active sessions in memory (in production, use Redis or database)
const activeSessions = new Map();

// GET /api/drive/auth - Get OAuth2 authorization URL
router.get('/auth', (req, res) => {
  try {
    const driveService = new GoogleDriveService();
    const authUrl = driveService.generateAuthUrl();
    
    res.json({ 
      success: true, 
      authUrl,
      message: 'Click the URL to authorize access to Google Drive'
    });
  } catch (error) {
    console.error('Error generating auth URL:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to generate authorization URL',
      message: error.message 
    });
  }
});

// POST /api/drive/auth/callback - Handle OAuth2 callback
router.post('/auth/callback', async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Authorization code is required'
      });
    }

    const driveService = new GoogleDriveService();
    const { tokens } = await driveService.auth.getToken(code);
    driveService.setCredentials(tokens);

    // Store tokens in session (in production, use secure storage)
    req.session = req.session || {};
    req.session.googleTokens = tokens;

    res.json({
      success: true,
      message: 'Successfully authorized Google Drive access',
      hasAccess: true
    });
  } catch (error) {
    console.error('Error in auth callback:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process authorization',
      message: error.message
    });
  }
});

// POST /api/drive/validate - Validate Drive folder URL and check access
router.post('/validate', async (req, res) => {
  try {
    const { driveUrl, tokens } = req.body;
    
    if (!driveUrl) {
      return res.status(400).json({
        success: false,
        error: 'Drive URL is required'
      });
    }

    const driveService = new GoogleDriveService();
    
    // Set credentials if provided
    if (tokens) {
      driveService.setCredentials(tokens);
    } else if (req.session?.googleTokens) {
      driveService.setCredentials(req.session.googleTokens);
    } else {
      return res.status(401).json({
        success: false,
        error: 'Google Drive authorization required',
        needsAuth: true
      });
    }

    // Extract folder ID from URL
    const folderId = driveService.extractFolderId(driveUrl);
    
    // Validate folder access
    const validation = await driveService.validateFolderAccess(folderId);
    
    if (validation.isValid) {
      res.json({
        success: true,
        folderId,
        folderInfo: validation.folderInfo,
        imageCount: validation.imageCount,
        message: validation.message
      });
    } else {
      res.status(400).json({
        success: false,
        error: validation.error,
        message: validation.message
      });
    }

  } catch (error) {
    console.error('Error validating Drive folder:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate folder',
      message: error.message
    });
  }
});

// POST /api/drive/process - Start processing photos from Drive folder
router.post('/process', async (req, res) => {
  try {
    const { folderId, tokens, options = {} } = req.body;
    
    if (!folderId) {
      return res.status(400).json({
        success: false,
        error: 'Folder ID is required'
      });
    }

    const driveService = new GoogleDriveService();
    
    // Set credentials
    if (tokens) {
      driveService.setCredentials(tokens);
    } else if (req.session?.googleTokens) {
      driveService.setCredentials(req.session.googleTokens);
    } else {
      return res.status(401).json({
        success: false,
        error: 'Google Drive authorization required',
        needsAuth: true
      });
    }

    // Generate session ID for real-time updates
    const sessionId = uuidv4();
    
    // Store session info
    activeSessions.set(sessionId, {
      folderId,
      status: 'starting',
      startTime: Date.now(),
      photos: [],
      progress: { current: 0, total: 0 }
    });

    // Start processing in background
    processPhotosAsync(driveService, folderId, sessionId, options);

    res.json({
      success: true,
      sessionId,
      message: 'Photo processing started',
      status: 'processing'
    });

  } catch (error) {
    console.error('Error starting photo processing:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start processing',
      message: error.message
    });
  }
});

// GET /api/drive/session/:sessionId/status - Get processing status
router.get('/session/:sessionId/status', (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = activeSessions.get(sessionId);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    res.json({
      success: true,
      session: {
        id: sessionId,
        status: session.status,
        progress: session.progress,
        photoCount: session.photos.length,
        elapsed: Date.now() - session.startTime
      }
    });
  } catch (error) {
    console.error('Error getting session status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get session status',
      message: error.message
    });
  }
});

// GET /api/drive/session/:sessionId/photos - Get processed photos
router.get('/session/:sessionId/photos', (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = activeSessions.get(sessionId);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    res.json({
      success: true,
      photos: session.photos,
      count: session.photos.length,
      session: {
        id: sessionId,
        status: session.status
      }
    });
  } catch (error) {
    console.error('Error getting session photos:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get photos',
      message: error.message
    });
  }
});

// DELETE /api/drive/session/:sessionId - Cancel/cleanup session
router.delete('/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = activeSessions.get(sessionId);
    
    if (session) {
      // Cleanup temp files if any
      if (session.tempFiles && session.tempFiles.length > 0) {
        const driveService = new GoogleDriveService();
        await driveService.cleanupTempFiles(session.tempFiles);
      }
      
      activeSessions.delete(sessionId);
    }

    res.json({
      success: true,
      message: 'Session cleaned up'
    });
  } catch (error) {
    console.error('Error cleaning up session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cleanup session',
      message: error.message
    });
  }
});

// Async function to process photos from Google Drive
async function processPhotosAsync(driveService, folderId, sessionId, options = {}) {
  const session = activeSessions.get(sessionId);
  let tempFiles = [];
  
  try {
    session.status = 'listing_images';
    
    // List all images in the folder
    emitProgressUpdate(sessionId, {
      current: 0,
      total: 0,
      stage: 'listing',
      message: 'Finding images in Google Drive folder...'
    });

    const imageFiles = await driveService.listImages(folderId, options.recursive !== false);
    
    if (imageFiles.length === 0) {
      throw new Error('No images found in the specified folder');
    }

    session.progress.total = imageFiles.length;
    session.status = 'processing_metadata';

    emitProcessingStarted(sessionId, imageFiles.length);

    // Process images in batches
    const batchSize = parseInt(process.env.BATCH_SIZE) || 10;
    const maxConcurrent = parseInt(process.env.MAX_CONCURRENT_PROCESSING) || 3;
    
    for (let i = 0; i < imageFiles.length; i += batchSize) {
      const batch = imageFiles.slice(i, i + batchSize);
      
      // Process batch with concurrency limit
      const batchPromises = batch.map(async (imageFile, batchIndex) => {
        const globalIndex = i + batchIndex;
        return await processSingleImage(driveService, imageFile, sessionId, globalIndex, imageFiles.length);
      });

      // Wait for batch to complete with concurrency control
      const batchResults = await Promise.allSettled(
        limitConcurrency(batchPromises, maxConcurrent)
      );

      // Add successful results to session
      batchResults.forEach((result, batchIndex) => {
        if (result.status === 'fulfilled' && result.value) {
          session.photos.push(result.value);
          tempFiles.push(result.value.tempFilePath);
        } else if (result.status === 'rejected') {
          console.error(`Failed to process image ${i + batchIndex}:`, result.reason);
        }
      });

      session.progress.current = Math.min(i + batchSize, imageFiles.length);
    }

    session.status = 'completed';
    session.tempFiles = tempFiles;

  } catch (error) {
    console.error('Error processing photos:', error);
    session.status = 'error';
    session.error = error.message;
    
    emitError(sessionId, error, { stage: 'processing' });
    
    // Cleanup temp files on error
    if (tempFiles.length > 0) {
      try {
        await driveService.cleanupTempFiles(tempFiles);
      } catch (cleanupError) {
        console.error('Error cleaning up temp files:', cleanupError);
      }
    }
  }
}

// Process a single image file
async function processSingleImage(driveService, imageFile, sessionId, index, total) {
  try {
    // Download image temporarily for EXIF extraction
    const downloadResult = await driveService.downloadImage(imageFile.id, imageFile.name);
    
    // Extract metadata
    const metadata = await exifParser.extractMetadata(downloadResult.localPath, imageFile.mimeType);
    
    // Generate thumbnail
    const thumbnailResult = await driveService.generateThumbnail(
      downloadResult.localPath, 
      imageFile.name
    );

    // Create PhotoModel instance
    const photo = new PhotoModel({
      id: uuidv4(),
      filename: imageFile.name,
      originalFilename: imageFile.name,
      driveFileId: imageFile.id,
      fileSize: imageFile.size,
      mimeType: imageFile.mimeType,
      metadata,
      thumbnailUrl: thumbnailResult.thumbnailUrl,
      processingStatus: 'completed',
      processedAt: new Date()
    });

    // Emit progress update
    emitPhotoProcessed(sessionId, {
      filename: photo.filename,
      hasGPS: photo.hasGPSData(),
      hasTimestamp: photo.hasTimestamp(),
      metadata: exifParser.createMetadataSummary(metadata)
    }, {
      current: index + 1,
      total
    });

    return {
      ...photo.toJSON(),
      tempFilePath: downloadResult.localPath
    };

  } catch (error) {
    console.error(`Error processing image ${imageFile.name}:`, error);
    
    // Return a minimal photo object for failed processing
    return new PhotoModel({
      id: uuidv4(),
      filename: imageFile.name,
      originalFilename: imageFile.name,
      driveFileId: imageFile.id,
      fileSize: imageFile.size,
      mimeType: imageFile.mimeType,
      processingStatus: 'failed',
      processingError: error.message,
      processedAt: new Date()
    }).toJSON();
  }
}

// Utility to limit concurrency
async function limitConcurrency(promises, limit) {
  const results = [];
  const executing = [];

  for (const promise of promises) {
    const p = Promise.resolve().then(() => promise);
    results.push(p);

    if (promises.length >= limit) {
      executing.push(p.then(() => executing.splice(executing.indexOf(p), 1)));
    }

    if (executing.length >= limit) {
      await Promise.race(executing);
    }
  }

  return Promise.all(results);
}

module.exports = router;