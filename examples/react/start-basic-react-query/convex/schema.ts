import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
export default defineSchema({
  posts: defineTable({
    id: v.number(),
    title: v.string(),
    body: v.string(),
  }).index('id', ['id']),
})
