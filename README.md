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