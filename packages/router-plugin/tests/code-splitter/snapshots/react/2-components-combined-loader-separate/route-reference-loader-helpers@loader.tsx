const formatter = new Intl.NumberFormat('en');
let label = 'initial';
label = 'updated';
async function fetchPosts() {
  return [formatter.format(1), label];
}
const SplitLoader = () => fetchPosts();
export { SplitLoader as loader };