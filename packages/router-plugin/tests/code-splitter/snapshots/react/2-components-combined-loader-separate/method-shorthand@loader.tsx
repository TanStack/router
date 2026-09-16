import { fetchPosts } from '../posts';
const SplitLoader = async function ({
  context
}) {
  return await fetchPosts(context);
};
export { SplitLoader as loader };