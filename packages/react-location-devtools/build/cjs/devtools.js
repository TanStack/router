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

var _rollupPluginBabelHelpers = require('./_virtual/_rollupPluginBabelHelpers.js');
var React = require('react');
var reactLocation = require('@tanstack/react-location');
var useLocalStorage = require('./useLocalStorage.js');
var utils = require('./utils.js');
var styledComponents = require('./styledComponents.js');
var theme = require('./theme.js');
var Explorer = require('./Explorer.js');
var Logo = require('./Logo.js');

function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

var React__default = /*#__PURE__*/_interopDefaultLegacy(React);

var _excluded = ["style"],
    _excluded2 = ["style", "onClick"],
    _excluded3 = ["style", "onClick"],
    _excluded4 = ["isOpen", "setIsOpen", "handleDragStart", "useRouter"];
var isServer = typeof window === 'undefined';
function ReactLocationDevtools(_ref) {
  var initialIsOpen = _ref.initialIsOpen,
      _ref$panelProps = _ref.panelProps,
      panelProps = _ref$panelProps === void 0 ? {} : _ref$panelProps,
      _ref$closeButtonProps = _ref.closeButtonProps,
      closeButtonProps = _ref$closeButtonProps === void 0 ? {} : _ref$closeButtonProps,
      _ref$toggleButtonProp = _ref.toggleButtonProps,
      toggleButtonProps = _ref$toggleButtonProp === void 0 ? {} : _ref$toggleButtonProp,
      _ref$position = _ref.position,
      position = _ref$position === void 0 ? 'bottom-left' : _ref$position,
      _ref$containerElement = _ref.containerElement,
      Container = _ref$containerElement === void 0 ? 'footer' : _ref$containerElement,
      _ref$useRouter = _ref.useRouter,
      useRouterImpl = _ref$useRouter === void 0 ? reactLocation.useRouter : _ref$useRouter;
  var rootRef = React__default["default"].useRef(null);
  var panelRef = React__default["default"].useRef(null);

  var _useLocalStorage = useLocalStorage["default"]('reactLocationDevtoolsOpen', initialIsOpen),
      isOpen = _useLocalStorage[0],
      setIsOpen = _useLocalStorage[1];

  var _useLocalStorage2 = useLocalStorage["default"]('reactLocationDevtoolsHeight', null),
      devtoolsHeight = _useLocalStorage2[0],
      setDevtoolsHeight = _useLocalStorage2[1];

  var _useSafeState = utils.useSafeState(false),
      isResolvedOpen = _useSafeState[0],
      setIsResolvedOpen = _useSafeState[1];

  var _useSafeState2 = utils.useSafeState(false),
      isResizing = _useSafeState2[0],
      setIsResizing = _useSafeState2[1];

  var isMounted = utils.useIsMounted();

  var _handleDragStart = function handleDragStart(panelElement, startEvent) {
    var _panelElement$getBoun;

    if (startEvent.button !== 0) return; // Only allow left click for drag

    setIsResizing(true);
    var dragInfo = {
      originalHeight: (_panelElement$getBoun = panelElement == null ? void 0 : panelElement.getBoundingClientRect().height) != null ? _panelElement$getBoun : 0,
      pageY: startEvent.pageY
    };

    var run = function run(moveEvent) {
      var delta = dragInfo.pageY - moveEvent.pageY;
      var newHeight = (dragInfo == null ? void 0 : dragInfo.originalHeight) + delta;
      setDevtoolsHeight(newHeight);

      if (newHeight < 70) {
        setIsOpen(false);
      } else {
        setIsOpen(true);
      }
    };

    var unsub = function unsub() {
      setIsResizing(false);
      document.removeEventListener('mousemove', run);
      document.removeEventListener('mouseUp', unsub);
    };

    document.addEventListener('mousemove', run);
    document.addEventListener('mouseup', unsub);
  };

  React__default["default"].useEffect(function () {
    setIsResolvedOpen(isOpen != null ? isOpen : false);
  }, [isOpen, isResolvedOpen, setIsResolvedOpen]); // Toggle panel visibility before/after transition (depending on direction).
  // Prevents focusing in a closed panel.

  React__default["default"].useEffect(function () {
    var ref = panelRef.current;

    if (ref) {
      var handlePanelTransitionStart = function handlePanelTransitionStart() {
        if (ref && isResolvedOpen) {
          ref.style.visibility = 'visible';
        }
      };

      var handlePanelTransitionEnd = function handlePanelTransitionEnd() {
        if (ref && !isResolvedOpen) {
          ref.style.visibility = 'hidden';
        }
      };

      ref.addEventListener('transitionstart', handlePanelTransitionStart);
      ref.addEventListener('transitionend', handlePanelTransitionEnd);
      return function () {
        ref.removeEventListener('transitionstart', handlePanelTransitionStart);
        ref.removeEventListener('transitionend', handlePanelTransitionEnd);
      };
    }
  }, [isResolvedOpen]);
  React__default["default"][isServer ? 'useEffect' : 'useLayoutEffect'](function () {
    if (isResolvedOpen) {
      var _rootRef$current, _rootRef$current$pare;

      var previousValue = (_rootRef$current = rootRef.current) == null ? void 0 : (_rootRef$current$pare = _rootRef$current.parentElement) == null ? void 0 : _rootRef$current$pare.style.paddingBottom;

      var run = function run() {
        var _panelRef$current, _rootRef$current2;

        var containerHeight = (_panelRef$current = panelRef.current) == null ? void 0 : _panelRef$current.getBoundingClientRect().height;

        if ((_rootRef$current2 = rootRef.current) != null && _rootRef$current2.parentElement) {
          rootRef.current.parentElement.style.paddingBottom = containerHeight + "px";
        }
      };

      run();

      if (typeof window !== 'undefined') {
        window.addEventListener('resize', run);
        return function () {
          var _rootRef$current3;

          window.removeEventListener('resize', run);

          if ((_rootRef$current3 = rootRef.current) != null && _rootRef$current3.parentElement && typeof previousValue === 'string') {
            rootRef.current.parentElement.style.paddingBottom = previousValue;
          }
        };
      }
    }
  }, [isResolvedOpen]);

  var _panelProps$style = panelProps.style,
      panelStyle = _panelProps$style === void 0 ? {} : _panelProps$style,
      otherPanelProps = _rollupPluginBabelHelpers.objectWithoutPropertiesLoose(panelProps, _excluded);

  var _closeButtonProps$sty = closeButtonProps.style,
      closeButtonStyle = _closeButtonProps$sty === void 0 ? {} : _closeButtonProps$sty,
      onCloseClick = closeButtonProps.onClick,
      otherCloseButtonProps = _rollupPluginBabelHelpers.objectWithoutPropertiesLoose(closeButtonProps, _excluded2);

  var _toggleButtonProps$st = toggleButtonProps.style,
      toggleButtonStyle = _toggleButtonProps$st === void 0 ? {} : _toggleButtonProps$st,
      onToggleClick = toggleButtonProps.onClick,
      otherToggleButtonProps = _rollupPluginBabelHelpers.objectWithoutPropertiesLoose(toggleButtonProps, _excluded3); // Do not render on the server


  if (!isMounted()) return null;
  return /*#__PURE__*/React__default["default"].createElement(Container, {
    ref: rootRef,
    className: "ReactLocationDevtools"
  }, /*#__PURE__*/React__default["default"].createElement(theme.ThemeProvider, {
    theme: theme.defaultTheme
  }, /*#__PURE__*/React__default["default"].createElement(ReactLocationDevtoolsPanel, _rollupPluginBabelHelpers["extends"]({
    ref: panelRef
  }, otherPanelProps, {
    useRouter: useRouterImpl,
    style: _rollupPluginBabelHelpers["extends"]({
      position: 'fixed',
      bottom: '0',
      right: '0',
      zIndex: 99999,
      width: '100%',
      height: devtoolsHeight != null ? devtoolsHeight : 500,
      maxHeight: '90%',
      boxShadow: '0 0 20px rgba(0,0,0,.3)',
      borderTop: "1px solid " + theme.defaultTheme.gray,
      transformOrigin: 'top',
      // visibility will be toggled after transitions, but set initial state here
      visibility: isOpen ? 'visible' : 'hidden'
    }, panelStyle, isResizing ? {
      transition: "none"
    } : {
      transition: "all .2s ease"
    }, isResolvedOpen ? {
      opacity: 1,
      pointerEvents: 'all',
      transform: "translateY(0) scale(1)"
    } : {
      opacity: 0,
      pointerEvents: 'none',
      transform: "translateY(15px) scale(1.02)"
    }),
    isOpen: isResolvedOpen,
    setIsOpen: setIsOpen,
    handleDragStart: function handleDragStart(e) {
      return _handleDragStart(panelRef.current, e);
    }
  })), isResolvedOpen ? /*#__PURE__*/React__default["default"].createElement(styledComponents.Button, _rollupPluginBabelHelpers["extends"]({
    type: "button",
    "aria-label": "Close React Location Devtools"
  }, otherCloseButtonProps, {
    onClick: function onClick(e) {
      setIsOpen(false);
      onCloseClick && onCloseClick(e);
    },
    style: _rollupPluginBabelHelpers["extends"]({
      position: 'fixed',
      zIndex: 99999,
      margin: '.5em',
      bottom: 0
    }, position === 'top-right' ? {
      right: '0'
    } : position === 'top-left' ? {
      left: '0'
    } : position === 'bottom-right' ? {
      right: '0'
    } : {
      left: '0'
    }, closeButtonStyle)
  }), "Close") : null), !isResolvedOpen ? /*#__PURE__*/React__default["default"].createElement("button", _rollupPluginBabelHelpers["extends"]({
    type: "button"
  }, otherToggleButtonProps, {
    "aria-label": "Open React Location Devtools",
    onClick: function onClick(e) {
      setIsOpen(true);
      onToggleClick && onToggleClick(e);
    },
    style: _rollupPluginBabelHelpers["extends"]({
      background: 'none',
      border: 0,
      padding: 0,
      position: 'fixed',
      zIndex: 99999,
      display: 'inline-flex',
      fontSize: '1.5em',
      margin: '.5em',
      cursor: 'pointer',
      width: 'fit-content'
    }, position === 'top-right' ? {
      top: '0',
      right: '0'
    } : position === 'top-left' ? {
      top: '0',
      left: '0'
    } : position === 'bottom-right' ? {
      bottom: '0',
      right: '0'
    } : {
      bottom: '0',
      left: '0'
    }, toggleButtonStyle)
  }), /*#__PURE__*/React__default["default"].createElement(Logo["default"], {
    "aria-hidden": true
  })) : null);
}
var ReactLocationDevtoolsPanel = /*#__PURE__*/React__default["default"].forwardRef(function ReactLocationDevtoolsPanel(props, ref) {
  var _router$state$matches, _router$pending;

  props.isOpen;
      props.setIsOpen;
      var handleDragStart = props.handleDragStart,
      useRouter = props.useRouter,
      panelProps = _rollupPluginBabelHelpers.objectWithoutPropertiesLoose(props, _excluded4);

  var router = useRouter();

  var _useLocalStorage3 = useLocalStorage["default"]('reactLocationDevtoolsActiveRouteId', ''),
      activeMatchId = _useLocalStorage3[0],
      setActiveRouteId = _useLocalStorage3[1];

  var activeMatch = (_router$state$matches = router.state.matches) == null ? void 0 : _router$state$matches.find(function (d) {
    return d.id === activeMatchId;
  });
  return /*#__PURE__*/React__default["default"].createElement(theme.ThemeProvider, {
    theme: theme.defaultTheme
  }, /*#__PURE__*/React__default["default"].createElement(styledComponents.Panel, _rollupPluginBabelHelpers["extends"]({
    ref: ref,
    className: "ReactLocationDevtoolsPanel"
  }, panelProps), /*#__PURE__*/React__default["default"].createElement("style", {
    dangerouslySetInnerHTML: {
      __html: "\n            .ReactLocationDevtoolsPanel * {\n              scrollbar-color: " + theme.defaultTheme.backgroundAlt + " " + theme.defaultTheme.gray + ";\n            }\n\n            .ReactLocationDevtoolsPanel *::-webkit-scrollbar, .ReactLocationDevtoolsPanel scrollbar {\n              width: 1em;\n              height: 1em;\n            }\n\n            .ReactLocationDevtoolsPanel *::-webkit-scrollbar-track, .ReactLocationDevtoolsPanel scrollbar-track {\n              background: " + theme.defaultTheme.backgroundAlt + ";\n            }\n\n            .ReactLocationDevtoolsPanel *::-webkit-scrollbar-thumb, .ReactLocationDevtoolsPanel scrollbar-thumb {\n              background: " + theme.defaultTheme.gray + ";\n              border-radius: .5em;\n              border: 3px solid " + theme.defaultTheme.backgroundAlt + ";\n            }\n          "
    }
  }), /*#__PURE__*/React__default["default"].createElement("div", {
    style: {
      position: 'absolute',
      left: 0,
      top: 0,
      width: '100%',
      height: '4px',
      marginBottom: '-4px',
      cursor: 'row-resize',
      zIndex: 100000
    },
    onMouseDown: handleDragStart
  }), /*#__PURE__*/React__default["default"].createElement("div", {
    style: {
      flex: '1 1 500px',
      minHeight: '40%',
      maxHeight: '100%',
      overflow: 'auto',
      borderRight: "1px solid " + theme.defaultTheme.grayAlt,
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React__default["default"].createElement("div", {
    style: {
      padding: '.5em',
      background: theme.defaultTheme.backgroundAlt,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React__default["default"].createElement(Logo["default"], {
    "aria-hidden": true,
    style: {
      marginRight: '.5em'
    }
  }), /*#__PURE__*/React__default["default"].createElement("div", {
    style: {
      marginRight: 'auto',
      fontSize: 'clamp(.8rem, 2vw, 1.3rem)',
      fontWeight: 'bold'
    }
  }, "React Location", ' ', /*#__PURE__*/React__default["default"].createElement("span", {
    style: {
      fontWeight: 100
    }
  }, "Devtools")), /*#__PURE__*/React__default["default"].createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column'
    }
  })), /*#__PURE__*/React__default["default"].createElement("div", {
    style: {
      overflowY: 'auto',
      flex: '1'
    }
  }, /*#__PURE__*/React__default["default"].createElement("div", {
    style: {
      padding: '.5em'
    }
  }, /*#__PURE__*/React__default["default"].createElement(Explorer["default"], {
    label: "Location",
    value: router.state.location,
    defaultExpanded: {
      search: true
    }
  })), /*#__PURE__*/React__default["default"].createElement("div", {
    style: {
      padding: '.5em'
    }
  }, /*#__PURE__*/React__default["default"].createElement(Explorer["default"], {
    label: "Router",
    value: {
      basepath: router.basepath,
      routes: router.routes,
      routesById: router.routesById,
      matchCache: router.matchCache,
      defaultLinkPreloadMaxAge: router.defaultLinkPreloadMaxAge,
      defaultLoaderMaxAge: router.defaultLoaderMaxAge,
      defaultPendingMinMs: router.defaultPendingMinMs,
      defaultPendingMs: router.defaultPendingMs,
      defaultElement: router.defaultElement,
      defaultErrorElement: router.defaultErrorElement,
      defaultPendingElement: router.defaultPendingElement
    },
    defaultExpanded: {}
  })))), /*#__PURE__*/React__default["default"].createElement("div", {
    style: {
      flex: '1 1 500px',
      minHeight: '40%',
      maxHeight: '100%',
      overflow: 'auto',
      borderRight: "1px solid " + theme.defaultTheme.grayAlt,
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React__default["default"].createElement("div", {
    style: {
      padding: '.5em',
      background: theme.defaultTheme.backgroundAlt,
      position: 'sticky',
      top: 0,
      zIndex: 1
    }
  }, "Current Matches"), router.state.matches.map(function (match, i) {
    return /*#__PURE__*/React__default["default"].createElement("div", {
      key: match.id || i,
      role: "button",
      "aria-label": "Open match details for " + match.id,
      onClick: function onClick() {
        return setActiveRouteId(activeMatchId === match.id ? '' : match.id);
      },
      style: {
        display: 'flex',
        borderBottom: "solid 1px " + theme.defaultTheme.grayAlt,
        cursor: 'pointer',
        alignItems: 'center',
        background: match === activeMatch ? 'rgba(255,255,255,.1)' : undefined
      }
    }, /*#__PURE__*/React__default["default"].createElement("div", {
      style: {
        flex: '0 0 auto',
        width: '1.3rem',
        height: '1.3rem',
        marginLeft: '.25rem',
        background: utils.getStatusColor(match, theme.defaultTheme),
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 'bold',
        borderRadius: '.25rem',
        transition: 'all .2s ease-out'
      }
    }), /*#__PURE__*/React__default["default"].createElement(styledComponents.Code, {
      style: {
        padding: '.5em'
      }
    }, "" + match.id));
  }), /*#__PURE__*/React__default["default"].createElement("div", {
    style: {
      marginTop: '2rem',
      padding: '.5em',
      background: theme.defaultTheme.backgroundAlt,
      position: 'sticky',
      top: 0,
      zIndex: 1
    }
  }, "Pending Matches"), (_router$pending = router.pending) == null ? void 0 : _router$pending.matches.map(function (match, i) {
    return /*#__PURE__*/React__default["default"].createElement("div", {
      key: match.id || i,
      role: "button",
      "aria-label": "Open match details for " + match.id,
      onClick: function onClick() {
        return setActiveRouteId(activeMatchId === match.id ? '' : match.id);
      },
      style: {
        display: 'flex',
        borderBottom: "solid 1px " + theme.defaultTheme.grayAlt,
        cursor: 'pointer',
        background: match === activeMatch ? 'rgba(255,255,255,.1)' : undefined
      }
    }, /*#__PURE__*/React__default["default"].createElement("div", {
      style: {
        flex: '0 0 auto',
        width: '1.3rem',
        height: '1.3rem',
        marginLeft: '.25rem',
        background: utils.getStatusColor(match, theme.defaultTheme),
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 'bold',
        borderRadius: '.25rem',
        transition: 'all .2s ease-out'
      }
    }), /*#__PURE__*/React__default["default"].createElement(styledComponents.Code, {
      style: {
        padding: '.5em'
      }
    }, "" + match.id));
  })), activeMatch ? /*#__PURE__*/React__default["default"].createElement(styledComponents.ActivePanel, null, /*#__PURE__*/React__default["default"].createElement("div", {
    style: {
      padding: '.5em',
      background: theme.defaultTheme.backgroundAlt,
      position: 'sticky',
      top: 0,
      zIndex: 1
    }
  }, "Match Details"), /*#__PURE__*/React__default["default"].createElement("div", {
    style: {
      padding: '.5em'
    }
  }, /*#__PURE__*/React__default["default"].createElement("div", {
    style: {
      marginBottom: '.5em',
      display: 'flex',
      alignItems: 'stretch',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React__default["default"].createElement(styledComponents.Code, {
    style: {
      lineHeight: '1.8em'
    }
  }, /*#__PURE__*/React__default["default"].createElement("pre", {
    style: {
      margin: 0,
      padding: 0,
      overflow: 'auto'
    }
  }, JSON.stringify(activeMatch.id, null, 2)))), /*#__PURE__*/React__default["default"].createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }
  }, "Last Updated:", ' ', activeMatch.updatedAt ? /*#__PURE__*/React__default["default"].createElement(styledComponents.Code, null, new Date(activeMatch.updatedAt).toLocaleTimeString()) : 'N/A')), /*#__PURE__*/React__default["default"].createElement("div", {
    style: {
      background: theme.defaultTheme.backgroundAlt,
      padding: '.5em',
      position: 'sticky',
      top: 0,
      zIndex: 1
    }
  }, "Explorer"), /*#__PURE__*/React__default["default"].createElement("div", {
    style: {
      padding: '.5em'
    }
  }, /*#__PURE__*/React__default["default"].createElement(Explorer["default"], {
    label: "Match",
    value: activeMatch,
    defaultExpanded: {}
  }))) : null));
});

exports.ReactLocationDevtools = ReactLocationDevtools;
exports.ReactLocationDevtoolsPanel = ReactLocationDevtoolsPanel;
//# sourceMappingURL=devtools.js.map
