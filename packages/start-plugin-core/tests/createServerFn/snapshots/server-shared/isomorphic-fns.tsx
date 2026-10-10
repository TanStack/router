import { createIsomorphicFn } from '@tanstack/react-start';
const getEnv = createIsomorphicFn().server(() => 'server').client(() => 'client');
const getEcho = createIsomorphicFn().server((input: string) => 'server received ' + input).client(input => 'client received ' + input);
export { getEcho, getEnv };