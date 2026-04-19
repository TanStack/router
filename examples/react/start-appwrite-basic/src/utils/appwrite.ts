import {
  deleteCookie,
  getCookie,
  setCookie,
} from '@tanstack/react-start/server'
import { Account, Client, Users } from 'node-appwrite'

export const APPWRITE_SESSION_COOKIE = 'appwrite-session'

function getEndpoint() {
  return process.env.APPWRITE_ENDPOINT ?? 'https://cloud.appwrite.io/v1'
}

export function createSessionClient() {
  const client = new Client()
    .setEndpoint(getEndpoint())
    .setProject(process.env.APPWRITE_PROJECT_ID!)

  const session = getCookie(APPWRITE_SESSION_COOKIE)
  if (session) {
    client.setSession(session)
  }

  return {
    get account() {
      return new Account(client)
    },
  }
}

function adminClient() {
  return new Client()
    .setEndpoint(getEndpoint())
    .setProject(process.env.APPWRITE_PROJECT_ID!)
    .setKey(process.env.APPWRITE_API_KEY!)
}

export function createAdminClient() {
  const client = adminClient()
  return {
    get account() {
      return new Account(client)
    },
  }
}

export function createAdminUsers() {
  return new Users(adminClient())
}

export function setAppwriteSessionCookie(secret: string) {
  setCookie(APPWRITE_SESSION_COOKIE, secret, {
    path: '/',
    httpOnly: true,
    sameSite: 'strict',
    secure: true,
  })
}

export function clearAppwriteSessionCookie() {
  deleteCookie(APPWRITE_SESSION_COOKIE)
}
