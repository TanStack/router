import { getDefaultSerovalPlugins } from '@tanstack/start-client-core'
import type { HandleServerFunctionOptions } from '@solidjs/web/server-functions/server'

type SolidServerFunctionCodec = NonNullable<
  HandleServerFunctionOptions['codec']
>

const READABLE_STREAM_PLUGIN_TAG = 'seroval/plugins/web/ReadableStream'

export function getSolidStartServerFunctionCodec(): SolidServerFunctionCodec {
  return {
    // Solid appends its web plugins, so including TanStack's copy of the
    // ReadableStream plugin would register the same Seroval tag twice.
    plugins: getDefaultSerovalPlugins().filter(
      (plugin) => plugin.tag !== READABLE_STREAM_PLUGIN_TAG,
    ) as unknown as SolidServerFunctionCodec['plugins'],
  }
}
