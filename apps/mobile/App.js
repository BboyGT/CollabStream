import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Linking,
  KeyboardAvoidingView,
  SafeAreaView,
  StatusBar,
} from 'react-native'
import RoomScreen from './src/RoomScreen'
import { NEEDS_SERVER_CONFIG, SERVER_URL } from './src/config'

const MONO = Platform.OS === 'ios' ? 'Menlo' : 'monospace'

function JoinScreen({ onJoin, initialCode = '' }) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (initialCode) setCode(initialCode)
  }, [initialCode])

  async function handleJoin() {
    const trimCode = code.trim()
    const trimName = name.trim()
    if (!trimCode) { setError('Enter a join code.'); return }
    if (!trimName) { setError('Enter your name.'); return }
    setError(null)
    setLoading(true)
    try {
      if (NEEDS_SERVER_CONFIG) {
        setError('Set EXPO_PUBLIC_SERVER_URL to your computer LAN URL before joining.')
        setLoading(false)
        return
      }
      const res = await fetch(`${SERVER_URL}/api/join/${trimCode}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error === 'room-locked' ? 'Session is locked.' : data.error === 'not-found' ? 'Invalid code.' : 'Could not join session.')
        setLoading(false)
        return
      }
      const data = await res.json()
      onJoin({ sessionId: data.sessionId, token: data.token, name: trimName })
    } catch {
      setError('Could not reach server. Check your LAN IP in src/config.js.')
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#09090b" />
      <KeyboardAvoidingView
        style={styles.joinContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Logo */}
        <View style={styles.logoRow}>
          <View style={styles.logoBox}>
            <Text style={styles.logoText}>CS</Text>
          </View>
          <View>
            <Text style={styles.appName}>CollabStream</Text>
            <Text style={styles.appSub}>Mobile guest client</Text>
          </View>
        </View>

        {/* Fields */}
        <View style={styles.card}>
          <Text style={styles.label}>Your name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Alex"
            placeholderTextColor="#475569"
            autoCapitalize="words"
            returnKeyType="next"
          />
          <Text style={[styles.label, { marginTop: 14 }]}>Join code</Text>
          <TextInput
            style={styles.input}
            value={code}
            onChangeText={setCode}
            placeholder="6-digit code or short link"
            placeholderTextColor="#475569"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="default"
            returnKeyType="join"
            onSubmitEditing={handleJoin}
          />

          {error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : null}

          <TouchableOpacity
            style={[styles.joinBtn, loading && styles.joinBtnDisabled]}
            onPress={handleJoin}
            disabled={loading}
          >
            <Text style={styles.joinBtnText}>{loading ? 'Joining\u2026' : 'Join session'}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.hint}>
          Make sure you&apos;re on the same WiFi as the host.
        </Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

export default function App() {
  const [screen, setScreen] = useState('join')
  const [roomParams, setRoomParams] = useState(null)
  const [initialCode, setInitialCode] = useState('')

  // Handle deep links: collabstream://join/<code>
  useEffect(() => {
    function handleUrl({ url }) {
      if (!url) return
      const match = url.match(/join\/([a-z0-9]+)/i)
      if (match) {
        // Pre-fill the code — user still needs to enter name
        // (We can't auto-join without a name, so we just note the code)
        setInitialCode(match[1])
        setScreen('join')
      }
    }
    const sub = Linking.addEventListener('url', handleUrl)
    Linking.getInitialURL().then((url) => { if (url) handleUrl({ url }) })
    return () => sub.remove()
  }, [])

  function handleJoin(params) {
    setRoomParams(params)
    setScreen('room')
  }

  if (screen === 'room' && roomParams) {
    return (
      <RoomScreen
        route={{ params: roomParams }}
        navigation={{ goBack: () => { setScreen('join'); setRoomParams(null) } }}
      />
    )
  }

  return <JoinScreen onJoin={handleJoin} initialCode={initialCode} />
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  joinContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 20,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 8,
  },
  logoBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(34,211,238,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    color: '#22d3ee',
    fontSize: 18,
    fontFamily: MONO,
    fontWeight: '700',
  },
  appName: {
    color: '#f1f5f9',
    fontSize: 18,
    fontFamily: MONO,
    fontWeight: '600',
    letterSpacing: 1,
  },
  appSub: {
    color: '#475569',
    fontSize: 11,
    fontFamily: MONO,
    marginTop: 1,
  },
  card: {
    width: '100%',
    backgroundColor: 'rgba(15,23,42,0.8)',
    borderWidth: 1,
    borderColor: 'rgba(51,65,85,0.7)',
    borderRadius: 20,
    padding: 20,
  },
  label: {
    color: '#64748b',
    fontSize: 11,
    fontFamily: MONO,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  input: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: 'rgba(51,65,85,0.7)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: '#e2e8f0',
    fontFamily: MONO,
    fontSize: 14,
  },
  errorText: {
    color: '#fca5a5',
    fontFamily: MONO,
    fontSize: 12,
    marginTop: 10,
    textAlign: 'center',
  },
  joinBtn: {
    marginTop: 18,
    backgroundColor: '#06b6d4',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  joinBtnDisabled: {
    backgroundColor: 'rgba(6,182,212,0.4)',
  },
  joinBtnText: {
    color: '#0c0a09',
    fontFamily: MONO,
    fontSize: 14,
    fontWeight: '700',
  },
  hint: {
    color: '#334155',
    fontFamily: MONO,
    fontSize: 11,
    textAlign: 'center',
  },
})
