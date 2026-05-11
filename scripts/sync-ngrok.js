#!/usr/bin/env node
/**
 * sync-ngrok.js — reads the live ngrok tunnel for port 5173 from the
 * local ngrok agent API (always at http://localhost:4040), then patches
 * apps/web/.env.local and apps/web/vite.config.js so the QR code and
 * allowedHosts are always in sync with the current session.
 *
 * Run automatically before `npm run dev` via the root package.json.
 */

const http = require('http')
const fs = require('fs')
const path = require('path')

const ENV_LOCAL = path.resolve(__dirname, '../apps/web/.env.local')
const VITE_CONFIG = path.resolve(__dirname, '../apps/web/vite.config.js')

function fetchTunnels() {
  return new Promise((resolve, reject) => {
    const req = http.get('http://localhost:4040/api/tunnels', (res) => {
      let body = ''
      res.on('data', (c) => (body += c))
      res.on('end', () => {
        try { resolve(JSON.parse(body)) }
        catch (e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.setTimeout(3000, () => { req.destroy(); reject(new Error('timeout')) })
  })
}

async function main() {
  let data
  try {
    data = await fetchTunnels()
  } catch {
    console.log('[sync-ngrok] ngrok is not running — skipping URL sync.')
    console.log('[sync-ngrok] To use ngrok: run `ngrok http 5173` first, then re-run dev.')
    return
  }

  const tunnels = data?.tunnels || []
  const tunnel = tunnels.find((t) => {
    const addr = t?.config?.addr || ''
    return addr.includes('5173')
  })

  if (!tunnel) {
    console.log('[sync-ngrok] No ngrok tunnel found for port 5173.')
    console.log('[sync-ngrok] Run `ngrok http 5173` if you need phone access.')
    return
  }

  const publicUrl = tunnel.public_url
  const hostname = new URL(publicUrl).hostname

  // ── Patch .env.local ──────────────────────────────────────────────────────
  let envContent = ''
  try { envContent = fs.readFileSync(ENV_LOCAL, 'utf8') } catch { envContent = '' }

  if (envContent.includes('VITE_PUBLIC_URL=')) {
    envContent = envContent.replace(/^VITE_PUBLIC_URL=.*/m, `VITE_PUBLIC_URL=${publicUrl}`)
  } else {
    envContent = envContent.trimEnd() + `\nVITE_PUBLIC_URL=${publicUrl}\n`
  }
  fs.writeFileSync(ENV_LOCAL, envContent, 'utf8')

  // ── Patch vite.config.js allowedHosts ─────────────────────────────────────
  let viteContent = fs.readFileSync(VITE_CONFIG, 'utf8')

  // Replace the allowedHosts array value with the new hostname
  viteContent = viteContent.replace(
    /allowedHosts:\s*\[.*?\]/s,
    `allowedHosts: ['${hostname}']`
  )
  fs.writeFileSync(VITE_CONFIG, viteContent, 'utf8')

  console.log(`[sync-ngrok] Synced ngrok URL: ${publicUrl}`)
  console.log(`[sync-ngrok]  → .env.local VITE_PUBLIC_URL patched`)
  console.log(`[sync-ngrok]  → vite.config.js allowedHosts patched`)
}

main()
