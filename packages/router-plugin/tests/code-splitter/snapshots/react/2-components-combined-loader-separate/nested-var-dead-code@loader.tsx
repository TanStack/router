import { loadServerData } from './lib'
if (typeof window !== 'undefined') {
}
try {
  var loaderOnly = loadServerData()
} catch {}
if (typeof window !== 'undefined') {
}
const SplitLoader = () => loaderOnly
export { SplitLoader as loader }
