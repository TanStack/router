/**
 * react-location
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

var _rollupPluginBabelHelpers = require('./_virtual/_rollupPluginBabelHelpers.js');
var React = require('react');
var history = require('history');

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

// Source
var LocationContext = /*#__PURE__*/React__namespace.createContext(null);
var MatchesContext = /*#__PURE__*/React__namespace.createContext(null);
var routerContext = /*#__PURE__*/React__namespace.createContext(null); // Detect if we're in the DOM

var isDOM = Boolean(typeof window !== 'undefined' && window.document && window.document.createElement);
var useLayoutEffect = isDOM ? React__namespace.useLayoutEffect : React__namespace.useEffect; // This is the default history object if none is defined

var createDefaultHistory = function createDefaultHistory() {
  return isDOM ? history.createBrowserHistory() : history.createMemoryHistory();
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
  _rollupPluginBabelHelpers.inheritsLoose(ReactLocation, _Subscribable);

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

    var from = _rollupPluginBabelHelpers["extends"]({}, this.current, dest.from);

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
      rest = _rollupPluginBabelHelpers.objectWithoutPropertiesLoose(_ref3, _excluded);

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
  _rollupPluginBabelHelpers.inheritsLoose(RouterInstance, _Subscribable2);

  function RouterInstance(_ref4) {
    var _this4;

    var location = _ref4.location,
        rest = _rollupPluginBabelHelpers.objectWithoutPropertiesLoose(_ref4, _excluded2);

    _this4 = _Subscribable2.call(this) || this;
    _this4.routesById = {};

    _this4.update = function (_ref5) {
      var basepath = _ref5.basepath,
          routes = _ref5.routes,
          opts = _rollupPluginBabelHelpers.objectWithoutPropertiesLoose(_ref5, _excluded3);

      Object.assign(_rollupPluginBabelHelpers.assertThisInitialized(_this4), opts);
      _this4.basepath = cleanPath("/" + (basepath != null ? basepath : ''));
      _this4.routesById = {};

      var recurseRoutes = function recurseRoutes(routes, parent) {
        return routes.map(function (route) {
          var _route$path, _route$pendingMs, _route$pendingMinMs, _route$children;

          var path = (_route$path = route.path) != null ? _route$path : '*';
          var id = joinPaths([(parent == null ? void 0 : parent.id) === 'root' ? '' : parent == null ? void 0 : parent.id, "" + (path == null ? void 0 : path.replace(/(.)\/$/, '$1')) + (route.id ? "-" + route.id : '')]);
          route = _rollupPluginBabelHelpers["extends"]({}, route, {
            pendingMs: (_route$pendingMs = route.pendingMs) != null ? _route$pendingMs : opts == null ? void 0 : opts.defaultPendingMs,
            pendingMinMs: (_route$pendingMinMs = route.pendingMinMs) != null ? _route$pendingMinMs : opts == null ? void 0 : opts.defaultPendingMinMs,
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
        ownData: {},
        data: {},
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

    _this4.matchCache = {};

    _this4.cleanMatchCache = function () {
      var _assertThisInitialize, _assertThisInitialize2, _assertThisInitialize3, _assertThisInitialize4, _assertThisInitialize5;

      var activeMatchIds = [].concat((_assertThisInitialize = (_assertThisInitialize2 = _rollupPluginBabelHelpers.assertThisInitialized(_this4)) == null ? void 0 : _assertThisInitialize2.state.matches) != null ? _assertThisInitialize : [], (_assertThisInitialize3 = (_assertThisInitialize4 = _rollupPluginBabelHelpers.assertThisInitialized(_this4)) == null ? void 0 : (_assertThisInitialize5 = _assertThisInitialize4.pending) == null ? void 0 : _assertThisInitialize5.matches) != null ? _assertThisInitialize3 : []).map(function (d) {
        return d.id;
      });
      Object.values(_this4.matchCache).forEach(function (match) {
        var _match$updatedAt;

        if (!match.updatedAt) {
          return;
        }

        if (activeMatchIds.includes(match.id)) {
          return;
        }

        var age = Date.now() - ((_match$updatedAt = match.updatedAt) != null ? _match$updatedAt : 0);

        if (!match.maxAge || age > match.maxAge) {
          if (match.route.unloader) {
            match.route.unloader(match);
          }

          delete _this4.matchCache[match.id];
        }
      });
    };

    _this4.updateLocation = function (next) {
      var unsubscribe;
      var promise = new Promise(function (resolve) {
        var matchLoader = new MatchLoader(_rollupPluginBabelHelpers.assertThisInitialized(_this4), next);

        _this4.setState(function (old) {
          return _rollupPluginBabelHelpers["extends"]({}, old, {
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
            return _rollupPluginBabelHelpers["extends"]({}, old, {
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
var RouteMatch = function RouteMatch(unloadedMatch) {
  var _this5 = this;

  this.status = 'loading';
  this.ownData = {};
  this.data = {};
  this.isLoading = false;

  this.notify = function (isSoft) {
    var _this5$matchLoader;

    (_this5$matchLoader = _this5.matchLoader) == null ? void 0 : _this5$matchLoader.preNotify(isSoft);
  };

  this.assignMatchLoader = function (matchLoader) {
    _this5.matchLoader = matchLoader;
  };

  this.startPending = function () {
    if (_this5.pendingTimeout) {
      clearTimeout(_this5.pendingTimeout);
    }

    if (_this5.route.pendingMs !== undefined) {
      _this5.pendingTimeout = setTimeout(function () {
        if (_this5.status === 'loading') {
          _this5.status = 'pending';
        }

        _this5.notify == null ? void 0 : _this5.notify();

        if (typeof _this5.route.pendingMinMs !== 'undefined') {
          _this5.pendingMinPromise = new Promise(function (r) {
            return setTimeout(r, _this5.route.pendingMinMs);
          });
        }
      }, _this5.route.pendingMs);
    }
  };

  this.load = function (opts) {
    var _ref6, _opts$maxAge;

    _this5.maxAge = (_ref6 = (_opts$maxAge = opts.maxAge) != null ? _opts$maxAge : _this5.route.loaderMaxAge) != null ? _ref6 : opts.router.defaultLoaderMaxAge;

    if (_this5.loaderPromise) {
      return;
    }

    var importer = _this5.route["import"]; // First, run any importers

    _this5.loaderPromise = (!importer ? Promise.resolve() : importer({
      params: _this5.params,
      search: _this5.search
    }).then(function (imported) {
      _this5.route = _rollupPluginBabelHelpers["extends"]({}, _this5.route, imported);
    }) // then run all element and data loaders in parallel
    ).then(function () {
      var elementPromises = []; // For each element type, potentially load it asynchronously

      var elementTypes = ['element', 'errorElement', 'pendingElement'];
      elementTypes.forEach(function (type) {
        var routeElement = _this5.route[type];

        if (_this5[type]) {
          return;
        }

        if (typeof routeElement === 'function') {
          elementPromises.push(routeElement(_this5).then(function (res) {
            _this5[type] = res;
          }));
        } else {
          _this5[type] = _this5.route[type];
        }
      });
      var loader = _this5.route.loader;
      var dataPromise = !loader ? Promise.resolve().then(function () {
        _this5.status = 'resolved';
      }) : new Promise( /*#__PURE__*/function () {
        var _ref7 = _rollupPluginBabelHelpers.asyncToGenerator( /*#__PURE__*/regeneratorRuntime.mark(function _callee2(resolveLoader) {
          var pendingTimeout, resolve, reject, finish;
          return regeneratorRuntime.wrap(function _callee2$(_context2) {
            while (1) {
              switch (_context2.prev = _context2.next) {
                case 0:
                  resolve = function resolve(data) {
                    _this5.status = 'resolved';
                    _this5.ownData = data;
                    _this5.error = undefined;
                  };

                  reject = function reject(err) {
                    console.error(err);
                    _this5.status = 'rejected';
                    _this5.error = err;
                  };

                  finish = function finish() {
                    _this5.isLoading = false;
                    _this5.startPending = undefined;
                    clearTimeout(pendingTimeout);
                    resolveLoader(_this5.ownData);
                    _this5.notify == null ? void 0 : _this5.notify(true);
                  };

                  _context2.prev = 3;
                  _this5.isLoading = true;
                  _context2.t0 = resolve;
                  _context2.next = 8;
                  return loader(_this5, {
                    parentMatch: opts.parentMatch,
                    dispatch: function () {
                      var _dispatch = _rollupPluginBabelHelpers.asyncToGenerator( /*#__PURE__*/regeneratorRuntime.mark(function _callee(event) {
                        return regeneratorRuntime.wrap(function _callee$(_context) {
                          while (1) {
                            switch (_context.prev = _context.next) {
                              case 0:
                                if (event.type === 'resolve') {
                                  resolve(event.data);
                                } else if (event.type === 'reject') {
                                  reject(event.error);
                                } else if (event.type === 'loading') {
                                  _this5.isLoading = true;
                                } else if (event.type === 'maxAge') {
                                  _this5.maxAge = event.maxAge;
                                }

                                _this5.updatedAt = Date.now();
                                _this5.notify == null ? void 0 : _this5.notify(true);

                              case 3:
                              case "end":
                                return _context.stop();
                            }
                          }
                        }, _callee);
                      }));

                      function dispatch(_x2) {
                        return _dispatch.apply(this, arguments);
                      }

                      return dispatch;
                    }()
                  });

                case 8:
                  _context2.t1 = _context2.sent;
                  (0, _context2.t0)(_context2.t1);
                  _context2.next = 12;
                  return _this5.pendingMinPromise;

                case 12:
                  finish();
                  _context2.next = 19;
                  break;

                case 15:
                  _context2.prev = 15;
                  _context2.t2 = _context2["catch"](3);
                  reject(_context2.t2);
                  finish();

                case 19:
                case "end":
                  return _context2.stop();
              }
            }
          }, _callee2, null, [[3, 15]]);
        }));

        return function (_x) {
          return _ref7.apply(this, arguments);
        };
      }());
      return Promise.all([].concat(elementPromises, [dataPromise])).then(function () {
        _this5.updatedAt = Date.now();
      });
    }).then(function () {
      return _this5.ownData;
    });
  };

  Object.assign(this, unloadedMatch);
};

var MatchLoader = /*#__PURE__*/function (_Subscribable3) {
  _rollupPluginBabelHelpers.inheritsLoose(MatchLoader, _Subscribable3);

  function MatchLoader(router, nextLocation) {
    var _this6;

    _this6 = _Subscribable3.call(this) || this;
    _this6.status = 'pending';

    _this6.preNotify = function (isSoft) {
      if (!isSoft) {
        _this6.status = 'resolved';
      }

      cascadeMatchData(_this6.matches);

      _this6.notify();
    };

    _this6.loadData = /*#__PURE__*/function () {
      var _ref8 = _rollupPluginBabelHelpers.asyncToGenerator( /*#__PURE__*/regeneratorRuntime.mark(function _callee3(_temp) {
        var _this6$matches;

        var _ref9, maxAge;

        return regeneratorRuntime.wrap(function _callee3$(_context3) {
          while (1) {
            switch (_context3.prev = _context3.next) {
              case 0:
                _ref9 = _temp === void 0 ? {} : _temp, maxAge = _ref9.maxAge;

                _this6.router.cleanMatchCache();

                if ((_this6$matches = _this6.matches) != null && _this6$matches.length) {
                  _context3.next = 5;
                  break;
                }

                _this6.preNotify();

                return _context3.abrupt("return");

              case 5:
                _this6.firstRenderPromises = [];

                _this6.matches.forEach(function (match, index) {
                  var _this6$matches2, _this6$firstRenderPro;

                  var parentMatch = (_this6$matches2 = _this6.matches) == null ? void 0 : _this6$matches2[index - 1];
                  match.assignMatchLoader == null ? void 0 : match.assignMatchLoader(_rollupPluginBabelHelpers.assertThisInitialized(_this6));
                  match.load == null ? void 0 : match.load({
                    maxAge: maxAge,
                    parentMatch: parentMatch,
                    router: _this6.router
                  });
                  (_this6$firstRenderPro = _this6.firstRenderPromises) == null ? void 0 : _this6$firstRenderPro.push(match.loaderPromise);
                });

                _context3.next = 9;
                return Promise.all(_this6.firstRenderPromises).then(function () {
                  _this6.preNotify();

                  return _this6.matches;
                });

              case 9:
                return _context3.abrupt("return", _context3.sent);

              case 10:
              case "end":
                return _context3.stop();
            }
          }
        }, _callee3);
      }));

      return function (_x3) {
        return _ref8.apply(this, arguments);
      };
    }();

    _this6.load = /*#__PURE__*/function () {
      var _ref10 = _rollupPluginBabelHelpers.asyncToGenerator( /*#__PURE__*/regeneratorRuntime.mark(function _callee4(_temp2) {
        var _ref11, maxAge;

        return regeneratorRuntime.wrap(function _callee4$(_context4) {
          while (1) {
            switch (_context4.prev = _context4.next) {
              case 0:
                _ref11 = _temp2 === void 0 ? {} : _temp2, maxAge = _ref11.maxAge;
                _context4.next = 3;
                return _this6.loadData({
                  maxAge: maxAge
                });

              case 3:
                return _context4.abrupt("return", _context4.sent);

              case 4:
              case "end":
                return _context4.stop();
            }
          }
        }, _callee4);
      }));

      return function (_x4) {
        return _ref10.apply(this, arguments);
      };
    }();

    _this6.startPending = /*#__PURE__*/_rollupPluginBabelHelpers.asyncToGenerator( /*#__PURE__*/regeneratorRuntime.mark(function _callee5() {
      return regeneratorRuntime.wrap(function _callee5$(_context5) {
        while (1) {
          switch (_context5.prev = _context5.next) {
            case 0:
              _this6.matches.forEach(function (match) {
                return match.startPending == null ? void 0 : match.startPending();
              });

            case 1:
            case "end":
              return _context5.stop();
          }
        }
      }, _callee5);
    }));
    _this6.router = router;
    _this6.location = nextLocation;
    _this6.matches = [];
    var unloadedMatches = matchRoutes(_this6.router, _this6.location);
    _this6.matches = unloadedMatches == null ? void 0 : unloadedMatches.map(function (unloadedMatch) {
      if (!_this6.router.matchCache[unloadedMatch.id]) {
        _this6.router.matchCache[unloadedMatch.id] = new RouteMatch(unloadedMatch);
      }

      return _this6.router.matchCache[unloadedMatch.id];
    });
    return _this6;
  }

  return MatchLoader;
}(Subscribable);

function cascadeMatchData(matches) {
  matches == null ? void 0 : matches.forEach(function (match, index) {
    var _parentMatch$data;

    var parentMatch = matches == null ? void 0 : matches[index - 1];
    match.data = _rollupPluginBabelHelpers["extends"]({}, (_parentMatch$data = parentMatch == null ? void 0 : parentMatch.data) != null ? _parentMatch$data : {}, match.ownData);
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

  var recurse = /*#__PURE__*/function () {
    var _ref13 = _rollupPluginBabelHelpers.asyncToGenerator( /*#__PURE__*/regeneratorRuntime.mark(function _callee6(routes, parentMatch) {
      var _route$children3;

      var pathname, params, filteredRoutes, route, interpolatedPath, interpolatedId, match;
      return regeneratorRuntime.wrap(function _callee6$(_context6) {
        while (1) {
          switch (_context6.prev = _context6.next) {
            case 0:
              pathname = parentMatch.pathname, params = parentMatch.params;
              filteredRoutes = router != null && router.filterRoutes ? router == null ? void 0 : router.filterRoutes(routes) : routes;
              route = filteredRoutes.find(function (route) {
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
                  params = _rollupPluginBabelHelpers["extends"]({}, params, matchParams);
                }

                return !!matchParams;
              });

              if (route) {
                _context6.next = 5;
                break;
              }

              return _context6.abrupt("return");

            case 5:
              interpolatedPath = interpolatePath(route.path, params);
              pathname = joinPaths([pathname, interpolatedPath]);
              interpolatedId = interpolatePath(route.id, params, true);
              match = {
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

            case 11:
            case "end":
              return _context6.stop();
          }
        }
      }, _callee6);
    }));

    return function recurse(_x5, _x6) {
      return _ref13.apply(this, arguments);
    };
  }();

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
  return useLatestCallback( /*#__PURE__*/function () {
    var _ref14 = _rollupPluginBabelHelpers.asyncToGenerator( /*#__PURE__*/regeneratorRuntime.mark(function _callee7(navigate, opts) {
      var _navigate$from;

      var next, matchLoader;
      return regeneratorRuntime.wrap(function _callee7$(_context7) {
        while (1) {
          switch (_context7.prev = _context7.next) {
            case 0:
              if (navigate === void 0) {
                navigate = location.current;
              }

              next = buildNext(_rollupPluginBabelHelpers["extends"]({}, navigate, {
                from: (_navigate$from = navigate.from) != null ? _navigate$from : {
                  pathname: match.pathname
                }
              }));
              matchLoader = new MatchLoader(router, next);
              _context7.next = 5;
              return matchLoader.load(opts);

            case 5:
              return _context7.abrupt("return", _context7.sent);

            case 6:
            case "end":
              return _context7.stop();
          }
        }
      }, _callee7);
    }));

    return function (_x7, _x8) {
      return _ref14.apply(this, arguments);
    };
  }());
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

  function navigate(_ref15) {
    var _fromCurrent;

    var search = _ref15.search,
        hash = _ref15.hash,
        replace = _ref15.replace,
        from = _ref15.from,
        to = _ref15.to,
        fromCurrent = _ref15.fromCurrent;
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

    return location.buildNext(router.basepath, _rollupPluginBabelHelpers["extends"]({}, opts, {
      __searchFilters: __searchFilters
    }));
  };

  return useLatestCallback(buildNext);
}

var Link = function Link(_ref16) {
  var _preload;

  var _ref16$to = _ref16.to,
      to = _ref16$to === void 0 ? '.' : _ref16$to,
      search = _ref16.search,
      hash = _ref16.hash,
      children = _ref16.children,
      target = _ref16.target,
      _ref16$style = _ref16.style,
      style = _ref16$style === void 0 ? {} : _ref16$style,
      replace = _ref16.replace,
      onClick = _ref16.onClick,
      onMouseEnter = _ref16.onMouseEnter,
      _ref16$className = _ref16.className,
      className = _ref16$className === void 0 ? '' : _ref16$className,
      _ref16$getActiveProps = _ref16.getActiveProps,
      getActiveProps = _ref16$getActiveProps === void 0 ? function () {
    return {};
  } : _ref16$getActiveProps,
      _ref16$getInactivePro = _ref16.getInactiveProps,
      getInactiveProps = _ref16$getInactivePro === void 0 ? function () {
    return {};
  } : _ref16$getInactivePro,
      activeOptions = _ref16.activeOptions,
      preload = _ref16.preload,
      disabled = _ref16.disabled,
      _ref = _ref16._ref,
      rest = _rollupPluginBabelHelpers.objectWithoutPropertiesLoose(_ref16, _excluded4);

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

  var _ref17 = isActive ? getActiveProps() : {},
      _ref17$style = _ref17.style,
      activeStyle = _ref17$style === void 0 ? {} : _ref17$style,
      _ref17$className = _ref17.className,
      activeClassName = _ref17$className === void 0 ? '' : _ref17$className,
      activeRest = _rollupPluginBabelHelpers.objectWithoutPropertiesLoose(_ref17, _excluded5); // Get the inactive props


  var _ref18 = isActive ? {} : getInactiveProps(),
      _ref18$style = _ref18.style,
      inactiveStyle = _ref18$style === void 0 ? {} : _ref18$style,
      _ref18$className = _ref18.className,
      inactiveClassName = _ref18$className === void 0 ? '' : _ref18$className,
      inactiveRest = _rollupPluginBabelHelpers.objectWithoutPropertiesLoose(_ref18, _excluded6);

  return /*#__PURE__*/React__namespace.createElement("a", _rollupPluginBabelHelpers["extends"]({
    ref: _ref,
    href: disabled ? undefined : next.href,
    onClick: handleClick,
    onMouseEnter: handleMouseEnter,
    target: target,
    style: _rollupPluginBabelHelpers["extends"]({}, style, activeStyle, inactiveStyle),
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
            style: _rollupPluginBabelHelpers["extends"]({}, preStyle, {
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
  return useLatestCallback(function (_ref19) {
    var pending = _ref19.pending,
        matchLocation = _rollupPluginBabelHelpers.objectWithoutPropertiesLoose(_ref19, _excluded7);

    matchLocation = _rollupPluginBabelHelpers["extends"]({}, matchLocation, {
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
function MatchRoute(_ref20) {
  var children = _ref20.children,
      rest = _rollupPluginBabelHelpers.objectWithoutPropertiesLoose(_ref20, _excluded8);

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
function Prompt(_ref21) {
  var message = _ref21.message,
      when = _ref21.when,
      children = _ref21.children;
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
  search = _rollupPluginBabelHelpers["extends"]({}, search);

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
exports.RouteMatch = RouteMatch;
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
