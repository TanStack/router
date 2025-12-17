// Destructuring - ensure we promote the right binding
const cfg = {
  apiUrl: 'http://api.com',
  timeout: 5000
};
const {
  apiUrl
} = cfg;
const SplitLoader = async () => {
  // Uses the destructured binding
  return fetch(apiUrl).then(r => r.json());
};
export { SplitLoader as loader };