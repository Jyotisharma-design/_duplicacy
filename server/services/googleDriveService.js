// server/services/googleDriveService.js
const authService = require('./authService');

const ALLOWED_MIME_PREFIX = 'image/';

/**
 * Resolve shareable link to file id.
 * Supports links like https://drive.google.com/file/d/FILE_ID/view?usp=sharing
 * @param {string} link
 */
function extractFileId(link) {
  // possible patterns: /file/d/ID, /folders/ID, open?id=ID, uc?id=ID
  const patterns = [
    /\/d\/([a-zA-Z0-9_-]{10,})/, // file or folder
    /\/folders\/([a-zA-Z0-9_-]{10,})/, // folder link
    /[?&]id=([a-zA-Z0-9_-]{10,})/ // open?id or uc?id
  ];
  for (const regex of patterns) {
    const match = link.match(regex);
    if (match) return match[1];
  }
  return null;
}

/**
 * Download file bytes into Buffer using drive API.
 * @param {string} fileId
 * @returns {Promise<Buffer>}
 */
async function downloadFile(fileId) {
  const drive = authService.getDriveClient();
  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
  return Buffer.from(res.data);
}

/**
 * Fetch list of image file ids within a folder link.
 * NOTE: This is placeholder; actual implementation should handle pagination.
 * @param {string} folderId
 */
async function listImagesInFolder(folderId) {
  const drive = authService.getDriveClient();
  const files = [];
  let pageToken = undefined;
  do {
    const { data } = await drive.files.list({
      q: `'${folderId}' in parents and mimeType contains '${ALLOWED_MIME_PREFIX}'`,
      fields: 'nextPageToken, files(id, name, mimeType, size)',
      spaces: 'drive',
      pageSize: 1000,
      pageToken
    });
    files.push(...data.files);
    pageToken = data.nextPageToken;
  } while (pageToken);
  return files;
}

/**
 * Accepts a shareable link (file or folder) and returns array of { buffer, filename }
 * @param {string} link
 */
async function getImagesFromLink(link) {
  if (!authService.isAuthenticated()) {
    throw new Error('Not authenticated with Google Drive');
  }

  const fileId = extractFileId(link);
  if (!fileId) throw new Error('Invalid Google Drive link');

  const drive = authService.getDriveClient();
  const { data: fileMeta } = await drive.files.get({ fileId, fields: 'id, name, mimeType' });

  if (fileMeta.mimeType === 'application/vnd.google-apps.folder') {
    const files = await listImagesInFolder(fileId);
    const items = [];
    for (const file of files) {
      if (!file.mimeType.startsWith(ALLOWED_MIME_PREFIX)) continue;
      const buffer = await downloadFile(file.id);
      items.push({ buffer, filename: file.name });
    }
    return items;
  } else {
    if (!fileMeta.mimeType.startsWith(ALLOWED_MIME_PREFIX)) {
      throw new Error('Provided link is not an image');
    }
    const buffer = await downloadFile(fileId);
    return [{ buffer, filename: fileMeta.name }];
  }
}

module.exports = {
  getImagesFromLink,
  extractFileId // export for testing
};