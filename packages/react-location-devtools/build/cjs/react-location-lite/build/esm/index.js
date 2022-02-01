/**
 * react-location-devtools
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
var routerContext = /*#__PURE__*/React__namespace.createContext(null); // Detect if we're in the DOM
function useRouter() {
  var value = React__namespace.useContext(routerContext);

  if (!value) {
    warning(true, 'You are trying to use useRouter() outside of ReactLocation!');
    throw new Error();
  }

  return value;
}

function warning(cond, message) {
  if (!cond) {
    if (typeof console !== 'undefined') console.warn(message);

    try {
      throw new Error(message);
    } catch (_unused) {}
  }
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
exports.useRouter = useRouter;
//# sourceMappingURL=index.js.map
