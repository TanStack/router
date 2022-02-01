import * as React from 'react';
import { createHashHistory, createBrowserHistory, createMemoryHistory, BrowserHistory, MemoryHistory, History, HashHistory } from 'history';
export { createHashHistory, createBrowserHistory, createMemoryHistory };
declare type Timeout = ReturnType<typeof setTimeout>;
declare type Maybe<T, TUnknown> = T extends {} ? T : TUnknown;
export declare type DefaultGenerics = {
    Params: Params<string>;
    Search: Search<unknown>;
    RouteMeta: RouteMeta<unknown>;
};
export declare type PartialGenerics = Partial<DefaultGenerics>;
export declare type MakeGenerics<TGenerics extends PartialGenerics> = TGenerics;
export declare type Search<T> = Record<string, T>;
export declare type Params<T> = Record<string, T>;
export declare type RouteMeta<T> = Record<string, T>;
export declare type UseGeneric<TGenerics extends PartialGenerics, TGeneric extends keyof PartialGenerics> = TGeneric extends 'Search' ? Partial<Maybe<TGenerics[TGeneric], DefaultGenerics[TGeneric]>> : Maybe<TGenerics[TGeneric], DefaultGenerics[TGeneric]>;
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
    searchFilters?: SearchFilter<TGenerics>[];
    children?: Route<TGenerics>[];
    pendingElement?: React.ReactNode;
} & RouteLoaders<TGenerics>;
export declare type RouteLoaders<TGenerics> = {
    element?: React.ReactNode;
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
    useErrorBoundary?: boolean;
    defaultElement?: React.ReactNode;
    defaultPendingElement?: React.ReactNode;
    caseSensitive?: boolean;
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
export declare type TransitionState<TGenerics> = {
    location: Location<TGenerics>;
    matches: RouteMatch<TGenerics>[];
};
export declare type FilterRoutesFn = <TGenerics extends PartialGenerics = DefaultGenerics>(routes: Route<TGenerics>[]) => Route<TGenerics>[];
export declare type RouterPropsType<TGenerics extends PartialGenerics = DefaultGenerics> = RouterProps<TGenerics>;
export declare type RouterType<TGenerics extends PartialGenerics = DefaultGenerics> = (props: RouterProps<TGenerics>) => JSX.Element;
declare type Listener = () => void;
export declare class ReactLocation<TGenerics extends PartialGenerics = DefaultGenerics> {
    history: BrowserHistory | MemoryHistory;
    stringifySearch: SearchSerializer;
    parseSearch: SearchParser;
    current: Location<TGenerics>;
    destroy: () => void;
    navigateTimeout?: Timeout;
    nextAction?: 'push' | 'replace';
    listeners: Listener[];
    isTransitioning: boolean;
    constructor(options?: ReactLocationOptions);
    subscribe(listener: Listener): () => void;
    notify(): void;
    buildNext(basepath?: string, dest?: BuildNextOptions<TGenerics>): Location<TGenerics>;
    navigate(next: Location<TGenerics>, replace?: boolean): void;
    parseLocation(location: History['location'], previousLocation?: Location<TGenerics>): Location<TGenerics>;
}
export declare type MatchesProviderProps<TGenerics> = {
    value: RouteMatch<TGenerics>[];
    children: React.ReactNode;
};
export declare function MatchesProvider<TGenerics>(props: MatchesProviderProps<TGenerics>): JSX.Element;
export declare type RouterInstance<TGenerics> = {
    routesById: Record<string, Route<TGenerics>>;
    basepath: string;
    rootMatch?: RouteMatch<TGenerics>;
    routes: Route<TGenerics>[];
    filterRoutes?: FilterRoutesFn;
    useErrorBoundary?: boolean;
    defaultElement?: React.ReactNode;
    defaultPendingElement?: React.ReactNode;
    caseSensitive?: boolean;
    state: TransitionState<TGenerics>;
};
export declare function Router<TGenerics extends PartialGenerics = DefaultGenerics>({ children, location, routes, basepath: userBasepath, ...rest }: RouterProps<TGenerics>): JSX.Element;
export declare type UseLocationType<TGenerics extends PartialGenerics = DefaultGenerics> = () => ReactLocation<TGenerics>;
export declare function useLocation<TGenerics extends PartialGenerics = DefaultGenerics>(): ReactLocation<TGenerics>;
declare type RouteMatch<TGenerics extends PartialGenerics = DefaultGenerics> = {
    id: string;
    route: Route<TGenerics>;
    pathname: string;
    params: UseGeneric<TGenerics, 'Params'>;
    search: UseGeneric<TGenerics, 'Search'>;
};
export declare type UseRouterType<TGenerics extends PartialGenerics = DefaultGenerics> = () => RouterInstance<TGenerics>;
export declare function useRouter<TGenerics extends PartialGenerics = DefaultGenerics>(): RouterInstance<TGenerics>;
export declare type MatchRoutesType<TGenerics extends PartialGenerics = DefaultGenerics> = (router: RouterInstance<TGenerics>[], currentLocation: Location<TGenerics>) => Promise<RouteMatch<TGenerics>[]>;
export declare function matchRoutes<TGenerics extends PartialGenerics = DefaultGenerics>(router: RouterInstance<TGenerics>, currentLocation: Location<TGenerics>): RouteMatch<TGenerics>[];
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
export declare const Link: <TGenerics extends Partial<DefaultGenerics> = DefaultGenerics>({ to, search, hash, children, target, style, replace, onClick, onMouseEnter, className, getActiveProps, getInactiveProps, activeOptions, disabled, _ref, ...rest }: LinkProps<TGenerics>) => JSX.Element;
export declare function Outlet<TGenerics extends PartialGenerics = DefaultGenerics>(): JSX.Element | null;
export declare function useResolvePath<TGenerics extends PartialGenerics = DefaultGenerics>(): (path: string) => string;
export declare type UseSearchType<TGenerics extends PartialGenerics = DefaultGenerics> = () => Partial<Maybe<TGenerics['Search'], Search<any>>>;
export declare function useSearch<TGenerics extends PartialGenerics = DefaultGenerics>(): Partial<Maybe<TGenerics["Search"], Search<unknown>>>;
export declare type MatchRouteType<TGenerics extends PartialGenerics = DefaultGenerics> = (currentLocation: Location<TGenerics>, matchLocation: MatchLocation<TGenerics>) => UseGeneric<TGenerics, 'Params'> | undefined;
export declare function matchRoute<TGenerics extends PartialGenerics = DefaultGenerics>(currentLocation: Location<TGenerics>, matchLocation: MatchLocation<TGenerics>): UseGeneric<TGenerics, 'Params'> | undefined;
export declare type UseMatchRouteType<TGenerics extends PartialGenerics = DefaultGenerics> = () => (matchLocation: MatchLocation<TGenerics>) => Maybe<TGenerics['Params'], Params<any>> | undefined;
export declare function useMatchRoute<TGenerics extends PartialGenerics = DefaultGenerics>(): (matchLocation: MatchLocation<TGenerics>, opts?: {
    caseSensitive?: boolean;
}) => Maybe<TGenerics['Params'], Params<any>> | undefined;
export declare function MatchRoute<TGenerics extends PartialGenerics = DefaultGenerics>({ children, ...rest }: MatchLocation<TGenerics> & {
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
