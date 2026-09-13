import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { z } from 'zod'
import { db } from './db.server'

export const listNotes = createServerFn({ method: 'GET' })
  .validator(z.object({ q: z.string().max(200) }))
  .handler(async ({ data }) => {
    setResponseHeader('Cache-Control', 'no-store')
    return db.note.findMany({
      where: { title: { contains: data.q, mode: 'insensitive' } },
      select: { slug: true, title: true, categoryName: true },
      orderBy: { slug: 'asc' },
    })
  })

export const getNote = createServerFn({ method: 'GET' })
  .validator(z.string().min(1).max(80))
  .handler(async ({ data }) => {
    setResponseHeader('Cache-Control', 'no-store')
    return db.note.findUnique({
      where: { slug: data },
      select: { slug: true, title: true, body: true, categoryName: true },
    })
  })
