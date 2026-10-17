import { createServerFn } from '@tanstack/react-start'

// Imported with a `!` prefix, which skips builtin SWC for this module, so it
// must stay plain JavaScript.
export const getInlineLoaderGreeting = createServerFn().handler(() => ({
  greeting: 'Hello, inline loader!',
}))
