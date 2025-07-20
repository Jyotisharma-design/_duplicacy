import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Alert,
  LinearProgress,
  Stepper,
  Step,
  StepLabel,
  Chip,
  Divider,
  CircularProgress
} from '@mui/material';
import {
  FolderOpen,
  Search,
  FindInPage,
  Download,
  Refresh,
  Warning,
  CheckCircle
} from '@mui/icons-material';

import { ApiService, isGoogleDriveUrl } from '../services/apiService';
import websocketService, { WEBSOCKET_EVENTS } from '../services/websocketService';
import { Photo, ProcessingCounts, ProcessingProgress, DetectionResults } from '../types';

import StatsPanel from './StatsPanel';
import ProgressBar from './ProgressBar';
import ResultsGrid from './ResultsGrid';

const PROCESSING_STEPS = [
  'Enter Google Drive URL',
  'Process Photos',
  'Detect Duplicates',
  'View Results'
];

interface DuplicateDetectorState {
  // Input state
  driveUrl: string;
  isValidating: boolean;
  validationResult: any;
  
  // Processing state
  activeStep: number;
  isProcessing: boolean;
  currentSessionId: string | null;
  
  // Progress tracking
  counts: ProcessingCounts;
  progress: ProcessingProgress;
  
  // Results
  photos: Photo[];
  duplicateResults: DetectionResults | null;
  
  // UI state
  error: string | null;
  successMessage: string | null;
  connectionStatus: string;
}

const DuplicateDetector: React.FC = () => {
  const [state, setState] = useState<DuplicateDetectorState>({
    driveUrl: '',
    isValidating: false,
    validationResult: null,
    activeStep: 0,
    isProcessing: false,
    currentSessionId: null,
    counts: { total: 0, processed: 0, unique: 0, duplicates: 0, duplicateGroups: 0 },
    progress: { current: 0, total: 0, percentage: 0, stage: '', message: '' },
    photos: [],
    duplicateResults: null,
    error: null,
    successMessage: null,
    connectionStatus: 'connecting'
  });

  // Setup WebSocket event listeners
  useEffect(() => {
    const unsubscribeConnection = websocketService.on(WEBSOCKET_EVENTS.CONNECTION, (data) => {
      setState(prev => ({ ...prev, connectionStatus: data.status }));
    });

    const unsubscribeProgress = websocketService.on(WEBSOCKET_EVENTS.PROGRESS_UPDATE, (data) => {
      setState(prev => ({ ...prev, progress: data.progress }));
    });

    const unsubscribeCount = websocketService.on(WEBSOCKET_EVENTS.COUNT_UPDATE, (data) => {
      setState(prev => ({ ...prev, counts: data.counts }));
    });

    const unsubscribeComplete = websocketService.on(WEBSOCKET_EVENTS.PROCESSING_COMPLETE, (data) => {
      handleProcessingComplete(data);
    });

    const unsubscribeError = websocketService.on(WEBSOCKET_EVENTS.ERROR, (data) => {
      setState(prev => ({
        ...prev,
        error: data.error.message,
        isProcessing: false
      }));
    });

    return () => {
      unsubscribeConnection();
      unsubscribeProgress();
      unsubscribeCount();
      unsubscribeComplete();
      unsubscribeError();
    };
  }, []);

  const handleProcessingComplete = useCallback(async (data: any) => {
    try {
      if (state.currentSessionId) {
        // Get full results
        const results = await ApiService.getDuplicateResults(state.currentSessionId);
        setState(prev => ({
          ...prev,
          duplicateResults: results,
          isProcessing: false,
          activeStep: 3,
          successMessage: `Analysis complete! Found ${results.counts.duplicateGroups} duplicate groups.`
        }));
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: 'Failed to fetch results',
        isProcessing: false
      }));
    }
  }, [state.currentSessionId]);

  const validateDriveUrl = async () => {
    if (!state.driveUrl.trim()) {
      setState(prev => ({ ...prev, error: 'Please enter a Google Drive URL' }));
      return;
    }

    if (!isGoogleDriveUrl(state.driveUrl)) {
      setState(prev => ({ ...prev, error: 'Please enter a valid Google Drive folder URL' }));
      return;
    }

    setState(prev => ({ ...prev, isValidating: true, error: null }));

    try {
      const result = await ApiService.validateDriveFolder(state.driveUrl);
      setState(prev => ({
        ...prev,
        validationResult: result,
        isValidating: false,
        activeStep: result.isValid ? 1 : 0,
        successMessage: result.isValid ? result.message : null,
        error: result.isValid ? null : result.error
      }));
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        isValidating: false,
        error: error.response?.data?.message || 'Failed to validate Google Drive folder'
      }));
    }
  };

  const startProcessing = async () => {
    if (!state.validationResult?.isValid) {
      setState(prev => ({ ...prev, error: 'Please validate the Google Drive URL first' }));
      return;
    }

    setState(prev => ({
      ...prev,
      isProcessing: true,
      error: null,
      activeStep: 1,
      counts: { total: 0, processed: 0, unique: 0, duplicates: 0, duplicateGroups: 0 },
      progress: { current: 0, total: 0, percentage: 0, stage: 'starting', message: 'Starting...' }
    }));

    try {
      // Start photo processing
      const processingResult = await ApiService.startPhotoProcessing(
        state.validationResult.folderId
      );

      const sessionId = processingResult.sessionId;
      setState(prev => ({ ...prev, currentSessionId: sessionId }));

      // Join WebSocket session for real-time updates
      websocketService.joinProcessingSession(sessionId);

      // Wait for processing to complete and photos to be ready
      await waitForPhotosProcessing(sessionId);

    } catch (error: any) {
      setState(prev => ({
        ...prev,
        isProcessing: false,
        error: error.response?.data?.message || 'Failed to start photo processing'
      }));
    }
  };

  const waitForPhotosProcessing = async (sessionId: string) => {
    const checkStatus = async (): Promise<void> => {
      try {
        const status = await ApiService.getSessionStatus(sessionId);
        
        if (status.status === 'completed') {
          // Get processed photos
          const photos = await ApiService.getSessionPhotos(sessionId);
          setState(prev => ({ ...prev, photos }));
          
          // Start duplicate detection
          await startDuplicateDetection(photos, sessionId);
        } else if (status.status === 'error') {
          throw new Error('Photo processing failed');
        } else {
          // Continue checking
          setTimeout(checkStatus, 2000);
        }
      } catch (error) {
        throw error;
      }
    };

    await checkStatus();
  };

  const startDuplicateDetection = async (photos: Photo[], sessionId: string) => {
    setState(prev => ({
      ...prev,
      activeStep: 2,
      progress: { current: 0, total: photos.length, percentage: 0, stage: 'detecting', message: 'Detecting duplicates...' }
    }));

    try {
      await ApiService.startDuplicateDetection(photos, sessionId);
      // Results will be handled by WebSocket events
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        isProcessing: false,
        error: error.response?.data?.message || 'Failed to start duplicate detection'
      }));
    }
  };

  const exportResults = async (format: 'json' | 'csv' = 'json') => {
    if (!state.currentSessionId) return;

    try {
      const blob = await ApiService.exportResults(state.currentSessionId, format);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `duplicates-${state.currentSessionId}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      setState(prev => ({ ...prev, error: 'Failed to export results' }));
    }
  };

  const resetAnalysis = () => {
    if (state.currentSessionId) {
      websocketService.leaveProcessingSession(state.currentSessionId);
      ApiService.cleanupSession(state.currentSessionId);
    }

    setState({
      driveUrl: '',
      isValidating: false,
      validationResult: null,
      activeStep: 0,
      isProcessing: false,
      currentSessionId: null,
      counts: { total: 0, processed: 0, unique: 0, duplicates: 0, duplicateGroups: 0 },
      progress: { current: 0, total: 0, percentage: 0, stage: '', message: '' },
      photos: [],
      duplicateResults: null,
      error: null,
      successMessage: null,
      connectionStatus: state.connectionStatus
    });
  };

  return (
    <Box>
      {/* Connection Status */}
      {state.connectionStatus !== 'connected' && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          WebSocket {state.connectionStatus}. Real-time updates may not work properly.
        </Alert>
      )}

      {/* Progress Stepper */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stepper activeStep={state.activeStep} alternativeLabel>
            {PROCESSING_STEPS.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>
        </CardContent>
      </Card>

      {/* Error/Success Messages */}
      {state.error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {state.error}
        </Alert>
      )}

      {state.successMessage && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {state.successMessage}
        </Alert>
      )}

      {/* Step 1: Google Drive URL Input */}
      {state.activeStep === 0 && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              <FolderOpen sx={{ mr: 1, verticalAlign: 'middle' }} />
              Enter Google Drive Folder URL
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Paste the URL of a Google Drive folder containing photos. The folder must be publicly accessible or you need appropriate permissions.
            </Typography>
            
            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
              <TextField
                fullWidth
                value={state.driveUrl}
                onChange={(e) => setState(prev => ({ ...prev, driveUrl: e.target.value, error: null }))}
                placeholder="https://drive.google.com/drive/folders/your-folder-id"
                variant="outlined"
                disabled={state.isValidating}
              />
              <Button
                variant="contained"
                onClick={validateDriveUrl}
                disabled={state.isValidating || !state.driveUrl.trim()}
                startIcon={state.isValidating ? <CircularProgress size={20} /> : <Search />}
                sx={{ minWidth: 120 }}
              >
                {state.isValidating ? 'Validating...' : 'Validate'}
              </Button>
            </Box>

            {state.validationResult && state.validationResult.isValid && (
              <Box sx={{ p: 2, bgcolor: 'success.light', borderRadius: 1 }}>
                <Typography variant="body2" color="success.dark">
                  <CheckCircle sx={{ mr: 1, verticalAlign: 'middle', fontSize: 16 }} />
                  Found {state.validationResult.imageCount} images in folder "{state.validationResult.folderInfo?.name}"
                </Typography>
                <Button
                  variant="contained"
                  onClick={startProcessing}
                  disabled={state.isProcessing}
                  startIcon={<FindInPage />}
                  sx={{ mt: 2 }}
                >
                  Start Analysis
                </Button>
              </Box>
            )}
          </CardContent>
        </Card>
      )}

      {/* Processing Progress */}
      {state.isProcessing && (
        <Box className="progress-container" sx={{ p: 2, mb: 3 }}>
          <ProgressBar progress={state.progress} />
          <Box sx={{ mt: 2 }}>
            <StatsPanel counts={state.counts} />
          </Box>
        </Box>
      )}

      {/* Results */}
      {state.duplicateResults && (
        <Box>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">
                  Analysis Results
                </Typography>
                <Box>
                  <Button
                    startIcon={<Download />}
                    onClick={() => exportResults('json')}
                    sx={{ mr: 1 }}
                  >
                    Export JSON
                  </Button>
                  <Button
                    startIcon={<Download />}
                    onClick={() => exportResults('csv')}
                    sx={{ mr: 1 }}
                  >
                    Export CSV
                  </Button>
                  <Button
                    startIcon={<Refresh />}
                    onClick={resetAnalysis}
                    variant="outlined"
                  >
                    New Analysis
                  </Button>
                </Box>
              </Box>

              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={6} sm={3}>
                  <Chip
                    label={`${state.duplicateResults.counts.total} Total Photos`}
                    color="default"
                    variant="outlined"
                  />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Chip
                    label={`${state.duplicateResults.counts.unique} Unique`}
                    color="success"
                    variant="outlined"
                  />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Chip
                    label={`${state.duplicateResults.counts.duplicates} Duplicates`}
                    color="warning"
                    variant="outlined"
                  />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Chip
                    label={`${state.duplicateResults.counts.duplicateGroups} Groups`}
                    color="error"
                    variant="outlined"
                  />
                </Grid>
              </Grid>

              <Divider sx={{ my: 2 }} />

              <ResultsGrid duplicateResults={state.duplicateResults} />
            </CardContent>
          </Card>
        </Box>
      )}
    </Box>
  );
};

export default DuplicateDetector;