# Altheria FTS v3 — Full Stack Forensic Platform

## Architecture

```
altheria-v3/
├── client/          React + Vite + Tailwind (port 5173)
│   └── src/
│       ├── components/
│       │   ├── Gateway.jsx          ← Auth (calls real backend)
│       │   ├── CommandHub.jsx       ← Dashboard + slide drawers
│       │   ├── Intake.jsx           ← Case verification (DB query)
│       │   ├── NewEntry.jsx         ← Criminal registration (DB write)
│       │   ├── AssessmentEnclave.jsx← AI interrogation + camera + TTS/STT
│       │   ├── ReportsPanel.jsx     ← Reports + recordings + evidence linking
│       │   ├── FocusLayout.jsx      ← Minimalist task header
│       │   ├── SlideDrawer.jsx      ← Non-destructive side panel
│       │   └── AuditConsole.jsx     ← Live audit log display
│       ├── context/AppContext.jsx   ← Auth state + JWT management
│       ├── services/api.js          ← All HTTP + WebSocket calls
│       └── utils/auditLogger.js     ← Client-side log entries
│
└── server/          Node.js + Express + WebSocket (port 4000)
    └── src/
        ├── index.js                 ← Entry point
        ├── db.js                    ← In-memory store + seed data
        ├── wsHandler.js             ← WebSocket metric streaming
        ├── middleware/auth.js       ← JWT verification
        ├── routes/
        │   ├── auth.js              ← POST /api/auth/login|logout
        │   ├── cases.js             ← GET/POST /api/cases
        │   ├── sessions.js          ← POST /api/sessions
        │   ├── interrogation.js     ← POST /api/interrogation/:id/open|respond
        │   ├── recordings.js        ← POST/GET /api/recordings
        │   ├── reports.js           ← POST/GET /api/reports
        │   └── audit.js             ← GET /api/audit
        └── services/
            ├── aiInterrogator.js    ← Question engine (Ollama or offline local fallback)
            └── pdfReportService.js  ← PDFKit report synthesis
```

## Quick Start

### Prerequisites
- Node.js 18+ installed
- (Optional) Ollama with `llama3.1:8b` or `mistral` for free local LLM prompts

### 1. Install all dependencies

```bash
# In the root altheria-v3/ folder:
cd server && npm install
cd ../client && npm install
```

### 2. Configure environment

```bash
# Server
cp server/.env.example server/.env
# Edit server/.env — at minimum set JWT_SECRET to something random
# Optionally set OLLAMA_BASE_URL and OLLAMA_MODEL for free local AI questions

# Client
cp client/.env.example client/.env
# Default VITE_API_URL=http://localhost:4000/api is fine for local dev
```

### 3. Run both servers (two terminals)

**Terminal 1 — Backend:**
```bash
cd server
npm run dev
# → http://localhost:4000/api
# → ws://localhost:4000/ws
```

**Terminal 2 — Frontend:**
```bash
cd client
npm run dev
# → http://localhost:5173
```

### 4. Login

Open `http://localhost:5173`

| Badge ID | Passcode     |
|----------|-------------|
| 8829     | password123  |
| ADMIN    | admin123     |

---

## Feature Walkthrough

### Authentication
Gateway calls `POST /api/auth/login`, verifies against the in-memory DB,
returns a JWT. The token is stored in React context and sent with every
subsequent request.

### Case Verification (Intake)
Calls `GET /api/cases/:caseId`. If found, transitions the button to
**▶ START ASSESSMENT** and shows the subject profile card.

### Assessment Enclave
1. `POST /api/sessions` — creates a tracked session
2. `POST /api/interrogation/:id/open` — AI generates opening statement
3. TTS reads it aloud (Web Speech API)
4. Subject responds hands-free through continuous SpeechRecognition
5. Five seconds of silence automatically submits the answer
6. `POST /api/interrogation/:id/respond` — AI analyzes response for stress,
   returns the next question. Stress flags are highlighted immediately.
7. Camera and microphone streams generate local behavioral and voice metrics
8. On **End Session**: master, voice-only, and camera-only evidence files are
   finalized under `uploads/recordings`, then the PDF report is generated

### Reports & Evidence Linking
- **Reports panel** lists all generated PDFs with risk rating
- Click a **stress flag** → jumps the linked video player to that timestamp
- PDF download link streams the file directly from the server

### Audit Trail
Every action (login, case lookup, registration, session start/end,
report generation, recording save) is logged server-side and surfaced
in the Command Hub's **System Audit Console**.

---

## Notes on Production Readiness

- **Database**: Replace `db.js` with Firebase Admin SDK or PostgreSQL.
  All data structures mirror Firestore document format.
- **Storage**: Replace local disk storage in `recordings.js` / `pdfReportService.js`
  with Firebase Storage or AWS S3. The `upload` and `stream` routes are
  already abstracted for easy swap.
- **AI**: Ollama is used first when available at `OLLAMA_BASE_URL`.
  Without it, the deterministic same-language local question bank is used.
- **Speech languages**: English, Hindi, Kannada, Telugu, and Tamil are mapped
  with exact BCP-47 codes. Browser SpeechRecognition and SpeechSynthesis still
  require the matching Chrome/Edge/OS language packs to be installed locally.
- **Camera and voice analysis**: The assessment pipeline now derives local
  voice prosody and camera behavior proxy metrics from the active media stream.
  You can upgrade this with a local MediaPipe/ONNX face-landmark model while
  keeping the zero-cost local-first architecture.
- **HTTPS**: Required for camera + microphone access in production.
  Use a reverse proxy (nginx) with SSL.

---

## v3 Patch Notes — Bug Fixes Applied

### Fix 1: TTS Language Switching
**Problem:** Selecting Hindi/Kannada/Telugu changed the UI labels but the voice continued speaking in English.
**Root cause:** The `speak()` function captured `lang.ttsLang` in a stale closure — when language changed, the closure still held the old value.
**Fix:** Introduced a `useTTS()` hook backed by a `langRef` (React ref). The ref is updated synchronously whenever `langKey` changes, so every TTS call reads the current language. Voices are matched by exact BCP-47 code first (`en-IN`, `hi-IN`, `kn-IN`, `te-IN`, `ta-IN`), then same-language local voices. Non-English sessions do not fall back to an English voice; if the OS/browser has no native voice, the utterance keeps the exact target `lang` so the browser can use its installed language pack.

### Fix 2: Camera Not Working
**Problem:** Camera feed was black or showed permission errors mid-session.
**Root cause:** The preview UI treated partial device failures as a full camera failure and could replace a live video feed with the orange placeholder.
**Fix:** `CameraFeed` now binds only live video tracks to the `<video>` element. Microphone-only errors are shown as a warning overlay, while a valid camera track continues rendering.

### Fix 3: Repeated Questions / Auto-End Session
**Problem:** After all 8 scenario questions were asked, the system cycled back to question 1 instead of ending.
**Root cause:** `getRuleBasedQuestion` returned `bank[transcript.length % bank.length]` (cycling) when no unasked questions remained.
**Fix (server):** `getRuleBasedQuestion` now returns `null` when the bank is exhausted. The `/respond` route returns `{ sessionExhausted: true }` instead of a next question.
**Fix (client):** `handleRespond` checks `sessionExhausted || newCount > MAX_Q` and calls `handleEndSession(true)` automatically.

### Fix 4: End Session Not Generating Report
**Problem:** Clicking "End Session" showed the generating spinner but never resolved to the done screen.
**Root cause:** Recorder chunks were not flushed reliably before upload, so the archive sometimes had no persisted media.
**Fix:** `handleEndSession` now requests final recorder data, stops the continuous recorders, uploads the finalized blobs, and then generates the report.

### Fix 5: Recordings Not in Archive
**Problem:** Sessions completed but the Recordings Archive showed empty.
**Root cause:** Recording metadata was not persisted with a stable uploads path.
**Fix:** `/api/recordings` now saves finalized files in `uploads/recordings`, stores `storagePath`, returns archive availability, supports HTTP range streaming, and groups `master`, `voice`, and `camera` evidence in the Recordings Archive.

### Fix 6: Opening Race and Visual Offline State
**Problem:** If camera/microphone permission stalled or was denied, the screen could enter a listening-looking standby state before question 1 had actually loaded.
**Fix:** Media startup is now promise-aware and the opening question waits for capture setup to resolve before TTS begins. The evidence panel uses React state instead of recorder refs, so it shows `REQUESTING`, `RECORDING`, `SAVED`, `ERROR`, or `UNAVAILABLE` accurately. Permission-denied states now explain that the browser address-bar camera/microphone permission must be allowed.

### Fix 7: Production Archive Persistence
**Problem:** Evidence could upload without being linked back to the completed session JSON.
**Fix:** `recordings.js` now writes each finalized `master`, `voice`, and `camera` file to `uploads/recordings`, persists it in the archive index, and appends a compact recording manifest to the matching session. Deleting a recording also removes that manifest entry.

### Fix 8: Safer Upload Middleware
**Problem:** Multer 1.x/2.x currently reports unresolved upload advisories in npm audit.
**Fix:** The recording route now uses Busboy streaming multipart parsing instead of Multer. This keeps uploads local, zero-cost, range-streamable, and audit-clean while preserving the same frontend `recordingsAPI.upload(...)` contract.

### Fix 9: AI Service Compatibility
**Problem:** Some integration notes refer to `server/src/services/aiService.js`, while the active implementation is `aiInterrogator.js`.
**Fix:** Added `aiService.js` as a compatibility facade that re-exports the local Ollama-first forensic engine.
