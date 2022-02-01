import * as React from 'react';
import { Route as RouteType, PartialGenerics, DefaultGenerics } from '@tanstack/react-location';
export declare function Route<TGenerics extends PartialGenerics = DefaultGenerics>(_props: Omit<RouteType<TGenerics>, 'children'> & {
    children?: React.ReactNode;
}): null;
export declare function elementsToRoutes<TGenerics extends PartialGenerics = DefaultGenerics>(children: React.ReactNode): RouteType<TGenerics>[];
