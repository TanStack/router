/**
 * Emotion cache utilities for SSR and client-side rendering.
 *
 * - Client: Reuses module-level cache that auto-hydrates from SSR <style> tags
 * - Server: Creates new cache instances (Emotion shares state internally by key)
 */

import createCache from '@emotion/cache'
import type { EmotionCache } from '@emotion/cache'

export const EMOTION_CACHE_KEY = 'mui' as const

const isClient = typeof window !== 'undefined'

// Client-only module-level cache (created before React hydration)
// Will automatically hydrate from server-rendered <style> tags with data-emotion="mui ..."
const clientCache: EmotionCache | undefined = isClient
  ? createCache({ key: EMOTION_CACHE_KEY })
  : undefined

/**
 * Get the appropriate Emotion cache based on environment.
 *
 * @returns EmotionCache instance
 */
export function getEmotionCache(): EmotionCache {
  return clientCache || createCache({ key: EMOTION_CACHE_KEY })
}
