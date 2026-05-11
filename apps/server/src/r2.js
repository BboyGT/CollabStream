const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')

if (!process.env.R2_ACCOUNT_ID) {
  console.warn('[r2] R2_ACCOUNT_ID not set — cloud recording will be unavailable')
}

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID || 'placeholder'}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
})

async function uploadRecording(sessionId, buffer, mimeType = 'video/webm') {
  const key = `recordings/${sessionId}/${Date.now()}.webm`
  await r2.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME || 'collabstream-recordings',
    Key: key,
    Body: buffer,
    ContentType: mimeType,
  }))
  return key
}

async function getRecordingUrl(key) {
  return getSignedUrl(r2, new GetObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME || 'collabstream-recordings',
    Key: key,
  }), { expiresIn: 86400 })
}

async function uploadLogo(userId, buffer, mimeType = 'image/png') {
  const key = `logos/${userId}/logo.png`
  await r2.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME || 'collabstream-recordings',
    Key: key,
    Body: buffer,
    ContentType: mimeType,
  }))
  return key
}

module.exports = { r2, uploadRecording, getRecordingUrl, uploadLogo }
