import type { ServerFnCodec } from './serverFnCodecLoader'

// Lazy builds alias the bundled imports here: Vite can otherwise promote the
// codec to an initial chunk before eliminating the bundled-only branches.
// These bindings are only referenced in branches removed by the transport flag.
export const serialize: ServerFnCodec['serialize'] = undefined!
export const deserialize: ServerFnCodec['deserialize'] = undefined!
