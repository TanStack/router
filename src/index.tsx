import * as React from 'react';
import * as qss from './qss';

import { Misc } from 'ts-toolbelt';

import {
  createHashHistory,
  createBrowserHistory,
  createMemoryHistory,
  BrowserHistory,
  MemoryHistory,
  History,
  HashHistory,
} from 'history';
import { parse, stringify } from './jsurl';

export { createHashHistory, createBrowserHistory, createMemoryHistory };

export type ReactLocationInstanceOptions = {
  history?: BrowserHistory | MemoryHistory | HashHistory;
  basepath?: string;
};

export type BuildNextOptions = {
  from?: string;
  search?: Updater<SearchObj>;
  state?: Updater<StateObj>;
  hash?: Updater<string>;
};

export type NavigateOptions = BuildNextOptions & {
  replace?: boolean;
};

export type SearchObj = Misc.JSON.Object;
export type StateObj = object | Misc.JSON.Object;

export type Updater<TResult, TPrevious = TResult> =
  | TResult
  | ((prev?: TPrevious) => TResult);

export type Location = {
  href: string;
  pathname: string;
  search: SearchObj;
  searchStr: string;
  state: StateObj;
  hash: string;
  key: string;
};

export type RouteContext = {
  params: Params;
  basepath: string;
};

export type Params = Record<string, string | undefined>;

export type RouteConfig = {
  path: string;
  segments: Segment[];
  element: React.ReactElement;
  index: number;
};

export type ListenerFn = () => void;

function warning(cond: boolean, message: string) {
  if (!cond) {
    if (typeof console !== 'undefined') console.warn(message);

    try {
      throw new Error(message);
    } catch {}
  }
}

const LocationContext = React.createContext<ReactLocationInstance>(undefined!);

const RouteContext = React.createContext<RouteContext>({
  params: {},
  basepath: '/',
});

// Detect if we're in the DOM
const isDOM = Boolean(
  typeof window !== 'undefined' &&
    window.document &&
    window.document.createElement
);

// This is the default history object if none is defined
const createDefaultHistory = () =>
  isDOM ? createBrowserHistory() : createMemoryHistory();

function isFunction(d: any): d is Function {
  return typeof d === 'function';
}

export function functionalUpdate<TResult, TPrevious>(
  updater: Updater<TResult, TPrevious>,
  previous?: TPrevious
) {
  if (isFunction(updater)) {
    return updater(previous);
  }

  return updater;
}

function parseSearch(search: string) {
  if (search.substring(0, 1) === '?') {
    search = search.substring(1);
  }

  let query = qss.decode(search);

  // Try to parse any query params that might be json
  for (let key in query) {
    const value = query[key];
    if (typeof value === 'string') {
      try {
        query[key] = parse(value);
      } catch (err) {
        //
      }
    }
  }

  return query;
}

function stringifySearch(search: SearchObj) {
  search = { ...search };

  if (search) {
    Object.keys(search).forEach((key) => {
      const val = search[key];
      if (val && typeof val === 'object' && val !== null) {
        try {
          search[key] = stringify(val);
        } catch (err) {
          // silent
        }
      }
    });
  }

  let searchStr = qss.encode(search, '');

  return (searchStr = searchStr ? `?${searchStr}` : '');
}

const parseLocation = (
  location: History['location'],
  previousLocation?: Location
): Location => {
  return {
    pathname: location.pathname,
    state: replaceEqualDeep(
      previousLocation?.state ?? {},
      location.state ?? {}
    ),
    searchStr: location.search,
    search: replaceEqualDeep(
      previousLocation?.search,
      parseSearch(location.search)
    ),
    hash: location.hash.split('#').reverse()[0] ?? '',
    href: `${location.pathname}${location.search}${location.hash}`,
    key: location.key,
  };
};

class ReactLocationInstance {
  history: BrowserHistory | MemoryHistory;
  basepath: string;
  current: Location;
  destroy;
  commitTimeout;

  //

  listeners: ListenerFn[] = [];

  constructor(options: ReactLocationInstanceOptions) {
    this.history = options.history || createDefaultHistory();
    this.basepath = options.basepath || '/';
    this.current = parseLocation(this.history.location);

    this.destroy = this.history.listen((event) => {
      this.current = parseLocation(event.location, this.current);
      this.notify();
    });

    this.commitTimeout = setTimeout(() => {
      this.destroy();
    }, 5000);
  }

  commit = () => {
    clearTimeout(this.commitTimeout);
    this.notify();
    return this.destroy;
  };

  notify = () => {
    this.listeners.forEach((listener) => {
      listener();
    });
  };

  subscribe = (cb: ListenerFn) => {
    this.listeners.push(cb);

    return () => {
      this.listeners = this.listeners.filter((d) => d !== cb);
    };
  };

  match = () => {
    return {
      path: '/',
      url: '/',
      params: {},
      isExact: location.pathname === '/',
    };
  };

  private buildSearch = (updater?: Updater<SearchObj>) => {
    const newSearch = functionalUpdate(updater, this.current.search);

    if (newSearch) {
      return replaceEqualDeep(this.current.search, newSearch);
    }

    return {};
  };

  private buildState = (updater?: Updater<StateObj>) => {
    const newState = functionalUpdate(updater, this.current.state);
    if (newState) {
      return replaceEqualDeep(this.current.state, newState);
    }

    return {};
  };

  private buildHash = (updater?: Updater<string>) => {
    return functionalUpdate(updater, this.current.hash);
  };

  buildNext = (to: string, options: BuildNextOptions = {}): Location => {
    const pathname = resolvePath(options.from || this.current.pathname, to);

    const search = this.buildSearch(options.search);

    const searchStr = stringifySearch(search);

    const state = this.buildState(options.state);

    let hash = this.buildHash(options.hash);
    hash = hash ? `#${hash}` : '';

    return {
      pathname,
      search,
      searchStr,
      state,
      hash,
      href: `${pathname}${searchStr}${hash}`,
      key: this.current.key,
    };
  };

  navigate = (to: string, options: NavigateOptions = {}) => {
    this.current = this.buildNext(to, options);

    if (options.replace) {
      return this.history.replace(
        {
          pathname: this.current.pathname,
          hash: this.current.hash,
          search: this.current.searchStr,
        },
        this.current.state
      );
    }

    return this.history.push(
      {
        pathname: this.current.pathname,
        hash: this.current.hash,
        search: this.current.searchStr,
      },
      this.current.state
    );
  };
}

export type ReactLocationProps = ReactLocationInstanceOptions & {
  children: React.ReactNode;
};

export function ReactLocation({
  children,
  history: userHistory,
  basepath: userBasepath,
}: ReactLocationProps) {
  const instanceRef = React.useRef<ReactLocationInstance>();

  if (!instanceRef.current) {
    instanceRef.current = new ReactLocationInstance({
      history: userHistory,
      basepath: userBasepath,
    });
  }

  const locationInstance = instanceRef.current;

  React.useEffect(() => locationInstance.commit(), [userHistory, userBasepath]);

  const routeContextValue = React.useMemo(
    () => ({
      params: {},
      basepath: locationInstance.basepath,
    }),
    [locationInstance.basepath]
  );

  return (
    <LocationContext.Provider value={locationInstance}>
      <RouteContext.Provider value={routeContextValue}>
        {children}
      </RouteContext.Provider>
    </LocationContext.Provider>
  );
}

export function useLocation() {
  const [, rerender] = React.useReducer((d) => d + 1, 0);
  const instance = React.useContext(LocationContext);
  warning(!!instance, 'useLocation must be used within a <ReactLocation />');

  React.useEffect(() => {
    return instance.subscribe(() => {
      rerender();
    });
  }, [instance]);

  return instance;
}

function parsePath(path: string) {
  path = cleanRoutePath(path);
  const segments = segmentPathname(path);

  return [path, segments] as const;
}

export function parseRoutes(children: React.ReactNode): RouteConfig[] {
  const routes: RouteConfig[] = [];

  React.Children.forEach(children, (child, index) => {
    if (React.isValidElement(child)) {
      if (child.type === React.Fragment) {
        routes.push(...parseRoutes(child.props.children));
      } else {
        const [path, segments] = parsePath(child.props.path || '/');

        const route: RouteConfig = {
          index,
          path,
          segments,
          element: child,
        };

        if (route.segments[0]?.value === '..') {
          throw new Error('Route paths with ".." are not supported');
        }

        // TODO: If people want colocated route defs, we can do it like this:
        // if (child.props.children) {
        //   const childRoutes = parseRoutes(child.props.children);

        //   if (childRoutes.length) {
        //     route.children = childRoutes;
        //   }
        // }

        routes.push(route);
      }
    }
  });

  return routes;
}

function rankRoutes(routes: RouteConfig[]) {
  return [...routes].sort((a, b) => {
    // Multi-sort by each segment
    for (let i = 0; i < a.segments.length; i++) {
      const aSegment = a.segments[i];
      const bSegment = b.segments[i];

      if (aSegment && bSegment) {
        let sort: -1 | 1 | 0 = 0;

        ([
          {
            key: 'value',
            value: '*',
          },
          {
            key: 'value',
            value: '/',
          },
          {
            key: 'type',
            value: 'param',
          },
        ] as const).some((condition) => {
          if (
            [aSegment[condition.key], bSegment[condition.key]].includes(
              condition.value
            ) &&
            aSegment[condition.key] !== bSegment[condition.key]
          ) {
            sort = aSegment[condition.key] === condition.value ? 1 : -1;
            return true;
          }

          return false;
        });

        if (sort !== 0) {
          return sort;
        }
      } else {
        // Then shorter segments last
        return aSegment ? -1 : 1;
      }
    }

    // Keep things stable by route index
    return a.index - b.index;
  });
}

function useRouteContext() {
  return React.useContext(RouteContext);
}

export type UseNavigateOptions = {
  search?: Updater<SearchObj>;
  state?: Updater<StateObj>;
  hash?: Updater<string>;
  replace?: boolean;
};

export function useNavigate() {
  const routeContext = useRouteContext();
  const location = useLocation();

  return React.useCallback(
    (to: string, { search, state, hash, replace }: UseNavigateOptions = {}) => {
      location.navigate(to, {
        from: routeContext.basepath,
        search,
        state,
        hash,
        replace,
      });
    },
    [routeContext, location]
  );
}

export function useParams() {
  const routeContext = useRouteContext();
  return routeContext.params;
}

export function useSearch() {
  const location = useLocation();
  return location.current.search;
}

export function useMatch() {
  const location = useLocation();
  const routeContext = useRouteContext();

  return React.useCallback(
    (matchPath: string, options?: { exact?: boolean }) => {
      const [path] = parsePath(matchPath);
      const fullPath = joinPaths([routeContext.basepath, path]);
      return matchRoute(location.current.pathname, fullPath, {
        exact: options?.exact,
      });
    },
    [routeContext.basepath, location.current.pathname]
  );
}

export function usePrompt(message: string, when = true): void {
  const location = useLocation();

  React.useEffect(() => {
    if (!when) return;

    let unblock = location.history.block((transition) => {
      if (window.confirm(message)) {
        unblock();
        transition.retry();
      }
    });

    return unblock;
  }, [when, location, message]);
}

export type PromptProps = {
  message: string;
  when?: boolean;
};

export function Prompt({ message, when }: PromptProps) {
  usePrompt(message, when);

  return null;
}

export type RoutesProps = {
  children: React.ReactNode;
};

export function Routes({ children }: RoutesProps) {
  const location = useLocation();
  const routeContext = useRouteContext();
  const childRoutes = rankRoutes(parseRoutes(children));

  let route = matchRoutes(
    location.current.pathname,
    routeContext.basepath,
    childRoutes
  );

  if (!route) {
    return null;
  }

  return <>{route.element}</>;
}

export type RouteProps = {
  path: string;
  element: React.ReactNode;
};

export function Route({ path, element }: RouteProps) {
  const location = useLocation();
  const routeContext = useRouteContext();

  const fullpath = joinPaths([routeContext.basepath, path]);
  const params = React.useMemo(
    () => ({
      ...routeContext.params,
      ...matchRoute(location.current.pathname, fullpath),
    }),
    [routeContext.params, location.current.pathname, fullpath]
  );

  // Not a match?
  if (!params) {
    return null;
  }

  const interpolatedPathSegments = segmentPathname(path);

  const interpolatedPath = joinPaths(
    interpolatedPathSegments.map((segment) => {
      if (segment.value === '*') {
        return '';
      }

      if (segment.type === 'param') {
        return params[segment.value] ?? '';
      }

      return segment.value;
    })
  );

  const newRoutePathname = joinPaths([routeContext.basepath, interpolatedPath]);

  const routeContextValue = React.useMemo(
    () => ({
      params: params,
      basepath: newRoutePathname,
    }),
    [params, newRoutePathname]
  );

  return (
    <>
      {/* <div>
        {newRoutePathname} - {JSON.stringify(params)}
      </div> */}
      <RouteContext.Provider value={routeContextValue}>
        {element}
      </RouteContext.Provider>
    </>
  );
}

type ActiveOptions = {
  exact?: boolean;
  includeHash?: boolean;
};

export type LinkProps = Omit<
  React.AnchorHTMLAttributes<HTMLAnchorElement>,
  'href'
> & {
  to: string;
  search?: Updater<SearchObj>;
  state?: Updater<StateObj>;
  hash?: Updater<string>;
  replace?: boolean;
  getActiveProps?: () => Record<string, any>;
  activeOptions?: ActiveOptions;
};

export function Link({
  to,
  search,
  state,
  hash,
  children,
  target,
  style = {},
  replace,
  onClick,
  className = '',
  getActiveProps = () => ({}),
  activeOptions,
  ...rest
}: LinkProps) {
  const routeContext = useRouteContext();
  const location = useLocation();
  const navigate = useNavigate();

  // If this `to` is a valid external URL, log a warning
  try {
    const url = new URL(to);
    warning(
      false,
      `<Link /> should not be used for external URLs like: ${url.href}`
    );
  } catch (e) {}

  const next = location.buildNext(to, {
    from: routeContext.basepath,
    search,
    state,
    hash,
  });

  // The click handler
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (onClick) onClick(e);

    if (
      !isCtrlEvent(e) &&
      !e.defaultPrevented &&
      (!target || target === '_self') &&
      e.button === 0
    ) {
      e.preventDefault();
      // All is well? Navigate!
      navigate(to, {
        search,
        state,
        hash,
        replace,
      });
    }
  };

  // Compare path/hash for matches
  const pathIsEqual = location.current.pathname === next.pathname;
  const pathIsFuzzyEqual = location.current.pathname.startsWith(next.pathname);
  const hashIsEqual = location.current.hash === next.hash;

  // Combine the matches based on user options
  const pathTest = activeOptions?.exact ? pathIsEqual : pathIsFuzzyEqual;
  const hashTest = activeOptions?.includeHash ? hashIsEqual : true;

  // The final "active" test
  const isCurrent = pathTest && hashTest;

  // Get the active props
  const {
    style: activeStyle = {},
    className: activeClassName = '',
    ...activeRest
  } = isCurrent ? getActiveProps() : {};

  return (
    <a
      href={next.href}
      onClick={handleClick}
      target={target}
      style={{
        ...style,
        ...activeStyle,
      }}
      className={
        [className, activeClassName].filter(Boolean).join(' ') || undefined
      }
      {...rest}
      {...activeRest}
    >
      {children}
    </a>
  );
}

export function Navigate({
  to,
  search,
  state,
  hash,
  replace,
}: { to: string } & UseNavigateOptions) {
  let navigate = useNavigate();

  let useIsomorphicLayoutEffect = isDOM
    ? React.useLayoutEffect
    : React.useEffect;

  if (process.env.NODE_ENV === 'test') {
    useIsomorphicLayoutEffect = React.useEffect;
  }

  useIsomorphicLayoutEffect(() => {
    navigate(to, { search, state, hash, replace });
  }, [navigate]);

  return null;
}

function cleanPathname(pathname: string) {
  return `${pathname}`.replace(/\/{2,}/g, '/');
}

function cleanRoutePath(path: string) {
  path = cleanPathname(path);

  // Remove '/' and './' prefixes from route paths
  if (path !== '/') {
    path = path.replace(/^(\/|\.\/)/g, '');
  }

  return path;
}

function joinPaths(paths: string[]) {
  return cleanPathname(paths.join('/'));
}

function matchRoutes(base: string, routeBase: string, routes: RouteConfig[]) {
  return routes.find((route) =>
    matchRoute(base, joinPaths([routeBase, route.path]))
  );
}

function matchRoute(
  base: string,
  path: string,
  options?: { exact?: boolean }
): Params | false {
  const baseSegments = segmentPathname(base);
  const routeSegments = segmentPathname(path);

  const params: Params = {};

  // /workspaces/tanner/teams
  // /workspaces/:idddd/teams/new
  // /workspaces/:idddd/teams/:teamId

  const max = Math.max(baseSegments.length, routeSegments.length);

  let isMatch = (() => {
    for (let i = 0; i < max; i++) {
      const baseSegment = baseSegments[i];
      const routeSegment = routeSegments[i];

      if (routeSegment?.value === '*') {
        return true;
      }

      if (!baseSegment) {
        return false;
      }

      if (!routeSegment?.value) {
        return !options?.exact;
      }

      if (routeSegment.type === 'param') {
        params[routeSegment.value] = baseSegment.value;
      } else if (routeSegment.value !== baseSegment.value) {
        return false;
      }
    }

    return true;
  })();

  if (isMatch) {
    return params;
  }

  return false;
}

export type Segment = {
  type: 'pathname' | 'param';
  value: string;
};

function segmentPathname(pathname: string) {
  pathname = cleanPathname(pathname);

  const segments: Segment[] = [];

  if (pathname.substring(0, 1) === '/') {
    segments.push({
      type: 'pathname',
      value: '/',
    });
    pathname = pathname.substring(1);
  }

  // Remove empty segments and '.' segments
  const split = pathname.split('/').filter((path) => {
    return path.length && path !== '.';
  });

  segments.push(
    ...split.map(
      (part): Segment => {
        if (part.startsWith(':')) {
          return {
            type: 'param',
            value: part.substring(1),
          };
        }

        return {
          type: 'pathname',
          value: part,
        };
      }
    )
  );

  return segments;
}

function resolvePath(base: string, to: string) {
  let baseSegments = segmentPathname(base);
  const toSegments = segmentPathname(to);

  toSegments.forEach((toSegment) => {
    if (toSegment.type === 'param') {
      throw new Error(
        'Destination pathnames may not contain route parameter placeholders.'
      );
    } else if (toSegment.value === '/') {
      baseSegments = [toSegment];
    } else if (toSegment.value === '..') {
      baseSegments.pop();
    } else if (toSegment.value === '.') {
      return;
    } else {
      baseSegments.push(toSegment);
    }
  });

  const joined = baseSegments.map((d) => d.value).join('/');

  return cleanPathname(joined);
}

function isCtrlEvent(e: React.MouseEvent) {
  return !!(e.metaKey || e.altKey || e.ctrlKey || e.shiftKey);
}

/**
 * This function returns `a` if `b` is deeply equal.
 * If not, it will replace any deeply equal children of `b` with those of `a`.
 * This can be used for structural sharing between JSON values for example.
 */
function replaceEqualDeep(prev: any, next: any) {
  if (prev === next) {
    return prev;
  }

  const array = Array.isArray(prev) && Array.isArray(next);

  if (array || (isPlainObject(prev) && isPlainObject(next))) {
    const aSize = array ? prev.length : Object.keys(prev).length;
    const bItems = array ? next : Object.keys(next);
    const bSize = bItems.length;
    const copy: any = array ? [] : {};

    let equalItems = 0;

    for (let i = 0; i < bSize; i++) {
      const key = array ? i : bItems[i];
      copy[key] = replaceEqualDeep(prev[key], next[key]);
      if (copy[key] === prev[key]) {
        equalItems++;
      }
    }

    return aSize === bSize && equalItems === aSize ? prev : copy;
  }

  return next;
}

// Copied from: https://github.com/jonschlinkert/is-plain-object
function isPlainObject(o: any) {
  if (!hasObjectPrototype(o)) {
    return false;
  }

  // If has modified constructor
  const ctor = o.constructor;
  if (typeof ctor === 'undefined') {
    return true;
  }

  // If has modified prototype
  const prot = ctor.prototype;
  if (!hasObjectPrototype(prot)) {
    return false;
  }

  // If constructor does not have an Object-specific method
  if (!prot.hasOwnProperty('isPrototypeOf')) {
    return false;
  }

  // Most likely a plain Object
  return true;
}

function hasObjectPrototype(o: any) {
  return Object.prototype.toString.call(o) === '[object Object]';
}
