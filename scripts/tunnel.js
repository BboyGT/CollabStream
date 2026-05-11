const { spawn, spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const http = require('http')

function hasNgrok() {
  const res = spawnSync('ngrok', ['version'], { stdio: 'ignore' })
  return res.status === 0
}

function writeEnv(url) {
  const envPath = path.join(__dirname, '..', 'apps', 'web', '.env.local')
  const content = `VITE_PUBLIC_URL=${url}\n`
  fs.writeFileSync(envPath, content, 'utf8')
}

function fetchTunnels() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:4040/api/tunnels', (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          resolve(json)
        } catch (err) {
          reject(err)
        }
      })
    }).on('error', reject)
  })
}

async function waitForUrl(timeoutMs = 20000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const data = await fetchTunnels()
      const https = data?.tunnels?.find((t) => t.public_url?.startsWith('https://'))
      if (https?.public_url) return https.public_url
    } catch (_) {
      // ignore and retry
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  return null
}

async function main() {
  if (!hasNgrok()) {
    console.error('ngrok not found in PATH.')
    console.error('Install from https://ngrok.com/download and try again.')
    process.exit(1)
  }

  console.log('Starting ngrok tunnel for http://localhost:5173 ...')
  const proc = spawn('ngrok', ['http', '5173'], { stdio: 'ignore' })
  proc.on('exit', (code) => {
    if (code !== 0) {
      console.error(`ngrok exited with code ${code}`)
    }
  })

  const url = await waitForUrl()
  if (!url) {
    console.error('Could not fetch ngrok URL from local API.')
    process.exit(1)
  }

  writeEnv(url)
  console.log(`Tunnel ready: ${url}`)
  console.log('Saved VITE_PUBLIC_URL to apps/web/.env.local')
  console.log('Restart the web dev server to pick it up.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
