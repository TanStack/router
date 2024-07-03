import { v } from 'convex/values'

import { internalAction, internalMutation, query } from './_generated/server'
import { internal } from './_generated/api'

import schema from './schema'

export const seed = internalAction(async (ctx) => {
  const posts = await (
    await fetch('https://jsonplaceholder.typicode.com/posts')
  ).json()
  await ctx.runMutation(internal.data.resetPosts, {
    posts: posts.slice(0, 10),
  })
})

export const resetPosts = internalMutation({
  args: {
    posts: v.array(schema.tables.posts.validator),
  },
  handler: async (ctx, { posts }) => {
    for await (const post of ctx.db.query('posts')) {
      ctx.db.delete(post._id)
    }
    for (const post of posts) {
      ctx.db.insert('posts', post)
    }
  },
})

export const getPosts = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('posts').collect()
  },
})

export const getPost = query({
  args: { id: v.number() },
  handler: async (ctx, { id }) => {
    const invoice = await ctx.db
      .query('posts')
      .withIndex('id', (q) => q.eq('id', id))
      .unique()
    if (!invoice) throw new Error('not found')
    return invoice
  },
})
