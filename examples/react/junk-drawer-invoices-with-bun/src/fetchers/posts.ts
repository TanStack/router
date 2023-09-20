import { NotFoundError } from "../types";
import { PostType } from "../types";
import axios from "axios";

export const fetchPosts = async () => {
  console.log("Fetching posts...");
  await new Promise((r) => setTimeout(r, 500));
  return axios
    .get<PostType[]>("https://jsonplaceholder.typicode.com/posts")
    .then((r) => r.data.slice(0, 10));
};

export const fetchPost = async (postId: string) => {
  console.log(`Fetching post with id ${postId}...`);
  await new Promise((r) => setTimeout(r, 500));
  const post = await axios
    .get<PostType>(`https://jsonplaceholder.typicode.com/posts/${postId}`)
    .then((r) => r.data);

  if (!post) {
    throw new NotFoundError(`Post with id "${postId}" not found!`);
  }

  return post;
};
