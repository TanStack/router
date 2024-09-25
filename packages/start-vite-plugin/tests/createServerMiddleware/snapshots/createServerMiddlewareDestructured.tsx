import { createServerMiddleware } from '@tanstack/start';
import { z } from 'zod';
export const withUseServer = createServerMiddleware({
  id: 'test',
}).use(async ({ next }) {
    "use server";

    console.info('Fetching posts...');
    await new Promise(r => setTimeout(r, 500));
    return axios.get<Array<PostType>>('https://jsonplaceholder.typicode.com/posts').then(r => r.data.slice(0, 10));
  }
});
export const withoutUseServer = createServerMiddleware({
  id: 'test',
  after: async () => {
    "use server";

    console.info('Fetching posts...');
    await new Promise(r => setTimeout(r, 500));
    return axios.get<Array<PostType>>('https://jsonplaceholder.typicode.com/posts').then(r => r.data.slice(0, 10));
  }
});
export const withVariable = createServerMiddleware({
  id: 'test',
  before: (...args) => {
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
export const withZodValidator = createServerMiddleware({
  id: 'test',
  before: (...args) => {
    "use server";

    return zodValidator(z.number(), input => {
      return {
        'you gave': input
      };
    }).apply(this, args);
  }
});