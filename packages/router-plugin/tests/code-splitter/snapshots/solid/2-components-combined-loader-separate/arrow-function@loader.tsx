import { fetchPosts } from '../posts';
import { Route } from "arrow-function.tsx";
const SplitLoader = fetchPosts;
export { SplitLoader as loader };