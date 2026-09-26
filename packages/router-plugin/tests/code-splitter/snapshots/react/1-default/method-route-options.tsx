import { state } from "method-route-options.tsx?tsr-shared=1";
const $$splitErrorComponentImporter = () => import("method-route-options.tsx?tsr-split=errorComponent");
import { lazyRouteComponent } from "@tanstack/react-router";
import { createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/method-options')({ loader() {
  return state;
}, get component() {
  return () => <div>{state.count}</div>;
}, set component(_value) {
  state.count++;
}, errorComponent: lazyRouteComponent($$splitErrorComponentImporter, "errorComponent") });