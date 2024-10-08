import * as TanStackStart from '@tanstack/start';
import { z } from 'zod';
export const withUseServer = TanStackStart.createServerFn({
  method: 'GET'
}).handler((...args) => {
  "use server";

  return (async function () {
    console.info('Fetching posts...');
    await new Promise(r => setTimeout(r, 500));
    return axios.get<Array<PostType>>('https://jsonplaceholder.typicode.com/posts').then(r => r.data.slice(0, 10));
  })(...args);
});
export const withoutUseServer = TanStackStart.createServerFn({
  method: 'GET'
}).handler((...args) => {
  "use server";

  return (async () => {
    console.info('Fetching posts...');
    await new Promise(r => setTimeout(r, 500));
    return axios.get<Array<PostType>>('https://jsonplaceholder.typicode.com/posts').then(r => r.data.slice(0, 10));
  })(...args);
});
export const withVariable = TanStackStart.createServerFn({
  method: 'GET'
}).handler((...args) => {
  "use server";

  return (abstractedFunction)(...args);
});
async function abstractedFunction() {
  console.info('Fetching posts...');
  await new Promise(r => setTimeout(r, 500));
  return axios.get<Array<PostType>>('https://jsonplaceholder.typicode.com/posts').then(r => r.data.slice(0, 10));
}
function zodValidator<TSchema extends z.ZodSchema, TResult>(schema: TSchema, fn: (input: z.output<TSchema>) => TResult) {
  return async (input: unknown) => {
    return fn(schema.parse(input));
  };
}
export const withZodValidator = TanStackStart.createServerFn({
  method: 'GET'
}).handler((...args) => {
  "use server";

  return (zodValidator(z.number(), input => {
    return {
      'you gave': input
    };
  }))(...args);
});