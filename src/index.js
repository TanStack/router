import React, {
  createContext,
  useState,
  useContext,
  useEffect,
  useRef
} from "react";
import * as qss from "qss";

import { createHistory, createMemorySource } from "./history";
import {
  isModifiedEvent,
  resolve,
  isMatch,
  startsWith,
  getResolvedBasepath
} from "./utils";

// Allow creation of custom historys including memory sources
export { createHistory, createMemorySource };

// The shared context for everything
const context = createContext();

// Detect if we're in the DOM
const isDOM = Boolean(
  typeof window !== "undefined" &&
    window.document &&
    window.document.createElement
);

// This is the default history object if none is defined
export const globalHistory = createHistory(
  isDOM ? window : createMemorySource()
);

const LocationRoot = ({
  children,
  history: userHistory,
  basepath: userBasepath
}) => {
  // If this is the first history, create it using the userHistory or browserHistory
  const [history] = useState(userHistory || globalHistory);

  // Let's get at some of the nested data on the history object
  const {
    location: { pathname, hash: fullHash, search: search, state, key },
    _onTransitionComplete
  } = history;

  // Get the hash without the bang
  const hash = fullHash.split("#").reverse()[0];
  // The default basepath for the entire Location
  const basepath = userBasepath || "/";
  // Parse the query params into an object
  const query = qss.decode(search.substring(1));

  // Try to parse any query params that might be json
  Object.keys(query).forEach(key => {
    try {
      query[key] = JSON.parse(query[key]);
    } catch (err) {
      //
    }
  });

  // Start off with fresh params at the top level
  const params = {};
  const href = pathname + (hash ? "#" + hash : "") + search;

  // Build our context value
  const contextValue = {
    basepath,
    pathname,
    hash,
    params,
    query,
    search,
    state,
    href,
    key,
    history
  };

  const historyListenerRef = useRef();

  // Subscribe to the history, even before the component mounts
  if (!historyListenerRef.current) {
    historyListenerRef.current = history.listen(() => setCount(old => old + 1));
  }

  // Before the component unmounts, unsubscribe from the history
  useEffect(() => {
    return historyListenerRef.current;
  }, []);

  // After component update, mark the transition as complete
  useEffect(() => {
    _onTransitionComplete();
  });

  return <context.Provider value={contextValue}>{children}</context.Provider>;
};

// This is the main Location component that acts like a Provider
export const LocationProvider = ({ children, location, ...rest }) => {
  if (location) {
    return <context.Provider value={location}>{children}</context.Provider>;
  }
  return <LocationRoot {...rest}>{children}</LocationRoot>;
};

// This hook powers just about everything. It is also responsible for
// creating the navigate() function based on the depth at which the hook is used
export const useLocation = () => {
  const contextValue = useContext(context);
  const { query, state, history, basepath } = contextValue;

  // Make the navigate function
  const navigate = (
    to,
    { query: queryUpdater, state: stateUpdater, replace, preview }
  ) => {
    // Allow query params and state to be updated with a function
    const resolvedQuery =
      typeof queryUpdater === "function" ? queryUpdater(query) : queryUpdater;
    const resolvedState =
      typeof stateUpdater === "function" ? stateUpdater(state) : stateUpdater;

    // If the query was updated, serialize all of the subkeys
    if (resolvedQuery) {
      Object.keys(resolvedQuery).forEach(key => {
        const val = resolvedQuery[key];
        if (typeof val === "object" && val !== "null") {
          resolvedQuery[key] = JSON.stringify(val);
        }
      });
    }

    // Then stringify the query params for URL encoding
    const search = qss.encode(resolvedQuery, "?");

    // Construct the final href for the navigation
    const href = resolve(to, basepath) + (search === "?" ? "" : search);

    // If this is a preview, just return the final href
    if (preview) {
      return href;
    }

    // Otherwise, apply the navigation to the history
    return history._navigate(href, {
      state: resolvedState,
      replace
    });
  };

  return {
    ...contextValue,
    navigate // add the navigat function to the hook output
  };
};

export const Location = ({ children, render, ...rest }) => {
  const location = useLocation(rest);

  if (children) {
    return children(location);
  }

  if (render) {
    return render(location);
  }

  return null;
};

export const withLocation = Comp => {
  return props => {
    const location = useLocation();
    return <Comp {...props} location={location} />;
  };
};

// MatchFirst returns the first matching child Match component or
// any non-null non-Match component and renders only that component.
// Comparable to React-Locations Swtich component
export const MatchFirst = ({ children }) => {
  const locationValue = useLocation();
  const { basepath, pathname } = locationValue;

  let match;
  // Loop over all of the children
  React.Children.forEach(children, child => {
    // If the match hasn't been found yet and the child is valid
    if (!match && React.isValidElement(child)) {
      // If the child isn't a route, it's the default content
      // and becomes the only match
      if (child.type !== Match) {
        match = child;
        return;
      }

      // It must be a Match component, then.
      // Try and match on its to/from prop
      const path = child.props.path || child.props.from;
      let newBasepath = getResolvedBasepath(path, basepath);
      const matched = isMatch(newBasepath, pathname);

      // If it's a match
      if (matched) {
        // If it's an index path
        if (path === "/") {
          // And if the match is exact
          if (matched.isExact) {
            // Return this child
            match = child;
          }
          // Don't return non-exact index matches
          return;
        }
        // Return all other general matches though
        match = child;
        return;
      }
    }
  });

  // Return the match or null
  return match || null;
};

// The Match component is used to match paths againts the location and
// render content for that match
export const Match = ({ path, children, render, component: Comp, ...rest }) => {
  // Use the location
  const locationValue = useLocation();
  const { basepath, pathname, params } = locationValue;

  // Resolve the new basepath from the Match's path prop
  let newBasePath = getResolvedBasepath(path, basepath);
  // See if the route is currently matched
  const match = isMatch(newBasePath, pathname);

  if (match) {
    // If the route is a match, make sure we use
    // the newBasePath from the match. It contains
    // the interpolated path, free of route param
    // identifiers
    newBasePath = match.newBasePath;
  }

  // Update the contex to use hte new basePath and params
  const contextValue = {
    ...locationValue,
    basepath: newBasePath,
    params: {
      ...params,
      ...(match ? match.params : {})
    }
  };

  // Not a match? Return null
  if (!match) {
    return null;
  }

  const renderProps = {
    ...contextValue,
    ...contextValue.params
  };

  // Support the render prop
  if (render) {
    children = render(renderProps);
  }

  // Support the component prop
  if (Comp) {
    children = <Comp {...renderProps} {...rest} />;
  }

  // Support child as a function
  if (typeof children === "function") {
    children = children(renderProps);
  }

  // Support just children
  return <context.Provider value={contextValue}>{children}</context.Provider>;
};

// The Match component is used to match paths againts the location and
// render content for that match
export const Redirect = ({ from, to, query, state, replace = true }) => {
  // Use the location
  const locationValue = useLocation();
  const { basepath, pathname, navigate } = locationValue;

  // Resolve the new basepath from the Match's path prop
  let newBasePath = getResolvedBasepath(from, basepath);
  // See if the route is currently matched
  const match = isMatch(newBasePath, pathname);

  if (match) {
    navigate(to, { query, state, replace });
  }

  return null;
};

export function Link({
  to,
  query,
  replace,
  state,
  onClick,
  target,
  style = {},
  className = "",
  getActiveProps = () => ({}),
  activeType,
  children,
  ...rest
}) {
  // Use the useLocation hook
  const location = useLocation();
  const { navigate, pathname, href } = location;

  // If this `to` is an external URL, make a normal a href
  try {
    const link = new URL(to);
    return (
      <a
        href={link.href}
        target={target}
        style={style}
        className={className}
        {...rest}
      >
        {children}
      </a>
    );
  } catch (e) {
    // if a path is not parsable by URL its a local relative path.
    // Proceed
  }

  // Get the preview href for this link and its variations
  const linkHrefWithQuery = navigate(to, {
    query,
    state,
    replace,
    preview: true
  });
  const linkHrefWithHash = linkHrefWithQuery.split("?")[0];
  const linkHref = linkHrefWithHash.split("#")[0];

  // Detect if this link is active using the different activeType options
  let isCurrent;
  if (activeType === "partial") {
    isCurrent = startsWith(href, linkHrefWithQuery);
  } else if (activeType === "path") {
    isCurrent = pathname === linkHref;
  } else if (activeType === "hash") {
    isCurrent = pathname === linkHrefWithHash;
  } else {
    isCurrent = href === linkHrefWithQuery;
  }

  // Get the active props
  const {
    style: activeStyle = {},
    className: activeClassName = "",
    ...activeRest
  } = isCurrent ? getActiveProps(location) : {};

  // The click handler
  const handleClick = e => {
    if (onClick) onClick(e);

    if (
      !e.defaultPrevented && // onClick prevented default
      e.button === 0 && // ignore everything but left clicks
      (!target || target === "_self") && // let browser handle "target=_blank" etc.
      !isModifiedEvent(e) // ignore clicks with modifier keys
    ) {
      e.preventDefault();
      // All is well? Navigate!
      navigate(to, { query, state, replace });
    }
  };

  return (
    <a
      href={linkHrefWithQuery}
      target={target}
      onClick={handleClick}
      style={{
        ...style,
        ...activeStyle
      }}
      className={
        [className, activeClassName].filter(Boolean).join(" ") || undefined
      }
      {...rest}
      {...activeRest}
    >
      {children}
    </a>
  );
}
