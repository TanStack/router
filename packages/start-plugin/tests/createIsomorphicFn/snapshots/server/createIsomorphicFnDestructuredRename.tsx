import { createIsomorphicFn as isomorphicFn } from '@tanstack/start';
const noImpl = () => {};
const serverOnlyFn = () => 'server';
const clientOnlyFn = () => {};
const serverThenClientFn = () => 'server';
const clientThenServerFn = () => 'server';
function abstractedServerFn() {
  return 'server';
}
const serverOnlyFnAbstracted = abstractedServerFn;
function abstractedClientFn() {
  return 'client';
}
const clientOnlyFnAbstracted = () => {};
const serverThenClientFnAbstracted = abstractedServerFn;
const clientThenServerFnAbstracted = abstractedServerFn;