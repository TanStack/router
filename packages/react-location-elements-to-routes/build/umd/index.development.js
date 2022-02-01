/**
 * react-location-elements-to-routes
 *
 * Copyright (c) TanStack
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE.md file in the root directory of this source tree.
 *
 * @license MIT
 */
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('react')) :
  typeof define === 'function' && define.amd ? define(['exports', 'react'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.ReactLocationElementsToRoutes = {}, global.React));
})(this, (function (exports, React) { 'use strict';

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

  function Route(_props) {
    return null;
  }
  function elementsToRoutes(children) {
    var routes = [];
    React__namespace.Children.forEach(children, function (element) {
      if (! /*#__PURE__*/React__namespace.isValidElement(element)) return;

      if (element.type === React__namespace.Fragment) {
        routes.push.apply(routes, elementsToRoutes(element.props.children));
        return;
      }

      if (!element.type === Route) {
        if (process.env.node_env !== 'production') {
          console.warn('elementsToRoutes only supports <Route> and <React.Fragment> elements.');
        }

        throw new Error();
      }

      var route = _extends({}, element.props);

      if (element.props.children) {
        route.children = elementsToRoutes(element.props.children);
      }

      routes.push(route);
    });
    return routes;
  }

  exports.Route = Route;
  exports.elementsToRoutes = elementsToRoutes;

  Object.defineProperty(exports, '__esModule', { value: true });

}));
//# sourceMappingURL=index.development.js.map
