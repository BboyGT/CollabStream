const DEFAULT_SERVER_URL = 'http://localhost:3001'

function trimSlash(value) {
  return String(value || '').replace(/\/$/, '')
}

const configuredServerUrl = trimSlash(
  process.env.EXPO_PUBLIC_SERVER_URL ||
  process.env.REACT_NATIVE_SERVER_URL ||
  DEFAULT_SERVER_URL
)

export const SERVER_URL = configuredServerUrl
export const WS_URL = configuredServerUrl.replace(/^http/, 'ws') + '/ws'
export const NEEDS_SERVER_CONFIG = configuredServerUrl === DEFAULT_SERVER_URL
