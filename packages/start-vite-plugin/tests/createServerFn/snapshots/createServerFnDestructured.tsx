import { createServerFn } from '@tanstack/start';
import { z } from 'zod';
export const withUseServer = createServerFn({
  method: 'GET'
}).handler((...args) => {
  "use server";

  return (async function () {
    console.info('Fetching posts...');
    await new Promise(r => setTimeout(r, 500));
    return axios.get<Array<PostType>>('https://jsonplaceholder.typicode.com/posts').then(r => r.data.slice(0, 10));
  })(...args);
});
export const withArrowFunction = createServerFn({
  method: 'GET'
}).handler((...args) => {
  "use server";

  return (async () => null)(...args);
});
export const withArrowFunctionAndFunction = createServerFn({
  method: 'GET'
}).handler((...args) => {
  "use server";

  return (async () => test())(...args);
});
export const withoutUseServer = createServerFn({
  method: 'GET'
}).handler((...args) => {
  "use server";

  return (async () => {
    console.info('Fetching posts...');
    await new Promise(r => setTimeout(r, 500));
    return axios.get<Array<PostType>>('https://jsonplaceholder.typicode.com/posts').then(r => r.data.slice(0, 10));
  })(...args);
});
export const withVariable = createServerFn({
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
export const withZodValidator = createServerFn({
  method: 'GET'
}).handler((...args) => {
  "use server";

  return (zodValidator(z.number(), input => {
    return {
      'you gave': input
    };
  }))(...args);
});
export const withValidatorFn = createServerFn({
  method: 'GET'
}).handler((...args) => {
  "use server";

  args[0].input = (z.number())(args[0].input);
  return (async ({
    input
  }) => {
    return null;
  })(...args);
});