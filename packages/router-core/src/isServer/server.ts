export const isServer = process.env.NODE_ENV === 'test' ? undefined : true
export { loadServer, loadServerRouter } from '../load-server'
