import React from 'react';
import { Box, LinearProgress, Typography, Card, CardContent } from '@mui/material';
import { ProcessingProgress } from '../types';

interface ProgressBarProps {
  progress: ProcessingProgress;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ progress }) => {
  const getStageColor = (stage: string) => {
    switch (stage) {
      case 'listing':
        return 'info';
      case 'processing':
      case 'analyzing':
        return 'primary';
      case 'detecting':
        return 'warning';
      case 'completed':
        return 'success';
      case 'error':
        return 'error';
      default:
        return 'primary';
    }
  };

  const getStageLabel = (stage: string) => {
    switch (stage) {
      case 'listing':
        return 'Finding Images';
      case 'processing':
        return 'Processing Photos';
      case 'analyzing':
        return 'Analyzing Metadata';
      case 'detecting':
        return 'Detecting Duplicates';
      case 'completed':
        return 'Complete';
      case 'error':
        return 'Error';
      default:
        return 'Processing';
    }
  };

  return (
    <Card>
      <CardContent>
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="h6" component="div">
              {getStageLabel(progress.stage)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {progress.percentage}%
            </Typography>
          </Box>
          
          <LinearProgress
            variant="determinate"
            value={progress.percentage}
            color={getStageColor(progress.stage) as any}
            sx={{ height: 8, borderRadius: 4 }}
          />
          
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {progress.message}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {progress.current} / {progress.total}
            </Typography>
          </Box>
        </Box>

        {progress.stage === 'detecting' && (
          <Box sx={{ mt: 2, p: 2, bgcolor: 'warning.light', borderRadius: 1 }}>
            <Typography variant="body2" color="warning.dark">
              <strong>Duplicate Detection in Progress</strong><br />
              Analyzing photos based on timestamp and GPS coordinates...
            </Typography>
          </Box>
        )}

        {progress.stage === 'processing' && (
          <Box sx={{ mt: 2, p: 2, bgcolor: 'info.light', borderRadius: 1 }}>
            <Typography variant="body2" color="info.dark">
              <strong>Extracting Metadata</strong><br />
              Reading EXIF data including timestamps and GPS coordinates...
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default ProgressBar;