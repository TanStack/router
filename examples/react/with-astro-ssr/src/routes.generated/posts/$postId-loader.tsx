export type PostType = {
  id: string;
  title: string;
  body: string;
};
export const tanner = 'foo';
async function fetchPostById(postId: string) {
  console.log(`Fetching post with id ${postId}...`);
  await new Promise(r => setTimeout(r, Math.round(Math.random() * 300)));
  return fetch(`https://jsonplaceholder.typicode.com/posts/${postId}`).then(r => (r.json() as Promise<PostType>));
}
export const loader = async ({
  params: {
    postId
  }
}) => {
  return {
    post: await fetchPostById(postId)
  };
};