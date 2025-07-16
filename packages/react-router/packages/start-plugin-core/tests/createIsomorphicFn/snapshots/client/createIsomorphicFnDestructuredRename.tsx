import { createIsomorphicFn as isomorphicFn } from '@tanstack/react-start';
const noImpl = () => {};
const serverOnlyFn = () => {};
const clientOnlyFn = () => 'client';
const serverThenClientFn = () => 'client';
const clientThenServerFn = () => 'client';
function abstractedServerFn() {
  return 'server';
}
const serverOnlyFnAbstracted = () => {};
function abstractedClientFn() {
  return 'client';
}
const clientOnlyFnAbstracted = abstractedClientFn;
const serverThenClientFnAbstracted = abstractedClientFn;
const clientThenServerFnAbstracted = abstractedClientFn;