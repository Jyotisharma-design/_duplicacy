# Real-time Duplicate Photo Detection Tool

A comprehensive web-based application that automatically detects duplicate photos in Google Drive based on metadata analysis (timestamp, GPS coordinates) with real-time updates and live count tracking.

## 🌟 Features

### Core Functionality
- **Google Drive Integration**: Direct access to Google Drive folders via shareable links
- **Real-time Processing**: Live updates with WebSocket connections during analysis
- **Metadata-based Detection**: Uses EXIF data (timestamp and GPS coordinates) for accurate duplicate detection
- **Beautiful UI**: Modern, responsive interface built with Material-UI
- **Export Results**: Download analysis results in JSON or CSV format

### Advanced Capabilities
- **Batch Processing**: Handles large photo collections efficiently
- **Thumbnail Generation**: Quick visual preview of photos
- **Progress Tracking**: Real-time progress bars and statistics
- **Error Handling**: Comprehensive error management and user feedback
- **Mobile Responsive**: Works seamlessly on desktop and mobile devices

## 🚀 Quick Start

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn
- Google Cloud Project with Drive API enabled

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd duplicate-photo-detector
   ```

2. **Install dependencies**
   ```bash
   npm run install:all
   ```

3. **Set up Google Drive API**
   - Create a project in [Google Cloud Console](https://console.cloud.google.com/)
   - Enable the Google Drive API
   - Create OAuth 2.0 credentials
   - Add authorized redirect URIs

4. **Configure environment variables**
   ```bash
   cd server
   cp .env.example .env
   ```
   
   Edit `.env` with your configuration:
   ```env
   PORT=3001
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   GOOGLE_REDIRECT_URI=http://localhost:3001/auth/google/callback
   ```

5. **Start the application**
   ```bash
   npm run dev
   ```

   The application will start:
   - Frontend: http://localhost:3000
   - Backend: http://localhost:3001

## 📖 How It Works

### 1. Google Drive Access
- Paste a Google Drive folder URL
- The system validates access and counts images
- Supports publicly shared folders and authenticated access

### 2. Photo Processing
- Downloads images temporarily for EXIF extraction
- Extracts metadata: timestamps, GPS coordinates, camera info
- Generates thumbnails for quick preview
- Real-time progress updates via WebSocket

### 3. Duplicate Detection
- Compares photos based on:
  - **Timestamp**: Within 2 seconds tolerance
  - **GPS Coordinates**: Within 0.0001 degrees tolerance
- Groups duplicates and calculates similarity scores
- Provides detailed analysis of each group

### 4. Results Display
- Interactive accordion view of duplicate groups
- Photo thumbnails with metadata overlay
- Space savings calculations
- Export options for further analysis

## 🏗️ Architecture

### Backend (Node.js)
```
server/
├── controllers/          # API endpoint handlers
├── services/            # Business logic and external APIs
├── models/              # Data models and validation
├── utils/               # Utility functions
├── websocket/           # Real-time communication
└── config/              # Configuration files
```

### Frontend (React + TypeScript)
```
client/src/
├── components/          # React components
├── services/            # API communication
├── types/               # TypeScript interfaces
├── hooks/               # Custom React hooks
└── utils/               # Helper functions
```

### Key Technologies
- **Backend**: Express.js, Socket.io, Google APIs, Sharp, ExifR
- **Frontend**: React, TypeScript, Material-UI, Socket.io-client
- **Real-time**: WebSocket connections for live updates
- **Image Processing**: Sharp for thumbnails, ExifR for metadata

## 🔧 Configuration

### Environment Variables

#### Server Configuration
```env
# Server
PORT=3001
NODE_ENV=development

# Google Drive API
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3001/auth/google/callback

# Processing
BATCH_SIZE=50
MAX_CONCURRENT_PROCESSING=5
TIME_TOLERANCE_SECONDS=2
GPS_TOLERANCE_DEGREES=0.0001

# File Handling
MAX_FILE_SIZE=10485760
TEMP_DIR=./temp
THUMBNAILS_DIR=./thumbnails
```

#### Database (Optional)
```env
MONGODB_URI=mongodb://localhost:27017/duplicate-photo-detector
```

### Duplicate Detection Parameters

The system uses configurable tolerances for duplicate detection:

- **Time Tolerance**: 2 seconds (photos taken within this timeframe)
- **GPS Tolerance**: 0.0001 degrees (~11 meters at equator)
- **Additional Factors**: File size, dimensions, camera model for scoring

## 📊 API Endpoints

### Google Drive Operations
- `POST /api/drive/validate` - Validate Drive folder URL
- `POST /api/drive/process` - Start photo processing
- `GET /api/drive/session/:id/status` - Get processing status
- `GET /api/drive/session/:id/photos` - Get processed photos

### Duplicate Detection
- `POST /api/duplicates/detect` - Start duplicate detection
- `GET /api/duplicates/results/:id` - Get detection results
- `GET /api/duplicates/export/:id` - Export results (JSON/CSV)
- `GET /api/duplicates/statistics/:id` - Get analysis statistics

### WebSocket Events
- `processing_started` - Processing begins
- `photo_processed` - Individual photo completed
- `progress_update` - Progress information
- `duplicate_found` - Duplicate group discovered
- `processing_complete` - Analysis finished

## 🎨 User Interface

### Main Components

1. **Drive Input Panel**
   - URL validation with real-time feedback
   - Folder information display
   - Image count preview

2. **Progress Tracking**
   - Step-by-step progress indicator
   - Real-time statistics dashboard
   - Processing stage information

3. **Results Display**
   - Expandable duplicate group cards
   - Photo thumbnails with metadata
   - Space savings calculations
   - Export functionality

### Features
- **Responsive Design**: Works on all screen sizes
- **Dark/Light Themes**: Material-UI theming support
- **Accessibility**: ARIA labels and keyboard navigation
- **Progressive Enhancement**: Graceful degradation for slower connections

## 🔍 Troubleshooting

### Common Issues

**Google Drive Access Denied**
- Ensure folder is publicly accessible or properly shared
- Check OAuth credentials and redirect URIs
- Verify Google Drive API is enabled

**No Duplicates Detected**
- Photos may lack GPS data or timestamps
- Check EXIF data presence in sample photos
- Adjust tolerance settings if needed

**WebSocket Connection Issues**
- Check firewall settings
- Verify CORS configuration
- Try different transport methods

**Memory Issues with Large Collections**
- Increase Node.js memory limit: `--max-old-space-size=4096`
- Reduce batch size in configuration
- Process in smaller chunks

### Performance Optimization

**For Large Photo Collections (>1000 images)**
- Use MongoDB for persistent storage
- Implement Redis for session management
- Configure proper caching headers
- Consider CDN for thumbnail delivery

## 🚀 Deployment

### Production Setup

1. **Environment Configuration**
   ```env
   NODE_ENV=production
   GOOGLE_REDIRECT_URI=https://yourdomain.com/auth/google/callback
   ```

2. **Build Application**
   ```bash
   npm run build
   ```

3. **Deploy with PM2**
   ```bash
   pm2 start server/index.js --name duplicate-detector
   ```

### Docker Deployment

```dockerfile
# Available in project root
docker build -t duplicate-photo-detector .
docker run -p 3001:3001 duplicate-photo-detector
```

### Cloud Deployment Options
- **Heroku**: Ready for Heroku deployment
- **AWS**: EC2 + S3 for file storage
- **Google Cloud**: App Engine + Cloud Storage
- **DigitalOcean**: Droplets + Spaces

## 🧪 Testing

### Run Tests
```bash
# Backend tests
cd server && npm test

# Frontend tests
cd client && npm test

# Integration tests
npm run test:integration
```

### Test Coverage
- Unit tests for duplicate detection algorithm
- Integration tests for Google Drive API
- Performance tests with large datasets
- UI tests for real-time updates

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Development Guidelines
- Follow TypeScript best practices
- Write tests for new features
- Update documentation
- Use semantic commit messages

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Google Drive API for cloud storage access
- ExifR library for metadata extraction
- Sharp for efficient image processing
- Material-UI for beautiful components
- Socket.io for real-time communication

## 📞 Support

For support, please:
- Check the troubleshooting section
- Search existing issues
- Create a new issue with detailed information
- Join our community discussions

---

Made with ❤️ for efficient photo management