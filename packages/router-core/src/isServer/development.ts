// Development/test mode - returns undefined so fallback to router.isServer is used
export const isServer: boolean | undefined = undefined
export { preloadServerRoute, loadServerRoute } from '../load-server'
