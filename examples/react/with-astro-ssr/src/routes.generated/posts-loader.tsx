import { PostType } from './posts/$postId';
async function fetchPosts() {
  console.log('Fetching posts...');
  await new Promise(r => setTimeout(r, 300 + Math.round(Math.random() * 300)));
  return fetch('https://jsonplaceholder.typicode.com/posts').then(d => (d.json() as Promise<PostType[]>)).then(d => d.slice(0, 10));
}
export const loader = async () => {
  return {
    posts: await fetchPosts()
  };
};