import { useEffect, useState } from 'react'

export default function useNetworkQuality(getStats, label = 'network') {
  const [quality, setQuality] = useState({
    rtt: null,
    loss: null,
    level: 'unknown',
    bitrate: null,
    connectionType: null,
  })

  useEffect(() => {
    let alive = true
    let lastBytesOut = 0
    let lastTs = Date.now()

    const timer = setInterval(async () => {
      if (!getStats) return
      const stats = await getStats()
      if (!stats || !alive) return

      let rtt = null
      let lost = 0
      let received = 0
      let bytesOut = 0
      let connectionType = null

      stats.forEach((report) => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          if (report.currentRoundTripTime) rtt = report.currentRoundTripTime * 1000
          if (report.availableOutgoingBitrate) {
            bytesOut += report.availableOutgoingBitrate
          }
          // Determine relay vs direct
          if (report.remoteCandidateId) {
            const remote = stats.get?.(report.remoteCandidateId)
            if (remote?.candidateType === 'relay') {
              connectionType = 'Relayed'
            } else if (connectionType === null) {
              connectionType = 'P2P'
            }
          }
        }
        if (report.type === 'inbound-rtp' && report.kind === 'video') {
          lost += report.packetsLost || 0
          received += report.packetsReceived || 0
        }
      })

      const now = Date.now()
      const elapsed = (now - lastTs) / 1000
      // Convert availableOutgoingBitrate (bps) to kbps for display
      const bitrate = bytesOut > 0 ? Math.round(bytesOut / 1000) : null
      lastBytesOut = bytesOut
      lastTs = now

      const loss = received + lost > 0 ? (lost / (received + lost)) * 100 : 0
      let level = 'good'
      if (rtt > 400 || loss > 8) level = 'poor'
      else if (rtt > 200 || loss > 3) level = 'fair'

      setQuality({
        rtt: rtt ? Math.round(rtt) : null,
        loss: Math.round(loss * 10) / 10,
        level,
        bitrate,
        connectionType,
      })
    }, 2000)

    return () => { alive = false; clearInterval(timer) }
  }, [getStats, label])

  return quality
}
