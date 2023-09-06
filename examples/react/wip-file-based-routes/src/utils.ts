import axios from "axios";
import { Post } from "./types";

export const fetchPosts = async () => {
    console.log("Fetching posts...");
    await new Promise((r) => setTimeout(r, 500));
    return axios
        .get<Post[]>("https://jsonplaceholder.typicode.com/posts")
        .then((r) => r.data.slice(0, 10));
};

export class PostNotFoundError extends Error { }

export const fetchPost = async (postId: string) => {
    console.log(`Fetching post with id ${postId}...`)
    await new Promise((r) => setTimeout(r, 500))
    const post = await axios
        .get<Post>(`https://jsonplaceholder.typicode.com/posts/${postId}`)
        .then((r) => r.data)

    if (!post) {
        throw new PostNotFoundError(`Post with id "${postId}" not found!`)
    }

    return post
}