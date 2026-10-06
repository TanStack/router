import { createIsomorphicFn } from '@tanstack/react-start'
import { connect, serverCall } from './db.server'

// Server-only state declared with `var` inside nested statements
if (typeof window === 'undefined') {
  var connection = connect()
}

export function getValue(flag: boolean) {
  if (flag) {
    var local = serverCall()
  }
  const read = createIsomorphicFn()
    .server(() => [connection, local])
    .client(() => 'client')
  return read()
}
