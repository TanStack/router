const cache = new Map<string, string>()
const SplitLoader = () => cache.get('title')
export { SplitLoader as loader }
const SplitComponent = () => <div>{cache.size}</div>
export { SplitComponent as component }
