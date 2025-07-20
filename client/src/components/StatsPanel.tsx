import React from 'react';
import { Grid, Card, CardContent, Typography, Box } from '@mui/material';
import { 
  Photo, 
  PhotoLibrary, 
  FilterDrama, 
  ContentCopy,
  GroupWork 
} from '@mui/icons-material';
import { ProcessingCounts } from '../types';

interface StatsPanelProps {
  counts: ProcessingCounts;
}

const StatsPanel: React.FC<StatsPanelProps> = ({ counts }) => {
  const statItems = [
    {
      label: 'Total Photos',
      value: counts.total,
      icon: <PhotoLibrary color="primary" />,
      color: 'primary.main'
    },
    {
      label: 'Processed',
      value: counts.processed,
      icon: <Photo color="info" />,
      color: 'info.main'
    },
    {
      label: 'Unique Photos',
      value: counts.unique,
      icon: <FilterDrama color="success" />,
      color: 'success.main'
    },
    {
      label: 'Duplicates',
      value: counts.duplicates,
      icon: <ContentCopy color="warning" />,
      color: 'warning.main'
    },
    {
      label: 'Duplicate Groups',
      value: counts.duplicateGroups,
      icon: <GroupWork color="error" />,
      color: 'error.main'
    }
  ];

  return (
    <Grid container spacing={2}>
      {statItems.map((item) => (
        <Grid item xs={6} sm={4} md={2.4} key={item.label}>
          <Card 
            sx={{ 
              height: '100%',
              borderLeft: 3,
              borderLeftColor: item.color,
              transition: 'transform 0.2s ease-in-out',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: 3
              }
            }}
          >
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="h4" component="div" fontWeight="bold" color={item.color}>
                    {item.value.toLocaleString()}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" noWrap>
                    {item.label}
                  </Typography>
                </Box>
                <Box sx={{ opacity: 0.7 }}>
                  {item.icon}
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
};

export default StatsPanel;