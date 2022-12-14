import { useLoaderData } from '@tanstack/react-router';
export type PostType = {
  id: string;
  title: string;
  body: string;
};
export const loader = async ({
  params: {
    postId
  }
}) => {
  console.log(`Fetching post with id ${postId}...`);
  await new Promise(r => setTimeout(r, Math.round(Math.random() * 300)));
  const post = await fetch(`https://jsonplaceholder.typicode.com/posts/${postId}`).then(r => (r.json() as Promise<PostType>));
  return {
    post
  };
};