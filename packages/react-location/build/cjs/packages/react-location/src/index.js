/**
 * react-location-lite
 *
 * Copyright (c) TanStack
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE.md file in the root directory of this source tree.
 *
 * @license MIT
 */
'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var assertThisInitialized = require('../node_modules/@babel/runtime/helpers/esm/assertThisInitialized.js');
var objectWithoutPropertiesLoose = require('../node_modules/@babel/runtime/helpers/esm/objectWithoutPropertiesLoose.js');
var _extends = require('../node_modules/@babel/runtime/helpers/esm/extends.js');
var inheritsLoose = require('../node_modules/@babel/runtime/helpers/esm/inheritsLoose.js');
var React = require('react');
var index = require('../../../node_modules/history/index.js');

function _interopNamespace(e) {
  if (e && e.__esModule) return e;
  var n = Object.create(null);
  if (e) {
    Object.keys(e).forEach(function (k) {
      if (k !== 'default') {
        var d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: function () { return e[k]; }
        });
      }
    });
  }
  n["default"] = e;
  return Object.freeze(n);
}

var React__namespace = /*#__PURE__*/_interopNamespace(React);

var _excluded = ["children", "location"],
    _excluded2 = ["location"],
    _excluded3 = ["basepath", "routes"],
    _excluded4 = ["to", "search", "hash", "children", "target", "style", "replace", "onClick", "onMouseEnter", "className", "getActiveProps", "getInactiveProps", "activeOptions", "preload", "disabled", "_ref"],
    _excluded5 = ["style", "className"],
    _excluded6 = ["style", "className"],
    _excluded7 = ["pending"],
    _excluded8 = ["children"];

function _await(value, then, direct) {
  if (direct) {
    return then ? then(value) : value;
  }

  if (!value || !value.then) {
    value = Promise.resolve(value);
  }

  return then ? value.then(then) : value;
}

function _async(f) {
  return function () {
    for (var args = [], i = 0; i < arguments.length; i++) {
      args[i] = arguments[i];
    }

    try {
      return Promise.resolve(f.apply(this, args));
    } catch (e) {
      return Promise.reject(e);
    }
  };
} // Types
// Source
var LocationContext = /*#__PURE__*/React__namespace.createContext(null);
var MatchesContext = /*#__PURE__*/React__namespace.createContext(null);
var routerContext = /*#__PURE__*/React__namespace.createContext(null); // Detect if we're in the DOM

var isDOM = Boolean(typeof window !== 'undefined' && window.document && window.document.createElement);
var useLayoutEffect = isDOM ? React__namespace.useLayoutEffect : React__namespace.useEffect; // This is the default history object if none is defined

var createDefaultHistory = function createDefaultHistory() {
  return isDOM ? index.createBrowserHistory() : index.createMemoryHistory();
};

var Subscribable = /*#__PURE__*/function () {
  function Subscribable() {
    this.listeners = [];
  }

  var _proto = Subscribable.prototype;

  _proto.subscribe = function subscribe(listener) {
    var _this = this;

    this.listeners.push(listener);
    return function () {
      _this.listeners = _this.listeners.filter(function (x) {
        return x !== listener;
      });
    };
  };

  _proto.notify = function notify() {
    this.listeners.forEach(function (listener) {
      return listener();
    });
  };

  return Subscribable;
}();

var ReactLocation = /*#__PURE__*/function (_Subscribable) {
  inheritsLoose["default"](ReactLocation, _Subscribable);

  //
  function ReactLocation(options) {
    var _options$stringifySea, _options$parseSearch;

    var _this2;

    _this2 = _Subscribable.call(this) || this;
    _this2.isTransitioning = false;
    _this2.history = (options == null ? void 0 : options.history) || createDefaultHistory();
    _this2.stringifySearch = (_options$stringifySea = options == null ? void 0 : options.stringifySearch) != null ? _options$stringifySea : defaultStringifySearch;
    _this2.parseSearch = (_options$parseSearch = options == null ? void 0 : options.parseSearch) != null ? _options$parseSearch : defaultParseSearch;
    _this2.current = _this2.parseLocation(_this2.history.location);
    _this2.destroy = _this2.history.listen(function (event) {
      _this2.current = _this2.parseLocation(event.location, _this2.current);

      _this2.notify();
    });
    return _this2;
  }

  var _proto2 = ReactLocation.prototype;

  _proto2.buildNext = function buildNext(basepath, dest) {
    var _dest$to, _ref2, _dest$__searchFilters;

    if (basepath === void 0) {
      basepath = '/';
    }

    if (dest === void 0) {
      dest = {};
    }

    var from = _extends["default"]({}, this.current, dest.from);

    var pathname = resolvePath(basepath, from.pathname, "" + ((_dest$to = dest.to) != null ? _dest$to : '.'));
    var updatedSearch = (_ref2 = dest.search === true ? from.search : functionalUpdate(dest.search, from.search)) != null ? _ref2 : {};
    var filteredSearch = (_dest$__searchFilters = dest.__searchFilters) != null && _dest$__searchFilters.length ? dest.__searchFilters.reduce(function (prev, next) {
      return next(prev, updatedSearch);
    }, from.search) : updatedSearch;
    var search = replaceEqualDeep(from.search, filteredSearch);
    var searchStr = this.stringifySearch(search);
    var hash = functionalUpdate(dest.hash, from.hash);
    hash = hash ? "#" + hash : '';
    return {
      pathname: pathname,
      search: search,
      searchStr: searchStr,
      hash: hash,
      href: "" + pathname + searchStr + hash,
      key: dest.key
    };
  };

  _proto2.navigate = function navigate(next, replace) {
    var _this3 = this;

    this.current = next;
    if (this.navigateTimeout) clearTimeout(this.navigateTimeout);
    var nextAction = 'replace';

    if (!this.nextAction) {
      nextAction = replace ? 'replace' : 'push';
    }

    if (!replace) {
      nextAction = 'push';
    }

    this.nextAction = nextAction;
    this.navigateTimeout = setTimeout(function () {
      var nextAction = _this3.nextAction;
      delete _this3.nextAction;

      var isSameUrl = _this3.parseLocation(_this3.history.location).href === _this3.current.href;

      if (isSameUrl && !_this3.current.key) {
        nextAction = 'replace';
      }

      if (nextAction === 'replace') {
        return _this3.history.replace({
          pathname: _this3.current.pathname,
          hash: _this3.current.hash,
          search: _this3.current.searchStr
        });
      }

      return _this3.history.push({
        pathname: _this3.current.pathname,
        hash: _this3.current.hash,
        search: _this3.current.searchStr
      });
    }, 16);
  };

  _proto2.parseLocation = function parseLocation(location, previousLocation) {
    var _location$hash$split$;

    var parsedSearch = this.parseSearch(location.search);
    return {
      pathname: location.pathname,
      searchStr: location.search,
      search: replaceEqualDeep(previousLocation == null ? void 0 : previousLocation.search, parsedSearch),
      hash: (_location$hash$split$ = location.hash.split('#').reverse()[0]) != null ? _location$hash$split$ : '',
      href: "" + location.pathname + location.search + location.hash,
      key: location.key
    };
  };

  return ReactLocation;
}(Subscribable);
function MatchesProvider(props) {
  return /*#__PURE__*/React__namespace.createElement(MatchesContext.Provider, props);
}
function Router(_ref3) {
  var children = _ref3.children,
      location = _ref3.location,
      rest = objectWithoutPropertiesLoose["default"](_ref3, _excluded);

  var routerRef = React__namespace.useRef(null);

  if (!routerRef.current) {
    routerRef.current = new RouterInstance({
      location: location,
      // snapshot,
      routes: rest.routes
    });
  }

  var router = routerRef.current;

  var _React$useReducer = React__namespace.useReducer(function () {
    return {};
  }, {}),
      nonce = _React$useReducer[0],
      rerender = _React$useReducer[1];

  router.update(rest);
  useLayoutEffect(function () {
    return router.subscribe(function () {
      rerender();
    });
  }, []);
  useLayoutEffect(function () {
    return router.updateLocation(location.current).unsubscribe;
  }, [location.current.key]);
  var routerValue = React__namespace.useMemo(function () {
    return {
      router: router
    };
  }, [nonce]);
  return /*#__PURE__*/React__namespace.createElement(LocationContext.Provider, {
    value: {
      location: location
    }
  }, /*#__PURE__*/React__namespace.createElement(routerContext.Provider, {
    value: routerValue
  }, /*#__PURE__*/React__namespace.createElement(MatchesProvider, {
    value: [router.rootMatch].concat(router.state.matches)
  }, children != null ? children : /*#__PURE__*/React__namespace.createElement(Outlet, null))));
}
var RouterInstance = /*#__PURE__*/function (_Subscribable2) {
  inheritsLoose["default"](RouterInstance, _Subscribable2);

  function RouterInstance(_ref4) {
    var _this4;

    var location = _ref4.location,
        rest = objectWithoutPropertiesLoose["default"](_ref4, _excluded2);

    _this4 = _Subscribable2.call(this) || this;
    _this4.routesById = {};

    _this4.update = function (_ref5) {
      var basepath = _ref5.basepath,
          routes = _ref5.routes,
          opts = objectWithoutPropertiesLoose["default"](_ref5, _excluded3);

      Object.assign(assertThisInitialized["default"](_this4), opts);
      _this4.basepath = cleanPath("/" + (basepath != null ? basepath : ''));
      _this4.routesById = {};

      var recurseRoutes = function recurseRoutes(routes, parent) {
        return routes.map(function (route) {
          var _route$path, _route$children;

          var path = (_route$path = route.path) != null ? _route$path : '*';
          var id = joinPaths([(parent == null ? void 0 : parent.id) === 'root' ? '' : parent == null ? void 0 : parent.id, "" + (path == null ? void 0 : path.replace(/(.)\/$/, '$1')) + (route.id ? "-" + route.id : '')]);
          route = _extends["default"]({}, route, {
            id: id
          });

          if (_this4.routesById[id]) {
            if (process.env.NODE_ENV !== 'production') {
              console.warn("Duplicate routes found with id: " + id, _this4.routesById, route);
            }

            throw new Error();
          }

          _this4.routesById[id] = route;
          route.children = (_route$children = route.children) != null && _route$children.length ? recurseRoutes(route.children, route) : undefined;
          return route;
        });
      };

      _this4.routes = recurseRoutes(routes);
      _this4.rootMatch = {
        id: 'root',
        params: {},
        search: {},
        pathname: _this4.basepath,
        route: null,
        isLoading: false,
        status: 'resolved'
      };
    };

    _this4.setState = function (updater) {
      var newState = updater({
        state: _this4.state,
        pending: _this4.pending
      });
      _this4.state = newState.state;
      _this4.pending = newState.pending;

      _this4.cleanMatchCache();

      _this4.notify();
    };

    _this4.updateLocation = function (next) {
      var unsubscribe;
      var promise = new Promise(function (resolve) {
        var matchLoader = new MatchLoader(assertThisInitialized["default"](_this4), next);

        _this4.setState(function (old) {
          return _extends["default"]({}, old, {
            pending: {
              location: matchLoader.location,
              matches: matchLoader.matches
            }
          });
        });

        unsubscribe = matchLoader.subscribe(function () {
          var currentMatches = _this4.state.matches;
          currentMatches.filter(function (d) {
            return !matchLoader.matches.find(function (dd) {
              return dd.id === d.id;
            });
          }).forEach(function (d) {
            d.onExit == null ? void 0 : d.onExit(d);
          });
          currentMatches.filter(function (d) {
            return matchLoader.matches.find(function (dd) {
              return dd.id === d.id;
            });
          }).forEach(function (d) {
            d.route.onTransition == null ? void 0 : d.route.onTransition(d);
          });
          matchLoader.matches.filter(function (d) {
            return !currentMatches.find(function (dd) {
              return dd.id === d.id;
            });
          }).forEach(function (d) {
            d.onExit = d.route.onMatch == null ? void 0 : d.route.onMatch(d);
          });

          _this4.setState(function (old) {
            return _extends["default"]({}, old, {
              state: {
                location: matchLoader.location,
                matches: matchLoader.matches
              },
              pending: undefined
            });
          });

          resolve();
        });
        matchLoader.loadData();
        matchLoader.startPending();
      });
      return {
        promise: promise,
        unsubscribe: unsubscribe
      };
    };

    _this4.update(rest); // if (snapshot) {
    //   const matchLoader = new MatchLoader(this, location.current)
    //   matchLoader.matches.forEach((match, index) => {
    //     if (match.id !== snapshot.matches[index]?.id) {
    //       throw new Error(
    //         `Router hydration mismatch: ${match.id} !== ${snapshot.matches[index]?.id}`,
    //       )
    //     }
    //     match.ownData = snapshot.matches[index]?.ownData ?? {}
    //   })
    //   cascadeMatchData(matchLoader.matches)
    // }


    _this4.state = {
      // location: snapshot?.location ?? location.current,
      // matches: matchLoader.matches,
      location: location.current,
      matches: []
    };
    location.subscribe(function () {
      return _this4.notify();
    });
    return _this4;
  } // snapshot = (): RouterSnapshot<TGenerics> => {
  //   return {
  //     location: this.state.location,
  //     matches: this.state.matches.map(({ ownData, id }) => {
  //       return {
  //         id,
  //         ownData,
  //       }
  //     }),
  //   }
  // }


  return RouterInstance;
}(Subscribable);
function useLocation() {
  // const getIsMounted = useGetIsMounted()
  // const [, rerender] = React.useReducer((d) => d + 1, 0)
  var context = React__namespace.useContext(LocationContext);
  warning(!!context, 'useLocation must be used within a <ReactLocation />'); // useLayoutEffect(() => {
  //   return instance.subscribe(() => {
  //     // Rerender all subscribers in a microtask
  //     Promise.resolve().then(() => {
  //       // setTimeout(function renderAllLocationSubscribers() {
  //       if (getIsMounted()) {
  //         rerender()
  //       }
  //       // }, 0)
  //     })
  //   })
  // }, [instance])

  return context.location;
}

var MatchLoader = /*#__PURE__*/function (_Subscribable3) {
  inheritsLoose["default"](MatchLoader, _Subscribable3);

  function MatchLoader(router, nextLocation) {
    var _this5;

    _this5 = _Subscribable3.call(this) || this;
    _this5.status = 'pending';

    _this5.preNotify = function (isSoft) {
      if (!isSoft) {
        _this5.status = 'resolved';
      }

      cascadeMatchData(_this5.matches);

      _this5.notify();
    };

    _this5.loadData = _async(function (_temp) {
      var _this5$matches;

      var _ref6 = _temp === void 0 ? {} : _temp,
          maxAge = _ref6.maxAge;

      _this5.router.cleanMatchCache();

      if (!((_this5$matches = _this5.matches) != null && _this5$matches.length)) {
        _this5.preNotify();

        return;
      }

      _this5.firstRenderPromises = [];

      _this5.matches.forEach(function (match, index) {
        var _this5$matches2, _this5$firstRenderPro;

        var parentMatch = (_this5$matches2 = _this5.matches) == null ? void 0 : _this5$matches2[index - 1];
        match.assignMatchLoader == null ? void 0 : match.assignMatchLoader(assertThisInitialized["default"](_this5));
        match.load == null ? void 0 : match.load({
          maxAge: maxAge,
          parentMatch: parentMatch,
          router: _this5.router
        });
        (_this5$firstRenderPro = _this5.firstRenderPromises) == null ? void 0 : _this5$firstRenderPro.push(match.loaderPromise);
      });

      return Promise.all(_this5.firstRenderPromises).then(function () {
        _this5.preNotify();

        return _this5.matches;
      });
    });
    _this5.load = _async(function (_temp2) {
      var _ref7 = _temp2 === void 0 ? {} : _temp2,
          maxAge = _ref7.maxAge;

      return _this5.loadData({
        maxAge: maxAge
      });
    });
    _this5.startPending = _async(function () {
      _this5.matches.forEach(function (match) {
        return match.startPending == null ? void 0 : match.startPending();
      });

      return _await();
    });
    _this5.router = router;
    _this5.location = nextLocation;
    _this5.matches = [];
    var unloadedMatches = matchRoutes(_this5.router, _this5.location);
    _this5.matches = unloadedMatches == null ? void 0 : unloadedMatches.map(function (unloadedMatch) {
      if (!_this5.router.matchCache[unloadedMatch.id]) {
        _this5.router.matchCache[unloadedMatch.id] = new RouteMatch(unloadedMatch);
      }

      return _this5.router.matchCache[unloadedMatch.id];
    });
    return _this5;
  }

  return MatchLoader;
}(Subscribable);

function cascadeMatchData(matches) {
  matches == null ? void 0 : matches.forEach(function (match, index) {
    var _parentMatch$data;

    var parentMatch = matches == null ? void 0 : matches[index - 1];
    match.data = _extends["default"]({}, (_parentMatch$data = parentMatch == null ? void 0 : parentMatch.data) != null ? _parentMatch$data : {}, match.ownData);
  });
}

function useRouter() {
  var value = React__namespace.useContext(routerContext);

  if (!value) {
    warning(true, 'You are trying to use useRouter() outside of ReactLocation!');
    throw new Error();
  }

  return value.router;
}
function matchRoutes(router, currentLocation) {
  if (!router.routes.length) {
    return [];
  }

  var matches = [];

  var recurse = _async(function (routes, parentMatch) {
    var _route$children3;

    var pathname = parentMatch.pathname,
        params = parentMatch.params;
    var filteredRoutes = router != null && router.filterRoutes ? router == null ? void 0 : router.filterRoutes(routes) : routes;
    var route = filteredRoutes.find(function (route) {
      var _route$children2, _route$caseSensitive;

      var fullRoutePathName = joinPaths([pathname, route.path]);
      var fuzzy = !!(route.path !== '/' || (_route$children2 = route.children) != null && _route$children2.length);
      var matchParams = matchRoute(currentLocation, {
        to: fullRoutePathName,
        search: route.search,
        fuzzy: fuzzy,
        caseSensitive: (_route$caseSensitive = route.caseSensitive) != null ? _route$caseSensitive : router.caseSensitive
      });

      if (matchParams) {
        params = _extends["default"]({}, params, matchParams);
      }

      return !!matchParams;
    });

    if (!route) {
      return;
    }

    var interpolatedPath = interpolatePath(route.path, params);
    pathname = joinPaths([pathname, interpolatedPath]);
    var interpolatedId = interpolatePath(route.id, params, true);
    var match = {
      id: interpolatedId,
      route: route,
      params: params,
      pathname: pathname,
      search: currentLocation.search
    };
    matches.push(match);

    if ((_route$children3 = route.children) != null && _route$children3.length) {
      recurse(route.children, match);
    }

    return _await();
  });

  recurse(router.routes, router.rootMatch);
  return matches;
}

function interpolatePath(path, params, leaveWildcard) {
  var interpolatedPathSegments = parsePathname(path);
  return joinPaths(interpolatedPathSegments.map(function (segment) {
    if (segment.value === '*' && !leaveWildcard) {
      return '';
    }

    if (segment.type === 'param') {
      var _segment$value$substr;

      return (_segment$value$substr = params[segment.value.substring(1)]) != null ? _segment$value$substr : '';
    }

    return segment.value;
  }));
}

function useLoadRoute() {
  var location = useLocation();
  var match = useMatch();
  var router = useRouter();
  var buildNext = useBuildNext();
  return useLatestCallback(_async(function (navigate, opts) {
    var _navigate$from;

    if (navigate === undefined) navigate = location.current;
    var next = buildNext(_extends["default"]({}, navigate, {
      from: (_navigate$from = navigate.from) != null ? _navigate$from : {
        pathname: match.pathname
      }
    }));
    var matchLoader = new MatchLoader(router, next);
    return matchLoader.load(opts);
  }));
}
function useParentMatches() {
  var router = useRouter();
  var match = useMatch();
  var matches = router.state.matches;
  return matches.slice(0, matches.findIndex(function (d) {
    return d.id === match.id;
  }) - 1);
}
function useMatches() {
  return React__namespace.useContext(MatchesContext);
}
function useMatch() {
  var _useMatches;

  return (_useMatches = useMatches()) == null ? void 0 : _useMatches[0];
}
function useNavigate() {
  var location = useLocation();
  var match = useMatch();
  var buildNext = useBuildNext();

  function navigate(_ref8) {
    var _fromCurrent;

    var search = _ref8.search,
        hash = _ref8.hash,
        replace = _ref8.replace,
        from = _ref8.from,
        to = _ref8.to,
        fromCurrent = _ref8.fromCurrent;
    fromCurrent = (_fromCurrent = fromCurrent) != null ? _fromCurrent : typeof to === 'undefined';
    var next = buildNext({
      to: to,
      search: search,
      hash: hash,
      from: fromCurrent ? location.current : from != null ? from : {
        pathname: match.pathname
      }
    });
    location.navigate(next, replace);
  }

  return useLatestCallback(navigate);
}
function Navigate(options) {
  var navigate = useNavigate();
  useLayoutEffect(function () {
    navigate(options);
  }, [navigate]);
  return null;
}

function useBuildNext() {
  var location = useLocation();
  var router = useRouter();

  var buildNext = function buildNext(opts) {
    var next = location.buildNext(router.basepath, opts);
    var matches = matchRoutes(router, next);

    var __searchFilters = matches.map(function (match) {
      var _match$route$searchFi;

      return (_match$route$searchFi = match.route.searchFilters) != null ? _match$route$searchFi : [];
    }).flat().filter(Boolean);

    return location.buildNext(router.basepath, _extends["default"]({}, opts, {
      __searchFilters: __searchFilters
    }));
  };

  return useLatestCallback(buildNext);
}

var Link = function Link(_ref9) {
  var _preload;

  var _ref9$to = _ref9.to,
      to = _ref9$to === void 0 ? '.' : _ref9$to,
      search = _ref9.search,
      hash = _ref9.hash,
      children = _ref9.children,
      target = _ref9.target,
      _ref9$style = _ref9.style,
      style = _ref9$style === void 0 ? {} : _ref9$style,
      replace = _ref9.replace,
      onClick = _ref9.onClick,
      onMouseEnter = _ref9.onMouseEnter,
      _ref9$className = _ref9.className,
      className = _ref9$className === void 0 ? '' : _ref9$className,
      _ref9$getActiveProps = _ref9.getActiveProps,
      getActiveProps = _ref9$getActiveProps === void 0 ? function () {
    return {};
  } : _ref9$getActiveProps,
      _ref9$getInactiveProp = _ref9.getInactiveProps,
      getInactiveProps = _ref9$getInactiveProp === void 0 ? function () {
    return {};
  } : _ref9$getInactiveProp,
      activeOptions = _ref9.activeOptions,
      preload = _ref9.preload,
      disabled = _ref9.disabled,
      _ref = _ref9._ref,
      rest = objectWithoutPropertiesLoose["default"](_ref9, _excluded4);

  var loadRoute = useLoadRoute();
  var match = useMatch();
  var location = useLocation();
  var router = useRouter();
  var navigate = useNavigate();
  var buildNext = useBuildNext();
  preload = (_preload = preload) != null ? _preload : router.defaultLinkPreloadMaxAge; // If this `to` is a valid external URL, log a warning

  try {
    var url = new URL("" + to);
    warning(false, "<Link /> should not be used for external URLs like: " + url.href);
  } catch (e) {}

  var next = buildNext({
    to: to,
    search: search,
    hash: hash,
    from: {
      pathname: match.pathname
    }
  }); // The click handler

  var handleClick = function handleClick(e) {
    if (onClick) onClick(e);

    if (!isCtrlEvent(e) && !e.defaultPrevented && (!target || target === '_self') && e.button === 0) {
      e.preventDefault(); // All is well? Navigate!

      navigate({
        to: to,
        search: search,
        hash: hash,
        replace: replace,
        from: {
          pathname: match.pathname
        }
      });
    }
  }; // The click handler


  var handleMouseEnter = function handleMouseEnter(e) {
    if (onMouseEnter) onMouseEnter(e);

    if (preload && preload > 0) {
      loadRoute({
        to: to,
        search: search,
        hash: hash
      }, {
        maxAge: preload
      });
    }
  }; // Compare path/hash for matches


  var pathIsEqual = location.current.pathname === next.pathname;
  var currentPathSplit = location.current.pathname.split('/');
  var nextPathSplit = next.pathname.split('/');
  var pathIsFuzzyEqual = nextPathSplit.every(function (d, i) {
    return d === currentPathSplit[i];
  });
  var hashIsEqual = location.current.hash === next.hash; // Combine the matches based on user options

  var pathTest = activeOptions != null && activeOptions.exact ? pathIsEqual : pathIsFuzzyEqual;
  var hashTest = activeOptions != null && activeOptions.includeHash ? hashIsEqual : true; // The final "active" test

  var isActive = pathTest && hashTest; // Get the active props

  var _ref10 = isActive ? getActiveProps() : {},
      _ref10$style = _ref10.style,
      activeStyle = _ref10$style === void 0 ? {} : _ref10$style,
      _ref10$className = _ref10.className,
      activeClassName = _ref10$className === void 0 ? '' : _ref10$className,
      activeRest = objectWithoutPropertiesLoose["default"](_ref10, _excluded5); // Get the inactive props


  var _ref11 = isActive ? {} : getInactiveProps(),
      _ref11$style = _ref11.style,
      inactiveStyle = _ref11$style === void 0 ? {} : _ref11$style,
      _ref11$className = _ref11.className,
      inactiveClassName = _ref11$className === void 0 ? '' : _ref11$className,
      inactiveRest = objectWithoutPropertiesLoose["default"](_ref11, _excluded6);

  return /*#__PURE__*/React__namespace.createElement("a", _extends["default"]({
    ref: _ref,
    href: disabled ? undefined : next.href,
    onClick: handleClick,
    onMouseEnter: handleMouseEnter,
    target: target,
    style: _extends["default"]({}, style, activeStyle, inactiveStyle),
    className: [className, activeClassName, inactiveClassName].filter(Boolean).join(' ') || undefined
  }, disabled ? {
    role: 'link',
    'aria-disabled': true
  } : undefined, rest, activeRest, inactiveRest, {
    children: typeof children === 'function' ? children({
      isActive: isActive
    }) : children
  }));
};
function Outlet() {
  var _match$errorElement;

  var router = useRouter();

  var _useMatches2 = useMatches();
      _useMatches2[0];
      var matches = _useMatches2.slice(1);

  var match = matches[0];

  if (!match) {
    return null;
  }

  var errorElement = (_match$errorElement = match.errorElement) != null ? _match$errorElement : router.defaultErrorElement;

  var element = function () {
    var _match$pendingElement, _match$element;

    if (match.status === 'rejected') {
      if (errorElement) {
        return errorElement;
      }

      if (!router.useErrorBoundary) {
        if (process.env.NODE_ENV !== 'production') {
          var preStyle = {
            whiteSpace: 'normal',
            display: 'inline-block',
            background: 'rgba(0,0,0,.1)',
            padding: '.1rem .2rem',
            margin: '.1rem',
            lineHeight: '1',
            borderRadius: '.25rem'
          };
          return /*#__PURE__*/React__namespace.createElement("div", {
            style: {
              lineHeight: '1.7'
            }
          }, /*#__PURE__*/React__namespace.createElement("strong", null, "The following error occured in the loader for you route at:", ' ', /*#__PURE__*/React__namespace.createElement("pre", {
            style: preStyle
          }, match.pathname)), ".", /*#__PURE__*/React__namespace.createElement("br", null), /*#__PURE__*/React__namespace.createElement("pre", {
            style: _extends["default"]({}, preStyle, {
              display: 'block',
              padding: '.5rem',
              borderRadius: '.5rem'
            })
          }, match.error.toString()), /*#__PURE__*/React__namespace.createElement("br", null), "Your users won't see this message in production, but they will see", ' ', /*#__PURE__*/React__namespace.createElement("strong", null, "\"An unknown error occured!\""), ", which is at least better than breaking your entire app. \uD83D\uDE0A For a better UX, please specify an ", /*#__PURE__*/React__namespace.createElement("pre", {
            style: preStyle
          }, "errorElement"), " for all of your routes that contain asynchronous behavior, or at least provide your own", /*#__PURE__*/React__namespace.createElement("pre", {
            style: preStyle
          }, "ErrorBoundary"), " wrapper around your renders to both the elements rendered by", ' ', /*#__PURE__*/React__namespace.createElement("pre", {
            style: preStyle
          }, 'useRoutes(routes, { useErrorBoundary: true })'), ' ', "and ", /*#__PURE__*/React__namespace.createElement("pre", {
            style: preStyle
          }, '<Router useErrorBoundary />'), ".", ' ', /*#__PURE__*/React__namespace.createElement("br", null), /*#__PURE__*/React__namespace.createElement("br", null));
        }

        return 'An unknown error occured!';
      }

      throw match.error;
    }

    var pendingElement = (_match$pendingElement = match.pendingElement) != null ? _match$pendingElement : router.defaultPendingElement;

    if (match.status === 'loading') {
      return null;
    }

    if (match.status === 'pending') {
      if (match.route.pendingMs || pendingElement) {
        return pendingElement != null ? pendingElement : null;
      }
    }

    var matchElement = (_match$element = match.element) != null ? _match$element : router.defaultElement;
    return matchElement != null ? matchElement : /*#__PURE__*/React__namespace.createElement(Outlet, null);
  }();

  return /*#__PURE__*/React__namespace.createElement(MatchesProvider, {
    value: matches
  }, element);
}
function useResolvePath() {
  var router = useRouter();
  var match = useMatch();
  return useLatestCallback(function (path) {
    return resolvePath(router.basepath, match.pathname, cleanPath(path));
  });
}
function useSearch() {
  var location = useLocation();
  return location.current.search;
}
function matchRoute(currentLocation, matchLocation) {
  var pathParams = matchByPath(currentLocation, matchLocation);
  var searchMatched = matchBySearch(currentLocation, matchLocation);

  if (matchLocation.to && !pathParams) {
    return;
  }

  if (matchLocation.search && !searchMatched) {
    return;
  }

  return pathParams != null ? pathParams : {};
}
function useMatchRoute() {
  var router = useRouter();
  var resolvePath = useResolvePath();
  return useLatestCallback(function (_ref12) {
    var pending = _ref12.pending,
        matchLocation = objectWithoutPropertiesLoose["default"](_ref12, _excluded7);

    matchLocation = _extends["default"]({}, matchLocation, {
      to: matchLocation.to ? resolvePath("" + matchLocation.to) : undefined
    });

    if (pending) {
      var _router$pending;

      if (!((_router$pending = router.pending) != null && _router$pending.location)) {
        return undefined;
      }

      return matchRoute(router.pending.location, matchLocation);
    }

    return matchRoute(router.state.location, matchLocation);
  });
}
function MatchRoute(_ref13) {
  var children = _ref13.children,
      rest = objectWithoutPropertiesLoose["default"](_ref13, _excluded8);

  var matchRoute = useMatchRoute();
  var match = matchRoute(rest);

  if (typeof children === 'function') {
    return children(match);
  }

  return match ? children : null;
}
function usePrompt(message, when) {
  var location = useLocation();
  React__namespace.useEffect(function () {
    if (!when) return;
    var unblock = location.history.block(function (transition) {
      if (window.confirm(message)) {
        unblock();
        transition.retry();
      } else {
        location.current.pathname = window.location.pathname;
      }
    });
    return unblock;
  }, [when, location, message]);
}
function Prompt(_ref14) {
  var message = _ref14.message,
      when = _ref14.when,
      children = _ref14.children;
  usePrompt(message, when != null ? when : true);
  return children != null ? children : null;
}

function warning(cond, message) {
  if (!cond) {
    if (typeof console !== 'undefined') console.warn(message);

    try {
      throw new Error(message);
    } catch (_unused) {}
  }
}

function isFunction(d) {
  return typeof d === 'function';
}

function functionalUpdate(updater, previous) {
  if (isFunction(updater)) {
    return updater(previous);
  }

  return updater;
}

function joinPaths(paths) {
  return cleanPath(paths.filter(Boolean).join('/'));
}

function cleanPath(path) {
  // remove double slashes
  return ("" + path).replace(/\/{2,}/g, '/');
}
function matchByPath(currentLocation, matchLocation) {
  var _matchLocation$to;

  var baseSegments = parsePathname(currentLocation.pathname);
  var routeSegments = parsePathname("" + ((_matchLocation$to = matchLocation.to) != null ? _matchLocation$to : '*'));
  var params = {};

  var isMatch = function () {
    for (var i = 0; i < Math.max(baseSegments.length, routeSegments.length); i++) {
      var baseSegment = baseSegments[i];
      var routeSegment = routeSegments[i];
      var isLastRouteSegment = i === routeSegments.length - 1;
      var isLastBaseSegment = i === baseSegments.length - 1;

      if (routeSegment) {
        if (routeSegment.type === 'wildcard') {
          if (baseSegment != null && baseSegment.value) {
            params['*'] = joinPaths(baseSegments.slice(i).map(function (d) {
              return d.value;
            }));
            return true;
          }

          return false;
        }

        if (routeSegment.type === 'pathname') {
          if (routeSegment.value === '/' && !(baseSegment != null && baseSegment.value)) {
            return true;
          }

          if (baseSegment) {
            if (matchLocation.caseSensitive) {
              if (routeSegment.value !== baseSegment.value) {
                return false;
              }
            } else if (routeSegment.value.toLowerCase() !== baseSegment.value.toLowerCase()) {
              return false;
            }
          }
        }

        if (!baseSegment) {
          return false;
        }

        if (routeSegment.type === 'param') {
          params[routeSegment.value.substring(1)] = baseSegment.value;
        }
      }

      if (isLastRouteSegment && !isLastBaseSegment) {
        return !!matchLocation.fuzzy;
      }
    }

    return true;
  }();

  return isMatch ? params : undefined;
}

function matchBySearch(currentLocation, matchLocation) {
  return !!(matchLocation.search && matchLocation.search(currentLocation.search));
}

function parsePathname(pathname) {
  if (!pathname) {
    return [];
  }

  pathname = cleanPath(pathname);
  var segments = [];

  if (pathname.slice(0, 1) === '/') {
    pathname = pathname.substring(1);
    segments.push({
      type: 'pathname',
      value: '/'
    });
  }

  if (!pathname) {
    return segments;
  } // Remove empty segments and '.' segments


  var split = pathname.split('/').filter(Boolean);
  segments.push.apply(segments, split.map(function (part) {
    if (part.startsWith('*')) {
      return {
        type: 'wildcard',
        value: part
      };
    }

    if (part.charAt(0) === ':') {
      return {
        type: 'param',
        value: part
      };
    }

    return {
      type: 'pathname',
      value: part
    };
  }));

  if (pathname.slice(-1) === '/') {
    pathname = pathname.substring(1);
    segments.push({
      type: 'pathname',
      value: '/'
    });
  }

  return segments;
}
function resolvePath(basepath, base, to) {
  base = base.replace(new RegExp("^" + basepath), '/');
  to = to.replace(new RegExp("^" + basepath), '/');
  var baseSegments = parsePathname(base);
  var toSegments = parsePathname(to);
  toSegments.forEach(function (toSegment, index) {
    if (toSegment.value === '/') {
      if (!index) {
        // Leading slash
        baseSegments = [toSegment];
      } else if (index === toSegments.length - 1) {
        // Trailing Slash
        baseSegments.push(toSegment);
      } else ;
    } else if (toSegment.value === '..') {
      baseSegments.pop();
    } else if (toSegment.value === '.') {
      return;
    } else {
      baseSegments.push(toSegment);
    }
  });
  var joined = joinPaths([basepath].concat(baseSegments.map(function (d) {
    return d.value;
  })));
  return cleanPath(joined);
}

function isCtrlEvent(e) {
  return !!(e.metaKey || e.altKey || e.ctrlKey || e.shiftKey);
}

function useLatestCallback(cb) {
  var stableFnRef = React__namespace.useRef();
  var cbRef = React__namespace.useRef(cb);
  cbRef.current = cb;

  if (!stableFnRef.current) {
    stableFnRef.current = function () {
      return cbRef.current.apply(cbRef, arguments);
    };
  }

  return stableFnRef.current;
}
/**
 * This function returns `a` if `b` is deeply equal.
 * If not, it will replace any deeply equal children of `b` with those of `a`.
 * This can be used for structural sharing between JSON values for example.
 */


function replaceEqualDeep(prev, next) {
  if (prev === next) {
    return prev;
  }

  var array = Array.isArray(prev) && Array.isArray(next);

  if (array || isPlainObject(prev) && isPlainObject(next)) {
    var aSize = array ? prev.length : Object.keys(prev).length;
    var bItems = array ? next : Object.keys(next);
    var bSize = bItems.length;
    var copy = array ? [] : {};
    var equalItems = 0;

    for (var i = 0; i < bSize; i++) {
      var key = array ? i : bItems[i];
      copy[key] = replaceEqualDeep(prev[key], next[key]);

      if (copy[key] === prev[key]) {
        equalItems++;
      }
    }

    return aSize === bSize && equalItems === aSize ? prev : copy;
  }

  return next;
} // Copied from: https://github.com/jonschlinkert/is-plain-object


function isPlainObject(o) {
  if (!hasObjectPrototype(o)) {
    return false;
  } // If has modified constructor


  var ctor = o.constructor;

  if (typeof ctor === 'undefined') {
    return true;
  } // If has modified prototype


  var prot = ctor.prototype;

  if (!hasObjectPrototype(prot)) {
    return false;
  } // If constructor does not have an Object-specific method


  if (!prot.hasOwnProperty('isPrototypeOf')) {
    return false;
  } // Most likely a plain Object


  return true;
}

function hasObjectPrototype(o) {
  return Object.prototype.toString.call(o) === '[object Object]';
}

function defaultStringifySearch(search) {
  search = _extends["default"]({}, search);

  if (search) {
    Object.keys(search).forEach(function (key) {
      var val = search[key];

      if (typeof val === 'undefined' || val === undefined) {
        delete search[key];
      } else if (val && typeof val === 'object' && val !== null) {
        try {
          search[key] = JSON.stringify(val);
        } catch (err) {// silent
        }
      }
    });
  }

  var searchStr = new URLSearchParams(search).toString();
  return searchStr ? "?" + searchStr : '';
}
function defaultParseSearch(searchStr) {
  if (searchStr.substring(0, 1) === '?') {
    searchStr = searchStr.substring(1);
  }

  var query = Object.fromEntries(new URLSearchParams(searchStr).entries()); // Try to parse query params

  for (var key in query) {
    var value = query[key];

    try {
      query[key] = JSON.parse(value);
    } catch (err) {//
    }
  }

  return query;
}

exports.createBrowserHistory = index.createBrowserHistory;
exports.createHashHistory = index.createHashHistory;
exports.createMemoryHistory = index.createMemoryHistory;
exports.Link = Link;
exports.MatchRoute = MatchRoute;
exports.MatchesProvider = MatchesProvider;
exports.Navigate = Navigate;
exports.Outlet = Outlet;
exports.Prompt = Prompt;
exports.ReactLocation = ReactLocation;
exports.Router = Router;
exports.RouterInstance = RouterInstance;
exports.cleanPath = cleanPath;
exports.defaultParseSearch = defaultParseSearch;
exports.defaultStringifySearch = defaultStringifySearch;
exports.functionalUpdate = functionalUpdate;
exports.matchByPath = matchByPath;
exports.matchRoute = matchRoute;
exports.matchRoutes = matchRoutes;
exports.parsePathname = parsePathname;
exports.resolvePath = resolvePath;
exports.useLoadRoute = useLoadRoute;
exports.useLocation = useLocation;
exports.useMatch = useMatch;
exports.useMatchRoute = useMatchRoute;
exports.useMatches = useMatches;
exports.useNavigate = useNavigate;
exports.useParentMatches = useParentMatches;
exports.usePrompt = usePrompt;
exports.useResolvePath = useResolvePath;
exports.useRouter = useRouter;
exports.useSearch = useSearch;
//# sourceMappingURL=index.js.map
