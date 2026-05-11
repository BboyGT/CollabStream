export default function useSnapshot(videoRef, canvasRef) {
  function takeSnapshot() {
    const video = videoRef?.current
    const overlay = canvasRef?.current
    if (!video) return

    const w = video.videoWidth || video.clientWidth
    const h = video.videoHeight || video.clientHeight
    if (!w || !h) return

    const out = document.createElement('canvas')
    out.width = w
    out.height = h
    const ctx = out.getContext('2d')
    ctx.drawImage(video, 0, 0, w, h)

    if (overlay) {
      ctx.drawImage(overlay, 0, 0, w, h)
    }

    const url = out.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = url
    a.download = `collabstream-${Date.now()}.png`
    a.click()
  }

  return { takeSnapshot }
}
