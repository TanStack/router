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
import * as React from 'react';

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
  React.Children.forEach(children, function (element) {
    if (! /*#__PURE__*/React.isValidElement(element)) return;

    if (element.type === React.Fragment) {
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

export { Route, elementsToRoutes };
//# sourceMappingURL=index.js.map
