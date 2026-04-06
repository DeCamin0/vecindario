/* global __APP_VERSION__ */
/**
 * App version – replaced at build from package.json via Vite define.
 * Fallback for dev when __APP_VERSION__ is not injected.
 */
export const APP_VERSION =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.1.0'
