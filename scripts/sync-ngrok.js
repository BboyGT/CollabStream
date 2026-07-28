#!/usr/bin/env node
const http = require('http')
const fs = require('fs')
const path = require('path')

const ENV_LOCAL = path.resolve(__dirname, '../apps/web/.env.local')
const WEB_PORT = String(process.env.PUBLIC_WEB_PORT || 5173)

function fetchTunnels() {
  return new Promise((resolve, reject) => {
    const req = http.get('http://127.0.0.1:4040/api/tunnels', (res) => {
      let body = ''
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => {
        try { resolve(JSON.parse(body)) } catch (err) { reject(err) }
      })
    })
    req.on('error', reject)
    req.setTimeout(3000, () => { req.destroy(); reject(new Error('timeout')) })
  })
}

function upsertLine(content, key, value) {
  const line = `${key}=${value}`
  if (new RegExp(`^${key}=`, 'm').test(content)) {
    return content.replace(new RegExp(`^${key}=.*`, 'm'), line)
  }
  return `${content.trimEnd()}\n${line}\n`
}

function syncFiles(publicUrl) {
  const hostname = new URL(publicUrl).hostname

  let envContent = ''
  try { envContent = fs.readFileSync(ENV_LOCAL, 'utf8') } catch {}
  envContent = upsertLine(envContent, 'VITE_PUBLIC_URL', publicUrl)
  envContent = upsertLine(envContent, 'VITE_ALLOWED_HOSTS', hostname)
  fs.writeFileSync(ENV_LOCAL, envContent, 'utf8')
}

async function main() {
  let data
  try {
    data = await fetchTunnels()
  } catch {
    console.log('[sync-ngrok] No global ngrok agent on :4040. Run `npm run tunnel` in another terminal for phone testing.')
    return
  }

  const tunnels = data?.tunnels || []
  const tunnel = tunnels.find((t) => String(t?.config?.addr || '').includes(WEB_PORT))
  if (!tunnel?.public_url) {
    console.log(`[sync-ngrok] No ngrok tunnel found for port ${WEB_PORT}.`)
    return
  }

  syncFiles(tunnel.public_url)
  console.log(`[sync-ngrok] Synced ngrok URL: ${tunnel.public_url}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
