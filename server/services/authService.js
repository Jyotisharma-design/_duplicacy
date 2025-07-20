// server/services/authService.js
const { google } = require('googleapis');

let oauth2Client;
let tokens = null; // simple in-memory token store; replace with DB in production

function createOauthClient() {
  if (oauth2Client) return oauth2Client;

  const {
    GOOGLE_CLIENT_ID: clientId,
    GOOGLE_CLIENT_SECRET: clientSecret,
    GOOGLE_REDIRECT_URI: redirectUri
  } = process.env;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Google OAuth env vars missing');
  }

  oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  if (tokens) {
    oauth2Client.setCredentials(tokens);
  }

  return oauth2Client;
}

function generateAuthUrl() {
  const client = createOauthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/drive.metadata.readonly'
    ],
    prompt: 'consent'
  });
}

async function setTokensByCode(code) {
  const client = createOauthClient();
  const { tokens: newTokens } = await client.getToken(code);
  tokens = newTokens;
  client.setCredentials(tokens);
  return tokens;
}

function getDriveClient() {
  const client = createOauthClient();
  return google.drive({ version: 'v3', auth: client });
}

function isAuthenticated() {
  return !!tokens;
}

module.exports = {
  generateAuthUrl,
  setTokensByCode,
  getDriveClient,
  isAuthenticated
};