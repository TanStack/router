import { createServerRpc } from '@tanstack/react-start/server-rpc';
import { createServerFn as serverFn } from '@tanstack/react-start';
import { z } from 'zod';
const withUseServer_createServerFn_handler = createServerRpc({
  id: "eyJmaWxlIjoiL0BpZC9zcmMvdGVzdC50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJ3aXRoVXNlU2VydmVyX2NyZWF0ZVNlcnZlckZuX2hhbmRsZXIifQ",
  name: "withUseServer",
  filename: "src/test.ts"
}, (opts, signal) => withUseServer.__executeServer(opts, signal));
const withUseServer = serverFn({
  method: 'GET'
}).handler(withUseServer_createServerFn_handler, async function () {
  console.info('Fetching posts...');
  await new Promise(r => setTimeout(r, 500));
  return axios.get<Array<PostType>>('https://jsonplaceholder.typicode.com/posts').then(r => r.data.slice(0, 10));
});
const withoutUseServer_createServerFn_handler = createServerRpc({
  id: "eyJmaWxlIjoiL0BpZC9zcmMvdGVzdC50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJ3aXRob3V0VXNlU2VydmVyX2NyZWF0ZVNlcnZlckZuX2hhbmRsZXIifQ",
  name: "withoutUseServer",
  filename: "src/test.ts"
}, (opts, signal) => withoutUseServer.__executeServer(opts, signal));
const withoutUseServer = serverFn({
  method: 'GET'
}).handler(withoutUseServer_createServerFn_handler, async () => {
  console.info('Fetching posts...');
  await new Promise(r => setTimeout(r, 500));
  return axios.get<Array<PostType>>('https://jsonplaceholder.typicode.com/posts').then(r => r.data.slice(0, 10));
});
const withVariable_createServerFn_handler = createServerRpc({
  id: "eyJmaWxlIjoiL0BpZC9zcmMvdGVzdC50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJ3aXRoVmFyaWFibGVfY3JlYXRlU2VydmVyRm5faGFuZGxlciJ9",
  name: "withVariable",
  filename: "src/test.ts"
}, (opts, signal) => withVariable.__executeServer(opts, signal));
const withVariable = serverFn({
  method: 'GET'
}).handler(withVariable_createServerFn_handler, abstractedFunction);
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
const withZodValidator_createServerFn_handler = createServerRpc({
  id: "eyJmaWxlIjoiL0BpZC9zcmMvdGVzdC50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJ3aXRoWm9kVmFsaWRhdG9yX2NyZWF0ZVNlcnZlckZuX2hhbmRsZXIifQ",
  name: "withZodValidator",
  filename: "src/test.ts"
}, (opts, signal) => withZodValidator.__executeServer(opts, signal));
const withZodValidator = serverFn({
  method: 'GET'
}).handler(withZodValidator_createServerFn_handler, zodValidator(z.number(), input => {
  return {
    'you gave': input
  };
}));
export { withUseServer_createServerFn_handler, withoutUseServer_createServerFn_handler, withVariable_createServerFn_handler, withZodValidator_createServerFn_handler };