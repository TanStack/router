import { createServerFn } from '@tanstack/start';
import { z } from 'zod';
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
export const withVariable = createServerFn('GET', (...args: Parameters<Parameters<typeof createServerFn>[1]>) => {
  "use server";

  return abstractedFunction.apply(this, args);
});
async function abstractedFunction() {
  console.log('Fetching posts...');
  await new Promise(r => setTimeout(r, 500));
  return axios.get<Array<PostType>>('https://jsonplaceholder.typicode.com/posts').then(r => r.data.slice(0, 10));
}
function zodValidator<TSchema extends z.ZodSchema, TResult>(schema: TSchema, fn: (input: z.output<TSchema>) => TResult) {
  return async (input: unknown) => {
    return fn(schema.parse(input));
  };
}
export const withZodValidator = createServerFn('GET', (...args: Parameters<Parameters<typeof createServerFn>[1]>) => {
  "use server";

  return zodValidator(z.number(), input => {
    return {
      'you gave': input
    };
  }).apply(this, args);
});