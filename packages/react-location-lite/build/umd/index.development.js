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
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('react'), require('history')) :
  typeof define === 'function' && define.amd ? define(['exports', 'react', 'history'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.ReactLocationLite = {}, global.React, global.History));
})(this, (function (exports, React, history) { 'use strict';

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

  function _extends() {
    _extends = Object.assign || function (target) {
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

  function _objectWithoutPropertiesLoose(source, excluded) {
    if (source == null) return {};
    var target = {};
    var sourceKeys = Object.keys(source);
    var key, i;

    for (i = 0; i < sourceKeys.length; i++) {
      key = sourceKeys[i];
      if (excluded.indexOf(key) >= 0) continue;
      target[key] = source[key];
    }

    return target;
  }

  var _excluded = ["children", "location", "routes", "basepath"],
      _excluded2 = ["to", "search", "hash", "children", "target", "style", "replace", "onClick", "onMouseEnter", "className", "getActiveProps", "getInactiveProps", "activeOptions", "disabled", "_ref"],
      _excluded3 = ["style", "className"],
      _excluded4 = ["style", "className"],
      _excluded5 = ["children"];

  // Source
  var LocationContext = /*#__PURE__*/React__namespace.createContext(null);
  var MatchesContext = /*#__PURE__*/React__namespace.createContext(null);
  var routerContext = /*#__PURE__*/React__namespace.createContext(null); // Detect if we're in the DOM

  var isDOM = Boolean(typeof window !== 'undefined' && window.document && window.document.createElement);
  var useLayoutEffect = isDOM ? React__namespace.useLayoutEffect : React__namespace.useEffect; // This is the default history object if none is defined

  var createDefaultHistory = function createDefaultHistory() {
    return isDOM ? history.createBrowserHistory() : history.createMemoryHistory();
  };

  var ReactLocation = /*#__PURE__*/function () {
    //
    function ReactLocation(options) {
      var _options$stringifySea,
          _options$parseSearch,
          _this = this;

      this.listeners = [];
      this.isTransitioning = false;
      this.history = (options == null ? void 0 : options.history) || createDefaultHistory();
      this.stringifySearch = (_options$stringifySea = options == null ? void 0 : options.stringifySearch) != null ? _options$stringifySea : defaultStringifySearch;
      this.parseSearch = (_options$parseSearch = options == null ? void 0 : options.parseSearch) != null ? _options$parseSearch : defaultParseSearch;
      this.current = this.parseLocation(this.history.location);
      this.destroy = this.history.listen(function (event) {
        _this.current = _this.parseLocation(event.location, _this.current);

        _this.notify();
      });
    }

    var _proto = ReactLocation.prototype;

    _proto.subscribe = function subscribe(listener) {
      var _this2 = this;

      this.listeners.push(listener);
      return function () {
        _this2.listeners = _this2.listeners.filter(function (x) {
          return x !== listener;
        });
      };
    };

    _proto.notify = function notify() {
      this.listeners.forEach(function (listener) {
        return listener();
      });
    };

    _proto.buildNext = function buildNext(basepath, dest) {
      var _dest$to, _ref2, _dest$__searchFilters;

      if (basepath === void 0) {
        basepath = '/';
      }

      if (dest === void 0) {
        dest = {};
      }

      var from = _extends({}, this.current, dest.from);

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

    _proto.navigate = function navigate(next, replace) {
      this.current = next;
      if (this.navigateTimeout) clearTimeout(this.navigateTimeout);
      var nextAction = 'replace';

      if (!replace) {
        nextAction = 'push';
      }

      var isSameUrl = this.parseLocation(this.history.location).href === this.current.href;

      if (isSameUrl && !this.current.key) {
        nextAction = 'replace';
      }

      if (nextAction === 'replace') {
        return this.history.replace({
          pathname: this.current.pathname,
          hash: this.current.hash,
          search: this.current.searchStr
        });
      }

      return this.history.push({
        pathname: this.current.pathname,
        hash: this.current.hash,
        search: this.current.searchStr
      }); // }, 16)
    };

    _proto.parseLocation = function parseLocation(location, previousLocation) {
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
  }();
  function MatchesProvider(props) {
    return /*#__PURE__*/React__namespace.createElement(MatchesContext.Provider, props);
  }
  function Router(_ref3) {
    var children = _ref3.children,
        location = _ref3.location,
        routes = _ref3.routes,
        userBasepath = _ref3.basepath,
        rest = _objectWithoutPropertiesLoose(_ref3, _excluded);

    var basepath = cleanPath("/" + (userBasepath != null ? userBasepath : ''));

    var _React$useState = React__namespace.useState({
      location: location.current,
      matches: []
    }),
        routerState = _React$useState[0],
        setRouterState = _React$useState[1];

    var rootMatch = React__namespace.useMemo(function () {
      return {
        id: 'root',
        params: {},
        search: {},
        pathname: basepath,
        route: null
      };
    }, [basepath]);
    var router = React__namespace.useMemo(function () {
      var routesById = {};

      var recurseRoutes = function recurseRoutes(routes, parent) {
        return routes.map(function (route) {
          var _route$path, _route$children;

          var path = (_route$path = route.path) != null ? _route$path : '*';
          var id = joinPaths([(parent == null ? void 0 : parent.id) === 'root' ? '' : parent == null ? void 0 : parent.id, "" + (path == null ? void 0 : path.replace(/(.)\/$/, '$1')) + (route.id ? "-" + route.id : '')]);
          route = _extends({}, route, {
            id: id
          });

          if (routesById[id]) {
            {
              console.warn("Duplicate routes found with id: " + id, routesById, route);
            }

            throw new Error();
          }

          routesById[id] = route;
          route.children = (_route$children = route.children) != null && _route$children.length ? recurseRoutes(route.children, route) : undefined;
          return route;
        });
      };

      routes = recurseRoutes(routes);
      return _extends({}, rest, {
        routesById: routesById,
        routes: routes,
        basepath: basepath,
        rootMatch: rootMatch,
        state: routerState
      });
    }, [routerState, rootMatch, basepath]);
    console.log(router.state);
    useLayoutEffect(function () {
      var update = function update() {
        var matches = matchRoutes(router, location.current);
        setRouterState(function () {
          return {
            location: location.current,
            matches: matches
          };
        });
      };

      update();
      return location.subscribe(update);
    }, [location.current.key]);
    return /*#__PURE__*/React__namespace.createElement(LocationContext.Provider, {
      value: {
        location: location
      }
    }, /*#__PURE__*/React__namespace.createElement(routerContext.Provider, {
      value: router
    }, /*#__PURE__*/React__namespace.createElement(MatchesProvider, {
      value: [router.rootMatch].concat(router.state.matches)
    }, children != null ? children : /*#__PURE__*/React__namespace.createElement(Outlet, null))));
  }
  function useLocation() {
    var context = React__namespace.useContext(LocationContext);
    warning(!!context, 'useLocation must be used within a <ReactLocation />');
    return context.location;
  }
  function useRouter() {
    var value = React__namespace.useContext(routerContext);

    if (!value) {
      warning(true, 'You are trying to use useRouter() outside of ReactLocation!');
      throw new Error();
    }

    return value;
  }
  function matchRoutes(router, currentLocation) {
    if (!router.routes.length) {
      return [];
    }

    var matches = [];

    var recurse = function recurse(routes, parentMatch) {
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
          params = _extends({}, params, matchParams);
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
    };

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

    function navigate(_ref4) {
      var _fromCurrent;

      var search = _ref4.search,
          hash = _ref4.hash,
          replace = _ref4.replace,
          from = _ref4.from,
          to = _ref4.to,
          fromCurrent = _ref4.fromCurrent;
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

      return location.buildNext(router.basepath, _extends({}, opts, {
        __searchFilters: __searchFilters
      }));
    };

    return useLatestCallback(buildNext);
  }

  var Link = function Link(_ref5) {
    var _ref5$to = _ref5.to,
        to = _ref5$to === void 0 ? '.' : _ref5$to,
        search = _ref5.search,
        hash = _ref5.hash,
        children = _ref5.children,
        target = _ref5.target,
        _ref5$style = _ref5.style,
        style = _ref5$style === void 0 ? {} : _ref5$style,
        replace = _ref5.replace,
        onClick = _ref5.onClick;
        _ref5.onMouseEnter;
        var _ref5$className = _ref5.className,
        className = _ref5$className === void 0 ? '' : _ref5$className,
        _ref5$getActiveProps = _ref5.getActiveProps,
        getActiveProps = _ref5$getActiveProps === void 0 ? function () {
      return {};
    } : _ref5$getActiveProps,
        _ref5$getInactiveProp = _ref5.getInactiveProps,
        getInactiveProps = _ref5$getInactiveProp === void 0 ? function () {
      return {};
    } : _ref5$getInactiveProp,
        activeOptions = _ref5.activeOptions,
        disabled = _ref5.disabled,
        _ref = _ref5._ref,
        rest = _objectWithoutPropertiesLoose(_ref5, _excluded2);

    var match = useMatch();
    var location = useLocation();
    var navigate = useNavigate();
    var buildNext = useBuildNext(); // If this `to` is a valid external URL, log a warning

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

    var _ref6 = isActive ? getActiveProps() : {},
        _ref6$style = _ref6.style,
        activeStyle = _ref6$style === void 0 ? {} : _ref6$style,
        _ref6$className = _ref6.className,
        activeClassName = _ref6$className === void 0 ? '' : _ref6$className,
        activeRest = _objectWithoutPropertiesLoose(_ref6, _excluded3); // Get the inactive props


    var _ref7 = isActive ? {} : getInactiveProps(),
        _ref7$style = _ref7.style,
        inactiveStyle = _ref7$style === void 0 ? {} : _ref7$style,
        _ref7$className = _ref7.className,
        inactiveClassName = _ref7$className === void 0 ? '' : _ref7$className,
        inactiveRest = _objectWithoutPropertiesLoose(_ref7, _excluded4);

    return /*#__PURE__*/React__namespace.createElement("a", _extends({
      ref: _ref,
      href: disabled ? undefined : next.href,
      onClick: handleClick,
      target: target,
      style: _extends({}, style, activeStyle, inactiveStyle),
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
    var _match$route$element, _match$route$pendingE;

    var router = useRouter();

    var _useMatches2 = useMatches();
        _useMatches2[0];
        var matches = _useMatches2.slice(1);

    var match = matches[0];

    if (!match) {
      return null;
    }

    var matchElement = (_match$route$element = match.route.element) != null ? _match$route$element : router.defaultElement;
    var element = /*#__PURE__*/React__namespace.createElement(MatchesProvider, {
      value: matches
    }, matchElement != null ? matchElement : /*#__PURE__*/React__namespace.createElement(Outlet, null));
    var pendingElement = (_match$route$pendingE = match.route.pendingElement) != null ? _match$route$pendingE : router.defaultPendingElement;

    if (pendingElement) {
      return /*#__PURE__*/React__namespace.createElement(React__namespace.Suspense, {
        fallback: pendingElement
      }, element);
    }

    return element;
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
    return useLatestCallback(function (matchLocation) {
      matchLocation = _extends({}, matchLocation, {
        to: matchLocation.to ? resolvePath("" + matchLocation.to) : undefined
      });
      return matchRoute(router.state.location, matchLocation);
    });
  }
  function MatchRoute(_ref8) {
    var children = _ref8.children,
        rest = _objectWithoutPropertiesLoose(_ref8, _excluded5);

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
  function Prompt(_ref9) {
    var message = _ref9.message,
        when = _ref9.when,
        children = _ref9.children;
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
    search = _extends({}, search);

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

  Object.defineProperty(exports, 'createBrowserHistory', {
    enumerable: true,
    get: function () { return history.createBrowserHistory; }
  });
  Object.defineProperty(exports, 'createHashHistory', {
    enumerable: true,
    get: function () { return history.createHashHistory; }
  });
  Object.defineProperty(exports, 'createMemoryHistory', {
    enumerable: true,
    get: function () { return history.createMemoryHistory; }
  });
  exports.Link = Link;
  exports.MatchRoute = MatchRoute;
  exports.MatchesProvider = MatchesProvider;
  exports.Navigate = Navigate;
  exports.Outlet = Outlet;
  exports.Prompt = Prompt;
  exports.ReactLocation = ReactLocation;
  exports.Router = Router;
  exports.cleanPath = cleanPath;
  exports.defaultParseSearch = defaultParseSearch;
  exports.defaultStringifySearch = defaultStringifySearch;
  exports.functionalUpdate = functionalUpdate;
  exports.matchByPath = matchByPath;
  exports.matchRoute = matchRoute;
  exports.matchRoutes = matchRoutes;
  exports.parsePathname = parsePathname;
  exports.resolvePath = resolvePath;
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

  Object.defineProperty(exports, '__esModule', { value: true });

}));
//# sourceMappingURL=index.development.js.map
