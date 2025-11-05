// Object contains methods (functions) - should still be shared as whole object
const api = {
  endpoint: 'http://api.com',
  fetch: async () => ({
    data: 'loaded'
  }),
  cache: new Map()
};
function TestComponent() {
  return <div>
      {api.endpoint} - Cache size: {api.cache.size}
    </div>;
}
export { TestComponent as component };