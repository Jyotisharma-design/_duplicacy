export interface PhotoMetadata {
  timestamp: string | null;
  gpsLatitude: number | null;
  gpsLongitude: number | null;
  gpsAltitude: number | null;
  camera: {
    make: string | null;
    model: string | null;
    software: string | null;
  };
  technical: {
    width: number | null;
    height: number | null;
    orientation: number | null;
    colorSpace: string | null;
    iso: number | null;
    aperture: number | null;
    shutterSpeed: number | null;
    focalLength: number | null;
  };
}

export interface Photo {
  id: string;
  filename: string;
  originalFilename: string;
  driveFileId?: string;
  downloadUrl?: string;
  thumbnailUrl?: string;
  fileSize: number;
  mimeType: string;
  checksum?: string;
  metadata: PhotoMetadata;
  duplicateGroup: number | null;
  isDuplicate: boolean;
  duplicateScore: number;
  similarPhotos: Array<{
    id: string;
    filename: string;
    timestamp: string;
    gps: string;
  }>;
  processingStatus: 'pending' | 'processing' | 'completed' | 'failed';
  processingError?: string;
  processedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DuplicateGroup {
  id: number;
  photoCount: number;
  photos: Array<{
    id: string;
    filename: string;
    originalFilename: string;
    thumbnailUrl?: string;
    fileSize: number;
    timestamp: string;
    gps: string;
    camera: string;
    duplicateScore: number;
    metadata: PhotoMetadata;
  }>;
  metadata: {
    averageTimestamp: string | null;
    averageGPS: {
      latitude: number;
      longitude: number;
    } | null;
    timeSpan: number;
    maxDistance: number;
  };
}

export interface ProcessingCounts {
  total: number;
  processed: number;
  unique: number;
  duplicates: number;
  duplicateGroups: number;
}

export interface ProcessingProgress {
  current: number;
  total: number;
  percentage: number;
  stage: string;
  message: string;
}

export interface SessionStatus {
  id: string;
  status: 'starting' | 'listing_images' | 'processing_metadata' | 'detecting_duplicates' | 'completed' | 'error';
  progress: {
    current: number;
    total: number;
  };
  photoCount: number;
  elapsed: number;
}

export interface DetectionResults {
  photos: Photo[];
  duplicateGroups: DuplicateGroup[];
  analyzablePhotos: number;
  unanalyzablePhotos: number;
  counts: ProcessingCounts;
  processingTime: number;
  tolerances: {
    timeTolerance: number;
    gpsTolerance: number;
  };
}

export interface DetectionStatistics {
  totalPhotos: number;
  uniquePhotos: number;
  duplicatePhotos: number;
  duplicateGroups: number;
  averageGroupSize: number;
  largestGroupSize: number;
  spaceSaved: number;
  tolerances: {
    timeTolerance: number;
    gpsTolerance: number;
  };
}

export interface GoogleDriveFolder {
  id: string;
  name: string;
  mimeType: string;
  createdTime: string;
  modifiedTime: string;
}

export interface ValidationResult {
  isValid: boolean;
  folderId?: string;
  folderInfo?: GoogleDriveFolder;
  imageCount?: number;
  message: string;
  error?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// WebSocket event types
export interface WebSocketEvent {
  type: string;
  data: any;
  timestamp: string;
  sessionId: string;
}

export interface ProcessingStartedEvent extends WebSocketEvent {
  type: 'processing_started';
  data: {
    totalPhotos: number;
    status: 'started';
  };
}

export interface PhotoProcessedEvent extends WebSocketEvent {
  type: 'photo_processed';
  data: {
    photo: {
      filename: string;
      hasGPS: boolean;
      hasTimestamp: boolean;
      metadata: any;
    };
    progress: {
      current: number;
      total: number;
      percentage: number;
    };
  };
}

export interface DuplicateFoundEvent extends WebSocketEvent {
  type: 'duplicate_found';
  data: {
    duplicateGroup: {
      groupId: number;
      photoCount: number;
      firstPhoto: string;
    };
    counts: ProcessingCounts;
  };
}

export interface CountUpdateEvent extends WebSocketEvent {
  type: 'count_update';
  data: {
    counts: ProcessingCounts;
  };
}

export interface ProgressUpdateEvent extends WebSocketEvent {
  type: 'progress_update';
  data: {
    progress: ProcessingProgress;
  };
}

export interface ProcessingCompleteEvent extends WebSocketEvent {
  type: 'processing_complete';
  data: {
    results: {
      totalPhotos: number;
      uniquePhotos: number;
      duplicatePhotos: number;
      duplicateGroups: number;
      processingTime: number;
      duplicateGroupsData: DuplicateGroup[];
    };
    status: 'completed';
  };
}

export interface ErrorEvent extends WebSocketEvent {
  type: 'error';
  data: {
    error: {
      message: string;
      code: string;
      context: any;
    };
    status: 'error';
  };
}

export type WebSocketEventType = 
  | ProcessingStartedEvent
  | PhotoProcessedEvent
  | DuplicateFoundEvent
  | CountUpdateEvent
  | ProgressUpdateEvent
  | ProcessingCompleteEvent
  | ErrorEvent;