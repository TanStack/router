import { LoaderFn, RouteMatch, PartialGenerics, DefaultGenerics } from '@tanstack/react-location';
export declare type FetchPolicy = 'cache-and-network' | 'cache-first' | 'network-only';
export declare type SimpleCacheRecord<TGenerics extends PartialGenerics = DefaultGenerics> = {
    key: string;
    updatedAt: number;
    ready: boolean;
    data?: any;
    invalid?: boolean;
    match: RouteMatch<TGenerics>;
};
export declare type SimpleCacheRecords<TGenerics extends PartialGenerics = DefaultGenerics> = Record<string, SimpleCacheRecord<TGenerics>>;
export declare class ReactLocationSimpleCache<TDefualtGenerics extends PartialGenerics = DefaultGenerics> {
    records: SimpleCacheRecords<any>;
    constructor();
    createLoader<TGenerics extends TDefualtGenerics = TDefualtGenerics>(loader: LoaderFn<TGenerics>, opts?: {
        key?: (match: RouteMatch<TGenerics>) => string;
        maxAge?: number;
        policy?: FetchPolicy;
    }): LoaderFn<TGenerics>;
    filter<TGenerics extends TDefualtGenerics = TDefualtGenerics>(fn: (record: SimpleCacheRecord<TGenerics>) => any): SimpleCacheRecord<TGenerics>[];
    find<TGenerics extends TDefualtGenerics = TDefualtGenerics>(fn: (record: SimpleCacheRecord<TGenerics>) => any): SimpleCacheRecord<TGenerics> | undefined;
    invalidate<TGenerics extends TDefualtGenerics = TDefualtGenerics>(fn: (record: SimpleCacheRecord<TGenerics>) => any): void;
    removeAll(): void;
    remove<TGenerics extends TDefualtGenerics = TDefualtGenerics>(fn: (record: SimpleCacheRecord<TGenerics>) => any): void;
}
