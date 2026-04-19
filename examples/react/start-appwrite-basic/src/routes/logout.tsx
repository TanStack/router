import { redirect, createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import {
  clearAppwriteSessionCookie,
  createSessionClient,
} from '../utils/appwrite'

const logoutFn = createServerFn().handler(async () => {
  try {
    const { account } = createSessionClient()
    await account.deleteSession({ sessionId: 'current' })
  } catch {
    // ignore — cookie is cleared below either way
  }

  clearAppwriteSessionCookie()

  throw redirect({
    href: '/',
  })
})

export const Route = createFileRoute('/logout')({
  preload: false,
  loader: () => logoutFn(),
})
