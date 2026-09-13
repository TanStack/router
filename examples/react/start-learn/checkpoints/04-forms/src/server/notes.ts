import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { z } from 'zod'
import { db } from './db.server'
import { Prisma } from '../generated/prisma/client'

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

export const createNote = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      slug: z
        .string()
        .min(1)
        .max(80)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      title: z.string().trim().min(1).max(120),
      body: z.string().trim().min(1).max(5000),
      category: z.string().trim().min(1).max(40),
    }),
  )
  .handler(async ({ data }) => {
    setResponseHeader('Cache-Control', 'no-store')
    try {
      await db.$transaction(async (tx) => {
        await tx.category.upsert({
          where: { name: data.category },
          create: { name: data.category },
          update: {},
        })
        await tx.note.create({
          data: {
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
