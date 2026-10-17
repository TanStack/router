import * as Solid from 'solid-js';
import { Route } from "method-shorthand.tsx";
const SplitComponent = function () {
  const posts = Route.useLoaderData();
  return <div>{posts().length} posts</div>;
};
export { SplitComponent as component };