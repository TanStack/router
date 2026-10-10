import * as React from 'react';
import { fetchPosts } from '../posts';
const SplitLoader = function () {
  return fetchPosts();
};
export { SplitLoader as loader };