import React, { useEffect, useState } from 'react'
import { View, Text, Pressable } from 'react-native'
import { BarCodeScanner } from 'expo-barcode-scanner'

export default function JoinCodeScanner({ onCode, onClose }) {
  const [hasPermission, setHasPermission] = useState(null)

  useEffect(() => {
    BarCodeScanner.requestPermissionsAsync().then(({ status }) => {
      setHasPermission(status === 'granted')
    })
  }, [])

  if (hasPermission === null) {
    return <Text style={{ color: '#a1a1aa' }}>Requesting camera permission…</Text>
  }
  if (hasPermission === false) {
    return <Text style={{ color: '#ef4444' }}>Camera permission denied</Text>
  }

  return (
    <View style={{ flex: 1 }}>
      <BarCodeScanner
        onBarCodeScanned={({ data }) => onCode?.(data)}
        style={{ flex: 1 }}
      />
      <Pressable onPress={onClose} style={{ position: 'absolute', bottom: 20, left: 20, right: 20, backgroundColor: '#27272a', padding: 12, borderRadius: 12 }}>
        <Text style={{ color: '#fff', textAlign: 'center' }}>Close Scanner</Text>
      </Pressable>
    </View>
  )
}
