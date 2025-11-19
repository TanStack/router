import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
export const withUseServer = createServerFn({
  method: 'GET'
}).handler((opts, signal) => {
  "use server";

  return withUseServer.__executeServer(opts, signal);
}, async function () {
  console.info('Fetching posts...');
  await new Promise(r => setTimeout(r, 500));
  return axios.get<Array<PostType>>('https://jsonplaceholder.typicode.com/posts').then(r => r.data.slice(0, 10));
});
export const withArrowFunction = createServerFn({
  method: 'GET'
}).handler((opts, signal) => {
  "use server";

  return withArrowFunction.__executeServer(opts, signal);
}, async () => null);
export const withArrowFunctionAndFunction = createServerFn({
  method: 'GET'
}).handler((opts, signal) => {
  "use server";

  return withArrowFunctionAndFunction.__executeServer(opts, signal);
}, async () => test());
export const withoutUseServer = createServerFn({
  method: 'GET'
}).handler((opts, signal) => {
  "use server";

  return withoutUseServer.__executeServer(opts, signal);
}, async () => {
  console.info('Fetching posts...');
  await new Promise(r => setTimeout(r, 500));
  return axios.get<Array<PostType>>('https://jsonplaceholder.typicode.com/posts').then(r => r.data.slice(0, 10));
});
export const withVariable = createServerFn({
  method: 'GET'
}).handler((opts, signal) => {
  "use server";

  return withVariable.__executeServer(opts, signal);
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
}).handler((opts, signal) => {
  "use server";

  return withZodValidator.__executeServer(opts, signal);
}, zodValidator(z.number(), input => {
  return {
    'you gave': input
  };
}));
export const withValidatorFn = createServerFn({
  method: 'GET'
}).inputValidator(z.number()).handler((opts, signal) => {
  "use server";

  return withValidatorFn.__executeServer(opts, signal);
}, async ({
  input
}) => {
  return null;
});