const { google } = require('googleapis');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');

class GoogleDriveService {
  constructor() {
    this.drive = null;
    this.auth = null;
    this.supportedImageTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/tiff',
      'image/heic',
      'image/heif',
      'image/webp',
      'image/bmp',
      'image/gif'
    ];
    
    this.initializeAuth();
  }

  // Initialize Google OAuth2 authentication
  initializeAuth() {
    try {
      this.auth = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
      );

      this.drive = google.drive({ version: 'v3', auth: this.auth });
    } catch (error) {
      console.error('Failed to initialize Google Drive auth:', error);
    }
  }

  // Generate OAuth2 authorization URL
  generateAuthUrl() {
    const scopes = [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/drive.metadata.readonly'
    ];

    return this.auth.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      include_granted_scopes: true
    });
  }

  // Set OAuth2 credentials
  setCredentials(tokens) {
    this.auth.setCredentials(tokens);
  }

  // Extract folder ID from various Google Drive URL formats
  extractFolderId(url) {
    try {
      // Remove any trailing parameters and clean the URL
      const cleanUrl = url.split('?')[0].split('#')[0];
      
      // Pattern for Google Drive folder URLs
      const patterns = [
        /\/folders\/([a-zA-Z0-9-_]+)/,          // Standard folder URL
        /\/drive\/folders\/([a-zA-Z0-9-_]+)/,   // Alternative format
        /id=([a-zA-Z0-9-_]+)/,                  // ID parameter format
        /\/open\?id=([a-zA-Z0-9-_]+)/          // Open format
      ];

      for (const pattern of patterns) {
        const match = cleanUrl.match(pattern);
        if (match && match[1]) {
          return match[1];
        }
      }

      // If it's just an ID (no URL structure)
      if (/^[a-zA-Z0-9-_]+$/.test(cleanUrl)) {
        return cleanUrl;
      }

      throw new Error('Could not extract folder ID from URL');
    } catch (error) {
      throw new Error(`Invalid Google Drive URL: ${error.message}`);
    }
  }

  // Get folder information
  async getFolderInfo(folderId) {
    try {
      const response = await this.drive.files.get({
        fileId: folderId,
        fields: 'id,name,mimeType,size,createdTime,modifiedTime,owners,permissions'
      });

      if (response.data.mimeType !== 'application/vnd.google-apps.folder') {
        throw new Error('The provided ID is not a folder');
      }

      return response.data;
    } catch (error) {
      if (error.code === 404) {
        throw new Error('Folder not found or not accessible');
      }
      throw new Error(`Failed to access folder: ${error.message}`);
    }
  }

  // List all images in a folder (including subfolders)
  async listImages(folderId, recursive = true) {
    try {
      const images = [];
      await this._listImagesRecursive(folderId, images, recursive);
      
      return images.filter(file => 
        this.supportedImageTypes.includes(file.mimeType?.toLowerCase())
      );
    } catch (error) {
      throw new Error(`Failed to list images: ${error.message}`);
    }
  }

  // Recursive helper to list images in folders and subfolders
  async _listImagesRecursive(folderId, images, recursive, depth = 0) {
    if (depth > 10) { // Prevent infinite recursion
      console.warn('Maximum folder depth reached');
      return;
    }

    try {
      let pageToken = null;
      
      do {
        const response = await this.drive.files.list({
          q: `'${folderId}' in parents and trashed=false`,
          fields: 'nextPageToken,files(id,name,mimeType,size,createdTime,modifiedTime,imageMediaMetadata,parents)',
          pageSize: 1000,
          pageToken
        });

        const files = response.data.files || [];
        
        for (const file of files) {
          if (file.mimeType === 'application/vnd.google-apps.folder' && recursive) {
            // Recursively process subfolders
            await this._listImagesRecursive(file.id, images, recursive, depth + 1);
          } else if (this.supportedImageTypes.includes(file.mimeType?.toLowerCase())) {
            // Add image file to list
            images.push({
              id: file.id,
              name: file.name,
              mimeType: file.mimeType,
              size: parseInt(file.size) || 0,
              createdTime: file.createdTime,
              modifiedTime: file.modifiedTime,
              imageMediaMetadata: file.imageMediaMetadata,
              parents: file.parents,
              path: await this._getFilePath(file.id, folderId)
            });
          }
        }

        pageToken = response.data.nextPageToken;
      } while (pageToken);

    } catch (error) {
      console.error(`Error listing files in folder ${folderId}:`, error.message);
    }
  }

  // Get the full path of a file within the folder structure
  async _getFilePath(fileId, rootFolderId) {
    try {
      const pathParts = [];
      let currentFileId = fileId;

      while (currentFileId && currentFileId !== rootFolderId) {
        const response = await this.drive.files.get({
          fileId: currentFileId,
          fields: 'id,name,parents'
        });

        const file = response.data;
        pathParts.unshift(file.name);

        if (file.parents && file.parents.length > 0) {
          currentFileId = file.parents[0];
        } else {
          break;
        }
      }

      return pathParts.join('/');
    } catch (error) {
      console.warn(`Could not determine path for file ${fileId}:`, error.message);
      return 'Unknown Path';
    }
  }

  // Download image file to temporary location
  async downloadImage(fileId, filename) {
    try {
      const tempDir = process.env.TEMP_DIR || './temp';
      const fileExtension = path.extname(filename) || '.jpg';
      const localFilename = `${uuidv4()}${fileExtension}`;
      const localPath = path.join(tempDir, localFilename);

      // Get file stream from Google Drive
      const response = await this.drive.files.get({
        fileId,
        alt: 'media'
      }, {
        responseType: 'stream'
      });

      // Write stream to local file
      const writer = require('fs').createWriteStream(localPath);
      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', () => {
          resolve({
            localPath,
            originalFilename: filename,
            fileId
          });
        });
        
        writer.on('error', (error) => {
          reject(new Error(`Failed to download image: ${error.message}`));
        });
      });

    } catch (error) {
      if (error.code === 404) {
        throw new Error('Image file not found or not accessible');
      }
      throw new Error(`Failed to download image: ${error.message}`);
    }
  }

  // Generate thumbnail for an image
  async generateThumbnail(localPath, originalFilename) {
    try {
      const thumbnailsDir = process.env.THUMBNAILS_DIR || './thumbnails';
      const fileExtension = path.extname(originalFilename);
      const thumbnailFilename = `thumb_${uuidv4()}.jpg`;
      const thumbnailPath = path.join(thumbnailsDir, thumbnailFilename);

      await sharp(localPath)
        .resize(300, 300, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ quality: 80 })
        .toFile(thumbnailPath);

      return {
        thumbnailPath,
        thumbnailUrl: `/thumbnails/${thumbnailFilename}`
      };

    } catch (error) {
      console.warn(`Failed to generate thumbnail for ${originalFilename}:`, error.message);
      return {
        thumbnailPath: null,
        thumbnailUrl: null
      };
    }
  }

  // Get file metadata without downloading
  async getFileMetadata(fileId) {
    try {
      const response = await this.drive.files.get({
        fileId,
        fields: 'id,name,mimeType,size,createdTime,modifiedTime,imageMediaMetadata,md5Checksum'
      });

      return response.data;
    } catch (error) {
      throw new Error(`Failed to get file metadata: ${error.message}`);
    }
  }

  // Check if the service has valid credentials
  hasValidCredentials() {
    return this.auth && this.auth.credentials && this.auth.credentials.access_token;
  }

  // Refresh access token if needed
  async refreshAccessToken() {
    try {
      if (this.auth.credentials.refresh_token) {
        const { credentials } = await this.auth.refreshAccessToken();
        this.auth.setCredentials(credentials);
        return credentials;
      }
      throw new Error('No refresh token available');
    } catch (error) {
      throw new Error(`Failed to refresh access token: ${error.message}`);
    }
  }

  // Clean up downloaded files
  async cleanupTempFiles(filePaths) {
    for (const filePath of filePaths) {
      try {
        await fs.unlink(filePath);
      } catch (error) {
        console.warn(`Failed to delete temp file ${filePath}:`, error.message);
      }
    }
  }

  // Validate folder access and get basic info
  async validateFolderAccess(folderId) {
    try {
      const folderInfo = await this.getFolderInfo(folderId);
      const imageCount = await this.getImageCount(folderId);
      
      return {
        isValid: true,
        folderInfo,
        imageCount,
        message: `Found ${imageCount} images in folder "${folderInfo.name}"`
      };
    } catch (error) {
      return {
        isValid: false,
        error: error.message,
        message: `Cannot access folder: ${error.message}`
      };
    }
  }

  // Get count of images in folder without listing all
  async getImageCount(folderId) {
    try {
      let totalCount = 0;
      await this._countImagesRecursive(folderId, totalCount);
      return totalCount;
    } catch (error) {
      console.warn('Failed to count images:', error.message);
      return 0;
    }
  }

  // Recursive helper to count images
  async _countImagesRecursive(folderId, count, depth = 0) {
    if (depth > 10) return count;

    try {
      let pageToken = null;
      
      do {
        const response = await this.drive.files.list({
          q: `'${folderId}' in parents and trashed=false`,
          fields: 'nextPageToken,files(mimeType)',
          pageSize: 1000,
          pageToken
        });

        const files = response.data.files || [];
        
        for (const file of files) {
          if (file.mimeType === 'application/vnd.google-apps.folder') {
            count = await this._countImagesRecursive(file.id, count, depth + 1);
          } else if (this.supportedImageTypes.includes(file.mimeType?.toLowerCase())) {
            count++;
          }
        }

        pageToken = response.data.nextPageToken;
      } while (pageToken);

      return count;
    } catch (error) {
      console.error(`Error counting files in folder ${folderId}:`, error.message);
      return count;
    }
  }
}

module.exports = GoogleDriveService;