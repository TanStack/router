import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import blogPosts from '../../data.ts'
import { procedure } from '../../trpc.ts'

const getPostByID = procedure.input(z.string()).query(({ input }) => {
  const post = blogPosts.find(({ id }) => id === input)

  if (!post) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: `Blog post with id = "${input}" not found!`,
    })
  }

  return post
})

export default getPostByID
