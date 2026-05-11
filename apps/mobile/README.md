# CollabStream Mobile

Guest-only mobile client for CollabStream sessions.

## Setup

1. **Open `apps/mobile/src/config.js`**
   Replace `192.168.1.x` with your computer's local IP address.
   - Windows: run `ipconfig`, look for IPv4 Address under your active adapter
   - Mac/Linux: run `ifconfig` and find `inet` under en0 or eth0

2. **Start the CollabStream server**
   ```
   cd apps/server && npm run dev
   ```
   Server must be running on port 3001.

3. **Install dependencies and start Expo**
   ```
   cd apps/mobile
   npm install
   npx expo start
   ```

4. **Open on your phone**
   - Install the [Expo Go](https://expo.dev/client) app on your phone
   - Scan the QR code shown in the terminal
   - Your phone and computer must be on **the same WiFi network**

5. **Join a session**
   - Enter your name
   - Enter the join code shown in the host's Invite modal (6-digit or short code)
   - Tap **Join session**

## Requirements

- Node.js 18+
- Expo Go app on your phone (iOS or Android)
- Same WiFi network as the CollabStream host
- Camera and microphone permissions (the app will prompt on first launch)

## Notes

- **Guest only** — hosting is not supported on mobile
- The LAN IP in `config.js` must match your computer's address on the current network
- If you change WiFi networks, update `config.js` and restart Expo
- `react-native-webrtc` handles the actual WebRTC — it is listed as a dependency in `package.json`

## File Structure

```
apps/mobile/
  src/
    config.js       ← LAN IP configuration (edit this)
    RoomScreen.js   ← WebRTC video room
  App.js            ← Join screen + navigation
  README.md         ← This file
  package.json
  app.json
```
