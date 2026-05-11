# Deployment

## One-command (Windows)
```powershell
pnpm deploy:all
```

## Manual
1. Server: `apps/server` → Railway
2. Web: `apps/web` → Vercel
3. Set `VITE_SIGNAL_URL` to your Railway WSS URL
4. Set TURN env vars if needed:
   - `VITE_TURN_URLS`
   - `VITE_TURN_USERNAME`
   - `VITE_TURN_CREDENTIAL`
5. Optional Sentry: `VITE_SENTRY_DSN`

