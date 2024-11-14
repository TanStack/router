/* eslint-disable @typescript-eslint/dot-notation */
import React, { useEffect, useMemo, useRef } from "react";

type PropsToWatch<P> = P extends object ? P : never;

/**
 * Differentiate between the first and subsequent renders.
 *
 * @returns {boolean} Returns true if it is the first render, false otherwise.
 */
export const useIsFirstRender = () => {
  const renderRef = useRef(true);

  if (renderRef.current === true) {
    renderRef.current = false;
    return true;
  }

  return renderRef.current;
};

/**
 * Logs props that have changed.
 * Use this for debugging which props force a component to re-render.
 * This is a hook version of the class component lifecycle method `componentDidUpdate`.
 * ALWAYS wrap in your own object.
 *
 * @param id optional id to use for logging or it will guess the id from the stack trace
 * @param propsToWatch all the props to watch for changes
 * @example
 * const propsToWatch = { foo: props.foo, bar: props.bar };
 * useDebugger(propsToWatch);
 */
export const useDebugger = <P extends object>(propsToWatch: PropsToWatch<P> | null, id?: string): void => {
  const prevPropsRef = useRef<PropsToWatch<P> | null>(propsToWatch);
  const uniqueId = useMemo(() => {
    let stackId = id || (propsToWatch && (propsToWatch as { id?: string }).id);
    const stack = new Error().stack;
    if (!stackId && stack) {
      const stackLines = stack.split("\n");
      for (let i = 0; i < stackLines.length; i++) {
        const stackLine = stackLines[i];
        if (stackLine?.includes("useDebugger")) {
          stackId = stackLines[i + 1]?.trim().split(" ")[1];
          break;
        }
      }
    }
    return stackId || "unknown-id";
  }, [id, propsToWatch]);
  const isFirstRender = useIsFirstRender();

  // eslint-disable-next-line no-console
  console.log(isFirstRender ? "First-render" : "Re-render", uniqueId, window.location.pathname);

  useEffect(() => {
    const changedProps = Object.entries<PropsToWatch<P>>(propsToWatch || {}).reduce(
      (result, [key, value]) => {
        if (prevPropsRef.current && prevPropsRef.current[key as keyof PropsToWatch<P>] !== value) {
          result[key + ""] = [prevPropsRef.current[key as keyof PropsToWatch<P>], value];
        }
        return result;
      },
      {} as { [key: string]: [unknown, unknown] }
    );
    if (Object.keys(changedProps).length > 0) {
      // eslint-disable-next-line no-console
      Object.keys(changedProps).forEach(changedProp => {
        // eslint-disable-next-line no-console
        console.log(`${uniqueId} changed property: ${changedProp}`);
        // JSON stringify is used to avoid console.table from logging the object reference
        const result = JSON.parse(JSON.stringify(changedProps[changedProp]));
        const result0 = result[0];
        const result1 = result[1];

        result0 &&
          typeof result0 === "object" &&
          Object.keys(result0).forEach(prop => {
            result0[prop] = typeof result0[prop] === "object" ? JSON.stringify(result0[prop]) : result0[prop];
          });
        result1 &&
          typeof result1 === "object" &&
          Object.keys(result1).forEach(prop => {
            result1[prop] = typeof result1[prop] === "object" ? JSON.stringify(result1[prop]) : result1[prop];
          });

        // eslint-disable-next-line no-console
        console.table([result0, result1]);
      });
      // eslint-disable-next-line no-console
      console.dir(changedProps);
    }
    prevPropsRef.current = propsToWatch;
  }, [propsToWatch, uniqueId]);
};

/**
 * Debugger component for debugging state changes and re-renders.
 *
 * This component will log when it is mounted, re-renders or unmounted.
 * It will also log when any of its props change.
 *
 * @param id optional id to use for logging
 * @param stop if true, will stop execution and open debugger
 * @param logPropsChanges optional object with props to watch for changes
 * @param children the children to render
 */
export const Debugger = ({
  id,
  logPropsChanges,
  stop,
  children,
}: {
  children?: React.ReactNode;
  id?: string;
  stop?: boolean;
  logPropsChanges?: Record<string, unknown>;
}) => {
  const uniqueId =
    id ||
    // @ts-ignore
    React["__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED"]?.ReactCurrentOwner?.current?._debugOwner?.type?.name ||
    new Error().stack?.split("\n")[2]?.trim() ||
    "unknown-id";
  useDebugger(logPropsChanges || {}, id);

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log(`${uniqueId} Debugger is mounting`);
    return () => {
      // eslint-disable-next-line no-console
      console.log(`${uniqueId} Debugger is unmounting`);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (stop === true) {
    // eslint-disable-next-line no-debugger
    debugger;
  }
  return <div className="Debugger">{children}</div>;
};
