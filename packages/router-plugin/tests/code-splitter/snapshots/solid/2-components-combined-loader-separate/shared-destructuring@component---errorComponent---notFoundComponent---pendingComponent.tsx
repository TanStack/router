// Destructuring - ensure we promote the right binding
const cfg = {
  apiUrl: 'http://api.com',
  timeout: 5000
};
const {
  apiUrl
} = cfg;
function TestComponent() {
  // Also uses the destructured binding
  return <div>API: {apiUrl}</div>;
}
export { TestComponent as component };