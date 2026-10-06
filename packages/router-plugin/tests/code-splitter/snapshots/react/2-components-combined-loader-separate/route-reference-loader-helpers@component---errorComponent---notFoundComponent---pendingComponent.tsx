import { Route } from "route-reference-loader-helpers.tsx";
let label = 'initial';
label = 'updated';
const SplitComponent = () => {
  const posts = Route.useLoaderData();
  return <ul>{posts.length}</ul>;
};
export { SplitComponent as component };