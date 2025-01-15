import { createServerFn } from '@tanstack/start';
import { z } from 'zod';
export const withUseServer = createServerFn({
  method: 'GET'
}).handler(opts => {
  "use server";

  return withUseServer.__executeServer(opts);
}, async function () {
  console.info('Fetching posts...');
  await new Promise(r => setTimeout(r, 500));
  return axios.get<Array<PostType>>('https://jsonplaceholder.typicode.com/posts').then(r => r.data.slice(0, 10));
});
export const withArrowFunction = createServerFn({
  method: 'GET'
}).handler(opts => {
  "use server";

  return withArrowFunction.__executeServer(opts);
}, async () => null);
export const withArrowFunctionAndFunction = createServerFn({
  method: 'GET'
}).handler(opts => {
  "use server";

  return withArrowFunctionAndFunction.__executeServer(opts);
}, async () => test());
export const withoutUseServer = createServerFn({
  method: 'GET'
}).handler(opts => {
  "use server";

  return withoutUseServer.__executeServer(opts);
}, async () => {
  console.info('Fetching posts...');
  await new Promise(r => setTimeout(r, 500));
  return axios.get<Array<PostType>>('https://jsonplaceholder.typicode.com/posts').then(r => r.data.slice(0, 10));
});
export const withVariable = createServerFn({
  method: 'GET'
}).handler(opts => {
  "use server";

  return withVariable.__executeServer(opts);
}, abstractedFunction);
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
}).handler(opts => {
  "use server";

  return withZodValidator.__executeServer(opts);
}, zodValidator(z.number(), input => {
  return {
    'you gave': input
  };
}));
export const withValidatorFn = createServerFn({
  method: 'GET'
}).validator(z.number()).handler(opts => {
  "use server";

  return withValidatorFn.__executeServer(opts);
}, async ({
  input
}) => {
  return null;
});