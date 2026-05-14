#!/usr/bin/env node
const { spawn, spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const WEB_PORT = Number(process.env.PUBLIC_WEB_PORT || 5173)
const ENV_LOCAL = path.resolve(__dirname, '../apps/web/.env.local')
const VITE_CONFIG = path.resolve(__dirname, '../apps/web/vite.config.js')

function upsertLine(content, key, value) {
  const line = `${key}=${value}`
  if (new RegExp(`^${key}=`, 'm').test(content)) {
    return content.replace(new RegExp(`^${key}=.*`, 'm'), line)
  }
  return `${content.trimEnd()}\n${line}\n`
}

function syncProjectUrl(publicUrl) {
  const hostname = new URL(publicUrl).hostname
  let envContent = ''
  try { envContent = fs.readFileSync(ENV_LOCAL, 'utf8') } catch {}
  envContent = upsertLine(envContent, 'VITE_PUBLIC_URL', publicUrl)
  fs.writeFileSync(ENV_LOCAL, envContent, 'utf8')

  let viteContent = fs.readFileSync(VITE_CONFIG, 'utf8')
  if (/allowedHosts:\s*\[.*?\]/s.test(viteContent)) {
    viteContent = viteContent.replace(/allowedHosts:\s*\[.*?\]/s, `allowedHosts: ['${hostname}']`)
  }
  fs.writeFileSync(VITE_CONFIG, viteContent, 'utf8')
}

function hasGlobalNgrok() {
  return spawnSync('ngrok', ['version'], { stdio: 'ignore' }).status === 0
}

async function startSdkTunnel() {
  const ngrok = require('@ngrok/ngrok')
  const listener = await ngrok.forward({
    addr: WEB_PORT,
    authtoken_from_env: Boolean(process.env.NGROK_AUTHTOKEN),
  })
  const publicUrl = listener.url()
  syncProjectUrl(publicUrl)
  console.log(`[tunnel] ngrok SDK tunnel ready: ${publicUrl}`)
  console.log('[tunnel] Synced VITE_PUBLIC_URL and Vite allowedHosts.')
  process.on('SIGINT', async () => {
    await listener.close().catch(() => {})
    process.exit(0)
  })
  process.stdin.resume()
}

function startCliTunnel() {
  if (!hasGlobalNgrok()) {
    console.error('[tunnel] ngrok CLI not found and @ngrok/ngrok SDK failed.')
    console.error('[tunnel] Set NGROK_AUTHTOKEN for the SDK, or install/login with the ngrok CLI.')
    process.exit(1)
  }

  console.log(`[tunnel] Starting global ngrok CLI for http://localhost:${WEB_PORT} ...`)
  const child = spawn('ngrok', ['http', String(WEB_PORT)], { stdio: 'inherit' })
  child.on('exit', (code) => process.exit(code || 0))
}

startSdkTunnel().catch((err) => {
  console.warn(`[tunnel] SDK tunnel failed: ${err.message}`)
  startCliTunnel()
})
