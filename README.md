# Duplicate Photo Detector

This project is a web-based tool that connects to Google Drive, extracts photo metadata, and detects duplicate images in real-time. Results are streamed to connected clients via WebSockets.

## Getting Started (Backend)

1. Clone the repo and install dependencies:

```bash
npm install
```

2. Create a `.env` file (see `.env.template`) with Google API credentials and desired port.

3. Start the development server with hot reload:

```bash
npm run dev
```

The server will be running at http://localhost:4000.

## Google OAuth Setup

Create an OAuth 2.0 Client ID (Web application) in Google Cloud Console and set its redirect URI to:

```
http://localhost:4000/api/auth/callback
```

Put the credentials in `.env`:

```
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=yyy
GOOGLE_REDIRECT_URI=http://localhost:4000/api/auth/callback
SESSION_SECRET=random-string
```

### Authenticate

1. Start the backend (`npm run dev`).
2. Visit `http://localhost:4000/api/auth/url` in your browser – you’ll receive the Google consent URL.
3. Open the URL, grant access, and when redirected you should see “Authentication successful”.
4. The backend now has refresh/access tokens in memory and you can POST to `/api/analyze`.

In production you’d persist tokens per user (DB) instead of memory.

## API

POST `/api/analyze`

Body:

```json
{
  "driveLink": "https://drive.google.com/drive/folders/…"
}
```

The endpoint kicks off background analysis and immediately returns `{ "status": "processing_started" }`.

Real-time events can be consumed via Socket.io on the same host.

## Roadmap

- [ ] Frontend React client with live dashboard
- [ ] Robust Google OAuth flow for end users
- [ ] Persist results in database
- [ ] Export duplicates report (CSV/JSON)