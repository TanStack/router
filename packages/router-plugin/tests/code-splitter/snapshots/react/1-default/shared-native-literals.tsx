import { pattern, values } from "shared-native-literals.tsx?tsr-shared=1";
const $$splitComponentImporter = () => import("shared-native-literals.tsx?tsr-split=component");
import { lazyRouteComponent } from "@tanstack/react-router";
import { createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/native-literals')({ loader: () => ({ matched: pattern.test('café'), value: values[0] }), component: lazyRouteComponent($$splitComponentImporter, "component") });