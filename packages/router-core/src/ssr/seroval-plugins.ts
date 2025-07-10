import { createPlugin } from 'seroval'
import type { SerovalNode } from 'seroval'

interface ErrorNode {
  message: SerovalNode
}

/**
 * this plugin serializes only the `message` part of an Error
 * this helps with serializing e.g. a ZodError which has functions attached that cannot be serialized
 */
export const ShallowErrorPlugin = /* @__PURE__ */ createPlugin<
  Error,
  ErrorNode
>({
  tag: 'tanstack-start:seroval-plugins/Error',
  test(value) {
    return value instanceof Error
  },
  parse: {
    sync(value, ctx) {
      return {
        message: ctx.parse(value.message),
      }
    },
    async async(value, ctx) {
      return {
        message: await ctx.parse(value.message),
      }
    },
    stream(value, ctx) {
      return {
        message: ctx.parse(value.message),
      }
    },
  },
  serialize(node, ctx) {
    return 'new Error(' + ctx.serialize(node.message) + ')'
  },
  deserialize(node, ctx) {
    return new Error(ctx.deserialize(node.message) as string)
  },
})
