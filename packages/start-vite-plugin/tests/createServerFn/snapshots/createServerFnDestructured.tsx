import { createServerFn } from '@tanstack/start';
import { z } from 'zod';
export const withUseServer = createServerFn({
  method: 'GET',
  fn: async function () {
    "use server";

    console.info('Fetching posts...');
    await new Promise(r => setTimeout(r, 500));
    return axios.get<Array<PostType>>('https://jsonplaceholder.typicode.com/posts').then(r => r.data.slice(0, 10));
  }
});
export const withArrowFunction = createServerFn({
  method: 'GET',
  fn: () => {
    "use server";

    return null;
  }
});
export const withArrowFunctionAndFunction = createServerFn({
  method: 'GET',
  fn: () => {
    "use server";

    return test();
  }
});
export const withoutUseServer = createServerFn({
  method: 'GET',
  fn: async () => {
    "use server";

    console.info('Fetching posts...');
    await new Promise(r => setTimeout(r, 500));
    return axios.get<Array<PostType>>('https://jsonplaceholder.typicode.com/posts').then(r => r.data.slice(0, 10));
  }
});
export const withVariable = createServerFn({
  method: 'GET',
  fn: (...args) => {
    "use server";

    return abstractedFunction.apply(this, args);
  }
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
export const withZodValidator = createServerFn({
  method: 'GET',
  fn: (...args) => {
    "use server";

    return zodValidator(z.number(), input => {
      return {
        'you gave': input
      };
    }).apply(this, args);
  }
});