/**
 * react-location-rank-routes
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

var _extends = require('../../../node_modules/@babel/runtime/helpers/esm/extends.js');
var reactLocation = require('react-location');

function rankRoutes(routes) {
  return [].concat(routes).map(function (d, i) {
    return _extends["default"]({}, d, {
      index: i
    });
  }).sort(function (a, b) {
    if (a.search || b.search) {
      if (!b.search) {
        return -1;
      }

      if (!a.search) {
        return 1;
      }
    }

    var aSegments = reactLocation.parsePathname(a.path);
    var bSegments = reactLocation.parsePathname(b.path); // Multi-sort by each segment

    var _loop = function _loop(i) {
      var aSegment = aSegments[i];
      var bSegment = bSegments[i];

      if (aSegment && bSegment) {
        var sort = 0;
        [{
          key: 'value',
          value: '*'
        }, {
          key: 'value',
          value: '/'
        }, {
          key: 'type',
          value: 'param'
        }].some(function (condition) {
          if ([aSegment[condition.key], bSegment[condition.key]].includes(condition.value) && aSegment[condition.key] !== bSegment[condition.key]) {
            sort = aSegment[condition.key] === condition.value ? 1 : -1;
            return true;
          }

          return false;
        });

        if (sort !== 0) {
          return {
            v: sort
          };
        }
      } else {
        // Then shorter segments last
        return {
          v: aSegment ? -1 : 1
        };
      }
    };

    for (var i = 0; i < aSegments.length; i++) {
      var _ret = _loop(i);

      if (typeof _ret === "object") return _ret.v;
    } // Keep things stable by route index


    return a.index - b.index;
  });
}

exports.rankRoutes = rankRoutes;
//# sourceMappingURL=index.js.map
