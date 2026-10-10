import { createAdminServerFn, createAuthServerFn } from "./test.ts?tss-serverfn-shared";
import { createSsrRpc } from '@tanstack/react-start/ssr-rpc';
export const myAuthedFn = createAuthServerFn().handler(createSsrRpc("3bb88b23926fa224cea3dcfb877026757733d95b42e3b66cf7f06bb89dab06a3"));
export const deleteUserFn = createAdminServerFn().handler(createSsrRpc("44d9483a9412daaacaa5a8aee6b02294333a0e61b5d3b17ba6bcb34fd2bdce31"));
function createFakeFn() {
  return {
    handler: cb => {
      return cb();
    }
  };
}
const x = createFakeFn().handler(() => {
  return 'fakeFn';
});
export { createAuthServerFn } from "./test.ts?tss-serverfn-shared";