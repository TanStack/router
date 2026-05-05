import type { PluginOption } from 'vite'

export function hasNitroPlugin(
  plugins: PluginOption | Array<PluginOption> | undefined,
) {
  if (!plugins) {
    return false
  }

  for (const plugin of Array.isArray(plugins) ? plugins : [plugins]) {
    if (!plugin) {
      continue
    }

    if (Array.isArray(plugin)) {
      if (hasNitroPlugin(plugin)) {
        return true
      }
      continue
    }

    if (typeof plugin === 'object' && 'name' in plugin) {
      const name = plugin.name
      if (typeof name === 'string' && name.startsWith('nitro:')) {
        return true
      }
    }
  }

  return false
}
