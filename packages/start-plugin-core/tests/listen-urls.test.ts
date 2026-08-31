import { describe, expect, it } from 'vitest'
import { formatListenBanner, resolveListenUrls } from '../src/bun/listen-urls'

const ifaces = {
  lo: [
    {
      address: '127.0.0.1',
      netmask: '255.0.0.0',
      family: 'IPv4' as const,
      mac: '00:00:00:00:00:00',
      internal: true,
      cidr: '127.0.0.1/8',
    },
  ],
  eth0: [
    {
      address: '192.168.1.8',
      netmask: '255.255.255.0',
      family: 'IPv4' as const,
      mac: 'aa:bb:cc:dd:ee:ff',
      internal: false,
      cidr: '192.168.1.8/24',
    },
    {
      address: 'fe80::1',
      netmask: 'ffff:ffff:ffff:ffff::',
      family: 'IPv6' as const,
      mac: 'aa:bb:cc:dd:ee:ff',
      internal: false,
      cidr: 'fe80::1/64',
      scopeid: 1,
    },
  ],
  tailscale0: [
    {
      address: '100.64.0.2',
      netmask: '255.255.255.255',
      family: 4 as const,
      mac: 'aa:bb:cc:dd:ee:ff',
      internal: false,
      cidr: '100.64.0.2/32',
    },
  ],
}

describe('resolveListenUrls', () => {
  it('wildcard 列出 localhost 与非内部 IPv4', () => {
    expect(
      resolveListenUrls(
        { hostname: '0.0.0.0', port: 3847, interfaces: ifaces },
      ),
    ).toEqual({
      local: ['http://localhost:3847/'],
      network: ['http://192.168.1.8:3847/', 'http://100.64.0.2:3847/'],
    })
  })

  it('localhost 不暴露 Network', () => {
    expect(
      resolveListenUrls({ hostname: '127.0.0.1', port: 3000, interfaces: ifaces }),
    ).toEqual({
      local: ['http://localhost:3000/'],
      network: [],
    })
  })
})

describe('formatListenBanner', () => {
  it('对齐 Local / Network 行', () => {
    const text = formatListenBanner({
      headline: '[tanstack-start-bun] dev server (esm HMR)',
      hostname: '0.0.0.0',
      port: 3847,
      interfaces: ifaces,
    })
    expect(text).toBe(
      [
        '[tanstack-start-bun] dev server (esm HMR)',
        '  ➜  Local:   http://localhost:3847/',
        '  ➜  Network: http://192.168.1.8:3847/',
        '              http://100.64.0.2:3847/',
      ].join('\n'),
    )
  })
})
