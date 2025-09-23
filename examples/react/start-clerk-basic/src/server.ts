import { defaultStreamHandler } from '@tanstack/react-start/server'
import { createClerkHandler } from '@clerk/tanstack-react-start/server'

// TODO fixme
const clerkHandler = createClerkHandler({} as any)

export default {
  fetch: clerkHandler(defaultStreamHandler),
}
