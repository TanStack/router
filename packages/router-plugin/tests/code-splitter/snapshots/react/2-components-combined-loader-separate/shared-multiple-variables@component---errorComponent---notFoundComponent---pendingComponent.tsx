// Multiple shared variables used by both loader and component
const collection1 = {
  name: 'todos',
  preload: async () => {}
};
const collection2 = {
  name: 'users',
  preload: async () => {}
};
const config = {
  apiUrl: 'http://api.com'
};
function TestComponent() {
  return <div>
      {collection1.name} {collection2.name} {config.apiUrl}
    </div>;
}
export { TestComponent as component };