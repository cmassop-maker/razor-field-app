/**
 * Platform-safe UUID generation.
 * Uses expo-crypto on native and crypto.randomUUID() on web.
 * Falls back to a manual v4 UUID generator if neither is available.
 */

function generateFallbackUUID(): string {
  // RFC 4122 v4 UUID using Math.random()
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function generateId(): string {
  try {
    // Try web crypto API first
    if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.randomUUID) {
      return globalThis.crypto.randomUUID();
    }
  } catch {
    // Fall through
  }

  try {
    // Try expo-crypto
    const ExpoCrypto = require("expo-crypto");
    if (ExpoCrypto && ExpoCrypto.randomUUID) {
      return ExpoCrypto.randomUUID();
    }
  } catch {
    // Fall through
  }

  // Fallback: Math.random-based UUID
  return generateFallbackUUID();
}
