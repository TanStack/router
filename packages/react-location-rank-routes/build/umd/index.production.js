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
!function(e,t){"object"==typeof exports&&"undefined"!=typeof module?t(exports,require("@tanstack/react-location")):"function"==typeof define&&define.amd?define(["exports","@tanstack/react-location"],t):t((e="undefined"!=typeof globalThis?globalThis:e||self).ReactLocationRankRoutes={},e.ReactLocation)}(this,(function(e,t){"use strict";function n(){return n=Object.assign||function(e){for(var t=1;t<arguments.length;t++){var n=arguments[t];for(var r in n)Object.prototype.hasOwnProperty.call(n,r)&&(e[r]=n[r])}return e},n.apply(this,arguments)}e.rankRoutes=function(e){return[].concat(e).map((function(e,t){return n({},e,{index:t})})).sort((function(e,n){if(e.search||n.search){if(!n.search)return-1;if(!e.search)return 1}for(var r=t.parsePathname(e.path),a=t.parsePathname(n.path),o=function(e){var t=r[e],n=a[e];if(!t||!n)return{v:t?-1:1};var o=0;return[{key:"value",value:"*"},{key:"value",value:"/"},{key:"type",value:"param"}].some((function(e){return!(![t[e.key],n[e.key]].includes(e.value)||t[e.key]===n[e.key])&&(o=t[e.key]===e.value?1:-1,!0)})),0!==o?{v:o}:void 0},i=0;i<r.length;i++){var u=o(i);if("object"==typeof u)return u.v}return e.index-n.index}))},Object.defineProperty(e,"__esModule",{value:!0})}));
//# sourceMappingURL=index.production.js.map
