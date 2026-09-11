import { createServerFn } from '@tanstack/react-start'
import {
  setResponseHeader,
  setResponseStatus,
} from '@tanstack/react-start/server'
import { z } from 'zod'
import { noteInput } from './note-input'
import { siteOrigin } from './site.server'
import { db } from './db.server'
import { requireUser } from './session.server'
import { Prisma } from '../generated/prisma/client'

export const listNotes = createServerFn({ method: 'GET' })
  .validator(z.object({ q: z.string().max(200) }))
  .handler(async ({ data }) => {
    setResponseHeader('Cache-Control', 'no-store')
    const notes = await db.note.findMany({
      where: {
        isPublished: true,
        title: { contains: data.q, mode: 'insensitive' },
      },
      select: { slug: true, title: true, categoryName: true },
      orderBy: { slug: 'asc' },
    })
    return { notes, canonical: `${siteOrigin}/` }
  })

export const getNote = createServerFn({ method: 'GET' })
  .validator(z.string().min(1).max(80))
  .handler(async ({ data }) => {
    setResponseHeader('Cache-Control', 'no-store')
    const note = await db.note.findFirst({
      where: { slug: data, isPublished: true },
      select: { slug: true, title: true, body: true, categoryName: true },
    })
    return note
      ? {
          ...note,
          canonical: `${siteOrigin}/notes/${encodeURIComponent(note.slug)}`,
        }
      : null
  })

export const createNote = createServerFn({ method: 'POST' })
  .validator(noteInput)
  .handler(async ({ data }) => {
    const user = await requireUser()
    try {
      await db.$transaction(async (tx) => {
        await tx.category.upsert({
          where: { name: data.category },
          create: { name: data.category },
          update: {},
        })
        await tx.note.create({
          data: {
            ownerId: user.id,
            slug: data.slug,
            title: data.title,
            body: data.body,
            categoryName: data.category,
          },
        })
      })
      return { error: '' }
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return { error: 'That slug is already used. Choose another one.' }
      }
      throw error
    }
  })

export const listOwnNotes = createServerFn({ method: 'GET' }).handler(
  async () => {
    const user = await requireUser()
    return db.note.findMany({
      where: { ownerId: user.id },
      select: { slug: true, title: true, isPublished: true },
      orderBy: { slug: 'asc' },
    })
  },
)
export const getOwnNote = createServerFn({ method: 'GET' })
  .validator(z.string().min(1).max(80))
  .handler(async ({ data }) => {
    const user = await requireUser()
    return db.note.findFirst({
      where: { slug: data, ownerId: user.id },
      select: { slug: true, title: true, body: true, isPublished: true },
    })
  })
export const setPublished = createServerFn({ method: 'POST' })
  .validator(
    z.object({ slug: z.string().min(1).max(80), isPublished: z.boolean() }),
  )
  .handler(async ({ data }) => {
    const user = await requireUser()
    const result = await db.note.updateMany({
      where: { slug: data.slug, ownerId: user.id },
      data: { isPublished: data.isPublished },
    })
    if (result.count !== 1) {
      setResponseStatus(404)
      throw new Error('Note not found')
    }
  })
