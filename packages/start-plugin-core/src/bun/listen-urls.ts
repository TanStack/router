import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os'

export type ListenUrls = {
  local: Array<string>
  network: Array<string>
}

type InterfaceMap = ReturnType<typeof networkInterfaces>

function isIpv4(info: NetworkInterfaceInfo): boolean {
  return String(info.family) === 'IPv4' || String(info.family) === '4'
}

function isWildcardHost(hostname: string): boolean {
  return hostname === '0.0.0.0' || hostname === '::' || hostname === ''
}

function hostForUrl(host: string): string {
  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host
}

/**
 * 类似 Vite `resolveServerUrls`：0.0.0.0 / :: 时列出 localhost + 局域网 IPv4。
 */
export function resolveListenUrls(opts: {
  hostname: string
  port: number
  protocol?: 'http' | 'https'
  interfaces?: InterfaceMap
}): ListenUrls {
  const protocol = opts.protocol ?? 'http'
  const { hostname, port } = opts
  const toUrl = (host: string) => `${protocol}://${hostForUrl(host)}:${port}/`

  if (!isWildcardHost(hostname)) {
    const localHost =
      hostname === '127.0.0.1' || hostname === '::1' ? 'localhost' : hostname
    return { local: [toUrl(localHost)], network: [] }
  }

  const ifaces = opts.interfaces ?? networkInterfaces()
  const network: Array<string> = []
  const seen = new Set<string>()
  for (const addrs of Object.values(ifaces)) {
    for (const addr of addrs ?? []) {
      if (!isIpv4(addr) || addr.internal) {
        continue
      }
      const url = toUrl(addr.address)
      if (seen.has(url)) {
        continue
      }
      seen.add(url)
      network.push(url)
    }
  }

  return { local: [toUrl('localhost')], network }
}

/** Vite 风格：Local / Network 对齐的多行 banner */
export function formatListenBanner(opts: {
  headline: string
  hostname: string
  port: number
  protocol?: 'http' | 'https'
  interfaces?: InterfaceMap
}): string {
  const urls = resolveListenUrls(opts)
  const lines = [opts.headline]
  const localLabel = '  ➜  Local:   '
  const networkLabel = '  ➜  Network: '
  const indent = ' '.repeat(networkLabel.length)
  for (const [index, url] of urls.local.entries()) {
    lines.push((index === 0 ? localLabel : indent) + url)
  }
  for (const [index, url] of urls.network.entries()) {
    lines.push((index === 0 ? networkLabel : indent) + url)
  }
  return lines.join('\n')
}

/** 写入 host.js / standalone entry 的运行时实现（与上面逻辑一致） */
export function listenBannerRuntimeJs(): string {
  return `function hostForUrl(host) {
  return host.includes(':') && !host.startsWith('[') ? '[' + host + ']' : host
}
function formatListenBanner(headline, hostname, port) {
  const toUrl = (host) => 'http://' + hostForUrl(host) + ':' + port + '/'
  const lines = [headline]
  const localLabel = '  ➜  Local:   '
  const networkLabel = '  ➜  Network: '
  const indent = ' '.repeat(networkLabel.length)
  const local = []
  const network = []
  if (hostname === '0.0.0.0' || hostname === '::' || hostname === '') {
    local.push(toUrl('localhost'))
    const seen = new Set()
    for (const addrs of Object.values(networkInterfaces())) {
      for (const addr of addrs ?? []) {
        const ipv4 = addr.family === 'IPv4' || addr.family === 4
        if (!ipv4 || addr.internal) continue
        const url = toUrl(addr.address)
        if (seen.has(url)) continue
        seen.add(url)
        network.push(url)
      }
    }
  } else {
    const localHost =
      hostname === '127.0.0.1' || hostname === '::1' ? 'localhost' : hostname
    local.push(toUrl(localHost))
  }
  for (const [index, url] of local.entries()) {
    lines.push((index === 0 ? localLabel : indent) + url)
  }
  for (const [index, url] of network.entries()) {
    lines.push((index === 0 ? networkLabel : indent) + url)
  }
  return lines.join('\\n')
}`
}

