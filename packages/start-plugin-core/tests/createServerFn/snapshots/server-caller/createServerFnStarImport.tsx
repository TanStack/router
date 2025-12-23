import { createSsrRpc } from '@tanstack/react-start/ssr-rpc';
import * as TanStackStart from '@tanstack/react-start';
export const withUseServer = TanStackStart.createServerFn({
  method: 'GET'
}).handler(createSsrRpc("eyJmaWxlIjoiL0BpZC90ZXN0LnRzP3Rzcy1zZXJ2ZXJmbi1zcGxpdCIsImV4cG9ydCI6IndpdGhVc2VTZXJ2ZXJfY3JlYXRlU2VydmVyRm5faGFuZGxlciJ9", () => import("test.ts?tss-serverfn-split").then(m => m["withUseServer_createServerFn_handler"])));
export const withoutUseServer = TanStackStart.createServerFn({
  method: 'GET'
}).handler(createSsrRpc("eyJmaWxlIjoiL0BpZC90ZXN0LnRzP3Rzcy1zZXJ2ZXJmbi1zcGxpdCIsImV4cG9ydCI6IndpdGhvdXRVc2VTZXJ2ZXJfY3JlYXRlU2VydmVyRm5faGFuZGxlciJ9", () => import("test.ts?tss-serverfn-split").then(m => m["withoutUseServer_createServerFn_handler"])));
export const withVariable = TanStackStart.createServerFn({
  method: 'GET'
}).handler(createSsrRpc("eyJmaWxlIjoiL0BpZC90ZXN0LnRzP3Rzcy1zZXJ2ZXJmbi1zcGxpdCIsImV4cG9ydCI6IndpdGhWYXJpYWJsZV9jcmVhdGVTZXJ2ZXJGbl9oYW5kbGVyIn0", () => import("test.ts?tss-serverfn-split").then(m => m["withVariable_createServerFn_handler"])));
export const withZodValidator = TanStackStart.createServerFn({
  method: 'GET'
}).handler(createSsrRpc("eyJmaWxlIjoiL0BpZC90ZXN0LnRzP3Rzcy1zZXJ2ZXJmbi1zcGxpdCIsImV4cG9ydCI6IndpdGhab2RWYWxpZGF0b3JfY3JlYXRlU2VydmVyRm5faGFuZGxlciJ9", () => import("test.ts?tss-serverfn-split").then(m => m["withZodValidator_createServerFn_handler"])));