// Test-only content source. Never deploy the control endpoint in worker.ts.
import { env } from 'cloudflare:workers'
import {
  getRequest,
  getRequestHeader,
  setResponseHeader,
} from '@tanstack/react-start/server'

export let finishStream: (() => void) | undefined

export const content = { value: String(env.MY_VAR), loads: 0, mode: '' }

export function readHomeData() {
  content.loads++
  setResponseHeader('X-Loader-Count', String(content.loads))
  if (content.mode === 'cookie') {
    setResponseHeader('Set-Cookie', 'session=new; HttpOnly; SameSite=Lax')
  }
  if (content.mode === 'encoded') {
    setResponseHeader('Content-Encoding', 'identity')
  }
  if (content.mode === 'error') {
    throw new Error('Test content source unavailable')
  }
  if (content.mode === 'vary') {
    setResponseHeader('Vary', 'X-Unsupported-Variant')
  }
  const edition = new URL(getRequest().url).searchParams.get('edition')
  const language = edition ? getRequestHeader('accept-language') : undefined
  const variant = [edition, language].filter(Boolean).join(' / ')
  const session = getRequestHeader('cookie')
  const user =
    session === 'session=alice'
      ? 'Alice'
      : session === 'session=bob'
        ? 'Bob'
        : undefined
  return {
    cacheControl:
      user || getRequestHeader('authorization') || content.mode === 'private'
        ? 'private, no-store'
        : 'public, max-age=0, s-maxage=5',
    ...(content.mode === 'stream'
      ? {
          pending: new Promise<void>((resolve) => {
            finishStream = resolve
          }),
        }
      : {}),
    message: `Running in ${navigator.userAgent}`,
    myVar: user
      ? `Private content for ${user}`
      : `${content.value}${variant ? ` (${variant})` : ''}`,
  }
}
