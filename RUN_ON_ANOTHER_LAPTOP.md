# Altheria FTS - Run on Another Laptop

Use this folder as the project root:

```powershell
cd altheria-v3-fixed
```

## 1. Install Node.js

Install Node.js LTS from:

```text
https://nodejs.org/
```

Recommended: Node.js 20 LTS or newer.

## 2. Install dependencies

Run this once:

```powershell
npm run install:all
```

If that fails, run manually:

```powershell
npm install
cd server
npm install
cd ..\client
npm install
cd ..
```

## 3. Start the backend

Open terminal 1:

```powershell
cd server
npm run dev
```

Backend should run on:

```text
http://localhost:4000/api
```

If port 4000 is busy:

```powershell
netstat -ano | findstr :4000
taskkill /PID <PID_NUMBER> /F
```

## 4. Start the frontend

Open terminal 2:

```powershell
cd client
npm run dev -- --host 127.0.0.1
```

Open:

```text
http://127.0.0.1:5173
```

## 5. Login

Use:

```text
Badge ID: 8829
Password: password123
```

The displayed investigator name is:

```text
Naga Thanisha
```

## 6. Camera and microphone

Use Chrome or Edge.

When the browser asks, allow both camera and microphone.

If camera does not show:

1. Close apps that may use the camera, such as WhatsApp, Teams, Zoom, Camera, or Google Meet.
2. Go to Windows Settings > Privacy & security > Camera and allow desktop/browser camera access.
3. In the assessment screen, use the camera dropdown and click Retry Camera.

## 7. Important

Do not run two backend servers at the same time. If `npm run dev` says port `4000` is already used, stop the old process first.

