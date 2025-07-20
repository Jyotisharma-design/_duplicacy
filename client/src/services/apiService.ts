import axios, { AxiosResponse } from 'axios';
import { 
  ValidationResult, 
  SessionStatus, 
  Photo,
  DetectionResults,
  DetectionStatistics,
  DuplicateGroup,
  ApiResponse 
} from '../types';

const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? '/api' 
  : 'http://localhost:3001/api';

// Create axios instance with default config
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Add response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

export class ApiService {
  // Google Drive Authentication
  static async getAuthUrl(): Promise<string> {
    const response = await api.get('/drive/auth');
    return response.data.authUrl;
  }

  static async handleAuthCallback(code: string): Promise<boolean> {
    const response = await api.post('/drive/auth/callback', { code });
    return response.data.success;
  }

  // Google Drive Folder Validation
  static async validateDriveFolder(driveUrl: string, tokens?: any): Promise<ValidationResult> {
    const response = await api.post('/drive/validate', { driveUrl, tokens });
    return {
      isValid: response.data.success,
      folderId: response.data.folderId,
      folderInfo: response.data.folderInfo,
      imageCount: response.data.imageCount,
      message: response.data.message,
      error: response.data.error
    };
  }

  // Photo Processing
  static async startPhotoProcessing(
    folderId: string, 
    tokens?: any, 
    options?: any
  ): Promise<{ sessionId: string; message: string }> {
    const response = await api.post('/drive/process', {
      folderId,
      tokens,
      options
    });
    return {
      sessionId: response.data.sessionId,
      message: response.data.message
    };
  }

  static async getSessionStatus(sessionId: string): Promise<SessionStatus> {
    const response = await api.get(`/drive/session/${sessionId}/status`);
    return response.data.session;
  }

  static async getSessionPhotos(sessionId: string): Promise<Photo[]> {
    const response = await api.get(`/drive/session/${sessionId}/photos`);
    return response.data.photos;
  }

  static async cleanupSession(sessionId: string): Promise<void> {
    await api.delete(`/drive/session/${sessionId}`);
  }

  // Duplicate Detection
  static async startDuplicateDetection(
    photos: Photo[], 
    sessionId: string, 
    options?: any
  ): Promise<{ sessionId: string; message: string }> {
    const response = await api.post('/duplicates/detect', {
      photos,
      sessionId,
      options
    });
    return {
      sessionId: response.data.sessionId,
      message: response.data.message
    };
  }

  static async getDuplicateResults(sessionId: string): Promise<DetectionResults> {
    const response = await api.get(`/duplicates/results/${sessionId}`);
    return response.data.results;
  }

  static async getDetectionStatistics(sessionId: string): Promise<DetectionStatistics> {
    const response = await api.get(`/duplicates/statistics/${sessionId}`);
    return response.data.statistics;
  }

  static async exportResults(sessionId: string, format: 'json' | 'csv' = 'json'): Promise<Blob> {
    const response = await api.get(`/duplicates/export/${sessionId}`, {
      params: { format },
      responseType: 'blob'
    });
    return response.data;
  }

  static async validatePhotosForDetection(photos: Photo[]): Promise<any> {
    const response = await api.post('/duplicates/validate', { photos });
    return response.data.validation;
  }

  static async clearResults(sessionId: string): Promise<void> {
    await api.delete(`/duplicates/results/${sessionId}`);
  }

  static async getDuplicateGroup(sessionId: string, groupId: number): Promise<DuplicateGroup> {
    const response = await api.get(`/duplicates/group/${sessionId}/${groupId}`);
    return response.data.group;
  }

  static async compareTwoPhotos(
    photo1: Photo, 
    photo2: Photo, 
    tolerances?: { timeTolerance: number; gpsTolerance: number }
  ): Promise<any> {
    const response = await api.post('/duplicates/compare-two', {
      photo1,
      photo2,
      tolerances
    });
    return response.data.comparison;
  }

  static async analyzeSample(samplePhotos: Photo[]): Promise<any> {
    const response = await api.post('/duplicates/analyze-sample', { samplePhotos });
    return response.data;
  }

  // Health Check
  static async healthCheck(): Promise<any> {
    const response = await api.get('/health');
    return response.data;
  }
}

// Helper function to handle file downloads
export const downloadFile = (blob: Blob, filename: string) => {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
};

// Helper function to format file sizes
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

// Helper function to format processing time
export const formatProcessingTime = (milliseconds: number): string => {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
};

// Helper function to format timestamps
export const formatTimestamp = (timestamp: string | null): string => {
  if (!timestamp) return 'Unknown';
  return new Date(timestamp).toLocaleString();
};

// Helper function to check if URL is a Google Drive folder
export const isGoogleDriveUrl = (url: string): boolean => {
  return /drive\.google\.com.*\/folders\//.test(url) || 
         /drive\.google\.com.*\/drive\/folders\//.test(url);
};

export default ApiService;