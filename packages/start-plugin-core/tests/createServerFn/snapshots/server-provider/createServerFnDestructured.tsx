import { createServerRpc } from '@tanstack/react-start/server-rpc';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
const withUseServer_createServerFn_handler = createServerRpc({
  id: "eyJmaWxlIjoiL0BpZC9zcmMvdGVzdC50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJ3aXRoVXNlU2VydmVyX2NyZWF0ZVNlcnZlckZuX2hhbmRsZXIifQ",
  name: "withUseServer",
  filename: "src/test.ts"
}, (opts, signal) => withUseServer.__executeServer(opts, signal));
const withUseServer = createServerFn({
  method: 'GET'
}).handler(withUseServer_createServerFn_handler, async function () {
  console.info('Fetching posts...');
  await new Promise(r => setTimeout(r, 500));
  return axios.get<Array<PostType>>('https://jsonplaceholder.typicode.com/posts').then(r => r.data.slice(0, 10));
});
const withArrowFunction_createServerFn_handler = createServerRpc({
  id: "eyJmaWxlIjoiL0BpZC9zcmMvdGVzdC50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJ3aXRoQXJyb3dGdW5jdGlvbl9jcmVhdGVTZXJ2ZXJGbl9oYW5kbGVyIn0",
  name: "withArrowFunction",
  filename: "src/test.ts"
}, (opts, signal) => withArrowFunction.__executeServer(opts, signal));
const withArrowFunction = createServerFn({
  method: 'GET'
}).handler(withArrowFunction_createServerFn_handler, async () => null);
const withArrowFunctionAndFunction_createServerFn_handler = createServerRpc({
  id: "eyJmaWxlIjoiL0BpZC9zcmMvdGVzdC50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJ3aXRoQXJyb3dGdW5jdGlvbkFuZEZ1bmN0aW9uX2NyZWF0ZVNlcnZlckZuX2hhbmRsZXIifQ",
  name: "withArrowFunctionAndFunction",
  filename: "src/test.ts"
}, (opts, signal) => withArrowFunctionAndFunction.__executeServer(opts, signal));
const withArrowFunctionAndFunction = createServerFn({
  method: 'GET'
}).handler(withArrowFunctionAndFunction_createServerFn_handler, async () => test());
const withoutUseServer_createServerFn_handler = createServerRpc({
  id: "eyJmaWxlIjoiL0BpZC9zcmMvdGVzdC50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJ3aXRob3V0VXNlU2VydmVyX2NyZWF0ZVNlcnZlckZuX2hhbmRsZXIifQ",
  name: "withoutUseServer",
  filename: "src/test.ts"
}, (opts, signal) => withoutUseServer.__executeServer(opts, signal));
const withoutUseServer = createServerFn({
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
const withVariable = createServerFn({
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
const withZodValidator = createServerFn({
  method: 'GET'
}).handler(withZodValidator_createServerFn_handler, zodValidator(z.number(), input => {
  return {
    'you gave': input
  };
}));
const withValidatorFn_createServerFn_handler = createServerRpc({
  id: "eyJmaWxlIjoiL0BpZC9zcmMvdGVzdC50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJ3aXRoVmFsaWRhdG9yRm5fY3JlYXRlU2VydmVyRm5faGFuZGxlciJ9",
  name: "withValidatorFn",
  filename: "src/test.ts"
}, (opts, signal) => withValidatorFn.__executeServer(opts, signal));
const withValidatorFn = createServerFn({
  method: 'GET'
}).inputValidator(z.number()).handler(withValidatorFn_createServerFn_handler, async ({
  input
}) => {
  return null;
});
export { withUseServer_createServerFn_handler, withArrowFunction_createServerFn_handler, withArrowFunctionAndFunction_createServerFn_handler, withoutUseServer_createServerFn_handler, withVariable_createServerFn_handler, withZodValidator_createServerFn_handler, withValidatorFn_createServerFn_handler };