# Smartfarm Dashboard (Vercel)

ESP32 telemetry/control UI over Firebase Realtime Database.

## Local

```powershell
cd dashboard
copy .env.example .env.local
npm install
npm run dev
```

Open http://localhost:3000

## Env

- `NEXT_PUBLIC_FIREBASE_DB_URL`
- `NEXT_PUBLIC_DEVICE_ID` (default `aiot01`)

## Deploy (Vercel)

```powershell
cd dashboard
npx vercel
```

Set the same env vars in Vercel Project Settings.
