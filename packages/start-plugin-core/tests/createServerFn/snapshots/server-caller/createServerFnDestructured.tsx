import { createSsrRpc } from '@tanstack/react-start/ssr-rpc';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
export const withUseServer = createServerFn({
  method: 'GET'
}).handler(createSsrRpc("eyJmaWxlIjoiL0BpZC90ZXN0LnRzP3Rzcy1zZXJ2ZXJmbi1zcGxpdCIsImV4cG9ydCI6IndpdGhVc2VTZXJ2ZXJfY3JlYXRlU2VydmVyRm5faGFuZGxlciJ9", () => import("test.ts?tss-serverfn-split").then(m => m["withUseServer_createServerFn_handler"])));
export const withArrowFunction = createServerFn({
  method: 'GET'
}).handler(createSsrRpc("eyJmaWxlIjoiL0BpZC90ZXN0LnRzP3Rzcy1zZXJ2ZXJmbi1zcGxpdCIsImV4cG9ydCI6IndpdGhBcnJvd0Z1bmN0aW9uX2NyZWF0ZVNlcnZlckZuX2hhbmRsZXIifQ", () => import("test.ts?tss-serverfn-split").then(m => m["withArrowFunction_createServerFn_handler"])));
export const withArrowFunctionAndFunction = createServerFn({
  method: 'GET'
}).handler(createSsrRpc("eyJmaWxlIjoiL0BpZC90ZXN0LnRzP3Rzcy1zZXJ2ZXJmbi1zcGxpdCIsImV4cG9ydCI6IndpdGhBcnJvd0Z1bmN0aW9uQW5kRnVuY3Rpb25fY3JlYXRlU2VydmVyRm5faGFuZGxlciJ9", () => import("test.ts?tss-serverfn-split").then(m => m["withArrowFunctionAndFunction_createServerFn_handler"])));
export const withoutUseServer = createServerFn({
  method: 'GET'
}).handler(createSsrRpc("eyJmaWxlIjoiL0BpZC90ZXN0LnRzP3Rzcy1zZXJ2ZXJmbi1zcGxpdCIsImV4cG9ydCI6IndpdGhvdXRVc2VTZXJ2ZXJfY3JlYXRlU2VydmVyRm5faGFuZGxlciJ9", () => import("test.ts?tss-serverfn-split").then(m => m["withoutUseServer_createServerFn_handler"])));
export const withVariable = createServerFn({
  method: 'GET'
}).handler(createSsrRpc("eyJmaWxlIjoiL0BpZC90ZXN0LnRzP3Rzcy1zZXJ2ZXJmbi1zcGxpdCIsImV4cG9ydCI6IndpdGhWYXJpYWJsZV9jcmVhdGVTZXJ2ZXJGbl9oYW5kbGVyIn0", () => import("test.ts?tss-serverfn-split").then(m => m["withVariable_createServerFn_handler"])));
export const withZodValidator = createServerFn({
  method: 'GET'
}).handler(createSsrRpc("eyJmaWxlIjoiL0BpZC90ZXN0LnRzP3Rzcy1zZXJ2ZXJmbi1zcGxpdCIsImV4cG9ydCI6IndpdGhab2RWYWxpZGF0b3JfY3JlYXRlU2VydmVyRm5faGFuZGxlciJ9", () => import("test.ts?tss-serverfn-split").then(m => m["withZodValidator_createServerFn_handler"])));
export const withValidatorFn = createServerFn({
  method: 'GET'
}).inputValidator(z.number()).handler(createSsrRpc("eyJmaWxlIjoiL0BpZC90ZXN0LnRzP3Rzcy1zZXJ2ZXJmbi1zcGxpdCIsImV4cG9ydCI6IndpdGhWYWxpZGF0b3JGbl9jcmVhdGVTZXJ2ZXJGbl9oYW5kbGVyIn0", () => import("test.ts?tss-serverfn-split").then(m => m["withValidatorFn_createServerFn_handler"])));