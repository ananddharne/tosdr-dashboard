// The app's own server (see server/). One URL serves both the grounded chat
// (/chat) and the direct check's page reader (/direct-check/pages). It comes
// from EXPO_PUBLIC_CHAT_API_URL at build/start time, for example:
//
//   EXPO_PUBLIC_CHAT_API_URL=http://localhost:3001 npx expo start
//
// No API key of any kind lives in the app.

const BASE_URL = (process.env.EXPO_PUBLIC_CHAT_API_URL ?? '').replace(/\/$/, '');

export function backendUrl(): string {
  return BASE_URL;
}

export function isBackendConfigured(): boolean {
  return BASE_URL !== '';
}
