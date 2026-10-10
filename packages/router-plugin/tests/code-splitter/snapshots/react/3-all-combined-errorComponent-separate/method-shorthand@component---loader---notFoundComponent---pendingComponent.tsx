import * as React from 'react';
import { fetchPosts } from '../posts';
import { Route } from "method-shorthand.tsx";
const SplitLoader = function () {
  return fetchPosts();
};
export { SplitLoader as loader };
const SplitComponent = function () {
  const posts = Route.useLoaderData();
  return <div>{posts.length} posts</div>;
};
export { SplitComponent as component };