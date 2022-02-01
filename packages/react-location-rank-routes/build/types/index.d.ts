import { Route, PartialGenerics, DefaultGenerics } from '@tanstack/react-location';
export declare function rankRoutes<TGenerics extends PartialGenerics = DefaultGenerics>(routes: Route<TGenerics>[]): Route<TGenerics>[];
