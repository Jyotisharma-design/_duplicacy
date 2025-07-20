let io;

const setupWebSocket = (socketIo) => {
  io = socketIo;
  
  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);
    
    // Join processing room for updates
    socket.on('join-processing', (sessionId) => {
      socket.join(`processing-${sessionId}`);
      console.log(`Client ${socket.id} joined processing session: ${sessionId}`);
    });
    
    // Leave processing room
    socket.on('leave-processing', (sessionId) => {
      socket.leave(`processing-${sessionId}`);
      console.log(`Client ${socket.id} left processing session: ${sessionId}`);
    });
    
    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });
};

// Event types for consistency
const EVENT_TYPES = {
  PROCESSING_STARTED: 'processing_started',
  PHOTO_PROCESSED: 'photo_processed',
  DUPLICATE_FOUND: 'duplicate_found',
  PROCESSING_COMPLETE: 'processing_complete',
  COUNT_UPDATE: 'count_update',
  ERROR: 'error',
  PROGRESS_UPDATE: 'progress_update',
  BATCH_COMPLETE: 'batch_complete'
};

// Emit events to specific processing session
const emitToSession = (sessionId, event, data) => {
  if (!io) {
    console.error('Socket.io not initialized');
    return;
  }
  
  io.to(`processing-${sessionId}`).emit(event, {
    ...data,
    timestamp: new Date().toISOString(),
    sessionId
  });
};

// Processing started event
const emitProcessingStarted = (sessionId, totalPhotos) => {
  emitToSession(sessionId, EVENT_TYPES.PROCESSING_STARTED, {
    totalPhotos,
    status: 'started'
  });
};

// Photo processed event
const emitPhotoProcessed = (sessionId, photoData, progress) => {
  emitToSession(sessionId, EVENT_TYPES.PHOTO_PROCESSED, {
    photo: photoData,
    progress: {
      current: progress.current,
      total: progress.total,
      percentage: Math.round((progress.current / progress.total) * 100)
    }
  });
};

// Duplicate found event
const emitDuplicateFound = (sessionId, duplicateGroup, newCounts) => {
  emitToSession(sessionId, EVENT_TYPES.DUPLICATE_FOUND, {
    duplicateGroup,
    counts: newCounts
  });
};

// Count update event
const emitCountUpdate = (sessionId, counts) => {
  emitToSession(sessionId, EVENT_TYPES.COUNT_UPDATE, {
    counts: {
      total: counts.total || 0,
      processed: counts.processed || 0,
      unique: counts.unique || 0,
      duplicates: counts.duplicates || 0,
      duplicateGroups: counts.duplicateGroups || 0
    }
  });
};

// Progress update event
const emitProgressUpdate = (sessionId, progress) => {
  emitToSession(sessionId, EVENT_TYPES.PROGRESS_UPDATE, {
    progress: {
      current: progress.current,
      total: progress.total,
      percentage: Math.round((progress.current / progress.total) * 100),
      stage: progress.stage || 'processing',
      message: progress.message || ''
    }
  });
};

// Batch complete event
const emitBatchComplete = (sessionId, batchInfo) => {
  emitToSession(sessionId, EVENT_TYPES.BATCH_COMPLETE, {
    batch: batchInfo
  });
};

// Processing complete event
const emitProcessingComplete = (sessionId, results) => {
  emitToSession(sessionId, EVENT_TYPES.PROCESSING_COMPLETE, {
    results: {
      totalPhotos: results.totalPhotos,
      uniquePhotos: results.uniquePhotos,
      duplicatePhotos: results.duplicatePhotos,
      duplicateGroups: results.duplicateGroups,
      processingTime: results.processingTime,
      duplicateGroupsData: results.duplicateGroupsData || []
    },
    status: 'completed'
  });
};

// Error event
const emitError = (sessionId, error, context = {}) => {
  emitToSession(sessionId, EVENT_TYPES.ERROR, {
    error: {
      message: error.message,
      code: error.code || 'UNKNOWN_ERROR',
      context
    },
    status: 'error'
  });
};

// Broadcast to all connected clients (for general updates)
const broadcast = (event, data) => {
  if (!io) {
    console.error('Socket.io not initialized');
    return;
  }
  
  io.emit(event, {
    ...data,
    timestamp: new Date().toISOString()
  });
};

module.exports = {
  setupWebSocket,
  EVENT_TYPES,
  emitToSession,
  emitProcessingStarted,
  emitPhotoProcessed,
  emitDuplicateFound,
  emitCountUpdate,
  emitProgressUpdate,
  emitBatchComplete,
  emitProcessingComplete,
  emitError,
  broadcast
};