/**
 * react-location-jsurl
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
var jsurl = require('./jsurl.js');
var qss = require('./qss.js');

function stringifySearch(search) {
  search = _extends["default"]({}, search);

  if (search) {
    Object.keys(search).forEach(function (key) {
      var val = search[key];

      if (typeof val === 'undefined' || val === undefined) {
        delete search[key];
      } else if (val && typeof val === 'object' && val !== null) {
        try {
          search[key] = jsurl.stringify(val);
        } catch (err) {// silent
        }
      }
    });
  }

  var searchStr = qss.encode(search).toString();
  return searchStr ? "?" + searchStr : '';
}
function parseSearch(searchStr) {
  if (searchStr.substring(0, 1) === '?') {
    searchStr = searchStr.substring(1);
  }

  var query = qss.decode(searchStr); // Try to parse any query params that might be json

  for (var key in query) {
    var value = query[key];

    if (typeof value === 'string') {
      try {
        query[key] = jsurl.parse(value);
      } catch (err) {//
      }
    }
  }

  return query;
}

exports.parseSearch = parseSearch;
exports.stringifySearch = stringifySearch;
//# sourceMappingURL=index.js.map
