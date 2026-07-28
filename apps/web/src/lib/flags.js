export const flags = {
  chat: import.meta.env.VITE_FEATURE_CHAT !== 'false',
  snapshot: import.meta.env.VITE_FEATURE_SNAPSHOT !== 'false',
  laser: import.meta.env.VITE_FEATURE_LASER !== 'false',
  control: import.meta.env.VITE_FEATURE_CONTROL !== 'false',
  captions: import.meta.env.VITE_FEATURE_CAPTIONS !== 'false',
}
