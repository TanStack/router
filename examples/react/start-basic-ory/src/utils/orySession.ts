import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { Configuration, FrontendApi } from '@ory/client-fetch'
import type { Session } from '@ory/client-fetch'

export type { Session as OrySession }

const ORY_BASE = process.env.VITE_ORY_SDK_URL ?? 'http://localhost:4000'

const oryClient = new FrontendApi(new Configuration({ basePath: ORY_BASE }))

const SESSION_CACHE_TTL = 600_000 // 10 minutes
const sessionCache = new Map<string, { data: Session | null; expiresAt: number }>()

export const getOrySession = createServerFn({ method: 'GET' }).handler(async () => {
    const req = getRequest()
    const cookie = req.headers.get('cookie') ?? ''

    const cached = sessionCache.get(cookie)
    if (cached && Date.now() < cached.expiresAt) {
        return cached.data
    }

    // Clean up any stale entry for this key before fetching
    sessionCache.delete(cookie)

    let data: Session | null
    try {
        data = await oryClient.toSession({ cookie })
    } catch {
        data = null
    }

    sessionCache.set(cookie, { data, expiresAt: Date.now() + SESSION_CACHE_TTL })
    return data
})

export const getLogoutUrl = createServerFn({ method: 'GET' }).handler(async () => {
    const req = getRequest()
    const cookie = req.headers.get('cookie') ?? ''

    try {
        const { logout_url } = await oryClient.createBrowserLogoutFlow({ cookie })
        return logout_url
    } catch {
        return null
    }
})
