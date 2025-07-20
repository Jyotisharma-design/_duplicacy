// server/services/googleDriveService.js
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

/**
 * Initialize Google Drive client using OAuth2 credentials from env.
 */
function getDriveClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Google API credentials are missing');
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  return google.drive({ version: 'v3', auth: oauth2Client });
}

/**
 * Resolve shareable link to file id.
 * Supports links like https://drive.google.com/file/d/FILE_ID/view?usp=sharing
 * @param {string} link
 */
function extractFileId(link) {
  const regex = /\/d\/([a-zA-Z0-9_-]{10,})/;
  const match = link.match(regex);
  return match ? match[1] : null;
}

/**
 * Download file bytes into Buffer using drive API.
 * @param {string} fileId
 * @returns {Promise<Buffer>}
 */
async function downloadFile(fileId) {
  const drive = getDriveClient();
  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
  return Buffer.from(res.data);
}

/**
 * Fetch list of image file ids within a folder link.
 * NOTE: This is placeholder; actual implementation should handle pagination.
 * @param {string} folderId
 */
async function listImagesInFolder(folderId) {
  const drive = getDriveClient();
  const { data } = await drive.files.list({
    q: `'${folderId}' in parents and mimeType contains 'image/'`,
    fields: 'files(id, name, mimeType, size)'
  });
  return data.files;
}

/**
 * Accepts a shareable link (file or folder) and returns array of { buffer, filename }
 * @param {string} link
 */
async function getImagesFromLink(link) {
  // This is simplified; robust parsing is needed.
  const fileId = extractFileId(link);
  if (!fileId) throw new Error('Invalid Google Drive link');

  const drive = getDriveClient();
  const { data: fileMeta } = await drive.files.get({ fileId, fields: 'id, name, mimeType' });

  if (fileMeta.mimeType === 'application/vnd.google-apps.folder') {
    const files = await listImagesInFolder(fileId);
    const items = [];
    for (const file of files) {
      const buffer = await downloadFile(file.id);
      items.push({ buffer, filename: file.name });
    }
    return items;
  } else {
    const buffer = await downloadFile(fileId);
    return [{ buffer, filename: fileMeta.name }];
  }
}

module.exports = {
  getImagesFromLink
};