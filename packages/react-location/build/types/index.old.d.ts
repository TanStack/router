import * as React from 'react';
import { createHashHistory, createBrowserHistory, createMemoryHistory, BrowserHistory, MemoryHistory, History, HashHistory } from 'history';
export { createHashHistory, createBrowserHistory, createMemoryHistory };
declare type Timeout = ReturnType<typeof setTimeout>;
declare type Maybe<T, TUnknown> = T extends {} ? T : TUnknown;
export declare type DefaultGenerics = {
    LoaderData: LoaderData<unknown>;
    Params: Params<string>;
    Search: Search<unknown>;
    RouteMeta: RouteMeta<unknown>;
};
export declare type PartialGenerics = Partial<DefaultGenerics>;
export declare type MakeGenerics<TGenerics extends PartialGenerics> = TGenerics;
export declare type Search<T> = Record<string, T>;
export declare type Params<T> = Record<string, T>;
export declare type LoaderData<T> = Record<string, T>;
export declare type RouteMeta<T> = Record<string, T>;
export declare type UseGeneric<TGenerics extends PartialGenerics, TGeneric extends keyof PartialGenerics> = TGeneric extends 'LoaderData' | 'Search' ? Partial<Maybe<TGenerics[TGeneric], DefaultGenerics[TGeneric]>> : Maybe<TGenerics[TGeneric], DefaultGenerics[TGeneric]>;
export declare type ReactLocationOptions = {
    history?: BrowserHistory | MemoryHistory | HashHistory;
    stringifySearch?: SearchSerializer;
    parseSearch?: SearchParser;
};
declare type SearchSerializer = (searchObj: Record<string, any>) => string;
declare type SearchParser = (searchStr: string) => Record<string, any>;
export declare type Updater<TResult> = TResult | ((prev?: TResult) => TResult);
export declare type Location<TGenerics extends PartialGenerics = DefaultGenerics> = {
    href: string;
    pathname: string;
    search: UseGeneric<TGenerics, 'Search'>;
    searchStr: string;
    hash: string;
    key?: string;
};
export declare type Route<TGenerics extends PartialGenerics = DefaultGenerics> = {
    path?: string;
    id?: string;
    caseSensitive?: boolean;
    search?: SearchPredicate<UseGeneric<TGenerics, 'Search'>>;
    pendingMs?: number;
    pendingMinMs?: number;
    searchFilters?: SearchFilter<TGenerics>[];
    children?: Route<TGenerics>[];
} & RouteLoaders<TGenerics> & {
    import?: (opts: {
        params: UseGeneric<TGenerics, 'Params'>;
        search: UseGeneric<TGenerics, 'Search'>;
    }) => Promise<RouteLoaders<TGenerics>>;
};
export declare type RouteLoaders<TGenerics> = {
    element?: SyncOrAsyncElement<TGenerics>;
    errorElement?: SyncOrAsyncElement<TGenerics>;
    pendingElement?: SyncOrAsyncElement<TGenerics>;
    loader?: LoaderFn<TGenerics>;
    unloader?: UnloaderFn<TGenerics>;
    loaderMaxAge?: number;
    onMatch?: (match: RouteMatch<TGenerics>) => void | undefined | ((match: RouteMatch<TGenerics>) => void);
    onTransition?: (match: RouteMatch<TGenerics>) => void;
    meta?: UseGeneric<TGenerics, 'RouteMeta'>;
};
export declare type SearchFilter<TGenerics> = (prev: UseGeneric<TGenerics, 'Search'>, next: UseGeneric<TGenerics, 'Search'>) => UseGeneric<TGenerics, 'Search'>;
export declare type MatchLocation<TGenerics extends PartialGenerics = DefaultGenerics> = {
    to?: string | number | null;
    search?: SearchPredicate<UseGeneric<TGenerics, 'Search'>>;
    fuzzy?: boolean;
    caseSensitive?: boolean;
};
export declare type SearchPredicate<TSearch> = (search: TSearch) => any;
export declare type SyncOrAsyncElement<TGenerics extends PartialGenerics = DefaultGenerics> = React.ReactNode | AsyncElement<TGenerics>;
export declare type AsyncElement<TGenerics extends PartialGenerics = DefaultGenerics> = (opts: {
    params: UseGeneric<TGenerics, 'Params'>;
}) => Promise<React.ReactNode>;
export declare type UnloadedMatch<TGenerics extends PartialGenerics = DefaultGenerics> = {
    id: string;
    route: Route<TGenerics>;
    pathname: string;
    params: UseGeneric<TGenerics, 'Params'>;
    search: UseGeneric<TGenerics, 'Search'>;
};
export declare type LoaderFn<TGenerics extends PartialGenerics = DefaultGenerics> = (routeMatch: RouteMatch<TGenerics>, opts: LoaderFnOptions<TGenerics>) => PromiseLike<UseGeneric<TGenerics, 'LoaderData'>>;
export declare type UnloaderFn<TGenerics extends PartialGenerics = DefaultGenerics> = (routeMatch: RouteMatch<TGenerics>) => void;
export declare type LoaderFnOptions<TGenerics extends PartialGenerics = DefaultGenerics> = {
    parentMatch?: RouteMatch<TGenerics>;
    dispatch: (event: LoaderDispatchEvent<TGenerics>) => void;
};
declare type PromiseLike<T> = Promise<T> | T;
export declare type ListenerFn = () => void;
export declare type Segment = {
    type: 'pathname' | 'param' | 'wildcard';
    value: string;
};
export declare type RouterProps<TGenerics extends PartialGenerics = DefaultGenerics> = {
    children?: React.ReactNode;
    location: ReactLocation<TGenerics>;
} & RouterOptions<TGenerics>;
export declare type RouterOptions<TGenerics> = {
    routes: Route<TGenerics>[];
    basepath?: string;
    filterRoutes?: FilterRoutesFn;
    defaultLinkPreloadMaxAge?: number;
    defaultLoaderMaxAge?: number;
    useErrorBoundary?: boolean;
    defaultElement?: SyncOrAsyncElement<TGenerics>;
    defaultErrorElement?: SyncOrAsyncElement<TGenerics>;
    defaultPendingElement?: SyncOrAsyncElement<TGenerics>;
    defaultPendingMs?: number;
    defaultPendingMinMs?: number;
    caseSensitive?: boolean;
};
export declare type RouterSnapshot<TGenerics> = {
    location: Location<TGenerics>;
    matches: SnapshotRouteMatch<TGenerics>[];
};
export declare type SnapshotRouteMatch<TGenerics> = {
    id: string;
    ownData: UseGeneric<TGenerics, 'LoaderData'>;
};
export declare type BuildNextOptions<TGenerics extends PartialGenerics = DefaultGenerics> = {
    to?: string | number | null;
    search?: true | Updater<UseGeneric<TGenerics, 'Search'>>;
    hash?: Updater<string>;
    from?: Partial<Location<TGenerics>>;
    key?: string;
    __searchFilters?: SearchFilter<TGenerics>[];
};
export declare type NavigateOptions<TGenerics> = BuildNextOptions<TGenerics> & {
    replace?: boolean;
    fromCurrent?: boolean;
};
export declare type PromptProps = {
    message: string;
    when?: boolean | any;
    children?: React.ReactNode;
};
export declare type LinkProps<TGenerics extends PartialGenerics = DefaultGenerics> = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'children'> & {
    to?: string | number | null;
    search?: true | Updater<UseGeneric<TGenerics, 'Search'>>;
    hash?: Updater<string>;
    replace?: boolean;
    getActiveProps?: () => Record<string, any>;
    getInactiveProps?: () => Record<string, any>;
    activeOptions?: ActiveOptions;
    preload?: number;
    disabled?: boolean;
    _ref?: React.Ref<HTMLAnchorElement>;
    children?: React.ReactNode | ((state: {
        isActive: boolean;
    }) => React.ReactNode);
};
declare type ActiveOptions = {
    exact?: boolean;
    includeHash?: boolean;
};
export declare type LinkPropsType<TGenerics extends PartialGenerics = DefaultGenerics> = LinkProps<TGenerics>;
export declare type LoaderDispatchEvent<TGenerics extends PartialGenerics = DefaultGenerics> = {
    type: 'maxAge';
    maxAge: number;
} | {
    type: 'loading';
} | {
    type: 'resolve';
    data: UseGeneric<TGenerics, 'LoaderData'>;
} | {
    type: 'reject';
    error: unknown;
};
export declare type LoadRouteFn<TGenerics> = (next: Location<TGenerics>) => MatchLoader<TGenerics>;
export declare type TransitionState<TGenerics> = {
    location: Location<TGenerics>;
    matches: RouteMatch<TGenerics>[];
};
export declare type FilterRoutesFn = <TGenerics extends PartialGenerics = DefaultGenerics>(routes: Route<TGenerics>[]) => Route<TGenerics>[];
export declare type RouterPropsType<TGenerics extends PartialGenerics = DefaultGenerics> = RouterProps<TGenerics>;
export declare type RouterType<TGenerics extends PartialGenerics = DefaultGenerics> = (props: RouterProps<TGenerics>) => JSX.Element;
declare type Listener = () => void;
declare class Subscribable {
    listeners: Listener[];
    constructor();
    subscribe(listener: Listener): () => void;
    notify(): void;
}
export declare class ReactLocation<TGenerics extends PartialGenerics = DefaultGenerics> extends Subscribable {
    history: BrowserHistory | MemoryHistory;
    stringifySearch: SearchSerializer;
    parseSearch: SearchParser;
    current: Location<TGenerics>;
    destroy: () => void;
    navigateTimeout?: Timeout;
    nextAction?: 'push' | 'replace';
    isTransitioning: boolean;
    constructor(options?: ReactLocationOptions);
    buildNext(basepath?: string, dest?: BuildNextOptions<TGenerics>): Location<TGenerics>;
    navigate(next: Location<TGenerics>, replace?: boolean): void;
    parseLocation(location: History['location'], previousLocation?: Location<TGenerics>): Location<TGenerics>;
}
export declare type MatchesProviderProps<TGenerics> = {
    value: RouteMatch<TGenerics>[];
    children: React.ReactNode;
};
export declare function MatchesProvider<TGenerics>(props: MatchesProviderProps<TGenerics>): JSX.Element;
export declare function Router<TGenerics extends PartialGenerics = DefaultGenerics>({ children, location, ...rest }: RouterProps<TGenerics>): JSX.Element;
declare type RouterInstanceState<TGenerics> = {
    state: TransitionState<TGenerics>;
    pending?: TransitionState<TGenerics>;
};
export declare class RouterInstance<TGenerics extends PartialGenerics = DefaultGenerics> extends Subscribable {
    basepath?: string;
    rootMatch?: RouteMatch<TGenerics>;
    state: TransitionState<TGenerics>;
    pending?: TransitionState<TGenerics>;
    routes: Route<TGenerics>[];
    filterRoutes?: FilterRoutesFn;
    defaultLinkPreloadMaxAge?: number;
    defaultLoaderMaxAge?: number;
    useErrorBoundary?: boolean;
    defaultElement: SyncOrAsyncElement<TGenerics>;
    defaultErrorElement: SyncOrAsyncElement<TGenerics>;
    defaultPendingElement: SyncOrAsyncElement<TGenerics>;
    defaultPendingMs?: number;
    defaultPendingMinMs?: number;
    caseSensitive?: boolean;
    routesById: Record<string, Route<TGenerics>>;
    constructor({ location, ...rest }: {
        location: ReactLocation<TGenerics>;
    } & RouterOptions<TGenerics>);
    update: ({ basepath, routes, ...opts }: RouterOptions<TGenerics>) => void;
    setState: (updater: (old: RouterInstanceState<TGenerics>) => RouterInstanceState<TGenerics>) => void;
    matchCache: Record<string, RouteMatch<TGenerics>>;
    cleanMatchCache: () => void;
    updateLocation: (next: Location<TGenerics>) => {
        promise: Promise<void>;
        unsubscribe: () => void;
    };
}
export declare type UseLocationType<TGenerics extends PartialGenerics = DefaultGenerics> = () => ReactLocation<TGenerics>;
export declare function useLocation<TGenerics extends PartialGenerics = DefaultGenerics>(): ReactLocation<TGenerics>;
export declare class RouteMatch<TGenerics extends PartialGenerics = DefaultGenerics> {
    id: string;
    route: Route<TGenerics>;
    pathname: string;
    params: UseGeneric<TGenerics, 'Params'>;
    search: UseGeneric<TGenerics, 'Search'>;
    updatedAt?: number;
    element?: React.ReactNode;
    errorElement?: React.ReactNode;
    pendingElement?: React.ReactNode;
    error?: unknown;
    loaderPromise?: Promise<UseGeneric<TGenerics, 'LoaderData'>>;
    maxAge?: number;
    matchLoader?: MatchLoader<TGenerics>;
    pendingTimeout?: Timeout;
    pendingMinPromise?: Promise<void>;
    onExit?: void | ((match: RouteMatch<TGenerics>) => void);
    constructor(unloadedMatch: UnloadedMatch<TGenerics>);
    status: 'loading' | 'pending' | 'resolved' | 'rejected';
    ownData: UseGeneric<TGenerics, 'LoaderData'>;
    data: UseGeneric<TGenerics, 'LoaderData'>;
    isLoading: boolean;
    private notify?;
    assignMatchLoader?: ((matchLoader: MatchLoader<TGenerics>) => void) | undefined;
    startPending?: (() => void) | undefined;
    load?: ((opts: {
        maxAge?: number;
        parentMatch?: RouteMatch<TGenerics>;
        router: RouterInstance<TGenerics>;
    }) => void) | undefined;
}
declare class MatchLoader<TGenerics extends PartialGenerics = DefaultGenerics> extends Subscribable {
    router: RouterInstance<TGenerics>;
    location: Location<TGenerics>;
    matches: RouteMatch<TGenerics>[];
    prepPromise?: Promise<void>;
    matchPromise?: Promise<UnloadedMatch<TGenerics>[]>;
    firstRenderPromises?: Promise<any>[];
    constructor(router: RouterInstance<TGenerics>, nextLocation: Location<TGenerics>);
    status: 'pending' | 'resolved';
    preNotify: (isSoft?: boolean | undefined) => void;
    loadData: ({ maxAge }?: {
        maxAge?: number | undefined;
    }) => Promise<RouteMatch<TGenerics>[] | undefined>;
    load: ({ maxAge }?: {
        maxAge?: number | undefined;
    }) => Promise<RouteMatch<TGenerics>[] | undefined>;
    startPending: () => Promise<void>;
}
export declare type UseRouterType<TGenerics extends PartialGenerics = DefaultGenerics> = () => RouterInstance<TGenerics>;
export declare function useRouter<TGenerics extends PartialGenerics = DefaultGenerics>(): RouterInstance<TGenerics>;
export interface MatchRoutesOptions<TGenerics> {
    filterRoutes?: FilterRoutesFn;
    defaultPendingMs?: number;
    defaultPendingMinMs?: number;
    defaultElement?: SyncOrAsyncElement<TGenerics>;
    defaultErrorElement?: SyncOrAsyncElement<TGenerics>;
    defaultPendingElement?: SyncOrAsyncElement<TGenerics>;
}
export declare type MatchRoutesType<TGenerics extends PartialGenerics = DefaultGenerics> = (router: RouterInstance<TGenerics>[], currentLocation: Location<TGenerics>) => Promise<UnloadedMatch<TGenerics>[]>;
export declare function matchRoutes<TGenerics extends PartialGenerics = DefaultGenerics>(router: RouterInstance<TGenerics>, currentLocation: Location<TGenerics>): UnloadedMatch<TGenerics>[];
export declare type UseLoadRouteType<TGenerics extends PartialGenerics = DefaultGenerics> = (routes?: Route<TGenerics>[]) => void;
export declare function useLoadRoute<TGenerics extends PartialGenerics = DefaultGenerics>(): (navigate?: NavigateOptions<TGenerics> | undefined, opts?: {
    maxAge?: number | undefined;
} | undefined) => Promise<RouteMatch<TGenerics>[] | undefined>;
export declare type UseMatchesType<TGenerics extends PartialGenerics = DefaultGenerics> = () => RouteMatch<TGenerics>[];
export declare function useParentMatches<TGenerics extends PartialGenerics = DefaultGenerics>(): RouteMatch<TGenerics>[];
export declare function useMatches<TGenerics extends PartialGenerics = DefaultGenerics>(): RouteMatch<TGenerics>[];
export declare type UseMatchType<TGenerics extends PartialGenerics = DefaultGenerics> = () => RouteMatch<TGenerics>;
export declare function useMatch<TGenerics extends PartialGenerics = DefaultGenerics>(): RouteMatch<TGenerics>;
export declare type UseNavigateType<TGenerics extends PartialGenerics = DefaultGenerics> = (options: NavigateOptions<TGenerics>) => void;
export declare function useNavigate<TGenerics extends PartialGenerics = DefaultGenerics>(): (args_0: BuildNextOptions<TGenerics> & {
    replace?: boolean | undefined;
    fromCurrent?: boolean | undefined;
} & {
    replace?: boolean | undefined;
}) => void;
export declare type NavigateType<TGenerics extends PartialGenerics = DefaultGenerics> = (options: NavigateOptions<TGenerics>) => null;
export declare function Navigate<TGenerics extends PartialGenerics = DefaultGenerics>(options: NavigateOptions<TGenerics>): null;
export declare type LinkType<TGenerics extends PartialGenerics = DefaultGenerics> = (props: LinkProps<TGenerics>) => JSX.Element;
export declare const Link: <TGenerics extends Partial<DefaultGenerics> = DefaultGenerics>({ to, search, hash, children, target, style, replace, onClick, onMouseEnter, className, getActiveProps, getInactiveProps, activeOptions, preload, disabled, _ref, ...rest }: LinkProps<TGenerics>) => JSX.Element;
export declare function Outlet<TGenerics extends PartialGenerics = DefaultGenerics>(): JSX.Element | null;
export declare function useResolvePath<TGenerics extends PartialGenerics = DefaultGenerics>(): (path: string) => string;
export declare type UseSearchType<TGenerics extends PartialGenerics = DefaultGenerics> = () => Partial<Maybe<TGenerics['Search'], Search<any>>>;
export declare function useSearch<TGenerics extends PartialGenerics = DefaultGenerics>(): Partial<Maybe<TGenerics["Search"], Search<unknown>>>;
export declare type MatchRouteType<TGenerics extends PartialGenerics = DefaultGenerics> = (currentLocation: Location<TGenerics>, matchLocation: MatchLocation<TGenerics>) => UseGeneric<TGenerics, 'Params'> | undefined;
export declare function matchRoute<TGenerics extends PartialGenerics = DefaultGenerics>(currentLocation: Location<TGenerics>, matchLocation: MatchLocation<TGenerics>): UseGeneric<TGenerics, 'Params'> | undefined;
export declare type UseMatchRouteType<TGenerics extends PartialGenerics = DefaultGenerics> = () => (matchLocation: MatchLocation<TGenerics>) => Maybe<TGenerics['Params'], Params<any>> | undefined;
export declare type UseMatchRouteOptions<TGenerics> = MatchLocation<TGenerics> & {
    pending?: boolean;
};
export declare function useMatchRoute<TGenerics extends PartialGenerics = DefaultGenerics>(): (matchLocation: UseMatchRouteOptions<TGenerics>, opts?: {
    caseSensitive?: boolean;
}) => Maybe<TGenerics['Params'], Params<any>> | undefined;
export declare function MatchRoute<TGenerics extends PartialGenerics = DefaultGenerics>({ children, ...rest }: UseMatchRouteOptions<TGenerics> & {
    children: React.ReactNode | ((isNextLocation?: Params<TGenerics>) => React.ReactNode);
}): any;
export declare function usePrompt(message: string, when: boolean | any): void;
export declare function Prompt({ message, when, children }: PromptProps): React.ReactNode;
export declare function functionalUpdate<TResult>(updater?: Updater<TResult>, previous?: TResult): TResult | undefined;
export declare function cleanPath(path: string): string;
export declare function matchByPath<TGenerics extends PartialGenerics = DefaultGenerics>(currentLocation: Location<TGenerics>, matchLocation: MatchLocation<TGenerics>): UseGeneric<TGenerics, 'Params'> | undefined;
export declare function parsePathname(pathname?: string): Segment[];
export declare function resolvePath(basepath: string, base: string, to: string): string;
export declare function defaultStringifySearch(search: Record<string, unknown>): string;
export declare function defaultParseSearch(searchStr: string): Record<string, any>;
