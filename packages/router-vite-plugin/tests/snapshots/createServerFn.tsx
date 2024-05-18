import { createServerFn } from '@tanstack/start';
export const withUseServer = createServerFn('GET', async function () {
  "use server";

  console.log('Fetching posts...');
  await new Promise(r => setTimeout(r, 500));
  return axios.get<Array<PostType>>('https://jsonplaceholder.typicode.com/posts').then(r => r.data.slice(0, 10));
});
export const withoutUseServer = createServerFn('GET', async () => {
  "use server";

  console.log('Fetching posts...');
  await new Promise(r => setTimeout(r, 500));
  return axios.get<Array<PostType>>('https://jsonplaceholder.typicode.com/posts').then(r => r.data.slice(0, 10));
});
export const withVariable = createServerFn('GET', abstractedFunction);
async function abstractedFunction() {
  console.log('Fetching posts...');
  await new Promise(r => setTimeout(r, 500));
  return axios.get<Array<PostType>>('https://jsonplaceholder.typicode.com/posts').then(r => r.data.slice(0, 10));
}