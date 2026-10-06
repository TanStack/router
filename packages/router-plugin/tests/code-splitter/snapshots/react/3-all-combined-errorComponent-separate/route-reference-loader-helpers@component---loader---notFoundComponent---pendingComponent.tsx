import { Route } from "route-reference-loader-helpers.tsx";
const formatter = new Intl.NumberFormat('en');
let label = 'initial';
label = 'updated';
async function fetchPosts() {
  return [formatter.format(1), label];
}
const SplitLoader = () => fetchPosts();
export { SplitLoader as loader };
const SplitComponent = () => {
  const posts = Route.useLoaderData();
  return <ul>{posts.length}</ul>;
};
export { SplitComponent as component };