/**
 * Rsbuild SSR decode implementation.
 *
 * Bundler-owned rsbuild virtual modules re-export this module for SSR-side
 * Flight decode.
 */

import { setOnClientReference } from '@rspack/core/rsc/ssr'
import { createFromReadableStream } from 'react-server-dom-rspack/client.node'

export { createFromReadableStream, setOnClientReference }
