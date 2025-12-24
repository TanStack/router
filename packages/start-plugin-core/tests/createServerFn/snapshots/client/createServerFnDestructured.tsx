import { createClientRpc } from '@tanstack/react-start/client-rpc';
import { createServerFn } from '@tanstack/react-start';
export const withUseServer = createServerFn({
  method: 'GET'
}).handler(createClientRpc("eyJmaWxlIjoiL0BpZC90ZXN0LnRzP3Rzcy1zZXJ2ZXJmbi1zcGxpdCIsImV4cG9ydCI6IndpdGhVc2VTZXJ2ZXJfY3JlYXRlU2VydmVyRm5faGFuZGxlciJ9"));
export const withArrowFunction = createServerFn({
  method: 'GET'
}).handler(createClientRpc("eyJmaWxlIjoiL0BpZC90ZXN0LnRzP3Rzcy1zZXJ2ZXJmbi1zcGxpdCIsImV4cG9ydCI6IndpdGhBcnJvd0Z1bmN0aW9uX2NyZWF0ZVNlcnZlckZuX2hhbmRsZXIifQ"));
export const withArrowFunctionAndFunction = createServerFn({
  method: 'GET'
}).handler(createClientRpc("eyJmaWxlIjoiL0BpZC90ZXN0LnRzP3Rzcy1zZXJ2ZXJmbi1zcGxpdCIsImV4cG9ydCI6IndpdGhBcnJvd0Z1bmN0aW9uQW5kRnVuY3Rpb25fY3JlYXRlU2VydmVyRm5faGFuZGxlciJ9"));
export const withoutUseServer = createServerFn({
  method: 'GET'
}).handler(createClientRpc("eyJmaWxlIjoiL0BpZC90ZXN0LnRzP3Rzcy1zZXJ2ZXJmbi1zcGxpdCIsImV4cG9ydCI6IndpdGhvdXRVc2VTZXJ2ZXJfY3JlYXRlU2VydmVyRm5faGFuZGxlciJ9"));
export const withVariable = createServerFn({
  method: 'GET'
}).handler(createClientRpc("eyJmaWxlIjoiL0BpZC90ZXN0LnRzP3Rzcy1zZXJ2ZXJmbi1zcGxpdCIsImV4cG9ydCI6IndpdGhWYXJpYWJsZV9jcmVhdGVTZXJ2ZXJGbl9oYW5kbGVyIn0"));
export const withZodValidator = createServerFn({
  method: 'GET'
}).handler(createClientRpc("eyJmaWxlIjoiL0BpZC90ZXN0LnRzP3Rzcy1zZXJ2ZXJmbi1zcGxpdCIsImV4cG9ydCI6IndpdGhab2RWYWxpZGF0b3JfY3JlYXRlU2VydmVyRm5faGFuZGxlciJ9"));
export const withValidatorFn = createServerFn({
  method: 'GET'
}).handler(createClientRpc("eyJmaWxlIjoiL0BpZC90ZXN0LnRzP3Rzcy1zZXJ2ZXJmbi1zcGxpdCIsImV4cG9ydCI6IndpdGhWYWxpZGF0b3JGbl9jcmVhdGVTZXJ2ZXJGbl9oYW5kbGVyIn0"));