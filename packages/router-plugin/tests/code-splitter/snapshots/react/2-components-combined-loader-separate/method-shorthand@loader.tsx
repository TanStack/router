import { obj } from "method-shorthand.tsx?tsr-shared=1";
import { fetchPosts } from '../posts';
const SplitLoader = async function ({
  context
}) {
  return await fetchPosts(context, obj);
};
export { SplitLoader as loader };