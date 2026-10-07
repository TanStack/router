import * as Solid from 'solid-js';
import { fetchPosts } from '../posts';
const SplitLoader = function () {
  return fetchPosts();
};
export { SplitLoader as loader };