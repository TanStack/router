/**
 * react-location-simple-cache
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

//
var ReactLocationSimpleCache = /*#__PURE__*/function () {
  function ReactLocationSimpleCache() {
    this.records = {};
  }

  var _proto = ReactLocationSimpleCache.prototype;

  _proto.createLoader = function createLoader(loader, opts) {
    var _opts$maxAge,
        _opts$policy,
        _this = this;

    var maxAge = (_opts$maxAge = opts == null ? void 0 : opts.maxAge) != null ? _opts$maxAge : 0;
    var policy = (_opts$policy = opts == null ? void 0 : opts.policy) != null ? _opts$policy : 'cache-and-network';

    var cachedLoader = /*#__PURE__*/function () {
      var _ref = _rollupPluginBabelHelpers.asyncToGenerator( /*#__PURE__*/regeneratorRuntime.mark(function _callee2(match, loaderOptions) {
        var key, entry, doFetch;
        return regeneratorRuntime.wrap(function _callee2$(_context2) {
          while (1) {
            switch (_context2.prev = _context2.next) {
              case 0:
                // Cache on pathname
                key = opts != null && opts.key ? opts.key(match) : match.pathname; // No cache? Create it.

                if (!_this.records[key]) {
                  _this.records[key] = {
                    key: key,
                    updatedAt: 0,
                    ready: false,
                    match: match
                  };
                }

                entry = _this.records[key];
                Object.assign(entry, {
                  match: match,
                  loaderOptions: loaderOptions
                });

                doFetch = /*#__PURE__*/function () {
                  var _ref2 = _rollupPluginBabelHelpers.asyncToGenerator( /*#__PURE__*/regeneratorRuntime.mark(function _callee() {
                    var data;
                    return regeneratorRuntime.wrap(function _callee$(_context) {
                      while (1) {
                        switch (_context.prev = _context.next) {
                          case 0:
                            loaderOptions.dispatch({
                              type: 'loading'
                            });
                            _context.prev = 1;
                            _context.next = 4;
                            return loader(match, loaderOptions);

                          case 4:
                            data = _context.sent;
                            entry.updatedAt = Date.now();
                            entry.ready = true;
                            entry.data = data;
                            loaderOptions.dispatch({
                              type: 'resolve',
                              data: data
                            });
                            return _context.abrupt("return", data);

                          case 12:
                            _context.prev = 12;
                            _context.t0 = _context["catch"](1);
                            loaderOptions.dispatch({
                              type: 'reject',
                              error: _context.t0
                            });
                            throw _context.t0;

                          case 16:
                          case "end":
                            return _context.stop();
                        }
                      }
                    }, _callee, null, [[1, 12]]);
                  }));

                  return function doFetch() {
                    return _ref2.apply(this, arguments);
                  };
                }();

                if (!(policy === 'network-only')) {
                  _context2.next = 9;
                  break;
                }

                _context2.next = 8;
                return doFetch();

              case 8:
                return _context2.abrupt("return", _context2.sent);

              case 9:
                if (entry.updatedAt) {
                  _context2.next = 12;
                  break;
                }

                _context2.next = 12;
                return doFetch();

              case 12:
                if (!(policy === 'cache-first')) {
                  _context2.next = 14;
                  break;
                }

                return _context2.abrupt("return", entry.data);

              case 14:
                if (Date.now() - entry.updatedAt > maxAge) {
                  doFetch();
                }

                return _context2.abrupt("return", entry.data);

              case 16:
              case "end":
                return _context2.stop();
            }
          }
        }, _callee2);
      }));

      return function cachedLoader(_x, _x2) {
        return _ref.apply(this, arguments);
      };
    }();

    return cachedLoader;
  };

  _proto.filter = function filter(fn) {
    var _this2 = this;

    return Object.keys(this.records).filter(function (key) {
      return fn(_this2.records[key]);
    }).map(function (d) {
      return _this2.records[d];
    });
  };

  _proto.find = function find(fn) {
    return this.filter(fn)[0];
  };

  _proto.invalidate = function invalidate(fn) {
    var records = this.filter(fn);
    records.forEach(function (record) {
      record.invalid = true;
    });
  };

  _proto.removeAll = function removeAll() {
    this.records = {};
  };

  _proto.remove = function remove(fn) {
    var _this3 = this;

    this.filter(fn).forEach(function (record) {
      delete _this3.records[record.key];
    });
  };

  return ReactLocationSimpleCache;
}();

exports.ReactLocationSimpleCache = ReactLocationSimpleCache;
//# sourceMappingURL=index.js.map
