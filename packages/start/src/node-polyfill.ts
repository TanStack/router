import { cloudflare, env, nodeless } from 'unenv'

const { external, alias, polyfill } = env(nodeless, cloudflare, {})
console.log('🚀 external', external)
console.log('🚀 alias', alias)
console.log('🚀 polyfill', polyfill)
