// server/websocket/realTimeUpdates.js
const { Server } = require('socket.io');

let ioInstance;

function initSocket(httpServer) {
  ioInstance = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  ioInstance.on('connection', socket => {
    console.log('Client connected:', socket.id);

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });
}

function emit(event, data) {
  if (!ioInstance) return;
  ioInstance.emit(event, data);
}

const eventTypes = {
  PROCESSING_STARTED: 'processing_started',
  PHOTO_PROCESSED: 'photo_processed',
  DUPLICATE_FOUND: 'duplicate_found',
  PROCESSING_COMPLETE: 'processing_complete',
  COUNT_UPDATE: 'count_update',
  ERROR: 'error'
};

module.exports = {
  initSocket,
  emit,
  eventTypes
};