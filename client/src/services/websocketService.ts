import { io, Socket } from 'socket.io-client';
import { WebSocketEventType } from '../types';

type EventCallback = (data: any) => void;

export class WebSocketService {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private eventCallbacks: Map<string, EventCallback[]> = new Map();

  constructor() {
    this.connect();
  }

  private connect() {
    const socketUrl = process.env.NODE_ENV === 'production' 
      ? window.location.origin 
      : 'http://localhost:3001';

    this.socket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      timeout: 20000,
      forceNew: true
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
      this.emit('connection', { status: 'connected' });
    });

    this.socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      this.emit('connection', { status: 'disconnected', reason });
      
      // Auto-reconnect logic
      if (reason === 'io server disconnect') {
        // Server initiated disconnect, don't reconnect automatically
        return;
      }
      
      this.handleReconnect();
    });

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      this.emit('connection', { status: 'error', error: error.message });
      this.handleReconnect();
    });

    // Processing events
    this.socket.on('processing_started', (data) => {
      this.emit('processing_started', data);
    });

    this.socket.on('photo_processed', (data) => {
      this.emit('photo_processed', data);
    });

    this.socket.on('duplicate_found', (data) => {
      this.emit('duplicate_found', data);
    });

    this.socket.on('count_update', (data) => {
      this.emit('count_update', data);
    });

    this.socket.on('progress_update', (data) => {
      this.emit('progress_update', data);
    });

    this.socket.on('batch_complete', (data) => {
      this.emit('batch_complete', data);
    });

    this.socket.on('processing_complete', (data) => {
      this.emit('processing_complete', data);
    });

    this.socket.on('error', (data) => {
      this.emit('error', data);
    });
  }

  private handleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      this.emit('connection', { status: 'failed', message: 'Failed to reconnect' });
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay}ms`);
    
    setTimeout(() => {
      if (this.socket) {
        this.socket.connect();
      }
    }, delay);
  }

  // Join a processing session to receive updates
  joinProcessingSession(sessionId: string) {
    if (this.socket) {
      this.socket.emit('join-processing', sessionId);
      console.log(`Joined processing session: ${sessionId}`);
    }
  }

  // Leave a processing session
  leaveProcessingSession(sessionId: string) {
    if (this.socket) {
      this.socket.emit('leave-processing', sessionId);
      console.log(`Left processing session: ${sessionId}`);
    }
  }

  // Subscribe to events
  on(event: string, callback: EventCallback) {
    if (!this.eventCallbacks.has(event)) {
      this.eventCallbacks.set(event, []);
    }
    this.eventCallbacks.get(event)!.push(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.eventCallbacks.get(event);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index > -1) {
          callbacks.splice(index, 1);
        }
      }
    };
  }

  // Unsubscribe from events
  off(event: string, callback?: EventCallback) {
    if (!callback) {
      // Remove all callbacks for this event
      this.eventCallbacks.delete(event);
    } else {
      const callbacks = this.eventCallbacks.get(event);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index > -1) {
          callbacks.splice(index, 1);
        }
      }
    }
  }

  // Emit events to callbacks
  private emit(event: string, data: any) {
    const callbacks = this.eventCallbacks.get(event);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event callback for ${event}:`, error);
        }
      });
    }
  }

  // Check connection status
  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  // Get connection state
  getConnectionState(): string {
    if (!this.socket) return 'disconnected';
    return this.socket.connected ? 'connected' : 'disconnected';
  }

  // Manually reconnect
  reconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.connect();
    }
  }

  // Disconnect
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.eventCallbacks.clear();
    }
  }

  // Send custom message (if needed)
  send(event: string, data: any) {
    if (this.socket) {
      this.socket.emit(event, data);
    }
  }
}

// Create singleton instance
export const websocketService = new WebSocketService();

// Export event types for convenience
export const WEBSOCKET_EVENTS = {
  CONNECTION: 'connection',
  PROCESSING_STARTED: 'processing_started',
  PHOTO_PROCESSED: 'photo_processed',
  DUPLICATE_FOUND: 'duplicate_found',
  COUNT_UPDATE: 'count_update',
  PROGRESS_UPDATE: 'progress_update',
  BATCH_COMPLETE: 'batch_complete',
  PROCESSING_COMPLETE: 'processing_complete',
  ERROR: 'error'
} as const;

export default websocketService;