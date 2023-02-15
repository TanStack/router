import { S as Store, i as invariant, _ as __astro_tag_component__ } from './Hydrate.f13f5eaa.mjs';
import 'react';
import 'jsesc';
import 'react/jsx-runtime';

/**
 * loaders
 *
 * Copyright (c) TanStack
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE.md file in the root directory of this source tree.
 *
 * @license MIT
 */

/**
 * This function returns `a` if `b` is deeply equal.
 * If not, it will replace any deeply equal children of `b` with those of `a`.
 * This can be used for structural sharing between immutable JSON values for example.
 * Do not use this with signals
 */
function replaceEqualDeep(prev, _next) {
  if (prev === _next) {
    return prev;
  }
  const next = _next;
  const array = Array.isArray(prev) && Array.isArray(next);
  if (array || isPlainObject(prev) && isPlainObject(next)) {
    const prevSize = array ? prev.length : Object.keys(prev).length;
    const nextItems = array ? next : Object.keys(next);
    const nextSize = nextItems.length;
    const copy = array ? [] : {};
    let equalItems = 0;
    for (let i = 0; i < nextSize; i++) {
      const key = array ? i : nextItems[i];
      copy[key] = replaceEqualDeep(prev[key], next[key]);
      if (copy[key] === prev[key]) {
        equalItems++;
      }
    }
    return prevSize === nextSize && equalItems === prevSize ? prev : copy;
  }
  return next;
}

// Copied from: https://github.com/jonschlinkert/is-plain-object
function isPlainObject(o) {
  if (!hasObjectPrototype(o)) {
    return false;
  }

  // If has modified constructor
  const ctor = o.constructor;
  if (typeof ctor === 'undefined') {
    return true;
  }

  // If has modified prototype
  const prot = ctor.prototype;
  if (!hasObjectPrototype(prot)) {
    return false;
  }

  // If constructor does not have an Object-specific method
  if (!prot.hasOwnProperty('isPrototypeOf')) {
    return false;
  }

  // Most likely a plain Object
  return true;
}
function hasObjectPrototype(o) {
  return Object.prototype.toString.call(o) === '[object Object]';
}

// A loader client that tracks instances of loaders by unique key like react query
class LoaderClient {
  initialized = false;
  constructor(options) {
    this.options = options;
    this.__store = new Store({
      isLoading: false,
      isPreloading: false
    }, {
      onUpdate: next => {
        this.state = next;
      }
    });
    this.state = this.__store.state;
    this.loaders = {};
  }
  init = () => {
    this.options.getLoaders().forEach(loader => {
      loader.client = this;
      this.loaders[loader.key] = loader;
    });
    this.initialized = true;
  };
  getLoader(opts) {
    if (!this.initialized) this.init();
    return this.loaders[opts.key];
  }
  dehydrate = () => {
    return {
      loaders: Object.values(this.loaders).reduce((acc, loader) => ({
        ...acc,
        [loader.key]: Object.values(loader.instances).reduce((acc, instance) => ({
          ...acc,
          [instance.hashedKey]: {
            hashedKey: instance.hashedKey,
            variables: instance.variables,
            state: instance.state
          }
        }), {})
      }), {})
    };
  };
  hydrate = data => {
    Object.entries(data.loaders).forEach(([loaderKey, instances]) => {
      const loader = this.getLoader({
        key: loaderKey
      });
      Object.values(instances).forEach(dehydratedInstance => {
        let instance = loader.instances[dehydratedInstance.hashedKey];
        if (!instance) {
          instance = loader.instances[dehydratedInstance.hashedKey] = loader.getInstance({
            variables: dehydratedInstance.variables
          });
        }
        instance.__store.setState(() => dehydratedInstance.state);
      });
    });
  };
}
function getInitialLoaderState() {
  return {
    status: 'idle',
    invalid: false,
    invalidAt: Infinity,
    preloadInvalidAt: Infinity,
    isFetching: false,
    updatedAt: 0,
    data: undefined,
    preload: false
  };
}
const visibilityChangeEvent = 'visibilitychange';
const focusEvent = 'focus';
class Loader {
  constructor(options) {
    this.options = options;
    this.key = this.options.key;
    this.instances = {};

    // addEventListener does not exist in React Native, but window does
    // In the future, we might need to invert control here for more adapters
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (typeof window !== 'undefined' && window.addEventListener) {
      // Listen to visibilitychange and focus
      window.addEventListener(visibilityChangeEvent, this.#reloadAll, false);
      window.addEventListener(focusEvent, this.#reloadAll, false);
    }
  }
  dispose = () => {
    if (typeof window !== 'undefined' && window.removeEventListener) {
      // Be sure to unsubscribe if a new handler is set

      window.removeEventListener(visibilityChangeEvent, this.#reloadAll);
      window.removeEventListener(focusEvent, this.#reloadAll);
    }
  };
  #reloadAll = () => {
    Object.values(this.instances).forEach(instance => {
      instance.loadIfActive({
        isFocusReload: true
      });
    });
  };
  getInstance = (opts = {}) => {
    const hashedKey = hashKey([this.key, opts.variables]);
    if (this.instances[hashedKey]) {
      return this.instances[hashedKey];
    }
    const loader = new LoaderInstance({
      hashedKey,
      loader: this,
      variables: opts.variables
    });
    return this.instances[hashedKey] = loader;
  };
  load = async (opts = {}) => {
    return this.getInstance(opts).load(opts);
  };
  fetch = async (opts = {}) => {
    return this.getInstance(opts).fetch(opts);
  };
  invalidate = async (opts = {}) => {
    await this.getInstance(opts).invalidate();
    await this.options.onAllInvalidate?.(this);
  };
  invalidateAll = async () => {
    await Promise.all(Object.values(this.instances).map(loader => loader.invalidate()));
  };
}
class LoaderInstance {
  #subscriptionCount = 0;
  constructor(options) {
    this.options = options;
    this.loader = options.loader;
    this.hashedKey = options.hashedKey;
    this.variables = options.variables;
    this.__store = new Store(getInitialLoaderState(), {
      onSubscribe: () => {
        if (!this.#subscriptionCount) {
          this.#stopGc();
        }
        this.#subscriptionCount++;
        return () => {
          this.#subscriptionCount--;
          if (!this.#subscriptionCount) {
            this.#startGc();
          }
        };
      },
      onUpdate: (next, prev) => {
        this.state = next;

        // if (next.isLoading !== prev.isLoading) {
        this.#notifyClient();
        // }
      }
    });

    this.state = this.__store.state;
    if (this.__store.listeners.size) {
      this.#stopGc();
    } else {
      this.#startGc();
    }
  }
  #notifyClient = () => {
    const client = this.loader.client;
    if (!client) return;
    const isLoading = Object.values(client.loaders).some(loader => {
      return Object.values(loader.instances).some(instance => instance.state.isFetching && !instance.state.preload);
    });
    const isPreloading = Object.values(client.loaders).some(loader => {
      return Object.values(loader.instances).some(instance => instance.state.isFetching && instance.state.preload);
    });
    if (client.state.isLoading === isLoading && client.state.isPreloading === isPreloading) {
      return;
    }
    client.__store.setState(s => {
      return {
        isLoading,
        isPreloading
      };
    });
  };
  #gcTimeout;
  #startGc = () => {
    this.#gcTimeout = setTimeout(() => {
      this.#gcTimeout = undefined;
      this.#gc();
    }, this.loader.options.gcMaxAge ?? this.loader.client?.options.defaultGcMaxAge ?? 5 * 60 * 1000);
  };
  #stopGc = () => {
    if (this.#gcTimeout) {
      clearTimeout(this.#gcTimeout);
      this.#gcTimeout = undefined;
    }
  };
  #gc = () => {
    this.#destroy();
  };
  #destroy = () => {
    delete this.loader.instances[this.hashedKey];
  };
  getIsInvalid = opts => {
    const now = Date.now();
    return this.state.status === 'success' && (this.state.invalid || (opts?.preload ? this.state.preloadInvalidAt : this.state.invalidAt) < now);
  };
  invalidate = async () => {
    this.__store.setState(s => ({
      ...s,
      invalid: true
    }));
    await this.loadIfActive();
    await this.loader.options.onEachInvalidate?.(this);
  };
  loadIfActive = async opts => {
    if (this.__store.listeners.size) {
      this.load(opts);
      try {
        await this.__loadPromise;
      } catch (err) {
        // Ignore
      }
    }
  };
  load = async opts => {
    if (opts?.isFocusReload) {
      if (!(this.loader.options.refetchOnWindowFocus ?? this.loader.client?.options.defaultRefetchOnWindowFocus ?? true)) {
        return this.state.data;
      }
    }
    if (this.state.status === 'error' || this.state.status === 'idle' || this.getIsInvalid(opts)) {
      // Fetch if we need to
      if (!this.__loadPromise) {
        this.fetch(opts).catch(() => {
          // Ignore
        });
      }
    }

    // If we already have data, return it
    if (typeof this.state.data !== 'undefined') {
      return this.state.data;
    }

    // Otherwise wait for the data to be fetched
    return this.__loadPromise;
  };
  #latestId = '';
  fetch = async opts => {
    // this.store.batch(() => {
    // If the match was in an error state, set it
    // to a loading state again. Otherwise, keep it
    // as loading or resolved
    if (this.state.status === 'idle') {
      this.__store.setState(s => ({
        ...s,
        status: 'pending'
      }));
    }

    // We started loading the route, so it's no longer invalid
    this.__store.setState(s => ({
      ...s,
      preload: !!opts?.preload,
      invalid: false,
      isFetching: true
    }));
    // })

    const loadId = '' + Date.now() + Math.random();
    this.#latestId = loadId;
    const hasNewer = () => {
      return loadId !== this.#latestId ? this.__loadPromise : undefined;
    };
    let newer;
    this.__loadPromise = Promise.resolve().then(async () => {
      const after = async () => {
        this.__store.setState(s => ({
          ...s,
          isFetching: false
        }));
        if (newer = hasNewer()) {
          await this.loader.options.onLatestSettled?.(this);
          return newer;
        } else {
          await this.loader.options.onEachSettled?.(this);
        }
        return;
      };
      try {
        const loaderImpl = this.loader.client?.options.wrapLoaderFn?.(this) ?? this.loader.options.loader;
        const data = await loaderImpl(this.variables, {
          loaderInstance: this,
          signal: opts?.signal
        });
        invariant(typeof data !== 'undefined', 'The data returned from a loader cannot be undefined.');
        if (newer = hasNewer()) return newer;
        const updatedAt = Date.now();
        const preloadInvalidAt = updatedAt + (opts?.maxAge ?? this.loader.options.preloadMaxAge ?? this.loader.client?.options.defaultPreloadMaxAge ?? 10000);
        const invalidAt = updatedAt + (opts?.maxAge ?? this.loader.options.maxAge ?? this.loader.client?.options.defaultMaxAge ?? 1000);
        this.__store.setState(s => ({
          ...s,
          error: undefined,
          updatedAt,
          data: replaceEqualDeep(s.data, data),
          preloadInvalidAt: preloadInvalidAt,
          invalidAt: invalidAt
        }));
        if (newer = hasNewer()) {
          await this.loader.options.onLatestSuccess?.(this);
          return newer;
        } else {
          await this.loader.options.onEachSuccess?.(this);
        }
        this.__store.setState(s => ({
          ...s,
          status: 'success'
        }));
        await after();
        return this.state.data;
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') {
          console.error(err);
        }
        this.__store.setState(s => ({
          ...s,
          error: err,
          updatedAt: Date.now()
        }));
        if (newer = hasNewer()) {
          await this.loader.options.onLatestError?.(this);
          return newer;
        } else {
          await this.loader.options.onEachError?.(this);
        }
        this.__store.setState(s => ({
          ...s,
          status: 'error'
        }));
        await after();
        throw err;
      }
    });
    this.__loadPromise.then(() => {
      delete this.__loadPromise;
    }).catch(() => {});
    return this.__loadPromise;
  };
}
function hashKey(queryKey) {
  return JSON.stringify(queryKey, (_, val) => isPlainObject(val) ? Object.keys(val).sort().reduce((result, key) => {
    result[key] = val[key];
    return result;
  }, {}) : val);
}

const createLoaderClient = () => {
  const postsLoader = new Loader({
    key: "posts",
    loader: async () => {
      console.log("Fetching posts...");
      await new Promise((r) => setTimeout(r, 300 + Math.round(Math.random() * 300)));
      return fetch("https://jsonplaceholder.typicode.com/posts").then((d) => d.json()).then((d) => d.slice(0, 10));
    }
  });
  const postLoader = new Loader({
    key: "post",
    maxAge: 5e3,
    loader: async (postId) => {
      console.log(`Fetching post with id ${postId}...`);
      await new Promise((r) => setTimeout(r, Math.round(Math.random() * 300)));
      return fetch(`https://jsonplaceholder.typicode.com/posts/${postId}`).then((r) => r.json());
    },
    onAllInvalidate: async () => {
      await postsLoader.invalidateAll();
    }
  });
  return new LoaderClient({
    getLoaders: () => [postsLoader, postLoader]
  });
};
const loaderClient = createLoaderClient();
__astro_tag_component__(createLoaderClient, "@astrojs/react");

export { createLoaderClient, loaderClient };
