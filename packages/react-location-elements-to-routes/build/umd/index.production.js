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
!function(e,t){"object"==typeof exports&&"undefined"!=typeof module?t(exports,require("react")):"function"==typeof define&&define.amd?define(["exports","react"],t):t((e="undefined"!=typeof globalThis?globalThis:e||self).ReactLocationElementsToRoutes={},e.React)}(this,(function(e,t){"use strict";function n(e){if(e&&e.__esModule)return e;var t=Object.create(null);return e&&Object.keys(e).forEach((function(n){if("default"!==n){var r=Object.getOwnPropertyDescriptor(e,n);Object.defineProperty(t,n,r.get?r:{enumerable:!0,get:function(){return e[n]}})}})),t.default=e,Object.freeze(t)}var r=n(t);function o(){return o=Object.assign||function(e){for(var t=1;t<arguments.length;t++){var n=arguments[t];for(var r in n)Object.prototype.hasOwnProperty.call(n,r)&&(e[r]=n[r])}return e},o.apply(this,arguments)}function i(e){return null}e.Route=i,e.elementsToRoutes=function e(t){var n=[];return r.Children.forEach(t,(function(t){if(r.isValidElement(t))if(t.type!==r.Fragment){if(!t.type===i)throw"production"!==process.env.node_env&&console.warn("elementsToRoutes only supports <Route> and <React.Fragment> elements."),new Error;var u=o({},t.props);t.props.children&&(u.children=e(t.props.children)),n.push(u)}else n.push.apply(n,e(t.props.children))})),n},Object.defineProperty(e,"__esModule",{value:!0})}));
//# sourceMappingURL=index.production.js.map
