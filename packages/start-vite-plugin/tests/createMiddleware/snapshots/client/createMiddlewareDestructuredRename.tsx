import { createMiddleware as middlewareFn } from '@tanstack/start';
import { z } from 'zod';
export const withUseServer = middlewareFn({
  id: 'test'
});
export const withoutUseServer = middlewareFn({
  id: 'test'
});
export const withVariable = middlewareFn({
  id: 'test'
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
export const withZodValidator = middlewareFn({
  id: 'test'
});