import React, { useState } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  CardMedia,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  Badge,
  IconButton,
  Tooltip,
  Paper,
  Divider
} from '@mui/material';
import {
  ExpandMore,
  LocationOn,
  Schedule,
  PhotoCamera,
  Storage,
  Warning,
  InfoOutlined
} from '@mui/icons-material';
import { DetectionResults, DuplicateGroup } from '../types';
import { formatFileSize, formatTimestamp } from '../services/apiService';

interface ResultsGridProps {
  duplicateResults: DetectionResults;
}

interface PhotoCardProps {
  photo: DuplicateGroup['photos'][0];
  isFirst?: boolean;
}

const PhotoCard: React.FC<PhotoCardProps> = ({ photo, isFirst = false }) => {
  return (
    <Card 
      sx={{ 
        position: 'relative',
        borderRadius: 2,
        transition: 'transform 0.2s ease-in-out',
        '&:hover': {
          transform: 'scale(1.02)',
          zIndex: 1
        },
        border: isFirst ? 2 : 1,
        borderColor: isFirst ? 'success.main' : 'divider'
      }}
    >
      {isFirst && (
        <Chip
          label="Keep"
          color="success"
          size="small"
          sx={{
            position: 'absolute',
            top: 8,
            left: 8,
            zIndex: 2
          }}
        />
      )}
      
      <Badge
        badgeContent={Math.round(photo.duplicateScore)}
        color="warning"
        sx={{
          '& .MuiBadge-badge': {
            right: 8,
            top: 8,
            fontSize: '0.7rem'
          }
        }}
      >
        {photo.thumbnailUrl && (
          <CardMedia
            component="img"
            height="160"
            image={photo.thumbnailUrl}
            alt={photo.filename}
            sx={{ objectFit: 'cover' }}
          />
        )}
      </Badge>

      <CardContent sx={{ p: 2 }}>
        <Typography variant="subtitle2" noWrap title={photo.filename}>
          {photo.filename}
        </Typography>
        
        <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Schedule sx={{ fontSize: 16, color: 'text.secondary' }} />
            <Typography variant="caption" color="text.secondary">
              {formatTimestamp(photo.timestamp)}
            </Typography>
          </Box>
          
          {photo.gps && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <LocationOn sx={{ fontSize: 16, color: 'text.secondary' }} />
              <Typography variant="caption" color="text.secondary" noWrap>
                {photo.gps}
              </Typography>
            </Box>
          )}
          
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Storage sx={{ fontSize: 16, color: 'text.secondary' }} />
            <Typography variant="caption" color="text.secondary">
              {formatFileSize(photo.fileSize)}
            </Typography>
          </Box>
          
          {photo.camera && photo.camera !== 'Unknown' && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <PhotoCamera sx={{ fontSize: 16, color: 'text.secondary' }} />
              <Typography variant="caption" color="text.secondary" noWrap>
                {photo.camera}
              </Typography>
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  );
};

const DuplicateGroupCard: React.FC<{ group: DuplicateGroup; index: number }> = ({ group, index }) => {
  const [expanded, setExpanded] = useState(index < 3); // Auto-expand first 3 groups

  const totalSize = group.photos.reduce((sum, photo) => sum + photo.fileSize, 0);
  const potentialSavings = totalSize - Math.max(...group.photos.map(p => p.fileSize));

  return (
    <Accordion 
      expanded={expanded} 
      onChange={() => setExpanded(!expanded)}
      sx={{ mb: 2, borderRadius: 2, '&:before': { display: 'none' } }}
    >
      <AccordionSummary expandIcon={<ExpandMore />}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
          <Chip
            label={`Group ${group.id}`}
            color="error"
            variant="outlined"
            size="small"
          />
          
          <Typography variant="h6" component="div">
            {group.photoCount} duplicate photos
          </Typography>
          
          <Box sx={{ display: 'flex', gap: 1, ml: 'auto' }}>
            <Chip
              label={formatFileSize(potentialSavings)}
              color="warning"
              size="small"
              icon={<Storage />}
            />
            
            {group.metadata.timeSpan > 0 && (
              <Chip
                label={`${group.metadata.timeSpan}s span`}
                color="info"
                size="small"
                icon={<Schedule />}
              />
            )}
            
            {group.metadata.maxDistance > 0 && (
              <Chip
                label={`${group.metadata.maxDistance.toFixed(1)}m apart`}
                color="secondary"
                size="small"
                icon={<LocationOn />}
              />
            )}
          </Box>
        </Box>
      </AccordionSummary>
      
      <AccordionDetails>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            <InfoOutlined sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'middle' }} />
            Photos are considered duplicates when taken within 2 seconds at the same GPS location.
            The first photo (marked "Keep") is typically the largest file.
          </Typography>
        </Box>

        <Grid container spacing={2}>
          {group.photos.map((photo, photoIndex) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={photo.id}>
              <PhotoCard photo={photo} isFirst={photoIndex === 0} />
            </Grid>
          ))}
        </Grid>

        {group.metadata.averageGPS && (
          <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
            <Typography variant="body2" color="text.secondary">
              <strong>Group Details:</strong><br />
              Average Location: {group.metadata.averageGPS.latitude.toFixed(6)}, {group.metadata.averageGPS.longitude.toFixed(6)}<br />
              {group.metadata.averageTimestamp && (
                <>Average Time: {formatTimestamp(group.metadata.averageTimestamp)}<br /></>
              )}
              Max Distance: {group.metadata.maxDistance.toFixed(2)} meters<br />
              Time Span: {group.metadata.timeSpan} seconds<br />
              Potential Space Saved: {formatFileSize(potentialSavings)}
            </Typography>
          </Box>
        )}
      </AccordionDetails>
    </Accordion>
  );
};

const ResultsGrid: React.FC<ResultsGridProps> = ({ duplicateResults }) => {
  if (!duplicateResults.duplicateGroups || duplicateResults.duplicateGroups.length === 0) {
    return (
      <Card sx={{ textAlign: 'center', p: 4 }}>
        <Typography variant="h6" color="success.main" gutterBottom>
          🎉 No Duplicates Found!
        </Typography>
        <Typography variant="body1" color="text.secondary">
          All photos in this collection appear to be unique based on their metadata.
        </Typography>
      </Card>
    );
  }

  const totalPotentialSavings = duplicateResults.duplicateGroups.reduce((total, group) => {
    const groupTotal = group.photos.reduce((sum, photo) => sum + photo.fileSize, 0);
    const largest = Math.max(...group.photos.map(p => p.fileSize));
    return total + (groupTotal - largest);
  }, 0);

  return (
    <Box>
      {/* Summary Information */}
      <Paper sx={{ p: 2, mb: 3, bgcolor: 'warning.light' }}>
        <Typography variant="h6" color="warning.dark" gutterBottom>
          <Warning sx={{ mr: 1, verticalAlign: 'middle' }} />
          Duplicate Analysis Summary
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <Typography variant="body2" color="warning.dark">
              <strong>Total Duplicates:</strong> {duplicateResults.counts.duplicates} photos
            </Typography>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Typography variant="body2" color="warning.dark">
              <strong>Duplicate Groups:</strong> {duplicateResults.counts.duplicateGroups}
            </Typography>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Typography variant="body2" color="warning.dark">
              <strong>Potential Space Saved:</strong> {formatFileSize(totalPotentialSavings)}
            </Typography>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Typography variant="body2" color="warning.dark">
              <strong>Processing Time:</strong> {(duplicateResults.processingTime / 1000).toFixed(1)}s
            </Typography>
          </Grid>
        </Grid>
      </Paper>

      {/* Duplicate Groups */}
      <Typography variant="h6" gutterBottom>
        Duplicate Groups ({duplicateResults.duplicateGroups.length})
      </Typography>
      
      {duplicateResults.duplicateGroups.map((group, index) => (
        <DuplicateGroupCard key={group.id} group={group} index={index} />
      ))}

      {/* Footer Information */}
      <Paper sx={{ p: 2, mt: 3, bgcolor: 'info.light' }}>
        <Typography variant="body2" color="info.dark">
          <InfoOutlined sx={{ mr: 1, verticalAlign: 'middle' }} />
          <strong>Detection Criteria:</strong> Photos are considered duplicates when they have timestamps within{' '}
          {duplicateResults.tolerances.timeTolerance} seconds and GPS coordinates within{' '}
          {duplicateResults.tolerances.gpsTolerance} degrees of each other.
        </Typography>
      </Paper>
    </Box>
  );
};

export default ResultsGrid;