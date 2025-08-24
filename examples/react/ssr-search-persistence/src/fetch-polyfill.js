import fetch, { Headers, Request, Response } from 'node-fetch'

// Polyfill fetch for Node.js environments that don't have it built-in
// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
globalThis.fetch = globalThis.fetch || fetch
// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
globalThis.Headers = globalThis.Headers || Headers
// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
globalThis.Request = globalThis.Request || Request
// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
globalThis.Response = globalThis.Response || Response
