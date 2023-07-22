import { z } from 'zod'

import { publicProcedure, router } from './init'
import { db } from '../db'

export const appRouter = router({
  postList: publicProcedure.query(async () => {
    // Retrieve users from a datasource, this is an imaginary database

    return await db.post.list()
  }),

  postById: publicProcedure.input(z.number()).query(async (opts) => {
    const user = await db.post.byId(opts.input)
    return user
  }),

  postCreate: publicProcedure
    .input(
      z.object({ title: z.string(), body: z.string(), authorId: z.number() }),
    )
    .mutation(async (opts) => {
      const user = await db.post.create(opts.input)
      return user
    }),
})

export type AppRouter = typeof appRouter
