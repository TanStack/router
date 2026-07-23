// Default resolution target for `#tanstack-start-server-fn-dispatch` (see
// the package.json `imports` map): the split-transport dispatch. Alternative
// transports (e.g. the solid directive transport) override the specifier
// with a virtual module at build time.
export { defaultDispatchServerFnRequest as dispatchServerFnRequest } from './server-functions-handler'
