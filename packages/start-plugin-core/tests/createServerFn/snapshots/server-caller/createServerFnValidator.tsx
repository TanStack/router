import { createSsrRpc } from '@tanstack/react-start/ssr-rpc';
import { withUseServer_createServerFn_handler } from "./test.ts?tss-serverfn-split";
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
globalThis.__tssServerFnHandlers = globalThis.__tssServerFnHandlers || [];
globalThis.__tssServerFnHandlers.push(withUseServer_createServerFn_handler);
export const withUseServer = createServerFn({
  method: 'GET'
}).inputValidator(z.number()).handler(createSsrRpc("eyJmaWxlIjoiL0BpZC9zcmMvdGVzdC50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJ3aXRoVXNlU2VydmVyX2NyZWF0ZVNlcnZlckZuX2hhbmRsZXIifQ", () => import("/test/src/test.ts?tss-serverfn-split").then(m => m["withUseServer_createServerFn_handler"])));