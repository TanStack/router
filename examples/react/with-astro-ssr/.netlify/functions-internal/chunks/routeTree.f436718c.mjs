import { s as shallow, i as invariant, R as Router, l as last, f as functionalUpdate, a as RootRoute, b as RouterScripts, c as Route } from '../entry.mjs';
import * as React from 'react';
import { useSyncExternalStoreWithSelector } from 'use-sync-external-store/shim/with-selector.js';
import { jsx, jsxs } from 'react/jsx-runtime';

var isProduction = process.env.NODE_ENV === 'production';
function warning(condition, message) {
  if (!isProduction) {
    if (condition) {
      return;
    }

    var text = "Warning: " + message;

    if (typeof console !== 'undefined') {
      console.warn(text);
    }

    try {
      throw Error(text);
    } catch (x) {}
  }
}

/**
 * react-store
 *
 * Copyright (c) TanStack
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE.md file in the root directory of this source tree.
 *
 * @license MIT
 */

function useStore(store, selector = d => d, compareShallow) {
  const slice = useSyncExternalStoreWithSelector(store.subscribe, () => store.state, () => store.state, selector, compareShallow ? shallow : undefined);
  return slice;
}

/**
 * react-loaders
 *
 * Copyright (c) TanStack
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE.md file in the root directory of this source tree.
 *
 * @license MIT
 */

//

const loaderClientContext = /*#__PURE__*/React.createContext(null);
function LoaderClientProvider({
  loaderClient,
  children,
  ...rest
}) {
  loaderClient.options = {
    ...loaderClient.options,
    ...rest
  };
  return /*#__PURE__*/React.createElement(loaderClientContext.Provider, {
    value: loaderClient
  }, children);
}
function useLoaderInstance(opts) {
  // opts as typeof opts & {
  //   key?: TKey
  //   loader?: Loader<any, any, any, any>
  // }

  const loaderClient = React.useContext(loaderClientContext);
  const optsKey = opts.key;
  const optsLoader = opts.loader;
  invariant(loaderClient || optsLoader, 'useLoaderInstance must be used inside a <LoaderClientProvider> component!');
  const loader = optsLoader ?? loaderClient.getLoader({
    key: optsKey
  });
  const loaderInstance = loader.getInstance({
    variables: opts?.variables
  });
  if (loaderInstance.state.status === 'error' && (opts.throwOnError ?? true)) {
    throw loaderInstance.state.error;
  }
  if (opts?.strict ?? true) {
    invariant(typeof loaderInstance.state.data !== 'undefined', `useLoaderInstance:
  Loader instance { key: ${loader.key}, variables: ${opts.variables} }) is currently in a "${loaderInstance.state.status}" state. By default useLoaderInstance will throw an error if the loader instance is not in a "success" state. To avoid this error:
  
  - Load the loader instance before using it (e.g. via your router's onLoad or loader option)

  - Set opts.strict to false and handle the loading state in your component`);
  }
  React.useEffect(() => {
    loaderInstance.load();
  }, [loaderInstance]);
  useStore(loaderInstance.__store, d => opts?.track?.(d) ?? d, true);
  return loaderInstance;
}

/**
 * react-router
 *
 * Copyright (c) TanStack
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE.md file in the root directory of this source tree.
 *
 * @license MIT
 */

function _extends() {
  _extends = Object.assign ? Object.assign.bind() : function (target) {
    for (var i = 1; i < arguments.length; i++) {
      var source = arguments[i];
      for (var key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
          target[key] = source[key];
        }
      }
    }
    return target;
  };
  return _extends.apply(this, arguments);
}
//

function useLinkProps(options) {
  const router = useRouterContext();
  const {
    // custom props
    type,
    children,
    target,
    activeProps = () => ({
      className: 'active'
    }),
    inactiveProps = () => ({}),
    activeOptions,
    disabled,
    // fromCurrent,
    hash,
    search,
    params,
    to = '.',
    preload,
    preloadDelay,
    replace,
    // element props
    style,
    className,
    onClick,
    onFocus,
    onMouseEnter,
    onMouseLeave,
    onTouchStart,
    ...rest
  } = options;
  const linkInfo = router.buildLink(options);
  if (linkInfo.type === 'external') {
    const {
      href
    } = linkInfo;
    return {
      href
    };
  }
  const {
    handleClick,
    handleFocus,
    handleEnter,
    handleLeave,
    handleTouchStart,
    isActive,
    next
  } = linkInfo;
  const reactHandleClick = e => {
    if (React.startTransition) {
      // This is a hack for react < 18
      React.startTransition(() => {
        handleClick(e);
      });
    } else {
      handleClick(e);
    }
  };
  const composeHandlers = handlers => e => {
    if (e.persist) e.persist();
    handlers.filter(Boolean).forEach(handler => {
      if (e.defaultPrevented) return;
      handler(e);
    });
  };

  // Get the active props
  const resolvedActiveProps = isActive ? functionalUpdate(activeProps, {}) ?? {} : {};

  // Get the inactive props
  const resolvedInactiveProps = isActive ? {} : functionalUpdate(inactiveProps, {}) ?? {};
  return {
    ...resolvedActiveProps,
    ...resolvedInactiveProps,
    ...rest,
    href: disabled ? undefined : next.href,
    onClick: composeHandlers([onClick, reactHandleClick]),
    onFocus: composeHandlers([onFocus, handleFocus]),
    onMouseEnter: composeHandlers([onMouseEnter, handleEnter]),
    onMouseLeave: composeHandlers([onMouseLeave, handleLeave]),
    onTouchStart: composeHandlers([onTouchStart, handleTouchStart]),
    target,
    style: {
      ...style,
      ...resolvedActiveProps.style,
      ...resolvedInactiveProps.style
    },
    className: [className, resolvedActiveProps.className, resolvedInactiveProps.className].filter(Boolean).join(' ') || undefined,
    ...(disabled ? {
      role: 'link',
      'aria-disabled': true
    } : undefined),
    ['data-status']: isActive ? 'active' : undefined
  };
}
const Link = /*#__PURE__*/React.forwardRef((props, ref) => {
  const linkProps = useLinkProps(props);
  return /*#__PURE__*/React.createElement("a", _extends({
    ref: ref
  }, linkProps, {
    children: typeof props.children === 'function' ? props.children({
      isActive: linkProps['data-status'] === 'active'
    }) : props.children
  }));
});
const matchesContext = /*#__PURE__*/React.createContext(null);
const routerContext = /*#__PURE__*/React.createContext(null);
class ReactRouter extends Router {
  constructor(opts) {
    super({
      ...opts,
      loadComponent: async component => {
        if (component.preload) {
          await component.preload();
        }
        return component;
      }
    });
  }
}
function RouterProvider({
  router,
  ...rest
}) {
  router.update(rest);
  const currentMatches = useStore(router.__store, s => s.currentMatches);
  React.useEffect(router.mount, [router]);
  return /*#__PURE__*/React.createElement(routerContext.Provider, {
    value: {
      router: router
    }
  }, /*#__PURE__*/React.createElement(matchesContext.Provider, {
    value: [undefined, ...currentMatches]
  }, /*#__PURE__*/React.createElement(CatchBoundary, {
    errorComponent: ErrorComponent,
    onCatch: () => {
      warning(false, `Error in router! Consider setting an 'errorComponent' in your RootRoute! 👍`);
    }
  }, /*#__PURE__*/React.createElement(Outlet, null))));
}
function useRouterContext() {
  const value = React.useContext(routerContext);
  warning(value, 'useRouter must be used inside a <Router> component!');
  useStore(value.router.__store);
  return value.router;
}
function useRouter(track, shallow) {
  const router = useRouterContext();
  useStore(router.__store, track, shallow);
  return router;
}
function useMatches() {
  return React.useContext(matchesContext);
}
function useParams(opts) {
  const router = useRouterContext();
  useStore(router.__store, d => {
    const params = last(d.currentMatches)?.params;
    return opts?.track?.(params) ?? params;
  }, true);
  return last(router.state.currentMatches)?.params;
}
function Outlet() {
  const matches = useMatches().slice(1);
  const match = matches[0];
  if (!match) {
    return null;
  }
  return /*#__PURE__*/React.createElement(SubOutlet, {
    matches: matches,
    match: match
  });
}
function SubOutlet({
  matches,
  match
}) {
  const router = useRouterContext();
  useStore(match.__store, store => [store.status, store.error], true);
  const defaultPending = React.useCallback(() => null, []);
  const PendingComponent = match.pendingComponent ?? router.options.defaultPendingComponent ?? defaultPending;
  const errorComponent = match.errorComponent ?? router.options.defaultErrorComponent;
  const ResolvedSuspenseBoundary = match.route.options.wrapInSuspense ?? true ? React.Suspense : SafeFragment;
  const ResolvedCatchBoundary = errorComponent ? CatchBoundary : SafeFragment;
  return /*#__PURE__*/React.createElement(matchesContext.Provider, {
    value: matches
  }, /*#__PURE__*/React.createElement(ResolvedSuspenseBoundary, {
    fallback: /*#__PURE__*/React.createElement(PendingComponent, null)
  }, /*#__PURE__*/React.createElement(ResolvedCatchBoundary, {
    key: match.route.id,
    errorComponent: errorComponent,
    onCatch: () => {
      warning(false, `Error in route match: ${match.id}`);
    }
  }, /*#__PURE__*/React.createElement(Inner, {
    match: match
  }))));
}
function Inner(props) {
  const router = useRouterContext();
  if (props.match.state.status === 'error') {
    throw props.match.state.error;
  }
  if (props.match.state.status === 'success') {
    return /*#__PURE__*/React.createElement(props.match.component ?? router.options.defaultComponent ?? Outlet);
  }
  if (props.match.state.status === 'pending') {
    throw props.match.__loadPromise;
  }
  invariant(false, 'Idle routeMatch status encountered during rendering! You should never see this. File an issue!');
}
function SafeFragment(props) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, props.children);
}

// This is the messiest thing ever... I'm either seriously tired (likely) or
// there has to be a better way to reset error boundaries when the
// router's location key changes.

class CatchBoundary extends React.Component {
  state = {
    error: false,
    info: undefined
  };
  componentDidCatch(error, info) {
    this.props.onCatch(error, info);
    console.error(error);
    this.setState({
      error,
      info
    });
  }
  render() {
    return /*#__PURE__*/React.createElement(CatchBoundaryInner, _extends({}, this.props, {
      errorState: this.state,
      reset: () => this.setState({})
    }));
  }
}
function CatchBoundaryInner(props) {
  const [activeErrorState, setActiveErrorState] = React.useState(props.errorState);
  const router = useRouterContext();
  const errorComponent = props.errorComponent ?? ErrorComponent;
  const prevKeyRef = React.useRef('');
  React.useEffect(() => {
    if (activeErrorState) {
      if (router.state.currentLocation.key !== prevKeyRef.current) {
        setActiveErrorState({});
      }
    }
    prevKeyRef.current = router.state.currentLocation.key;
  }, [activeErrorState, router.state.currentLocation.key]);
  React.useEffect(() => {
    if (props.errorState.error) {
      setActiveErrorState(props.errorState);
    }
    // props.reset()
  }, [props.errorState.error]);
  if (props.errorState.error && activeErrorState.error) {
    return /*#__PURE__*/React.createElement(errorComponent, activeErrorState);
  }
  return props.children;
}
function ErrorComponent({
  error
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '.5rem',
      maxWidth: '100%'
    }
  }, /*#__PURE__*/React.createElement("strong", {
    style: {
      fontSize: '1.2rem'
    }
  }, "Something went wrong!"), /*#__PURE__*/React.createElement("div", {
    style: {
      height: '.5rem'
    }
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("pre", {
    style: {
      fontSize: '.7em',
      border: '1px solid red',
      borderRadius: '.25rem',
      padding: '.5rem',
      color: 'red',
      overflow: 'auto'
    }
  }, error.message ? /*#__PURE__*/React.createElement("code", null, error.message) : null)));
}

const rootRoute = RootRoute.withRouterContext()({
  component: Root,
  wrapInSuspense: false,
  errorComponent: ({
    error
  }) => /* @__PURE__ */ jsx(ErrorComponent, {
    error
  })
});
function Root() {
  const router = useRouter();
  const titleMatch = [...router.state.currentMatches].reverse().find((d) => d.routeContext?.getTitle);
  const title = titleMatch?.context?.getTitle?.() ?? "Astro + TanStack Router";
  return /* @__PURE__ */ jsxs("html", {
    lang: "en",
    children: [/* @__PURE__ */ jsxs("head", {
      children: [/* @__PURE__ */ jsx("meta", {
        charSet: "UTF-8"
      }), /* @__PURE__ */ jsx("meta", {
        name: "viewport",
        content: "width=device-width, initial-scale=1.0"
      }), /* @__PURE__ */ jsx("title", {
        children: title
      }), /* @__PURE__ */ jsx("script", {
        src: "https://cdn.tailwindcss.com"
      })]
    }), /* @__PURE__ */ jsxs("body", {
      children: [/* @__PURE__ */ jsxs("div", {
        className: "p-2 flex gap-2 text-lg",
        children: [/* @__PURE__ */ jsx(Link, {
          to: "/",
          activeProps: {
            className: "font-bold"
          },
          activeOptions: {
            exact: true
          },
          children: "Home"
        }), " ", /* @__PURE__ */ jsx(Link, {
          to: "/posts",
          activeProps: {
            className: "font-bold"
          },
          children: "Posts"
        })]
      }), /* @__PURE__ */ jsx("hr", {}), /* @__PURE__ */ jsx(Outlet, {}), " ", /* @__PURE__ */ jsx(RouterScripts, {})]
    })]
  });
}

const indexRoute = new Route({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => /* @__PURE__ */ jsx("div", {
    className: "p-2",
    children: /* @__PURE__ */ jsx("h3", {
      children: "Welcome Home!"
    })
  })
});

const postIdRoute = new Route({
  getParentRoute: () => postsRoute,
  path: "$postId",
  getContext: ({
    context,
    params: {
      postId
    }
  }) => ({
    getTitle: () => context.loaderClient.getLoader({
      key: "post"
    }).getInstance({
      variables: postId
    }).state.data?.title
  }),
  onLoad: async ({
    params: {
      postId
    },
    preload,
    context
  }) => context.loaderClient.getLoader({
    key: "post"
  }).load({
    variables: postId,
    preload
  }),
  component: Post
});
function Post() {
  const {
    postId
  } = useParams({
    from: postIdRoute.id
  });
  const {
    state: {
      data: post
    }
  } = useLoaderInstance({
    key: "post",
    variables: postId
  });
  return /* @__PURE__ */ jsxs("div", {
    className: "space-y-2",
    children: [/* @__PURE__ */ jsx("h4", {
      className: "text-xl font-bold underline",
      children: post.title
    }), /* @__PURE__ */ jsx("div", {
      className: "text-sm",
      children: post.body
    })]
  });
}

const postsRoute = new Route({
  getParentRoute: () => rootRoute,
  path: "posts",
  onLoad: ({
    context,
    preload
  }) => context.loaderClient.getLoader({
    key: "posts"
  }).load({
    preload
  }),
  component: Posts,
  getContext: ({
    context
  }) => ({
    getTitle: () => `${context.loaderClient.getLoader({
      key: "posts"
    }).getInstance().state.data?.length} Posts`
  })
});
function Posts() {
  const {
    state: {
      data: posts
    }
  } = useLoaderInstance({
    key: "posts"
  });
  return /* @__PURE__ */ jsxs("div", {
    className: "p-2 flex gap-2",
    children: [/* @__PURE__ */ jsx("ul", {
      className: "list-disc pl-4",
      children: posts.map((post) => {
        return /* @__PURE__ */ jsx("li", {
          className: "whitespace-nowrap",
          children: /* @__PURE__ */ jsx(Link, {
            to: postIdRoute.fullPath,
            params: {
              postId: post.id
            },
            className: "block py-1 text-blue-800 hover:text-blue-600",
            activeProps: {
              className: "text-black font-bold"
            },
            children: /* @__PURE__ */ jsx("div", {
              children: post.title.substring(0, 20)
            })
          })
        }, post.id);
      })
    }), /* @__PURE__ */ jsx("hr", {}), /* @__PURE__ */ jsx(Outlet, {})]
  });
}

const postsIndexRoute = new Route({
  getParentRoute: () => postsRoute,
  path: "/",
  component: () => /* @__PURE__ */ jsx("div", {
    children: "Select a post."
  })
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  postsRoute.addChildren([postsIndexRoute, postIdRoute])
]);

const routeTree$1 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  routeTree
}, Symbol.toStringTag, { value: 'Module' }));

export { LoaderClientProvider as L, ReactRouter as R, RouterProvider as a, routeTree$1 as b, routeTree as r };
