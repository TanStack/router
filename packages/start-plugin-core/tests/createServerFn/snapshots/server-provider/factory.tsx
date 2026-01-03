import { createServerRpc } from '@tanstack/react-start/server-rpc';
let myAuthedFn_createServerFn_handler;
let deleteUserFn_createServerFn_handler;
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
export { myAuthedFn_createServerFn_handler, deleteUserFn_createServerFn_handler };