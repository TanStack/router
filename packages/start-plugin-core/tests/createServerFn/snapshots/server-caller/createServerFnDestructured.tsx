import { createSsrRpc } from '@tanstack/react-start/ssr-rpc';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
export const withUseServer = createServerFn({
  method: 'GET'
}).handler(createSsrRpc("eyJmaWxlIjoiL0BpZC9zcmMvdGVzdC50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJ3aXRoVXNlU2VydmVyX2NyZWF0ZVNlcnZlckZuX2hhbmRsZXIifQ", () => import("/test/src/test.ts?tss-serverfn-split").then(m => m["withUseServer_createServerFn_handler"])));
export const withArrowFunction = createServerFn({
  method: 'GET'
}).handler(createSsrRpc("eyJmaWxlIjoiL0BpZC9zcmMvdGVzdC50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJ3aXRoQXJyb3dGdW5jdGlvbl9jcmVhdGVTZXJ2ZXJGbl9oYW5kbGVyIn0", () => import("/test/src/test.ts?tss-serverfn-split").then(m => m["withArrowFunction_createServerFn_handler"])));
export const withArrowFunctionAndFunction = createServerFn({
  method: 'GET'
}).handler(createSsrRpc("eyJmaWxlIjoiL0BpZC9zcmMvdGVzdC50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJ3aXRoQXJyb3dGdW5jdGlvbkFuZEZ1bmN0aW9uX2NyZWF0ZVNlcnZlckZuX2hhbmRsZXIifQ", () => import("/test/src/test.ts?tss-serverfn-split").then(m => m["withArrowFunctionAndFunction_createServerFn_handler"])));
export const withoutUseServer = createServerFn({
  method: 'GET'
}).handler(createSsrRpc("eyJmaWxlIjoiL0BpZC9zcmMvdGVzdC50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJ3aXRob3V0VXNlU2VydmVyX2NyZWF0ZVNlcnZlckZuX2hhbmRsZXIifQ", () => import("/test/src/test.ts?tss-serverfn-split").then(m => m["withoutUseServer_createServerFn_handler"])));
export const withVariable = createServerFn({
  method: 'GET'
}).handler(createSsrRpc("eyJmaWxlIjoiL0BpZC9zcmMvdGVzdC50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJ3aXRoVmFyaWFibGVfY3JlYXRlU2VydmVyRm5faGFuZGxlciJ9", () => import("/test/src/test.ts?tss-serverfn-split").then(m => m["withVariable_createServerFn_handler"])));
export const withZodValidator = createServerFn({
  method: 'GET'
}).handler(createSsrRpc("eyJmaWxlIjoiL0BpZC9zcmMvdGVzdC50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJ3aXRoWm9kVmFsaWRhdG9yX2NyZWF0ZVNlcnZlckZuX2hhbmRsZXIifQ", () => import("/test/src/test.ts?tss-serverfn-split").then(m => m["withZodValidator_createServerFn_handler"])));
export const withValidatorFn = createServerFn({
  method: 'GET'
}).inputValidator(z.number()).handler(createSsrRpc("eyJmaWxlIjoiL0BpZC9zcmMvdGVzdC50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJ3aXRoVmFsaWRhdG9yRm5fY3JlYXRlU2VydmVyRm5faGFuZGxlciJ9", () => import("/test/src/test.ts?tss-serverfn-split").then(m => m["withValidatorFn_createServerFn_handler"])));