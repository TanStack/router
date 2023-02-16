import * as React from 'react';
import React__default from 'react';
import { useSyncExternalStoreWithSelector } from 'use-sync-external-store/shim/with-selector.js';
import { jsx, jsxs, Fragment as Fragment$1 } from 'react/jsx-runtime';

/**
 * Copyright (C) 2017-present by Andrea Giammarchi - @WebReflection
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

const {replace} = '';
const ca = /[&<>'"]/g;

const esca = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  "'": '&#39;',
  '"': '&quot;'
};
const pe = m => esca[m];

/**
 * Safely escape HTML entities such as `&`, `<`, `>`, `"`, and `'`.
 * @param {string} es the input to safely escape
 * @returns {string} the escaped input, and it **throws** an error if
 *  the input type is unexpected, except for boolean and numbers,
 *  converted as string.
 */
const escape = es => replace.call(es, ca, pe);

const escapeHTML = escape;
class HTMLString extends String {
  get [Symbol.toStringTag]() {
    return "HTMLString";
  }
}
const markHTMLString = (value) => {
  if (value instanceof HTMLString) {
    return value;
  }
  if (typeof value === "string") {
    return new HTMLString(value);
  }
  return value;
};
function isHTMLString(value) {
  return Object.prototype.toString.call(value) === "[object HTMLString]";
}

const AstroJSX = "astro:jsx";
const Empty = Symbol("empty");
const toSlotName = (slotAttr) => slotAttr;
function isVNode(vnode) {
  return vnode && typeof vnode === "object" && vnode[AstroJSX];
}
function transformSlots(vnode) {
  if (typeof vnode.type === "string")
    return vnode;
  const slots = {};
  if (isVNode(vnode.props.children)) {
    const child = vnode.props.children;
    if (!isVNode(child))
      return;
    if (!("slot" in child.props))
      return;
    const name = toSlotName(child.props.slot);
    slots[name] = [child];
    slots[name]["$$slot"] = true;
    delete child.props.slot;
    delete vnode.props.children;
  }
  if (Array.isArray(vnode.props.children)) {
    vnode.props.children = vnode.props.children.map((child) => {
      if (!isVNode(child))
        return child;
      if (!("slot" in child.props))
        return child;
      const name = toSlotName(child.props.slot);
      if (Array.isArray(slots[name])) {
        slots[name].push(child);
      } else {
        slots[name] = [child];
        slots[name]["$$slot"] = true;
      }
      delete child.props.slot;
      return Empty;
    }).filter((v) => v !== Empty);
  }
  Object.assign(vnode.props, slots);
}
function markRawChildren(child) {
  if (typeof child === "string")
    return markHTMLString(child);
  if (Array.isArray(child))
    return child.map((c) => markRawChildren(c));
  return child;
}
function transformSetDirectives(vnode) {
  if (!("set:html" in vnode.props || "set:text" in vnode.props))
    return;
  if ("set:html" in vnode.props) {
    const children = markRawChildren(vnode.props["set:html"]);
    delete vnode.props["set:html"];
    Object.assign(vnode.props, { children });
    return;
  }
  if ("set:text" in vnode.props) {
    const children = vnode.props["set:text"];
    delete vnode.props["set:text"];
    Object.assign(vnode.props, { children });
    return;
  }
}
function createVNode(type, props) {
  const vnode = {
    [Renderer]: "astro:jsx",
    [AstroJSX]: true,
    type,
    props: props ?? {}
  };
  transformSetDirectives(vnode);
  transformSlots(vnode);
  return vnode;
}

var idle_prebuilt_default = `(self.Astro=self.Astro||{}).idle=t=>{const e=async()=>{await(await t())()};"requestIdleCallback"in window?window.requestIdleCallback(e):setTimeout(e,200)},window.dispatchEvent(new Event("astro:idle"));`;

var load_prebuilt_default = `(self.Astro=self.Astro||{}).load=a=>{(async()=>await(await a())())()},window.dispatchEvent(new Event("astro:load"));`;

var media_prebuilt_default = `(self.Astro=self.Astro||{}).media=(s,a)=>{const t=async()=>{await(await s())()};if(a.value){const e=matchMedia(a.value);e.matches?t():e.addEventListener("change",t,{once:!0})}},window.dispatchEvent(new Event("astro:media"));`;

var only_prebuilt_default = `(self.Astro=self.Astro||{}).only=t=>{(async()=>await(await t())())()},window.dispatchEvent(new Event("astro:only"));`;

var visible_prebuilt_default = `(self.Astro=self.Astro||{}).visible=(s,c,n)=>{const r=async()=>{await(await s())()};let i=new IntersectionObserver(e=>{for(const t of e)if(!!t.isIntersecting){i.disconnect(),r();break}});for(let e=0;e<n.children.length;e++){const t=n.children[e];i.observe(t)}},window.dispatchEvent(new Event("astro:visible"));`;

var astro_island_prebuilt_default = `var l;{const c={0:t=>t,1:t=>JSON.parse(t,o),2:t=>new RegExp(t),3:t=>new Date(t),4:t=>new Map(JSON.parse(t,o)),5:t=>new Set(JSON.parse(t,o)),6:t=>BigInt(t),7:t=>new URL(t),8:t=>new Uint8Array(JSON.parse(t)),9:t=>new Uint16Array(JSON.parse(t)),10:t=>new Uint32Array(JSON.parse(t))},o=(t,s)=>{if(t===""||!Array.isArray(s))return s;const[e,n]=s;return e in c?c[e](n):void 0};customElements.get("astro-island")||customElements.define("astro-island",(l=class extends HTMLElement{constructor(){super(...arguments);this.hydrate=()=>{if(!this.hydrator||this.parentElement&&this.parentElement.closest("astro-island[ssr]"))return;const s=this.querySelectorAll("astro-slot"),e={},n=this.querySelectorAll("template[data-astro-template]");for(const r of n){const i=r.closest(this.tagName);!i||!i.isSameNode(this)||(e[r.getAttribute("data-astro-template")||"default"]=r.innerHTML,r.remove())}for(const r of s){const i=r.closest(this.tagName);!i||!i.isSameNode(this)||(e[r.getAttribute("name")||"default"]=r.innerHTML)}const a=this.hasAttribute("props")?JSON.parse(this.getAttribute("props"),o):{};this.hydrator(this)(this.Component,a,e,{client:this.getAttribute("client")}),this.removeAttribute("ssr"),window.removeEventListener("astro:hydrate",this.hydrate),window.dispatchEvent(new CustomEvent("astro:hydrate"))}}connectedCallback(){!this.hasAttribute("await-children")||this.firstChild?this.childrenConnectedCallback():new MutationObserver((s,e)=>{e.disconnect(),this.childrenConnectedCallback()}).observe(this,{childList:!0})}async childrenConnectedCallback(){window.addEventListener("astro:hydrate",this.hydrate);let s=this.getAttribute("before-hydration-url");s&&await import(s),this.start()}start(){const s=JSON.parse(this.getAttribute("opts")),e=this.getAttribute("client");if(Astro[e]===void 0){window.addEventListener(\`astro:\${e}\`,()=>this.start(),{once:!0});return}Astro[e](async()=>{const n=this.getAttribute("renderer-url"),[a,{default:r}]=await Promise.all([import(this.getAttribute("component-url")),n?import(n):()=>()=>{}]),i=this.getAttribute("component-export")||"default";if(!i.includes("."))this.Component=a[i];else{this.Component=a;for(const d of i.split("."))this.Component=this.Component[d]}return this.hydrator=r,this.hydrate},s,this)}attributeChangedCallback(){this.hydrator&&this.hydrate()}},l.observedAttributes=["props"],l))}`;

function determineIfNeedsHydrationScript(result) {
  if (result._metadata.hasHydrationScript) {
    return false;
  }
  return result._metadata.hasHydrationScript = true;
}
const hydrationScripts = {
  idle: idle_prebuilt_default,
  load: load_prebuilt_default,
  only: only_prebuilt_default,
  media: media_prebuilt_default,
  visible: visible_prebuilt_default
};
function determinesIfNeedsDirectiveScript(result, directive) {
  if (result._metadata.hasDirectives.has(directive)) {
    return false;
  }
  result._metadata.hasDirectives.add(directive);
  return true;
}
function getDirectiveScriptText(directive) {
  if (!(directive in hydrationScripts)) {
    throw new Error(`Unknown directive: ${directive}`);
  }
  const directiveScriptText = hydrationScripts[directive];
  return directiveScriptText;
}
function getPrescripts(type, directive) {
  switch (type) {
    case "both":
      return `<style>astro-island,astro-slot{display:contents}</style><script>${getDirectiveScriptText(directive) + astro_island_prebuilt_default}<\/script>`;
    case "directive":
      return `<script>${getDirectiveScriptText(directive)}<\/script>`;
  }
  return "";
}

const defineErrors = (errs) => errs;
const AstroErrorData = defineErrors({
  UnknownCompilerError: {
    title: "Unknown compiler error.",
    code: 1e3
  },
  StaticRedirectNotAvailable: {
    title: "`Astro.redirect` is not available in static mode.",
    code: 3001,
    message: "Redirects are only available when using `output: 'server'`. Update your Astro config if you need SSR features.",
    hint: "See https://docs.astro.build/en/guides/server-side-rendering/#enabling-ssr-in-your-project for more information on how to enable SSR."
  },
  ClientAddressNotAvailable: {
    title: "`Astro.clientAddress` is not available in current adapter.",
    code: 3002,
    message: (adapterName) => `\`Astro.clientAddress\` is not available in the \`${adapterName}\` adapter. File an issue with the adapter to add support.`
  },
  StaticClientAddressNotAvailable: {
    title: "`Astro.clientAddress` is not available in static mode.",
    code: 3003,
    message: "`Astro.clientAddress` is only available when using `output: 'server'`. Update your Astro config if you need SSR features.",
    hint: "See https://docs.astro.build/en/guides/server-side-rendering/#enabling-ssr-in-your-project for more information on how to enable SSR."
  },
  NoMatchingStaticPathFound: {
    title: "No static path found for requested path.",
    code: 3004,
    message: (pathName) => `A \`getStaticPaths()\` route pattern was matched, but no matching static path was found for requested path \`${pathName}\`.`,
    hint: (possibleRoutes) => `Possible dynamic routes being matched: ${possibleRoutes.join(", ")}.`
  },
  OnlyResponseCanBeReturned: {
    title: "Invalid type returned by Astro page.",
    code: 3005,
    message: (route, returnedValue) => `Route ${route ? route : ""} returned a \`${returnedValue}\`. Only a Response can be returned from Astro files.`,
    hint: "See https://docs.astro.build/en/guides/server-side-rendering/#response for more information."
  },
  MissingMediaQueryDirective: {
    title: "Missing value for `client:media` directive.",
    code: 3006,
    message: 'Media query not provided for `client:media` directive. A media query similar to `client:media="(max-width: 600px)"` must be provided'
  },
  NoMatchingRenderer: {
    title: "No matching renderer found.",
    code: 3007,
    message: (componentName, componentExtension, plural, validRenderersCount) => `Unable to render \`${componentName}\`.

${validRenderersCount > 0 ? `There ${plural ? "are." : "is."} ${validRenderersCount} renderer${plural ? "s." : ""} configured in your \`astro.config.mjs\` file,
but ${plural ? "none were." : "it was not."} able to server-side render \`${componentName}\`.` : `No valid renderer was found ${componentExtension ? `for the \`.${componentExtension}\` file extension.` : `for this file extension.`}`}`,
    hint: (probableRenderers) => `Did you mean to enable the ${probableRenderers} integration?

See https://docs.astro.build/en/core-concepts/framework-components/ for more information on how to install and configure integrations.`
  },
  NoClientEntrypoint: {
    title: "No client entrypoint specified in renderer.",
    code: 3008,
    message: (componentName, clientDirective, rendererName) => `\`${componentName}\` component has a \`client:${clientDirective}\` directive, but no client entrypoint was provided by \`${rendererName}\`.`,
    hint: "See https://docs.astro.build/en/reference/integrations-reference/#addrenderer-option for more information on how to configure your renderer."
  },
  NoClientOnlyHint: {
    title: "Missing hint on client:only directive.",
    code: 3009,
    message: (componentName) => `Unable to render \`${componentName}\`. When using the \`client:only\` hydration strategy, Astro needs a hint to use the correct renderer.`,
    hint: (probableRenderers) => `Did you mean to pass \`client:only="${probableRenderers}"\`? See https://docs.astro.build/en/reference/directives-reference/#clientonly for more information on client:only`
  },
  InvalidGetStaticPathParam: {
    title: "Invalid value returned by a `getStaticPaths` path.",
    code: 3010,
    message: (paramType) => `Invalid params given to \`getStaticPaths\` path. Expected an \`object\`, got \`${paramType}\``,
    hint: "See https://docs.astro.build/en/reference/api-reference/#getstaticpaths for more information on getStaticPaths."
  },
  InvalidGetStaticPathsReturn: {
    title: "Invalid value returned by getStaticPaths.",
    code: 3011,
    message: (returnType) => `Invalid type returned by \`getStaticPaths\`. Expected an \`array\`, got \`${returnType}\``,
    hint: "See https://docs.astro.build/en/reference/api-reference/#getstaticpaths for more information on getStaticPaths."
  },
  GetStaticPathsRemovedRSSHelper: {
    title: "getStaticPaths RSS helper is not available anymore.",
    code: 3012,
    message: "The RSS helper has been removed from `getStaticPaths`. Try the new @astrojs/rss package instead.",
    hint: "See https://docs.astro.build/en/guides/rss/ for more information."
  },
  GetStaticPathsExpectedParams: {
    title: "Missing params property on `getStaticPaths` route.",
    code: 3013,
    message: "Missing or empty required `params` property on `getStaticPaths` route.",
    hint: "See https://docs.astro.build/en/reference/api-reference/#getstaticpaths for more information on getStaticPaths."
  },
  GetStaticPathsInvalidRouteParam: {
    title: "Invalid value for `getStaticPaths` route parameter.",
    code: 3014,
    message: (key, value, valueType) => `Invalid getStaticPaths route parameter for \`${key}\`. Expected undefined, a string or a number, received \`${valueType}\` (\`${value}\`)`,
    hint: "See https://docs.astro.build/en/reference/api-reference/#getstaticpaths for more information on getStaticPaths."
  },
  GetStaticPathsRequired: {
    title: "`getStaticPaths()` function required for dynamic routes.",
    code: 3015,
    message: "`getStaticPaths()` function is required for dynamic routes. Make sure that you `export` a `getStaticPaths` function from your dynamic route.",
    hint: `See https://docs.astro.build/en/core-concepts/routing/#dynamic-routes for more information on dynamic routes.

Alternatively, set \`output: "server"\` in your Astro config file to switch to a non-static server build.
See https://docs.astro.build/en/guides/server-side-rendering/ for more information on non-static rendering.`
  },
  ReservedSlotName: {
    title: "Invalid slot name.",
    code: 3016,
    message: (slotName) => `Unable to create a slot named \`${slotName}\`. \`${slotName}\` is a reserved slot name. Please update the name of this slot.`
  },
  NoAdapterInstalled: {
    title: "Cannot use Server-side Rendering without an adapter.",
    code: 3017,
    message: `Cannot use \`output: 'server'\` without an adapter. Please install and configure the appropriate server adapter for your final deployment.`,
    hint: "See https://docs.astro.build/en/guides/server-side-rendering/ for more information."
  },
  NoMatchingImport: {
    title: "No import found for component.",
    code: 3018,
    message: (componentName) => `Could not render \`${componentName}\`. No matching import has been found for \`${componentName}\`.`,
    hint: "Please make sure the component is properly imported."
  },
  UnknownViteError: {
    title: "Unknown Vite Error.",
    code: 4e3
  },
  FailedToLoadModuleSSR: {
    title: "Could not import file.",
    code: 4001,
    message: (importName) => `Could not import \`${importName}\`.`,
    hint: "This is often caused by a typo in the import path. Please make sure the file exists."
  },
  InvalidGlob: {
    title: "Invalid glob pattern.",
    code: 4002,
    message: (globPattern) => `Invalid glob pattern: \`${globPattern}\`. Glob patterns must start with './', '../' or '/'.`,
    hint: "See https://docs.astro.build/en/guides/imports/#glob-patterns for more information on supported glob patterns."
  },
  UnknownCSSError: {
    title: "Unknown CSS Error.",
    code: 5e3
  },
  CSSSyntaxError: {
    title: "CSS Syntax Error.",
    code: 5001
  },
  UnknownMarkdownError: {
    title: "Unknown Markdown Error.",
    code: 6e3
  },
  MarkdownFrontmatterParseError: {
    title: "Failed to parse Markdown frontmatter.",
    code: 6001
  },
  UnknownConfigError: {
    title: "Unknown configuration error.",
    code: 7e3
  },
  ConfigNotFound: {
    title: "Specified configuration file not found.",
    code: 7001,
    message: (configFile) => `Unable to resolve \`--config "${configFile}"\`. Does the file exist?`
  },
  ConfigLegacyKey: {
    title: "Legacy configuration detected.",
    code: 7002,
    message: (legacyConfigKey) => `Legacy configuration detected: \`${legacyConfigKey}\`.`,
    hint: "Please update your configuration to the new format.\nSee https://astro.build/config for more information."
  },
  UnknownError: {
    title: "Unknown Error.",
    code: 99999
  }
});

function normalizeLF(code) {
  return code.replace(/\r\n|\r(?!\n)|\n/g, "\n");
}
function getErrorDataByCode(code) {
  const entry = Object.entries(AstroErrorData).find((data) => data[1].code === code);
  if (entry) {
    return {
      name: entry[0],
      data: entry[1]
    };
  }
}

function codeFrame(src, loc) {
  if (!loc || loc.line === void 0 || loc.column === void 0) {
    return "";
  }
  const lines = normalizeLF(src).split("\n").map((ln) => ln.replace(/\t/g, "  "));
  const visibleLines = [];
  for (let n = -2; n <= 2; n++) {
    if (lines[loc.line + n])
      visibleLines.push(loc.line + n);
  }
  let gutterWidth = 0;
  for (const lineNo of visibleLines) {
    let w = `> ${lineNo}`;
    if (w.length > gutterWidth)
      gutterWidth = w.length;
  }
  let output = "";
  for (const lineNo of visibleLines) {
    const isFocusedLine = lineNo === loc.line - 1;
    output += isFocusedLine ? "> " : "  ";
    output += `${lineNo + 1} | ${lines[lineNo]}
`;
    if (isFocusedLine)
      output += `${Array.from({ length: gutterWidth }).join(" ")}  | ${Array.from({
        length: loc.column
      }).join(" ")}^
`;
  }
  return output;
}

class AstroError extends Error {
  constructor(props, ...params) {
    var _a;
    super(...params);
    this.type = "AstroError";
    const { code, name, title, message, stack, location, hint, frame } = props;
    this.errorCode = code;
    if (name) {
      this.name = name;
    } else {
      this.name = ((_a = getErrorDataByCode(this.errorCode)) == null ? void 0 : _a.name) ?? "UnknownError";
    }
    this.title = title;
    if (message)
      this.message = message;
    this.stack = stack ? stack : this.stack;
    this.loc = location;
    this.hint = hint;
    this.frame = frame;
  }
  setErrorCode(errorCode) {
    var _a;
    this.errorCode = errorCode;
    this.name = ((_a = getErrorDataByCode(this.errorCode)) == null ? void 0 : _a.name) ?? "UnknownError";
  }
  setLocation(location) {
    this.loc = location;
  }
  setName(name) {
    this.name = name;
  }
  setMessage(message) {
    this.message = message;
  }
  setHint(hint) {
    this.hint = hint;
  }
  setFrame(source, location) {
    this.frame = codeFrame(source, location);
  }
  static is(err) {
    return err.type === "AstroError";
  }
}

const PROP_TYPE = {
  Value: 0,
  JSON: 1,
  RegExp: 2,
  Date: 3,
  Map: 4,
  Set: 5,
  BigInt: 6,
  URL: 7,
  Uint8Array: 8,
  Uint16Array: 9,
  Uint32Array: 10
};
function serializeArray(value, metadata = {}, parents = /* @__PURE__ */ new WeakSet()) {
  if (parents.has(value)) {
    throw new Error(`Cyclic reference detected while serializing props for <${metadata.displayName} client:${metadata.hydrate}>!

Cyclic references cannot be safely serialized for client-side usage. Please remove the cyclic reference.`);
  }
  parents.add(value);
  const serialized = value.map((v) => {
    return convertToSerializedForm(v, metadata, parents);
  });
  parents.delete(value);
  return serialized;
}
function serializeObject(value, metadata = {}, parents = /* @__PURE__ */ new WeakSet()) {
  if (parents.has(value)) {
    throw new Error(`Cyclic reference detected while serializing props for <${metadata.displayName} client:${metadata.hydrate}>!

Cyclic references cannot be safely serialized for client-side usage. Please remove the cyclic reference.`);
  }
  parents.add(value);
  const serialized = Object.fromEntries(
    Object.entries(value).map(([k, v]) => {
      return [k, convertToSerializedForm(v, metadata, parents)];
    })
  );
  parents.delete(value);
  return serialized;
}
function convertToSerializedForm(value, metadata = {}, parents = /* @__PURE__ */ new WeakSet()) {
  const tag = Object.prototype.toString.call(value);
  switch (tag) {
    case "[object Date]": {
      return [PROP_TYPE.Date, value.toISOString()];
    }
    case "[object RegExp]": {
      return [PROP_TYPE.RegExp, value.source];
    }
    case "[object Map]": {
      return [
        PROP_TYPE.Map,
        JSON.stringify(serializeArray(Array.from(value), metadata, parents))
      ];
    }
    case "[object Set]": {
      return [
        PROP_TYPE.Set,
        JSON.stringify(serializeArray(Array.from(value), metadata, parents))
      ];
    }
    case "[object BigInt]": {
      return [PROP_TYPE.BigInt, value.toString()];
    }
    case "[object URL]": {
      return [PROP_TYPE.URL, value.toString()];
    }
    case "[object Array]": {
      return [PROP_TYPE.JSON, JSON.stringify(serializeArray(value, metadata, parents))];
    }
    case "[object Uint8Array]": {
      return [PROP_TYPE.Uint8Array, JSON.stringify(Array.from(value))];
    }
    case "[object Uint16Array]": {
      return [PROP_TYPE.Uint16Array, JSON.stringify(Array.from(value))];
    }
    case "[object Uint32Array]": {
      return [PROP_TYPE.Uint32Array, JSON.stringify(Array.from(value))];
    }
    default: {
      if (value !== null && typeof value === "object") {
        return [PROP_TYPE.Value, serializeObject(value, metadata, parents)];
      } else {
        return [PROP_TYPE.Value, value];
      }
    }
  }
}
function serializeProps(props, metadata) {
  const serialized = JSON.stringify(serializeObject(props, metadata));
  return serialized;
}

function serializeListValue(value) {
  const hash = {};
  push(value);
  return Object.keys(hash).join(" ");
  function push(item) {
    if (item && typeof item.forEach === "function")
      item.forEach(push);
    else if (item === Object(item))
      Object.keys(item).forEach((name) => {
        if (item[name])
          push(name);
      });
    else {
      item = item === false || item == null ? "" : String(item).trim();
      if (item) {
        item.split(/\s+/).forEach((name) => {
          hash[name] = true;
        });
      }
    }
  }
}
function isPromise(value) {
  return !!value && typeof value === "object" && typeof value.then === "function";
}

const HydrationDirectivesRaw = ["load", "idle", "media", "visible", "only"];
const HydrationDirectives = new Set(HydrationDirectivesRaw);
const HydrationDirectiveProps = new Set(HydrationDirectivesRaw.map((n) => `client:${n}`));
function extractDirectives(displayName, inputProps) {
  let extracted = {
    isPage: false,
    hydration: null,
    props: {}
  };
  for (const [key, value] of Object.entries(inputProps)) {
    if (key.startsWith("server:")) {
      if (key === "server:root") {
        extracted.isPage = true;
      }
    }
    if (key.startsWith("client:")) {
      if (!extracted.hydration) {
        extracted.hydration = {
          directive: "",
          value: "",
          componentUrl: "",
          componentExport: { value: "" }
        };
      }
      switch (key) {
        case "client:component-path": {
          extracted.hydration.componentUrl = value;
          break;
        }
        case "client:component-export": {
          extracted.hydration.componentExport.value = value;
          break;
        }
        case "client:component-hydration": {
          break;
        }
        case "client:display-name": {
          break;
        }
        default: {
          extracted.hydration.directive = key.split(":")[1];
          extracted.hydration.value = value;
          if (!HydrationDirectives.has(extracted.hydration.directive)) {
            throw new Error(
              `Error: invalid hydration directive "${key}". Supported hydration methods: ${Array.from(
                HydrationDirectiveProps
              ).join(", ")}`
            );
          }
          if (extracted.hydration.directive === "media" && typeof extracted.hydration.value !== "string") {
            throw new AstroError(AstroErrorData.MissingMediaQueryDirective);
          }
          break;
        }
      }
    } else if (key === "class:list") {
      if (value) {
        extracted.props[key.slice(0, -5)] = serializeListValue(value);
      }
    } else {
      extracted.props[key] = value;
    }
  }
  for (const sym of Object.getOwnPropertySymbols(inputProps)) {
    extracted.props[sym] = inputProps[sym];
  }
  return extracted;
}
async function generateHydrateScript(scriptOptions, metadata) {
  const { renderer, result, astroId, props, attrs } = scriptOptions;
  const { hydrate, componentUrl, componentExport } = metadata;
  if (!componentExport.value) {
    throw new Error(
      `Unable to resolve a valid export for "${metadata.displayName}"! Please open an issue at https://astro.build/issues!`
    );
  }
  const island = {
    children: "",
    props: {
      uid: astroId
    }
  };
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      island.props[key] = escapeHTML(value);
    }
  }
  island.props["component-url"] = await result.resolve(decodeURI(componentUrl));
  if (renderer.clientEntrypoint) {
    island.props["component-export"] = componentExport.value;
    island.props["renderer-url"] = await result.resolve(decodeURI(renderer.clientEntrypoint));
    island.props["props"] = escapeHTML(serializeProps(props, metadata));
  }
  island.props["ssr"] = "";
  island.props["client"] = hydrate;
  let beforeHydrationUrl = await result.resolve("astro:scripts/before-hydration.js");
  if (beforeHydrationUrl.length) {
    island.props["before-hydration-url"] = beforeHydrationUrl;
  }
  island.props["opts"] = escapeHTML(
    JSON.stringify({
      name: metadata.displayName,
      value: metadata.hydrateArgs || ""
    })
  );
  return island;
}

function validateComponentProps(props, displayName) {
  var _a;
  if (((_a = (Object.assign({"BASE_URL":"/","MODE":"production","DEV":false,"PROD":true},{}))) == null ? void 0 : _a.DEV) && props != null) {
    for (const prop of Object.keys(props)) {
      if (HydrationDirectiveProps.has(prop)) {
        console.warn(
          `You are attempting to render <${displayName} ${prop} />, but ${displayName} is an Astro component. Astro components do not render in the client and should not have a hydration directive. Please use a framework component for client rendering.`
        );
      }
    }
  }
}
class AstroComponent {
  constructor(htmlParts, expressions) {
    this.htmlParts = htmlParts;
    this.error = void 0;
    this.expressions = expressions.map((expression) => {
      if (isPromise(expression)) {
        return Promise.resolve(expression).catch((err) => {
          if (!this.error) {
            this.error = err;
            throw err;
          }
        });
      }
      return expression;
    });
  }
  get [Symbol.toStringTag]() {
    return "AstroComponent";
  }
  async *[Symbol.asyncIterator]() {
    const { htmlParts, expressions } = this;
    for (let i = 0; i < htmlParts.length; i++) {
      const html = htmlParts[i];
      const expression = expressions[i];
      yield markHTMLString(html);
      yield* renderChild(expression);
    }
  }
}
function isAstroComponent(obj) {
  return typeof obj === "object" && Object.prototype.toString.call(obj) === "[object AstroComponent]";
}
function isAstroComponentFactory(obj) {
  return obj == null ? false : obj.isAstroComponentFactory === true;
}
async function* renderAstroComponent(component) {
  for await (const value of component) {
    if (value || value === 0) {
      for await (const chunk of renderChild(value)) {
        switch (chunk.type) {
          case "directive": {
            yield chunk;
            break;
          }
          default: {
            yield markHTMLString(chunk);
            break;
          }
        }
      }
    }
  }
}
async function renderToString(result, componentFactory, props, children) {
  const Component = await componentFactory(result, props, children);
  if (!isAstroComponent(Component)) {
    const response = Component;
    throw response;
  }
  let parts = new HTMLParts();
  for await (const chunk of renderAstroComponent(Component)) {
    parts.append(chunk, result);
  }
  return parts.toString();
}
async function renderToIterable(result, componentFactory, displayName, props, children) {
  validateComponentProps(props, displayName);
  const Component = await componentFactory(result, props, children);
  if (!isAstroComponent(Component)) {
    console.warn(
      `Returning a Response is only supported inside of page components. Consider refactoring this logic into something like a function that can be used in the page.`
    );
    const response = Component;
    throw response;
  }
  return renderAstroComponent(Component);
}
async function renderTemplate(htmlParts, ...expressions) {
  return new AstroComponent(htmlParts, expressions);
}

async function* renderChild(child) {
  child = await child;
  if (child instanceof SlotString) {
    if (child.instructions) {
      yield* child.instructions;
    }
    yield child;
  } else if (isHTMLString(child)) {
    yield child;
  } else if (Array.isArray(child)) {
    for (const value of child) {
      yield markHTMLString(await renderChild(value));
    }
  } else if (typeof child === "function") {
    yield* renderChild(child());
  } else if (typeof child === "string") {
    yield markHTMLString(escapeHTML(child));
  } else if (!child && child !== 0) ; else if (child instanceof AstroComponent || Object.prototype.toString.call(child) === "[object AstroComponent]") {
    yield* renderAstroComponent(child);
  } else if (ArrayBuffer.isView(child)) {
    yield child;
  } else if (typeof child === "object" && (Symbol.asyncIterator in child || Symbol.iterator in child)) {
    yield* child;
  } else {
    yield child;
  }
}

const slotString = Symbol.for("astro:slot-string");
class SlotString extends HTMLString {
  constructor(content, instructions) {
    super(content);
    this.instructions = instructions;
    this[slotString] = true;
  }
}
function isSlotString(str) {
  return !!str[slotString];
}
async function renderSlot(_result, slotted, fallback) {
  if (slotted) {
    let iterator = renderChild(slotted);
    let content = "";
    let instructions = null;
    for await (const chunk of iterator) {
      if (chunk.type === "directive") {
        if (instructions === null) {
          instructions = [];
        }
        instructions.push(chunk);
      } else {
        content += chunk;
      }
    }
    return markHTMLString(new SlotString(content, instructions));
  }
  return fallback;
}
async function renderSlots(result, slots = {}) {
  let slotInstructions = null;
  let children = {};
  if (slots) {
    await Promise.all(
      Object.entries(slots).map(
        ([key, value]) => renderSlot(result, value).then((output) => {
          if (output.instructions) {
            if (slotInstructions === null) {
              slotInstructions = [];
            }
            slotInstructions.push(...output.instructions);
          }
          children[key] = output;
        })
      )
    );
  }
  return { slotInstructions, children };
}

const Fragment = Symbol.for("astro:fragment");
const Renderer = Symbol.for("astro:renderer");
const encoder = new TextEncoder();
const decoder = new TextDecoder();
function stringifyChunk(result, chunk) {
  switch (chunk.type) {
    case "directive": {
      const { hydration } = chunk;
      let needsHydrationScript = hydration && determineIfNeedsHydrationScript(result);
      let needsDirectiveScript = hydration && determinesIfNeedsDirectiveScript(result, hydration.directive);
      let prescriptType = needsHydrationScript ? "both" : needsDirectiveScript ? "directive" : null;
      if (prescriptType) {
        let prescripts = getPrescripts(prescriptType, hydration.directive);
        return markHTMLString(prescripts);
      } else {
        return "";
      }
    }
    default: {
      if (isSlotString(chunk)) {
        let out = "";
        const c = chunk;
        if (c.instructions) {
          for (const instr of c.instructions) {
            out += stringifyChunk(result, instr);
          }
        }
        out += chunk.toString();
        return out;
      }
      return chunk.toString();
    }
  }
}
class HTMLParts {
  constructor() {
    this.parts = "";
  }
  append(part, result) {
    if (ArrayBuffer.isView(part)) {
      this.parts += decoder.decode(part);
    } else {
      this.parts += stringifyChunk(result, part);
    }
  }
  toString() {
    return this.parts;
  }
  toArrayBuffer() {
    return encoder.encode(this.parts);
  }
}

const ClientOnlyPlaceholder = "astro-client-only";
class Skip {
  constructor(vnode) {
    this.vnode = vnode;
    this.count = 0;
  }
  increment() {
    this.count++;
  }
  haveNoTried() {
    return this.count === 0;
  }
  isCompleted() {
    return this.count > 2;
  }
}
Skip.symbol = Symbol("astro:jsx:skip");
let originalConsoleError;
let consoleFilterRefs = 0;
async function renderJSX(result, vnode) {
  switch (true) {
    case vnode instanceof HTMLString:
      if (vnode.toString().trim() === "") {
        return "";
      }
      return vnode;
    case typeof vnode === "string":
      return markHTMLString(escapeHTML(vnode));
    case typeof vnode === "function":
      return vnode;
    case (!vnode && vnode !== 0):
      return "";
    case Array.isArray(vnode):
      return markHTMLString(
        (await Promise.all(vnode.map((v) => renderJSX(result, v)))).join("")
      );
  }
  let skip;
  if (vnode.props) {
    if (vnode.props[Skip.symbol]) {
      skip = vnode.props[Skip.symbol];
    } else {
      skip = new Skip(vnode);
    }
  } else {
    skip = new Skip(vnode);
  }
  return renderJSXVNode(result, vnode, skip);
}
async function renderJSXVNode(result, vnode, skip) {
  if (isVNode(vnode)) {
    switch (true) {
      case !vnode.type: {
        throw new Error(`Unable to render ${result._metadata.pathname} because it contains an undefined Component!
Did you forget to import the component or is it possible there is a typo?`);
      }
      case vnode.type === Symbol.for("astro:fragment"):
        return renderJSX(result, vnode.props.children);
      case vnode.type.isAstroComponentFactory: {
        let props = {};
        let slots = {};
        for (const [key, value] of Object.entries(vnode.props ?? {})) {
          if (key === "children" || value && typeof value === "object" && value["$$slot"]) {
            slots[key === "children" ? "default" : key] = () => renderJSX(result, value);
          } else {
            props[key] = value;
          }
        }
        return markHTMLString(await renderToString(result, vnode.type, props, slots));
      }
      case (!vnode.type && vnode.type !== 0):
        return "";
      case (typeof vnode.type === "string" && vnode.type !== ClientOnlyPlaceholder):
        return markHTMLString(await renderElement$1(result, vnode.type, vnode.props ?? {}));
    }
    if (vnode.type) {
      let extractSlots2 = function(child) {
        if (Array.isArray(child)) {
          return child.map((c) => extractSlots2(c));
        }
        if (!isVNode(child)) {
          _slots.default.push(child);
          return;
        }
        if ("slot" in child.props) {
          _slots[child.props.slot] = [..._slots[child.props.slot] ?? [], child];
          delete child.props.slot;
          return;
        }
        _slots.default.push(child);
      };
      if (typeof vnode.type === "function" && vnode.type["astro:renderer"]) {
        skip.increment();
      }
      if (typeof vnode.type === "function" && vnode.props["server:root"]) {
        const output2 = await vnode.type(vnode.props ?? {});
        return await renderJSX(result, output2);
      }
      if (typeof vnode.type === "function") {
        if (skip.haveNoTried() || skip.isCompleted()) {
          useConsoleFilter();
          try {
            const output2 = await vnode.type(vnode.props ?? {});
            let renderResult;
            if (output2 && output2[AstroJSX]) {
              renderResult = await renderJSXVNode(result, output2, skip);
              return renderResult;
            } else if (!output2) {
              renderResult = await renderJSXVNode(result, output2, skip);
              return renderResult;
            }
          } catch (e) {
            if (skip.isCompleted()) {
              throw e;
            }
            skip.increment();
          } finally {
            finishUsingConsoleFilter();
          }
        } else {
          skip.increment();
        }
      }
      const { children = null, ...props } = vnode.props ?? {};
      const _slots = {
        default: []
      };
      extractSlots2(children);
      for (const [key, value] of Object.entries(props)) {
        if (value["$$slot"]) {
          _slots[key] = value;
          delete props[key];
        }
      }
      const slotPromises = [];
      const slots = {};
      for (const [key, value] of Object.entries(_slots)) {
        slotPromises.push(
          renderJSX(result, value).then((output2) => {
            if (output2.toString().trim().length === 0)
              return;
            slots[key] = () => output2;
          })
        );
      }
      await Promise.all(slotPromises);
      props[Skip.symbol] = skip;
      let output;
      if (vnode.type === ClientOnlyPlaceholder && vnode.props["client:only"]) {
        output = await renderComponent(
          result,
          vnode.props["client:display-name"] ?? "",
          null,
          props,
          slots
        );
      } else {
        output = await renderComponent(
          result,
          typeof vnode.type === "function" ? vnode.type.name : vnode.type,
          vnode.type,
          props,
          slots
        );
      }
      if (typeof output !== "string" && Symbol.asyncIterator in output) {
        let parts = new HTMLParts();
        for await (const chunk of output) {
          parts.append(chunk, result);
        }
        return markHTMLString(parts.toString());
      } else {
        return markHTMLString(output);
      }
    }
  }
  return markHTMLString(`${vnode}`);
}
async function renderElement$1(result, tag, { children, ...props }) {
  return markHTMLString(
    `<${tag}${spreadAttributes(props)}${markHTMLString(
      (children == null || children == "") && voidElementNames.test(tag) ? `/>` : `>${children == null ? "" : await renderJSX(result, children)}</${tag}>`
    )}`
  );
}
function useConsoleFilter() {
  consoleFilterRefs++;
  if (!originalConsoleError) {
    originalConsoleError = console.error;
    try {
      console.error = filteredConsoleError;
    } catch (error) {
    }
  }
}
function finishUsingConsoleFilter() {
  consoleFilterRefs--;
}
function filteredConsoleError(msg, ...rest) {
  if (consoleFilterRefs > 0 && typeof msg === "string") {
    const isKnownReactHookError = msg.includes("Warning: Invalid hook call.") && msg.includes("https://reactjs.org/link/invalid-hook-call");
    if (isKnownReactHookError)
      return;
  }
  originalConsoleError(msg, ...rest);
}

/**
 * shortdash - https://github.com/bibig/node-shorthash
 *
 * @license
 *
 * (The MIT License)
 *
 * Copyright (c) 2013 Bibig <bibig@me.com>
 *
 * Permission is hereby granted, free of charge, to any person
 * obtaining a copy of this software and associated documentation
 * files (the "Software"), to deal in the Software without
 * restriction, including without limitation the rights to use,
 * copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following
 * conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
 * OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
 * WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
 * OTHER DEALINGS IN THE SOFTWARE.
 */
const dictionary = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXY";
const binary = dictionary.length;
function bitwise(str) {
  let hash = 0;
  if (str.length === 0)
    return hash;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = (hash << 5) - hash + ch;
    hash = hash & hash;
  }
  return hash;
}
function shorthash(text) {
  let num;
  let result = "";
  let integer = bitwise(text);
  const sign = integer < 0 ? "Z" : "";
  integer = Math.abs(integer);
  while (integer >= binary) {
    num = integer % binary;
    integer = Math.floor(integer / binary);
    result = dictionary[num] + result;
  }
  if (integer > 0) {
    result = dictionary[integer] + result;
  }
  return sign + result;
}

const voidElementNames = /^(area|base|br|col|command|embed|hr|img|input|keygen|link|meta|param|source|track|wbr)$/i;
const htmlBooleanAttributes = /^(allowfullscreen|async|autofocus|autoplay|controls|default|defer|disabled|disablepictureinpicture|disableremoteplayback|formnovalidate|hidden|loop|nomodule|novalidate|open|playsinline|readonly|required|reversed|scoped|seamless|itemscope)$/i;
const htmlEnumAttributes = /^(contenteditable|draggable|spellcheck|value)$/i;
const svgEnumAttributes = /^(autoReverse|externalResourcesRequired|focusable|preserveAlpha)$/i;
const STATIC_DIRECTIVES = /* @__PURE__ */ new Set(["set:html", "set:text"]);
const toIdent = (k) => k.trim().replace(/(?:(?!^)\b\w|\s+|[^\w]+)/g, (match, index) => {
  if (/[^\w]|\s/.test(match))
    return "";
  return index === 0 ? match : match.toUpperCase();
});
const toAttributeString = (value, shouldEscape = true) => shouldEscape ? String(value).replace(/&/g, "&#38;").replace(/"/g, "&#34;") : value;
const kebab = (k) => k.toLowerCase() === k ? k : k.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
const toStyleString = (obj) => Object.entries(obj).map(([k, v]) => `${kebab(k)}:${v}`).join(";");
function defineScriptVars(vars) {
  let output = "";
  for (const [key, value] of Object.entries(vars)) {
    output += `const ${toIdent(key)} = ${JSON.stringify(value)};
`;
  }
  return markHTMLString(output);
}
function formatList(values) {
  if (values.length === 1) {
    return values[0];
  }
  return `${values.slice(0, -1).join(", ")} or ${values[values.length - 1]}`;
}
function addAttribute(value, key, shouldEscape = true) {
  if (value == null) {
    return "";
  }
  if (value === false) {
    if (htmlEnumAttributes.test(key) || svgEnumAttributes.test(key)) {
      return markHTMLString(` ${key}="false"`);
    }
    return "";
  }
  if (STATIC_DIRECTIVES.has(key)) {
    console.warn(`[astro] The "${key}" directive cannot be applied dynamically at runtime. It will not be rendered as an attribute.

Make sure to use the static attribute syntax (\`${key}={value}\`) instead of the dynamic spread syntax (\`{...{ "${key}": value }}\`).`);
    return "";
  }
  if (key === "class:list") {
    const listValue = toAttributeString(serializeListValue(value), shouldEscape);
    if (listValue === "") {
      return "";
    }
    return markHTMLString(` ${key.slice(0, -5)}="${listValue}"`);
  }
  if (key === "style" && !(value instanceof HTMLString) && typeof value === "object") {
    return markHTMLString(` ${key}="${toAttributeString(toStyleString(value), shouldEscape)}"`);
  }
  if (key === "className") {
    return markHTMLString(` class="${toAttributeString(value, shouldEscape)}"`);
  }
  if (value === true && (key.startsWith("data-") || htmlBooleanAttributes.test(key))) {
    return markHTMLString(` ${key}`);
  } else {
    return markHTMLString(` ${key}="${toAttributeString(value, shouldEscape)}"`);
  }
}
function internalSpreadAttributes(values, shouldEscape = true) {
  let output = "";
  for (const [key, value] of Object.entries(values)) {
    output += addAttribute(value, key, shouldEscape);
  }
  return markHTMLString(output);
}
function renderElement(name, { props: _props, children = "" }, shouldEscape = true) {
  const { lang: _, "data-astro-id": astroId, "define:vars": defineVars, ...props } = _props;
  if (defineVars) {
    if (name === "style") {
      delete props["is:global"];
      delete props["is:scoped"];
    }
    if (name === "script") {
      delete props.hoist;
      children = defineScriptVars(defineVars) + "\n" + children;
    }
  }
  if ((children == null || children == "") && voidElementNames.test(name)) {
    return `<${name}${internalSpreadAttributes(props, shouldEscape)} />`;
  }
  return `<${name}${internalSpreadAttributes(props, shouldEscape)}>${children}</${name}>`;
}

function componentIsHTMLElement(Component) {
  return typeof HTMLElement !== "undefined" && HTMLElement.isPrototypeOf(Component);
}
async function renderHTMLElement(result, constructor, props, slots) {
  const name = getHTMLElementName(constructor);
  let attrHTML = "";
  for (const attr in props) {
    attrHTML += ` ${attr}="${toAttributeString(await props[attr])}"`;
  }
  return markHTMLString(
    `<${name}${attrHTML}>${await renderSlot(result, slots == null ? void 0 : slots.default)}</${name}>`
  );
}
function getHTMLElementName(constructor) {
  const definedName = customElements.getName(constructor);
  if (definedName)
    return definedName;
  const assignedName = constructor.name.replace(/^HTML|Element$/g, "").replace(/[A-Z]/g, "-$&").toLowerCase().replace(/^-/, "html-");
  return assignedName;
}

const rendererAliases = /* @__PURE__ */ new Map([["solid", "solid-js"]]);
function guessRenderers(componentUrl) {
  const extname = componentUrl == null ? void 0 : componentUrl.split(".").pop();
  switch (extname) {
    case "svelte":
      return ["@astrojs/svelte"];
    case "vue":
      return ["@astrojs/vue"];
    case "jsx":
    case "tsx":
      return ["@astrojs/react", "@astrojs/preact", "@astrojs/solid", "@astrojs/vue (jsx)"];
    default:
      return [
        "@astrojs/react",
        "@astrojs/preact",
        "@astrojs/solid",
        "@astrojs/vue",
        "@astrojs/svelte"
      ];
  }
}
function getComponentType(Component) {
  if (Component === Fragment) {
    return "fragment";
  }
  if (Component && typeof Component === "object" && Component["astro:html"]) {
    return "html";
  }
  if (isAstroComponentFactory(Component)) {
    return "astro-factory";
  }
  return "unknown";
}
async function renderComponent(result, displayName, Component, _props, slots = {}, route) {
  var _a, _b;
  Component = await Component ?? Component;
  switch (getComponentType(Component)) {
    case "fragment": {
      const children2 = await renderSlot(result, slots == null ? void 0 : slots.default);
      if (children2 == null) {
        return children2;
      }
      return markHTMLString(children2);
    }
    case "html": {
      const { slotInstructions: slotInstructions2, children: children2 } = await renderSlots(result, slots);
      const html2 = Component.render({ slots: children2 });
      const hydrationHtml = slotInstructions2 ? slotInstructions2.map((instr) => stringifyChunk(result, instr)).join("") : "";
      return markHTMLString(hydrationHtml + html2);
    }
    case "astro-factory": {
      async function* renderAstroComponentInline() {
        let iterable = await renderToIterable(result, Component, displayName, _props, slots);
        yield* iterable;
      }
      return renderAstroComponentInline();
    }
  }
  if (!Component && !_props["client:only"]) {
    throw new Error(
      `Unable to render ${displayName} because it is ${Component}!
Did you forget to import the component or is it possible there is a typo?`
    );
  }
  const { renderers } = result._metadata;
  const metadata = { displayName };
  const { hydration, isPage, props } = extractDirectives(displayName, _props);
  let html = "";
  let attrs = void 0;
  if (hydration) {
    metadata.hydrate = hydration.directive;
    metadata.hydrateArgs = hydration.value;
    metadata.componentExport = hydration.componentExport;
    metadata.componentUrl = hydration.componentUrl;
  }
  const probableRendererNames = guessRenderers(metadata.componentUrl);
  const validRenderers = renderers.filter((r) => r.name !== "astro:jsx");
  const { children, slotInstructions } = await renderSlots(result, slots);
  let renderer;
  if (metadata.hydrate !== "only") {
    let isTagged = false;
    try {
      isTagged = Component && Component[Renderer];
    } catch {
    }
    if (isTagged) {
      const rendererName = Component[Renderer];
      renderer = renderers.find(({ name }) => name === rendererName);
    }
    if (!renderer) {
      let error;
      for (const r of renderers) {
        try {
          if (await r.ssr.check.call({ result }, Component, props, children)) {
            renderer = r;
            break;
          }
        } catch (e) {
          error ?? (error = e);
        }
      }
      if (!renderer && error) {
        throw error;
      }
    }
    if (!renderer && typeof HTMLElement === "function" && componentIsHTMLElement(Component)) {
      const output = renderHTMLElement(result, Component, _props, slots);
      return output;
    }
  } else {
    if (metadata.hydrateArgs) {
      const passedName = metadata.hydrateArgs;
      const rendererName = rendererAliases.has(passedName) ? rendererAliases.get(passedName) : passedName;
      renderer = renderers.find(
        ({ name }) => name === `@astrojs/${rendererName}` || name === rendererName
      );
    }
    if (!renderer && validRenderers.length === 1) {
      renderer = validRenderers[0];
    }
    if (!renderer) {
      const extname = (_a = metadata.componentUrl) == null ? void 0 : _a.split(".").pop();
      renderer = renderers.filter(
        ({ name }) => name === `@astrojs/${extname}` || name === extname
      )[0];
    }
  }
  if (!renderer) {
    if (metadata.hydrate === "only") {
      throw new AstroError({
        ...AstroErrorData.NoClientOnlyHint,
        message: AstroErrorData.NoClientOnlyHint.message(metadata.displayName),
        hint: AstroErrorData.NoClientOnlyHint.hint(
          probableRendererNames.map((r) => r.replace("@astrojs/", "")).join("|")
        )
      });
    } else if (typeof Component !== "string") {
      const matchingRenderers = validRenderers.filter(
        (r) => probableRendererNames.includes(r.name)
      );
      const plural = validRenderers.length > 1;
      if (matchingRenderers.length === 0) {
        throw new AstroError({
          ...AstroErrorData.NoMatchingRenderer,
          message: AstroErrorData.NoMatchingRenderer.message(
            metadata.displayName,
            (_b = metadata == null ? void 0 : metadata.componentUrl) == null ? void 0 : _b.split(".").pop(),
            plural,
            validRenderers.length
          ),
          hint: AstroErrorData.NoMatchingRenderer.hint(
            formatList(probableRendererNames.map((r) => "`" + r + "`"))
          )
        });
      } else if (matchingRenderers.length === 1) {
        renderer = matchingRenderers[0];
        ({ html, attrs } = await renderer.ssr.renderToStaticMarkup.call(
          { result },
          Component,
          props,
          children,
          metadata
        ));
      } else {
        throw new Error(`Unable to render ${metadata.displayName}!

This component likely uses ${formatList(probableRendererNames)},
but Astro encountered an error during server-side rendering.

Please ensure that ${metadata.displayName}:
1. Does not unconditionally access browser-specific globals like \`window\` or \`document\`.
   If this is unavoidable, use the \`client:only\` hydration directive.
2. Does not conditionally return \`null\` or \`undefined\` when rendered on the server.

If you're still stuck, please open an issue on GitHub or join us at https://astro.build/chat.`);
      }
    }
  } else {
    if (metadata.hydrate === "only") {
      html = await renderSlot(result, slots == null ? void 0 : slots.fallback);
    } else {
      ({ html, attrs } = await renderer.ssr.renderToStaticMarkup.call(
        { result },
        Component,
        props,
        children,
        metadata
      ));
    }
  }
  if (renderer && !renderer.clientEntrypoint && renderer.name !== "@astrojs/lit" && metadata.hydrate) {
    throw new AstroError({
      ...AstroErrorData.NoClientEntrypoint,
      message: AstroErrorData.NoClientEntrypoint.message(
        displayName,
        metadata.hydrate,
        renderer.name
      )
    });
  }
  if (!html && typeof Component === "string") {
    const childSlots = Object.values(children).join("");
    const iterable = renderAstroComponent(
      await renderTemplate`<${Component}${internalSpreadAttributes(props)}${markHTMLString(
        childSlots === "" && voidElementNames.test(Component) ? `/>` : `>${childSlots}</${Component}>`
      )}`
    );
    html = "";
    for await (const chunk of iterable) {
      html += chunk;
    }
  }
  if (!hydration) {
    return async function* () {
      if (slotInstructions) {
        yield* slotInstructions;
      }
      if (isPage || (renderer == null ? void 0 : renderer.name) === "astro:jsx") {
        yield html;
      } else {
        yield markHTMLString(html.replace(/\<\/?astro-slot\>/g, ""));
      }
    }();
  }
  const astroId = shorthash(
    `<!--${metadata.componentExport.value}:${metadata.componentUrl}-->
${html}
${serializeProps(
      props,
      metadata
    )}`
  );
  const island = await generateHydrateScript(
    { renderer, result, astroId, props, attrs },
    metadata
  );
  let unrenderedSlots = [];
  if (html) {
    if (Object.keys(children).length > 0) {
      for (const key of Object.keys(children)) {
        if (!html.includes(key === "default" ? `<astro-slot>` : `<astro-slot name="${key}">`)) {
          unrenderedSlots.push(key);
        }
      }
    }
  } else {
    unrenderedSlots = Object.keys(children);
  }
  const template = unrenderedSlots.length > 0 ? unrenderedSlots.map(
    (key) => `<template data-astro-template${key !== "default" ? `="${key}"` : ""}>${children[key]}</template>`
  ).join("") : "";
  island.children = `${html ?? ""}${template}`;
  if (island.children) {
    island.props["await-children"] = "";
  }
  async function* renderAll() {
    if (slotInstructions) {
      yield* slotInstructions;
    }
    yield { type: "directive", hydration, result };
    yield markHTMLString(renderElement("astro-island", island, false));
  }
  return renderAll();
}

typeof process === "object" && Object.prototype.toString.call(process) === "[object process]";

function __astro_tag_component__(Component, rendererName) {
  if (!Component)
    return;
  if (typeof Component !== "function")
    return;
  Object.defineProperty(Component, Renderer, {
    value: rendererName,
    enumerable: false,
    writable: false
  });
}
function spreadAttributes(values, _name, { class: scopedClassName } = {}) {
  let output = "";
  if (scopedClassName) {
    if (typeof values.class !== "undefined") {
      values.class += ` ${scopedClassName}`;
    } else if (typeof values["class:list"] !== "undefined") {
      values["class:list"] = [values["class:list"], scopedClassName];
    } else {
      values.class = scopedClassName;
    }
  }
  for (const [key, value] of Object.entries(values)) {
    output += addAttribute(value, key, true);
  }
  return markHTMLString(output);
}

var isProduction$1 = process.env.NODE_ENV === 'production';
var prefix = 'Invariant failed';
function invariant(condition, message) {
    if (condition) {
        return;
    }
    if (isProduction$1) {
        throw new Error(prefix);
    }
    var provided = typeof message === 'function' ? message() : message;
    var value = provided ? "".concat(prefix, ": ").concat(provided) : prefix;
    throw new Error(value);
}

/**
 * store
 *
 * Copyright (c) TanStack
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE.md file in the root directory of this source tree.
 *
 * @license MIT
 */
class Store {
  listeners = new Set();
  batching = false;
  queue = [];
  constructor(initialState, options) {
    this.state = initialState;
    this.options = options;
  }
  subscribe = listener => {
    this.listeners.add(listener);
    const unsub = this.options?.onSubscribe?.(listener, this);
    return () => {
      this.listeners.delete(listener);
      unsub?.();
    };
  };
  setState = updater => {
    const previous = this.state;
    this.state = this.options?.updateFn ? this.options.updateFn(previous)(updater) : updater(previous);
    if (this.state === previous) return;
    this.options?.onUpdate?.(this.state, previous);
    this.queue.push(() => {
      this.listeners.forEach(listener => listener(this.state, previous));
    });
    this.#flush();
  };
  #flush = () => {
    if (this.batching) return;
    this.queue.forEach(cb => cb());
    this.queue = [];
  };
  batch = cb => {
    this.batching = true;
    cb();
    this.batching = false;
    this.#flush();
  };
}
function shallow(objA, objB) {
  if (Object.is(objA, objB)) {
    return true;
  }
  if (typeof objA !== 'object' || objA === null || typeof objB !== 'object' || objB === null) {
    return false;
  }

  // if (objA instanceof Map && objB instanceof Map) {
  //   if (objA.size !== objB.size) return false

  //   for (const [key, value] of objA) {
  //     if (!Object.is(value, objB.get(key))) {
  //       return false
  //     }
  //   }
  //   return true
  // }

  // if (objA instanceof Set && objB instanceof Set) {
  //   if (objA.size !== objB.size) return false

  //   for (const value of objA) {
  //     if (!objB.has(value)) {
  //       return false
  //     }
  //   }
  //   return true
  // }

  const keysA = Object.keys(objA);
  if (keysA.length !== Object.keys(objB).length) {
    return false;
  }
  for (let i = 0; i < keysA.length; i++) {
    if (!Object.prototype.hasOwnProperty.call(objB, keysA[i]) || !Object.is(objA[keysA[i]], objB[keysA[i]])) {
      return false;
    }
  }
  return true;
}

/**
 * react-store
 *
 * Copyright (c) TanStack
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE.md file in the root directory of this source tree.
 *
 * @license MIT
 */

function useStore(store, selector = d => d, compareShallow) {
  const slice = useSyncExternalStoreWithSelector(store.subscribe, () => store.state, () => store.state, selector, compareShallow ? shallow : undefined);
  return slice;
}

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
function replaceEqualDeep$1(prev, _next) {
  if (prev === _next) {
    return prev;
  }
  const next = _next;
  const array = Array.isArray(prev) && Array.isArray(next);
  if (array || isPlainObject$1(prev) && isPlainObject$1(next)) {
    const prevSize = array ? prev.length : Object.keys(prev).length;
    const nextItems = array ? next : Object.keys(next);
    const nextSize = nextItems.length;
    const copy = array ? [] : {};
    let equalItems = 0;
    for (let i = 0; i < nextSize; i++) {
      const key = array ? i : nextItems[i];
      copy[key] = replaceEqualDeep$1(prev[key], next[key]);
      if (copy[key] === prev[key]) {
        equalItems++;
      }
    }
    return prevSize === nextSize && equalItems === prevSize ? prev : copy;
  }
  return next;
}

// Copied from: https://github.com/jonschlinkert/is-plain-object
function isPlainObject$1(o) {
  if (!hasObjectPrototype$1(o)) {
    return false;
  }

  // If has modified constructor
  const ctor = o.constructor;
  if (typeof ctor === 'undefined') {
    return true;
  }

  // If has modified prototype
  const prot = ctor.prototype;
  if (!hasObjectPrototype$1(prot)) {
    return false;
  }

  // If constructor does not have an Object-specific method
  if (!prot.hasOwnProperty('isPrototypeOf')) {
    return false;
  }

  // Most likely a plain Object
  return true;
}
function hasObjectPrototype$1(o) {
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
          data: replaceEqualDeep$1(s.data, data),
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
  return JSON.stringify(queryKey, (_, val) => isPlainObject$1(val) ? Object.keys(val).sort().reduce((result, key) => {
    result[key] = val[key];
    return result;
  }, {}) : val);
}

/**
 * react-loaders
 *
 * Copyright (c) TanStack
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE.md file in the root directory of this source tree.
 *
 * @license MIT
 */

//

const loaderClientContext = /*#__PURE__*/React.createContext(null);
function LoaderClientProvider({
  loaderClient,
  children,
  ...rest
}) {
  loaderClient.options = {
    ...loaderClient.options,
    ...rest
  };
  return /*#__PURE__*/React.createElement(loaderClientContext.Provider, {
    value: loaderClient
  }, children);
}
function useLoaderInstance(opts) {
  // opts as typeof opts & {
  //   key?: TKey
  //   loader?: Loader<any, any, any, any>
  // }

  const loaderClient = React.useContext(loaderClientContext);
  const optsKey = opts.key;
  const optsLoader = opts.loader;
  invariant(loaderClient || optsLoader, 'useLoaderInstance must be used inside a <LoaderClientProvider> component!');
  const loader = optsLoader ?? loaderClient.getLoader({
    key: optsKey
  });
  const loaderInstance = loader.getInstance({
    variables: opts?.variables
  });
  if (loaderInstance.state.status === 'error' && (opts.throwOnError ?? true)) {
    throw loaderInstance.state.error;
  }
  if (opts?.strict ?? true) {
    invariant(typeof loaderInstance.state.data !== 'undefined', `useLoaderInstance:
  Loader instance { key: ${loader.key}, variables: ${opts.variables} }) is currently in a "${loaderInstance.state.status}" state. By default useLoaderInstance will throw an error if the loader instance is not in a "success" state. To avoid this error:
  
  - Load the loader instance before using it (e.g. via your router's onLoad or loader option)

  - Set opts.strict to false and handle the loading state in your component`);
  }
  React.useEffect(() => {
    loaderInstance.load();
  }, [loaderInstance]);
  useStore(loaderInstance.__store, d => opts?.track?.(d) ?? d, true);
  return loaderInstance;
}

var isProduction = process.env.NODE_ENV === 'production';
function warning(condition, message) {
  if (!isProduction) {
    if (condition) {
      return;
    }

    var text = "Warning: " + message;

    if (typeof console !== 'undefined') {
      console.warn(text);
    }

    try {
      throw Error(text);
    } catch (x) {}
  }
}

/**
 * router
 *
 * Copyright (c) TanStack
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE.md file in the root directory of this source tree.
 *
 * @license MIT
 */

// While the public API was clearly inspired by the "history" npm package,
// This implementation attempts to be more lightweight by
// making assumptions about the way TanStack Router works

const popStateEvent = 'popstate';
const beforeUnloadEvent = 'beforeunload';
const beforeUnloadListener = event => {
  event.preventDefault();
  // @ts-ignore
  return event.returnValue = '';
};
const stopBlocking = () => {
  removeEventListener(beforeUnloadEvent, beforeUnloadListener, {
    capture: true
  });
};
function createHistory(opts) {
  let currentLocation = opts.getLocation();
  let unsub = () => {};
  let listeners = new Set();
  let blockers = [];
  let queue = [];
  const tryFlush = () => {
    if (blockers.length) {
      blockers[0]?.(tryFlush, () => {
        blockers = [];
        stopBlocking();
      });
      return;
    }
    while (queue.length) {
      queue.shift()?.();
    }
    onUpdate();
  };
  const queueTask = task => {
    queue.push(task);
    tryFlush();
  };
  const onUpdate = () => {
    currentLocation = opts.getLocation();
    listeners.forEach(listener => listener());
  };
  return {
    get location() {
      return currentLocation;
    },
    listen: cb => {
      if (listeners.size === 0) {
        unsub = opts.listener(onUpdate);
      }
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
        if (listeners.size === 0) {
          unsub();
        }
      };
    },
    push: (path, state) => {
      queueTask(() => {
        opts.pushState(path, state);
      });
    },
    replace: (path, state) => {
      queueTask(() => {
        opts.replaceState(path, state);
      });
    },
    go: index => {
      queueTask(() => {
        opts.go(index);
      });
    },
    back: () => {
      queueTask(() => {
        opts.back();
      });
    },
    forward: () => {
      queueTask(() => {
        opts.forward();
      });
    },
    createHref: str => opts.createHref(str),
    block: cb => {
      blockers.push(cb);
      if (blockers.length === 1) {
        addEventListener(beforeUnloadEvent, beforeUnloadListener, {
          capture: true
        });
      }
      return () => {
        blockers = blockers.filter(b => b !== cb);
        if (!blockers.length) {
          stopBlocking();
        }
      };
    }
  };
}
function createBrowserHistory(opts) {
  const getHref = opts?.getHref ?? (() => `${window.location.pathname}${window.location.hash}${window.location.search}`);
  const createHref = opts?.createHref ?? (path => path);
  const getLocation = () => parseLocation(getHref(), history.state);
  return createHistory({
    getLocation,
    listener: onUpdate => {
      window.addEventListener(popStateEvent, onUpdate);
      return () => {
        window.removeEventListener(popStateEvent, onUpdate);
      };
    },
    pushState: (path, state) => {
      window.history.pushState({
        ...state,
        key: createRandomKey()
      }, '', createHref(path));
    },
    replaceState: (path, state) => {
      window.history.replaceState({
        ...state,
        key: createRandomKey()
      }, '', createHref(path));
    },
    back: () => window.history.back(),
    forward: () => window.history.forward(),
    go: n => window.history.go(n),
    createHref: path => createHref(path)
  });
}
function createMemoryHistory(opts = {
  initialEntries: ['/']
}) {
  const entries = opts.initialEntries;
  let index = opts.initialIndex ?? entries.length - 1;
  let currentState = {};
  const getLocation = () => parseLocation(entries[index], currentState);
  return createHistory({
    getLocation,
    listener: () => {
      return () => {};
    },
    pushState: (path, state) => {
      currentState = {
        ...state,
        key: createRandomKey()
      };
      entries.push(path);
      index++;
    },
    replaceState: (path, state) => {
      currentState = {
        ...state,
        key: createRandomKey()
      };
      entries[index] = path;
    },
    back: () => {
      index--;
    },
    forward: () => {
      index = Math.min(index + 1, entries.length - 1);
    },
    go: n => window.history.go(n),
    createHref: path => path
  });
}
function parseLocation(href, state) {
  let hashIndex = href.indexOf('#');
  let searchIndex = href.indexOf('?');
  return {
    href,
    pathname: href.substring(0, hashIndex > 0 ? searchIndex > 0 ? Math.min(hashIndex, searchIndex) : hashIndex : searchIndex > 0 ? searchIndex : href.length),
    hash: hashIndex > -1 ? href.substring(hashIndex, searchIndex) : '',
    search: searchIndex > -1 ? href.substring(searchIndex) : '',
    state
  };
}

// Thanks co-pilot!
function createRandomKey() {
  return (Math.random() + 1).toString(36).substring(7);
}

function last(arr) {
  return arr[arr.length - 1];
}
function isFunction(d) {
  return typeof d === 'function';
}
function functionalUpdate(updater, previous) {
  if (isFunction(updater)) {
    return updater(previous);
  }
  return updater;
}
function pick(parent, keys) {
  return keys.reduce((obj, key) => {
    obj[key] = parent[key];
    return obj;
  }, {});
}

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
function partialDeepEqual(a, b) {
  if (a === b) {
    return true;
  }
  if (typeof a !== typeof b) {
    return false;
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    return !Object.keys(b).some(key => !partialDeepEqual(a[key], b[key]));
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => partialDeepEqual(item, b[index]));
  }
  return false;
}

function joinPaths(paths) {
  return cleanPath(paths.filter(Boolean).join('/'));
}
function cleanPath(path) {
  // remove double slashes
  return path.replace(/\/{2,}/g, '/');
}
function trimPathLeft(path) {
  return path === '/' ? path : path.replace(/^\/{1,}/, '');
}
function trimPathRight(path) {
  return path === '/' ? path : path.replace(/\/{1,}$/, '');
}
function trimPath(path) {
  return trimPathRight(trimPathLeft(path));
}
function resolvePath(basepath, base, to) {
  base = base.replace(new RegExp(`^${basepath}`), '/');
  to = to.replace(new RegExp(`^${basepath}`), '/');
  let baseSegments = parsePathname(base);
  const toSegments = parsePathname(to);
  toSegments.forEach((toSegment, index) => {
    if (toSegment.value === '/') {
      if (!index) {
        // Leading slash
        baseSegments = [toSegment];
      } else if (index === toSegments.length - 1) {
        // Trailing Slash
        baseSegments.push(toSegment);
      } else ;
    } else if (toSegment.value === '..') {
      // Extra trailing slash? pop it off
      if (baseSegments.length > 1 && last(baseSegments)?.value === '/') {
        baseSegments.pop();
      }
      baseSegments.pop();
    } else if (toSegment.value === '.') {
      return;
    } else {
      baseSegments.push(toSegment);
    }
  });
  const joined = joinPaths([basepath, ...baseSegments.map(d => d.value)]);
  return cleanPath(joined);
}
function parsePathname(pathname) {
  if (!pathname) {
    return [];
  }
  pathname = cleanPath(pathname);
  const segments = [];
  if (pathname.slice(0, 1) === '/') {
    pathname = pathname.substring(1);
    segments.push({
      type: 'pathname',
      value: '/'
    });
  }
  if (!pathname) {
    return segments;
  }

  // Remove empty segments and '.' segments
  const split = pathname.split('/').filter(Boolean);
  segments.push(...split.map(part => {
    if (part === '$' || part === '*') {
      return {
        type: 'wildcard',
        value: part
      };
    }
    if (part.charAt(0) === '$') {
      return {
        type: 'param',
        value: part
      };
    }
    return {
      type: 'pathname',
      value: part
    };
  }));
  if (pathname.slice(-1) === '/') {
    pathname = pathname.substring(1);
    segments.push({
      type: 'pathname',
      value: '/'
    });
  }
  return segments;
}
function interpolatePath(path, params, leaveWildcard) {
  const interpolatedPathSegments = parsePathname(path);
  return joinPaths(interpolatedPathSegments.map(segment => {
    if (['$', '*'].includes(segment.value) && !leaveWildcard) {
      return '';
    }
    if (segment.type === 'param') {
      return params[segment.value.substring(1)] ?? '';
    }
    return segment.value;
  }));
}
function matchPathname(basepath, currentPathname, matchLocation) {
  const pathParams = matchByPath(basepath, currentPathname, matchLocation);
  // const searchMatched = matchBySearch(currentLocation.search, matchLocation)

  if (matchLocation.to && !pathParams) {
    return;
  }
  return pathParams ?? {};
}
function matchByPath(basepath, from, matchLocation) {
  if (!from.startsWith(basepath)) {
    return undefined;
  }
  from = basepath != '/' ? from.substring(basepath.length) : from;
  const baseSegments = parsePathname(from);
  const to = `${matchLocation.to ?? '$'}`;
  const routeSegments = parsePathname(to);
  if (last(baseSegments)?.value === '/') {
    baseSegments.pop();
  }
  const params = {};
  let isMatch = (() => {
    for (let i = 0; i < Math.max(baseSegments.length, routeSegments.length); i++) {
      const baseSegment = baseSegments[i];
      const routeSegment = routeSegments[i];
      const isLastRouteSegment = i === routeSegments.length - 1;
      const isLastBaseSegment = i === baseSegments.length - 1;
      if (routeSegment) {
        if (routeSegment.type === 'wildcard') {
          if (baseSegment?.value) {
            params['*'] = joinPaths(baseSegments.slice(i).map(d => d.value));
            return true;
          }
          return false;
        }
        if (routeSegment.type === 'pathname') {
          if (routeSegment.value === '/' && !baseSegment?.value) {
            return true;
          }
          if (baseSegment) {
            if (matchLocation.caseSensitive) {
              if (routeSegment.value !== baseSegment.value) {
                return false;
              }
            } else if (routeSegment.value.toLowerCase() !== baseSegment.value.toLowerCase()) {
              return false;
            }
          }
        }
        if (!baseSegment) {
          return false;
        }
        if (routeSegment.type === 'param') {
          if (baseSegment?.value === '/') {
            return false;
          }
          if (baseSegment.value.charAt(0) !== '$') {
            params[routeSegment.value.substring(1)] = baseSegment.value;
          }
        }
      }
      if (isLastRouteSegment && !isLastBaseSegment) {
        return !!matchLocation.fuzzy;
      }
    }
    return true;
  })();
  return isMatch ? params : undefined;
}

// @ts-nocheck

// qss has been slightly modified and inlined here for our use cases (and compression's sake). We've included it as a hard dependency for MIT license attribution.

function encode(obj, pfx) {
  var k,
    i,
    tmp,
    str = '';
  for (k in obj) {
    if ((tmp = obj[k]) !== void 0) {
      if (Array.isArray(tmp)) {
        for (i = 0; i < tmp.length; i++) {
          str && (str += '&');
          str += encodeURIComponent(k) + '=' + encodeURIComponent(tmp[i]);
        }
      } else {
        str && (str += '&');
        str += encodeURIComponent(k) + '=' + encodeURIComponent(tmp);
      }
    }
  }
  return (pfx || '') + str;
}
function toValue(mix) {
  if (!mix) return '';
  var str = decodeURIComponent(mix);
  if (str === 'false') return false;
  if (str === 'true') return true;
  if (str.charAt(0) === '0') return str;
  return +str * 0 === 0 ? +str : str;
}
function decode(str) {
  var tmp,
    k,
    out = {},
    arr = str.split('&');
  while (tmp = arr.shift()) {
    tmp = tmp.split('=');
    k = tmp.shift();
    if (out[k] !== void 0) {
      out[k] = [].concat(out[k], toValue(tmp.shift()));
    } else {
      out[k] = toValue(tmp.shift());
    }
  }
  return out;
}

const rootRouteId = '__root__';
class Route {
  // Set up in this.init()

  // customId!: TCustomId

  // Optional

  constructor(options) {
    this.options = options || {};
    this.isRoot = !options?.getParentRoute;
  }
  init = opts => {
    this.originalIndex = opts.originalIndex;
    this.router = opts.router;
    const allOptions = this.options;
    const isRoot = !allOptions?.path && !allOptions?.id;
    this.parentRoute = this.options?.getParentRoute?.();
    if (isRoot) {
      this.path = rootRouteId;
    } else {
      invariant(this.parentRoute, `Child Route instances must pass a 'getParentRoute: () => ParentRoute' option that returns a Route instance.`);
    }
    let path = isRoot ? rootRouteId : allOptions.path;

    // If the path is anything other than an index path, trim it up
    if (path && path !== '/') {
      path = trimPath(path);
    }
    const customId = allOptions?.id || path;

    // Strip the parentId prefix from the first level of children
    let id = isRoot ? rootRouteId : joinPaths([this.parentRoute.id === rootRouteId ? '' : this.parentRoute.id, customId]);
    if (path === rootRouteId) {
      path = '/';
    }
    if (id !== rootRouteId) {
      id = joinPaths(['/', id]);
    }
    const fullPath = id === rootRouteId ? '/' : trimPathRight(joinPaths([this.parentRoute.fullPath, path]));
    this.path = path;
    this.id = id;
    // this.customId = customId as TCustomId
    this.fullPath = fullPath;
  };
  addChildren = children => {
    this.children = children;
    return this;
  };

  // generate = (
  //   options: Omit<
  //     RouteOptions<
  //       TParentRoute,
  //       TCustomId,
  //       TPath,
  //       InferFullSearchSchema<TParentRoute>,
  //       TSearchSchema,
  //       TFullSearchSchema,
  //       TParentRoute['__types']['allParams'],
  //       TParams,
  //       TAllParams,
  //       TParentContext,
  //       TAllParentContext,
  //       TRouteContext,
  //       TContext
  //     >,
  //     'path'
  //   >,
  // ) => {
  //   invariant(
  //     false,
  //     `route.generate() is used by TanStack Router's file-based routing code generation and should not actually be called during runtime. `,
  //   )
  // }
}

class RootRoute extends Route {
  constructor(options) {
    super(options);
  }
  static withRouterContext = () => {
    return options => new RootRoute(options);
  };
}

// const rootRoute = new RootRoute({
//   validateSearch: () => null as unknown as { root?: boolean },
// })

// const aRoute = new Route({
//   getParentRoute: () => rootRoute,
//   path: 'a',
//   validateSearch: () => null as unknown as { a?: string },
// })

// const bRoute = new Route({
//   getParentRoute: () => aRoute,
//   path: 'b',
// })

// const rootIsRoot = rootRoute.isRoot
// //    ^?
// const aIsRoot = aRoute.isRoot
// //    ^?

// const rId = rootRoute.id
// //    ^?
// const aId = aRoute.id
// //    ^?
// const bId = bRoute.id
// //    ^?

// const rPath = rootRoute.fullPath
// //    ^?
// const aPath = aRoute.fullPath
// //    ^?
// const bPath = bRoute.fullPath
// //    ^?

// const rSearch = rootRoute.__types.fullSearchSchema
// //    ^?
// const aSearch = aRoute.__types.fullSearchSchema
// //    ^?
// const bSearch = bRoute.__types.fullSearchSchema
// //    ^?

// const config = rootRoute.addChildren([aRoute.addChildren([bRoute])])
// //    ^?

const defaultParseSearch = parseSearchWith(JSON.parse);
const defaultStringifySearch = stringifySearchWith(JSON.stringify);
function parseSearchWith(parser) {
  return searchStr => {
    if (searchStr.substring(0, 1) === '?') {
      searchStr = searchStr.substring(1);
    }
    let query = decode(searchStr);

    // Try to parse any query params that might be json
    for (let key in query) {
      const value = query[key];
      if (typeof value === 'string') {
        try {
          query[key] = parser(value);
        } catch (err) {
          //
        }
      }
    }
    return query;
  };
}
function stringifySearchWith(stringify) {
  return search => {
    search = {
      ...search
    };
    if (search) {
      Object.keys(search).forEach(key => {
        const val = search[key];
        if (typeof val === 'undefined' || val === undefined) {
          delete search[key];
        } else if (val && typeof val === 'object' && val !== null) {
          try {
            search[key] = stringify(val);
          } catch (err) {
            // silent
          }
        }
      });
    }
    const searchStr = encode(search).toString();
    return searchStr ? `?${searchStr}` : '';
  };
}

const defaultFetchServerDataFn = async ({
  router,
  routeMatch
}) => {
  const next = router.buildNext({
    to: '.',
    search: d => ({
      ...(d ?? {}),
      __data: {
        matchId: routeMatch.id
      }
    })
  });
  const res = await fetch(next.href, {
    method: 'GET',
    signal: routeMatch.abortController.signal
  });
  if (res.ok) {
    return res.json();
  }
  throw new Error('Failed to fetch match data');
};
class Router {
  #unsubHistory;
  startedLoadingAt = Date.now();
  resolveNavigation = () => {};
  constructor(options) {
    this.options = {
      defaultPreloadDelay: 50,
      context: undefined,
      ...options,
      stringifySearch: options?.stringifySearch ?? defaultStringifySearch,
      parseSearch: options?.parseSearch ?? defaultParseSearch,
      fetchServerDataFn: options?.fetchServerDataFn ?? defaultFetchServerDataFn
    };
    this.__store = new Store(getInitialRouterState(), {
      onUpdate: state => {
        this.state = state;
      }
    });
    this.state = this.__store.state;
    this.basepath = '';
    this.update(options);

    // Allow frameworks to hook into the router creation
    this.options.Router?.(this);
    const next = this.buildNext({
      hash: true,
      fromCurrent: true,
      search: true,
      state: true
    });
    if (this.state.latestLocation.href !== next.href) {
      this.#commitLocation({
        ...next,
        replace: true
      });
    }
  }
  reset = () => {
    this.__store.setState(s => Object.assign(s, getInitialRouterState()));
  };
  mount = () => {
    // Mount only does anything on the client
    if (!isServer$2) {
      // If the router matches are empty, start loading the matches
      if (!this.state.currentMatches.length) {
        this.safeLoad();
      }
    }
    return () => {};
  };
  update = opts => {
    Object.assign(this.options, opts);
    if (!this.history || this.options.history && this.options.history !== this.history) {
      if (this.#unsubHistory) {
        this.#unsubHistory();
      }
      this.history = this.options.history ?? (isServer$2 ? createMemoryHistory() : createBrowserHistory());
      const parsedLocation = this.#parseLocation();
      this.__store.setState(s => ({
        ...s,
        latestLocation: parsedLocation,
        currentLocation: parsedLocation
      }));
      this.#unsubHistory = this.history.listen(() => {
        this.safeLoad({
          next: this.#parseLocation(this.state.latestLocation)
        });
      });
    }
    const {
      basepath,
      routeTree
    } = this.options;
    this.basepath = `/${trimPath(basepath ?? '') ?? ''}`;
    if (routeTree) {
      this.routesById = {};
      this.routeTree = this.#buildRouteTree(routeTree);
    }
    return this;
  };
  buildNext = opts => {
    const next = this.#buildLocation(opts);
    const __matches = this.matchRoutes(next.pathname);
    return this.#buildLocation({
      ...opts,
      __matches
    });
  };
  cancelMatches = () => {
    [...this.state.currentMatches, ...(this.state.pendingMatches || [])].forEach(match => {
      match.cancel();
    });
  };
  safeLoad = opts => {
    this.load(opts).catch(err => {
      console.warn(err);
      invariant(false, 'Encountered an error during router.load()! ☝️.');
    });
  };
  load = async opts => {
    let now = Date.now();
    const startedAt = now;
    this.startedLoadingAt = startedAt;

    // Cancel any pending matches
    this.cancelMatches();
    let matches;
    this.__store.batch(() => {
      if (opts?.next) {
        // Ingest the new location
        this.__store.setState(s => ({
          ...s,
          latestLocation: opts.next
        }));
      }

      // Match the routes
      matches = this.matchRoutes(this.state.latestLocation.pathname, {
        strictParseParams: true
      });
      this.__store.setState(s => ({
        ...s,
        status: 'pending',
        pendingMatches: matches,
        pendingLocation: this.state.latestLocation
      }));
    });

    // Load the matches
    await this.loadMatches(matches, this.state.pendingLocation
    // opts
    );

    if (this.startedLoadingAt !== startedAt) {
      // Ignore side-effects of outdated side-effects
      return this.navigationPromise;
    }
    const previousMatches = this.state.currentMatches;
    const exiting = [],
      staying = [];
    previousMatches.forEach(d => {
      if (matches.find(dd => dd.id === d.id)) {
        staying.push(d);
      } else {
        exiting.push(d);
      }
    });
    const entering = matches.filter(d => {
      return !previousMatches.find(dd => dd.id === d.id);
    });
    now = Date.now();
    exiting.forEach(d => {
      d.__onExit?.({
        params: d.params,
        search: d.state.routeSearch
      });

      // Clear non-loading error states when match leaves
      if (d.state.status === 'error') {
        this.__store.setState(s => ({
          ...s,
          status: 'idle',
          error: undefined
        }));
      }
    });
    staying.forEach(d => {
      d.route.options.onTransition?.({
        params: d.params,
        search: d.state.routeSearch
      });
    });
    entering.forEach(d => {
      d.__onExit = d.route.options.onLoaded?.({
        params: d.params,
        search: d.state.search
      });
    });
    const prevLocation = this.state.currentLocation;
    this.__store.setState(s => ({
      ...s,
      status: 'idle',
      currentLocation: this.state.latestLocation,
      currentMatches: matches,
      pendingLocation: undefined,
      pendingMatches: undefined
    }));
    matches.forEach(match => {
      match.__commit();
    });
    if (prevLocation.href !== this.state.currentLocation.href) {
      this.options.onRouteChange?.();
    }
    this.resolveNavigation();
  };
  getRoute = id => {
    const route = this.routesById[id];
    invariant(route, `Route with id "${id}" not found`);
    return route;
  };
  loadRoute = async (navigateOpts = this.state.latestLocation) => {
    const next = this.buildNext(navigateOpts);
    const matches = this.matchRoutes(next.pathname, {
      strictParseParams: true
    });
    await this.loadMatches(matches, next);
    return matches;
  };
  preloadRoute = async (navigateOpts = this.state.latestLocation) => {
    const next = this.buildNext(navigateOpts);
    const matches = this.matchRoutes(next.pathname, {
      strictParseParams: true
    });
    await this.loadMatches(matches, next, {
      preload: true
    });
    return matches;
  };
  matchRoutes = (pathname, opts) => {
    const matches = [];
    if (!this.routeTree) {
      return matches;
    }
    const existingMatches = [...this.state.currentMatches, ...(this.state.pendingMatches ?? [])];
    const findInRouteTree = async routes => {
      const parentMatch = last(matches);
      let params = parentMatch?.params ?? {};
      const filteredRoutes = this.options.filterRoutes?.(routes) ?? routes;
      let matchingRoutes = [];
      const findMatchInRoutes = (parentRoutes, routes) => {
        routes.some(route => {
          const children = route.children;
          if (!route.path && children?.length) {
            return findMatchInRoutes([...matchingRoutes, route], children);
          }
          const fuzzy = !!(route.path !== '/' || children?.length);
          const matchParams = matchPathname(this.basepath, pathname, {
            to: route.fullPath,
            fuzzy,
            caseSensitive: route.options.caseSensitive ?? this.options.caseSensitive
          });
          if (matchParams) {
            let parsedParams;
            try {
              parsedParams = route.options.parseParams?.(matchParams) ?? matchParams;
            } catch (err) {
              if (opts?.strictParseParams) {
                throw err;
              }
            }
            params = {
              ...params,
              ...parsedParams
            };
          }
          if (!!matchParams) {
            matchingRoutes = [...parentRoutes, route];
          }
          return !!matchingRoutes.length;
        });
        return !!matchingRoutes.length;
      };
      findMatchInRoutes([], filteredRoutes);
      if (!matchingRoutes.length) {
        return;
      }
      matchingRoutes.forEach(foundRoute => {
        const interpolatedPath = interpolatePath(foundRoute.path, params);
        const matchId = interpolatePath(foundRoute.id, params, true);
        const match = existingMatches.find(d => d.id === matchId) || new RouteMatch(this, foundRoute, {
          id: matchId,
          params,
          pathname: joinPaths([this.basepath, interpolatedPath])
        });
        matches.push(match);
      });
      const foundRoute = last(matchingRoutes);
      const foundChildren = foundRoute.children;
      if (foundChildren?.length) {
        findInRouteTree(foundChildren);
      }
    };
    findInRouteTree([this.routeTree]);
    return matches;
  };
  loadMatches = async (resolvedMatches, location, opts) => {
    let firstBadMatchIndex;

    // Check each match middleware to see if the route can be accessed
    try {
      await Promise.all(resolvedMatches.map(async (match, index) => {
        try {
          await match.route.options.beforeLoad?.({
            router: this,
            match
          });
        } catch (err) {
          if (isRedirect(err)) {
            throw err;
          }
          firstBadMatchIndex = firstBadMatchIndex ?? index;
          const errorHandler = match.route.options.onBeforeLoadError ?? match.route.options.onError;
          try {
            errorHandler?.(err);
          } catch (errorHandlerErr) {
            if (isRedirect(errorHandlerErr)) {
              throw errorHandlerErr;
            }
            match.__store.setState(s => ({
              ...s,
              error: errorHandlerErr,
              status: 'error',
              updatedAt: Date.now()
            }));
            return;
          }
          match.__store.setState(s => ({
            ...s,
            error: err,
            status: 'error',
            updatedAt: Date.now()
          }));
        }
      }));
    } catch (err) {
      if (isRedirect(err)) {
        if (!opts?.preload) {
          this.navigate(err);
        }
        return;
      }
      throw err; // we should never end up here
    }

    const validResolvedMatches = resolvedMatches.slice(0, firstBadMatchIndex);
    const matchPromises = validResolvedMatches.map(async (match, index) => {
      const parentMatch = validResolvedMatches[index - 1];
      match.__load({
        preload: opts?.preload,
        location,
        parentMatch
      });
      await match.__loadPromise;
      if (parentMatch) {
        await parentMatch.__loadPromise;
      }
    });
    await Promise.all(matchPromises);
  };
  reload = () => {
    this.navigate({
      fromCurrent: true,
      replace: true,
      search: true
    });
  };
  resolvePath = (from, path) => {
    return resolvePath(this.basepath, from, cleanPath(path));
  };
  navigate = async ({
    from,
    to = '',
    search,
    hash,
    replace,
    params
  }) => {
    // If this link simply reloads the current route,
    // make sure it has a new key so it will trigger a data refresh

    // If this `to` is a valid external URL, return
    // null for LinkUtils
    const toString = String(to);
    const fromString = typeof from === 'undefined' ? from : String(from);
    let isExternal;
    try {
      new URL(`${toString}`);
      isExternal = true;
    } catch (e) {}
    invariant(!isExternal, 'Attempting to navigate to external url with this.navigate!');
    return this.#commitLocation({
      from: fromString,
      to: toString,
      search,
      hash,
      replace,
      params
    });
  };
  matchRoute = (location, opts) => {
    location = {
      ...location,
      to: location.to ? this.resolvePath(location.from ?? '', location.to) : undefined
    };
    const next = this.buildNext(location);
    const baseLocation = opts?.pending ? this.state.pendingLocation : this.state.currentLocation;
    if (!baseLocation) {
      return false;
    }
    const match = matchPathname(this.basepath, baseLocation.pathname, {
      ...opts,
      to: next.pathname
    });
    if (!match) {
      return false;
    }
    if (opts?.includeSearch ?? true) {
      return partialDeepEqual(baseLocation.search, next.search) ? match : false;
    }
    return match;
  };
  buildLink = ({
    from,
    to = '.',
    search,
    params,
    hash,
    target,
    replace,
    activeOptions,
    preload,
    preloadDelay: userPreloadDelay,
    disabled
  }) => {
    // If this link simply reloads the current route,
    // make sure it has a new key so it will trigger a data refresh

    // If this `to` is a valid external URL, return
    // null for LinkUtils

    try {
      new URL(`${to}`);
      return {
        type: 'external',
        href: to
      };
    } catch (e) {}
    const nextOpts = {
      from,
      to,
      search,
      params,
      hash,
      replace
    };
    const next = this.buildNext(nextOpts);
    preload = preload ?? this.options.defaultPreload;
    const preloadDelay = userPreloadDelay ?? this.options.defaultPreloadDelay ?? 0;

    // Compare path/hash for matches
    const currentPathSplit = this.state.currentLocation.pathname.split('/');
    const nextPathSplit = next.pathname.split('/');
    const pathIsFuzzyEqual = nextPathSplit.every((d, i) => d === currentPathSplit[i]);
    // Combine the matches based on user options
    const pathTest = activeOptions?.exact ? this.state.currentLocation.pathname === next.pathname : pathIsFuzzyEqual;
    const hashTest = activeOptions?.includeHash ? this.state.currentLocation.hash === next.hash : true;
    const searchTest = activeOptions?.includeSearch ?? true ? partialDeepEqual(this.state.currentLocation.search, next.search) : true;

    // The final "active" test
    const isActive = pathTest && hashTest && searchTest;

    // The click handler
    const handleClick = e => {
      if (!disabled && !isCtrlEvent(e) && !e.defaultPrevented && (!target || target === '_self') && e.button === 0) {
        e.preventDefault();

        // All is well? Navigate!
        this.#commitLocation(nextOpts);
      }
    };

    // The click handler
    const handleFocus = e => {
      if (preload) {
        this.preloadRoute(nextOpts).catch(err => {
          console.warn(err);
          console.warn('Error preloading route! ☝️');
        });
      }
    };
    const handleTouchStart = e => {
      this.preloadRoute(nextOpts).catch(err => {
        console.warn(err);
        console.warn('Error preloading route! ☝️');
      });
    };
    const handleEnter = e => {
      const target = e.target || {};
      if (preload) {
        if (target.preloadTimeout) {
          return;
        }
        target.preloadTimeout = setTimeout(() => {
          target.preloadTimeout = null;
          this.preloadRoute(nextOpts).catch(err => {
            console.warn(err);
            console.warn('Error preloading route! ☝️');
          });
        }, preloadDelay);
      }
    };
    const handleLeave = e => {
      const target = e.target || {};
      if (target.preloadTimeout) {
        clearTimeout(target.preloadTimeout);
        target.preloadTimeout = null;
      }
    };
    return {
      type: 'internal',
      next,
      handleFocus,
      handleClick,
      handleEnter,
      handleLeave,
      handleTouchStart,
      isActive,
      disabled
    };
  };
  dehydrate = () => {
    return {
      state: {
        ...pick(this.state, ['latestLocation', 'currentLocation', 'status', 'lastUpdated']),
        currentMatches: this.state.currentMatches.map(match => ({
          id: match.id,
          state: {
            status: match.state.status
          }
        }))
      }
    };
  };
  hydrate = dehydratedRouter => {
    this.__store.setState(s => {
      // Match the routes
      const currentMatches = this.matchRoutes(dehydratedRouter.state.latestLocation.pathname, {
        strictParseParams: true
      });
      currentMatches.forEach((match, index) => {
        const dehydratedMatch = dehydratedRouter.state.currentMatches[index];
        invariant(dehydratedMatch && dehydratedMatch.id === match.id, 'Oh no! There was a hydration mismatch when attempting to hydrate the state of the router! 😬');
        match.__store.setState(s => ({
          ...s,
          ...dehydratedMatch.state
        }));
      });
      return {
        ...s,
        ...dehydratedRouter.state,
        currentMatches
      };
    });
  };
  #buildRouteTree = routeTree => {
    const recurseRoutes = (routes, parentRoute) => {
      routes.forEach((route, i) => {
        route.init({
          originalIndex: i,
          router: this
        });
        const existingRoute = this.routesById[route.id];
        invariant(!existingRoute, `Duplicate routes found with id: ${String(route.id)}`);
        this.routesById[route.id] = route;
        const children = route.children;
        if (children?.length) {
          recurseRoutes(children);
          route.children = children.map((d, i) => {
            const parsed = parsePathname(trimPathLeft(cleanPath(d.path ?? '/')));
            while (parsed.length > 1 && parsed[0]?.value === '/') {
              parsed.shift();
            }
            let score = 0;
            parsed.forEach((d, i) => {
              let modifier = 1;
              while (i--) {
                modifier *= 0.001;
              }
              if (d.type === 'pathname' && d.value !== '/') {
                score += 1 * modifier;
              } else if (d.type === 'param') {
                score += 2 * modifier;
              } else if (d.type === 'wildcard') {
                score += 3 * modifier;
              }
            });
            return {
              child: d,
              parsed,
              index: i,
              score
            };
          }).sort((a, b) => {
            if (a.score !== b.score) {
              return a.score - b.score;
            }
            return a.index - b.index;
          }).map(d => d.child);
        }
      });
    };
    recurseRoutes([routeTree]);
    const recurceCheckRoutes = (routes, parentRoute) => {
      routes.forEach(route => {
        if (route.isRoot) {
          invariant(!parentRoute, 'Root routes can only be used as the root of a route tree.');
        } else {
          invariant(parentRoute ? route.parentRoute === parentRoute : true, `Expected a route with path "${route.path}" to be passed to its parent route "${route.parentRoute?.id}" in an addChildren() call, but was instead passed as a child of the "${parentRoute?.id}" route.`);
        }
        if (route.children) {
          recurceCheckRoutes(route.children, route);
        }
      });
    };
    recurceCheckRoutes([routeTree], undefined);
    return routeTree;
  };
  #parseLocation = previousLocation => {
    let {
      pathname,
      search,
      hash,
      state
    } = this.history.location;
    const parsedSearch = this.options.parseSearch(search);
    return {
      pathname: pathname,
      searchStr: search,
      search: replaceEqualDeep(previousLocation?.search, parsedSearch),
      hash: hash.split('#').reverse()[0] ?? '',
      href: `${pathname}${search}${hash}`,
      state: state,
      key: state?.key || '__init__'
    };
  };
  #buildLocation = (dest = {}) => {
    dest.fromCurrent = dest.fromCurrent ?? dest.to === '';
    const fromPathname = dest.fromCurrent ? this.state.latestLocation.pathname : dest.from ?? this.state.latestLocation.pathname;
    let pathname = resolvePath(this.basepath ?? '/', fromPathname, `${dest.to ?? ''}`);
    const fromMatches = this.matchRoutes(this.state.latestLocation.pathname, {
      strictParseParams: true
    });
    const prevParams = {
      ...last(fromMatches)?.params
    };
    let nextParams = (dest.params ?? true) === true ? prevParams : functionalUpdate(dest.params, prevParams);
    if (nextParams) {
      dest.__matches?.map(d => d.route.options.stringifyParams).filter(Boolean).forEach(fn => {
        nextParams = {
          ...nextParams,
          ...fn(nextParams)
        };
      });
    }
    pathname = interpolatePath(pathname, nextParams ?? {});
    const preSearchFilters = dest.__matches?.map(match => match.route.options.preSearchFilters ?? []).flat().filter(Boolean) ?? [];
    const postSearchFilters = dest.__matches?.map(match => match.route.options.postSearchFilters ?? []).flat().filter(Boolean) ?? [];

    // Pre filters first
    const preFilteredSearch = preSearchFilters?.length ? preSearchFilters?.reduce((prev, next) => next(prev), this.state.latestLocation.search) : this.state.latestLocation.search;

    // Then the link/navigate function
    const destSearch = dest.search === true ? preFilteredSearch // Preserve resolvedFrom true
    : dest.search ? functionalUpdate(dest.search, preFilteredSearch) ?? {} // Updater
    : preSearchFilters?.length ? preFilteredSearch // Preserve resolvedFrom filters
    : {};

    // Then post filters
    const postFilteredSearch = postSearchFilters?.length ? postSearchFilters.reduce((prev, next) => next(prev), destSearch) : destSearch;
    const search = replaceEqualDeep(this.state.latestLocation.search, postFilteredSearch);
    const searchStr = this.options.stringifySearch(search);
    let hash = dest.hash === true ? this.state.latestLocation.hash : functionalUpdate(dest.hash, this.state.latestLocation.hash);
    hash = hash ? `#${hash}` : '';
    const nextState = dest.state === true ? this.state.latestLocation.state : functionalUpdate(dest.state, this.state.latestLocation.state);
    return {
      pathname,
      search,
      searchStr,
      state: nextState,
      hash,
      href: this.history.createHref(`${pathname}${searchStr}${hash}`),
      key: dest.key
    };
  };
  #commitLocation = async location => {
    const next = this.buildNext(location);
    const id = '' + Date.now() + Math.random();
    if (this.navigateTimeout) clearTimeout(this.navigateTimeout);
    let nextAction = 'replace';
    if (!location.replace) {
      nextAction = 'push';
    }
    const isSameUrl = this.state.latestLocation.href === next.href;
    if (isSameUrl && !next.key) {
      nextAction = 'replace';
    }
    const href = `${next.pathname}${next.searchStr}${next.hash ? `#${next.hash}` : ''}`;
    this.history[nextAction === 'push' ? 'push' : 'replace'](href, {
      id,
      ...next.state
    });
    return this.navigationPromise = new Promise(resolve => {
      const previousNavigationResolve = this.resolveNavigation;
      this.resolveNavigation = () => {
        previousNavigationResolve();
        resolve();
      };
    });
  };
}

// Detect if we're in the DOM
const isServer$2 = typeof window === 'undefined' || !window.document.createElement;
function getInitialRouterState() {
  return {
    status: 'idle',
    latestLocation: null,
    currentLocation: null,
    currentMatches: [],
    lastUpdated: Date.now()
  };
}
function isCtrlEvent(e) {
  return !!(e.metaKey || e.altKey || e.ctrlKey || e.shiftKey);
}
function isRedirect(obj) {
  return !!obj?.isRedirect;
}

const componentTypes = ['component', 'errorComponent', 'pendingComponent'];
class RouteMatch {
  abortController = new AbortController();
  constructor(router, route, opts) {
    Object.assign(this, {
      route,
      router,
      id: opts.id,
      pathname: opts.pathname,
      params: opts.params,
      __store: new Store({
        updatedAt: 0,
        routeSearch: {},
        search: {},
        status: 'idle'
      }, {
        onUpdate: next => {
          this.state = next;
        }
      })
    });
    this.state = this.__store.state;
    componentTypes.map(async type => {
      const component = this.route.options[type];
      if (typeof this[type] !== 'function') {
        this[type] = component;
      }
    });
    if (this.state.status === 'idle' && !this.#hasLoaders()) {
      this.__store.setState(s => ({
        ...s,
        status: 'success'
      }));
    }
  }
  #hasLoaders = () => {
    return !!(this.route.options.onLoad || componentTypes.some(d => this.route.options[d]?.preload));
  };
  __commit = () => {
    const {
      routeSearch,
      search,
      context,
      routeContext
    } = this.#resolveInfo({
      location: this.router.state.currentLocation
    });
    this.context = context;
    this.routeContext = routeContext;
    this.__store.setState(s => ({
      ...s,
      routeSearch: replaceEqualDeep(s.routeSearch, routeSearch),
      search: replaceEqualDeep(s.search, search)
    }));
  };
  cancel = () => {
    this.abortController?.abort();
  };
  #resolveSearchInfo = opts => {
    // Validate the search params and stabilize them
    const parentSearchInfo = this.parentMatch ? this.parentMatch.#resolveSearchInfo(opts) : {
      search: opts.location.search,
      routeSearch: opts.location.search
    };
    try {
      const validator = typeof this.route.options.validateSearch === 'object' ? this.route.options.validateSearch.parse : this.route.options.validateSearch;
      const routeSearch = validator?.(parentSearchInfo.search) ?? {};
      const search = {
        ...parentSearchInfo.search,
        ...routeSearch
      };
      return {
        routeSearch,
        search
      };
    } catch (err) {
      if (isRedirect(err)) {
        throw err;
      }
      const errorHandler = this.route.options.onValidateSearchError ?? this.route.options.onError;
      errorHandler?.(err);
      const error = new Error('Invalid search params found', {
        cause: err
      });
      error.code = 'INVALID_SEARCH_PARAMS';
      throw error;
    }
  };
  #resolveInfo = opts => {
    const {
      search,
      routeSearch
    } = this.#resolveSearchInfo(opts);
    try {
      const routeContext = this.route.options.getContext?.({
        parentContext: this.parentMatch?.routeContext ?? {},
        context: this.parentMatch?.context ?? this.router?.options.context ?? {},
        params: this.params,
        search
      }) || {};
      const context = {
        ...(this.parentMatch?.context ?? this.router?.options.context),
        ...routeContext
      };
      return {
        routeSearch,
        search,
        context,
        routeContext
      };
    } catch (err) {
      this.route.options.onError?.(err);
      throw err;
    }
  };
  __load = async opts => {
    this.parentMatch = opts.parentMatch;
    let info;
    try {
      info = this.#resolveInfo(opts);
    } catch (err) {
      if (isRedirect(err)) {
        if (!opts?.preload) {
          this.router.navigate(err);
        }
        return;
      }
      this.__store.setState(s => ({
        ...s,
        status: 'error',
        error: err
      }));

      // Do not proceed with loading the route
      return;
    }
    const {
      routeSearch,
      search,
      context,
      routeContext
    } = info;

    // If the match is invalid, errored or idle, trigger it to load
    if (this.state.status === 'pending') {
      return;
    }

    // TODO: Should load promises be tracked based on location?
    this.__loadPromise = Promise.resolve().then(async () => {
      const loadId = '' + Date.now() + Math.random();
      this.#latestId = loadId;
      const checkLatest = () => {
        return loadId !== this.#latestId ? this.__loadPromise : undefined;
      };
      let latestPromise;

      // If the match was in an error state, set it
      // to a loading state again. Otherwise, keep it
      // as loading or resolved
      if (this.state.status === 'idle') {
        this.__store.setState(s => ({
          ...s,
          status: 'pending'
        }));
      }
      const componentsPromise = (async () => {
        // then run all component and data loaders in parallel
        // For each component type, potentially load it asynchronously

        await Promise.all(componentTypes.map(async type => {
          const component = this.route.options[type];
          if (this[type]?.preload) {
            this[type] = await this.router.options.loadComponent(component);
          }
        }));
      })();
      const dataPromise = Promise.resolve().then(() => {
        if (this.route.options.onLoad) {
          return this.route.options.onLoad({
            params: this.params,
            routeSearch,
            search,
            signal: this.abortController.signal,
            preload: !!opts?.preload,
            routeContext: routeContext,
            context: context
          });
        }
        return;
      });
      try {
        await Promise.all([componentsPromise, dataPromise]);
        if (latestPromise = checkLatest()) return await latestPromise;
        this.__store.setState(s => ({
          ...s,
          error: undefined,
          status: 'success',
          updatedAt: Date.now()
        }));
      } catch (err) {
        if (isRedirect(err)) {
          if (!opts?.preload) {
            this.router.navigate(err);
          }
          return;
        }
        const errorHandler = this.route.options.onLoadError ?? this.route.options.onError;
        try {
          errorHandler?.(err);
        } catch (errorHandlerErr) {
          if (isRedirect(errorHandlerErr)) {
            if (!opts?.preload) {
              this.router.navigate(errorHandlerErr);
            }
            return;
          }
          this.__store.setState(s => ({
            ...s,
            error: errorHandlerErr,
            status: 'error',
            updatedAt: Date.now()
          }));
          return;
        }
        this.__store.setState(s => ({
          ...s,
          error: err,
          status: 'error',
          updatedAt: Date.now()
        }));
      } finally {
        delete this.__loadPromise;
      }
    });
    return this.__loadPromise;
  };
  #latestId = '';
}

/**
 * react-router
 *
 * Copyright (c) TanStack
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE.md file in the root directory of this source tree.
 *
 * @license MIT
 */

function _extends$1() {
  _extends$1 = Object.assign ? Object.assign.bind() : function (target) {
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
  return _extends$1.apply(this, arguments);
}
//

function useLinkProps(options) {
  const router = useRouterContext();
  const {
    // custom props
    type,
    children,
    target,
    activeProps = () => ({
      className: 'active'
    }),
    inactiveProps = () => ({}),
    activeOptions,
    disabled,
    // fromCurrent,
    hash,
    search,
    params,
    to = '.',
    preload,
    preloadDelay,
    replace,
    // element props
    style,
    className,
    onClick,
    onFocus,
    onMouseEnter,
    onMouseLeave,
    onTouchStart,
    ...rest
  } = options;
  const linkInfo = router.buildLink(options);
  if (linkInfo.type === 'external') {
    const {
      href
    } = linkInfo;
    return {
      href
    };
  }
  const {
    handleClick,
    handleFocus,
    handleEnter,
    handleLeave,
    handleTouchStart,
    isActive,
    next
  } = linkInfo;
  const reactHandleClick = e => {
    if (React.startTransition) {
      // This is a hack for react < 18
      React.startTransition(() => {
        handleClick(e);
      });
    } else {
      handleClick(e);
    }
  };
  const composeHandlers = handlers => e => {
    if (e.persist) e.persist();
    handlers.filter(Boolean).forEach(handler => {
      if (e.defaultPrevented) return;
      handler(e);
    });
  };

  // Get the active props
  const resolvedActiveProps = isActive ? functionalUpdate(activeProps, {}) ?? {} : {};

  // Get the inactive props
  const resolvedInactiveProps = isActive ? {} : functionalUpdate(inactiveProps, {}) ?? {};
  return {
    ...resolvedActiveProps,
    ...resolvedInactiveProps,
    ...rest,
    href: disabled ? undefined : next.href,
    onClick: composeHandlers([onClick, reactHandleClick]),
    onFocus: composeHandlers([onFocus, handleFocus]),
    onMouseEnter: composeHandlers([onMouseEnter, handleEnter]),
    onMouseLeave: composeHandlers([onMouseLeave, handleLeave]),
    onTouchStart: composeHandlers([onTouchStart, handleTouchStart]),
    target,
    style: {
      ...style,
      ...resolvedActiveProps.style,
      ...resolvedInactiveProps.style
    },
    className: [className, resolvedActiveProps.className, resolvedInactiveProps.className].filter(Boolean).join(' ') || undefined,
    ...(disabled ? {
      role: 'link',
      'aria-disabled': true
    } : undefined),
    ['data-status']: isActive ? 'active' : undefined
  };
}
const Link = /*#__PURE__*/React.forwardRef((props, ref) => {
  const linkProps = useLinkProps(props);
  return /*#__PURE__*/React.createElement("a", _extends$1({
    ref: ref
  }, linkProps, {
    children: typeof props.children === 'function' ? props.children({
      isActive: linkProps['data-status'] === 'active'
    }) : props.children
  }));
});
const matchesContext = /*#__PURE__*/React.createContext(null);
const routerContext = /*#__PURE__*/React.createContext(null);
class ReactRouter extends Router {
  constructor(opts) {
    super({
      ...opts,
      loadComponent: async component => {
        if (component.preload) {
          await component.preload();
        }
        return component;
      }
    });
  }
}
function RouterProvider({
  router,
  ...rest
}) {
  router.update(rest);
  const currentMatches = useStore(router.__store, s => s.currentMatches);
  React.useEffect(router.mount, [router]);
  return /*#__PURE__*/React.createElement(routerContext.Provider, {
    value: {
      router: router
    }
  }, /*#__PURE__*/React.createElement(matchesContext.Provider, {
    value: [undefined, ...currentMatches]
  }, /*#__PURE__*/React.createElement(CatchBoundary, {
    errorComponent: ErrorComponent,
    onCatch: () => {
      warning(false, `Error in router! Consider setting an 'errorComponent' in your RootRoute! 👍`);
    }
  }, /*#__PURE__*/React.createElement(Outlet, null))));
}
function useRouterContext() {
  const value = React.useContext(routerContext);
  warning(value, 'useRouter must be used inside a <Router> component!');
  useStore(value.router.__store);
  return value.router;
}
function useRouter(track, shallow) {
  const router = useRouterContext();
  useStore(router.__store, track, shallow);
  return router;
}
function useMatches() {
  return React.useContext(matchesContext);
}
function useParams(opts) {
  const router = useRouterContext();
  useStore(router.__store, d => {
    const params = last(d.currentMatches)?.params;
    return opts?.track?.(params) ?? params;
  }, true);
  return last(router.state.currentMatches)?.params;
}
function Outlet() {
  const matches = useMatches().slice(1);
  const match = matches[0];
  if (!match) {
    return null;
  }
  return /*#__PURE__*/React.createElement(SubOutlet, {
    matches: matches,
    match: match
  });
}
function SubOutlet({
  matches,
  match
}) {
  const router = useRouterContext();
  useStore(match.__store, store => [store.status, store.error], true);
  const defaultPending = React.useCallback(() => null, []);
  const PendingComponent = match.pendingComponent ?? router.options.defaultPendingComponent ?? defaultPending;
  const errorComponent = match.errorComponent ?? router.options.defaultErrorComponent;
  const ResolvedSuspenseBoundary = match.route.options.wrapInSuspense ?? true ? React.Suspense : SafeFragment;
  const ResolvedCatchBoundary = errorComponent ? CatchBoundary : SafeFragment;
  return /*#__PURE__*/React.createElement(matchesContext.Provider, {
    value: matches
  }, /*#__PURE__*/React.createElement(ResolvedSuspenseBoundary, {
    fallback: /*#__PURE__*/React.createElement(PendingComponent, null)
  }, /*#__PURE__*/React.createElement(ResolvedCatchBoundary, {
    key: match.route.id,
    errorComponent: errorComponent,
    onCatch: () => {
      warning(false, `Error in route match: ${match.id}`);
    }
  }, /*#__PURE__*/React.createElement(Inner, {
    match: match
  }))));
}
function Inner(props) {
  const router = useRouterContext();
  if (props.match.state.status === 'error') {
    throw props.match.state.error;
  }
  if (props.match.state.status === 'success') {
    return /*#__PURE__*/React.createElement(props.match.component ?? router.options.defaultComponent ?? Outlet);
  }
  if (props.match.state.status === 'pending') {
    throw props.match.__loadPromise;
  }
  invariant(false, 'Idle routeMatch status encountered during rendering! You should never see this. File an issue!');
}
function SafeFragment(props) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, props.children);
}

// This is the messiest thing ever... I'm either seriously tired (likely) or
// there has to be a better way to reset error boundaries when the
// router's location key changes.

class CatchBoundary extends React.Component {
  state = {
    error: false,
    info: undefined
  };
  componentDidCatch(error, info) {
    this.props.onCatch(error, info);
    console.error(error);
    this.setState({
      error,
      info
    });
  }
  render() {
    return /*#__PURE__*/React.createElement(CatchBoundaryInner, _extends$1({}, this.props, {
      errorState: this.state,
      reset: () => this.setState({})
    }));
  }
}
function CatchBoundaryInner(props) {
  const [activeErrorState, setActiveErrorState] = React.useState(props.errorState);
  const router = useRouterContext();
  const errorComponent = props.errorComponent ?? ErrorComponent;
  const prevKeyRef = React.useRef('');
  React.useEffect(() => {
    if (activeErrorState) {
      if (router.state.currentLocation.key !== prevKeyRef.current) {
        setActiveErrorState({});
      }
    }
    prevKeyRef.current = router.state.currentLocation.key;
  }, [activeErrorState, router.state.currentLocation.key]);
  React.useEffect(() => {
    if (props.errorState.error) {
      setActiveErrorState(props.errorState);
    }
    // props.reset()
  }, [props.errorState.error]);
  if (props.errorState.error && activeErrorState.error) {
    return /*#__PURE__*/React.createElement(errorComponent, activeErrorState);
  }
  return props.children;
}
function ErrorComponent({
  error
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '.5rem',
      maxWidth: '100%'
    }
  }, /*#__PURE__*/React.createElement("strong", {
    style: {
      fontSize: '1.2rem'
    }
  }, "Something went wrong!"), /*#__PURE__*/React.createElement("div", {
    style: {
      height: '.5rem'
    }
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("pre", {
    style: {
      fontSize: '.7em',
      border: '1px solid red',
      borderRadius: '.25rem',
      padding: '.5rem',
      color: 'red',
      overflow: 'auto'
    }
  }, error.message ? /*#__PURE__*/React.createElement("code", null, error.message) : null)));
}

const hydrationContext = React.createContext({});
function ServerContext(props) {
  return /* @__PURE__ */ jsx(hydrationContext.Provider, {
    value: {
      dehydratedRouter: props.dehydratedRouter,
      dehydratedLoaderClient: props.dehydratedLoaderClient
    },
    children: props.children
  });
}
function Hydrate(props) {
  let ctx = React.useContext(hydrationContext);
  React.useState(() => {
    if (typeof document !== "undefined") {
      ctx = window.__DEHYDRATED__ || {};
    }
    const {
      dehydratedRouter,
      dehydratedLoaderClient
    } = ctx;
    if (dehydratedRouter && dehydratedLoaderClient) {
      props.loaderClient.hydrate(dehydratedLoaderClient);
      props.router.hydrate(dehydratedRouter);
    }
  });
  return props.children;
}
__astro_tag_component__(ServerContext, "@astrojs/react");
__astro_tag_component__(Hydrate, "@astrojs/react");

const XBlingLocationHeader = "x-bling-location";
const LocationHeader = "Location";
const ContentTypeHeader = "content-type";
const XBlingResponseTypeHeader = "x-bling-response-type";
const XBlingContentTypeHeader = "x-bling-content-type";
const XBlingOrigin = "x-bling-origin";
const JSONResponseType = "application/json";
const redirectStatusCodes = /* @__PURE__ */ new Set([204, 301, 302, 303, 307, 308]);
function isRedirectResponse(response) {
  return response && response instanceof Response && redirectStatusCodes.has(response.status);
}
class ResponseError extends Error {
  status;
  headers;
  name = "ResponseError";
  ok;
  statusText;
  redirected;
  url;
  constructor(response) {
    let message = JSON.stringify({
      $type: "response",
      status: response.status,
      message: response.statusText,
      headers: [...response.headers.entries()]
    });
    super(message);
    this.status = response.status;
    this.headers = new Map([...response.headers.entries()]);
    this.url = response.url;
    this.ok = response.ok;
    this.statusText = response.statusText;
    this.redirected = response.redirected;
    this.bodyUsed = false;
    this.type = response.type;
    this.response = () => response;
  }
  response;
  type;
  clone() {
    return this.response();
  }
  get body() {
    return this.response().body;
  }
  bodyUsed;
  async arrayBuffer() {
    return await this.response().arrayBuffer();
  }
  async blob() {
    return await this.response().blob();
  }
  async formData() {
    return await this.response().formData();
  }
  async text() {
    return await this.response().text();
  }
  async json() {
    return await this.response().json();
  }
}

const deserializers = [];
const server$ = (_fn) => {
  throw new Error("Should be compiled away");
};
server$.addDeserializer = (deserializer) => {
  deserializers.push(deserializer);
};
server$.parseRequest = async function(event) {
  let request = event.request;
  let contentType = request.headers.get(ContentTypeHeader);
  let name = new URL(request.url).pathname, args = [];
  if (contentType) {
    if (contentType === JSONResponseType) {
      let text = await request.text();
      try {
        args = JSON.parse(text, (key, value) => {
          if (!value) {
            return value;
          }
          let deserializer = deserializers.find((d) => d.apply(value));
          if (deserializer) {
            return deserializer.deserialize(value, event);
          }
          return value;
        });
      } catch (e) {
        throw new Error(`Error parsing request body: ${text}`);
      }
    } else if (contentType.includes("form")) {
      let formData = await request.clone().formData();
      args = [formData, event];
    }
  }
  return [name, args];
};
server$.respondWith = function({ request }, data, responseType) {
  if (data instanceof ResponseError) {
    data = data.clone();
  }
  if (data instanceof Response) {
    if (isRedirectResponse(data) && request.headers.get(XBlingOrigin) === "client") {
      let headers = new Headers(data.headers);
      headers.set(XBlingOrigin, "server");
      headers.set(XBlingLocationHeader, data.headers.get(LocationHeader));
      headers.set(XBlingResponseTypeHeader, responseType);
      headers.set(XBlingContentTypeHeader, "response");
      return new Response(null, {
        status: 204,
        statusText: "Redirected",
        headers
      });
    } else if (data.status === 101) {
      return data;
    } else {
      let headers = new Headers(data.headers);
      headers.set(XBlingOrigin, "server");
      headers.set(XBlingResponseTypeHeader, responseType);
      headers.set(XBlingContentTypeHeader, "response");
      return new Response(data.body, {
        status: data.status,
        statusText: data.statusText,
        headers
      });
    }
  } else if (data instanceof Error) {
    console.error(data);
    return new Response(
      JSON.stringify({
        error: {
          stack: `This error happened inside a server function and you didn't handle it. So the client will receive an Internal Server Error. You can catch the error and throw a ServerError that makes sense for your UI. In production, the user will have no idea what the error is: 

${data.stack}`,
          status: data.status
        }
      }),
      {
        status: data.status || 500,
        headers: {
          [XBlingResponseTypeHeader]: responseType,
          [XBlingContentTypeHeader]: "error"
        }
      }
    );
  } else if (typeof data === "object" || typeof data === "string" || typeof data === "number" || typeof data === "boolean") {
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        [ContentTypeHeader]: "application/json",
        [XBlingResponseTypeHeader]: responseType,
        [XBlingContentTypeHeader]: "json"
      }
    });
  }
  return new Response("null", {
    status: 200,
    headers: {
      [ContentTypeHeader]: "application/json",
      [XBlingContentTypeHeader]: "json",
      [XBlingResponseTypeHeader]: responseType
    }
  });
};
async function handleEvent(event) {
  const url = new URL(event.request.url);
  if (server$.hasHandler(url.pathname)) {
    try {
      let [name, args] = await server$.parseRequest(event);
      let handler = server$.getHandler(name);
      if (!handler) {
        throw {
          status: 404,
          message: "Handler Not Found for " + name
        };
      }
      const data = await handler.call(
        event,
        ...Array.isArray(args) ? args : [args]
      );
      return server$.respondWith(event, data, "return");
    } catch (error) {
      return server$.respondWith(event, error, "throw");
    }
  }
  return null;
}
server$.normalizeArgs = (path, that, args, meta) => {
  let ctx;
  if (typeof that === "object") {
    ctx = that;
  }
  return [ctx, args];
};
const handlers = /* @__PURE__ */ new Map();
server$.createHandler = (impl, route, meta) => {
  let serverFunction = function(...args) {
    let [normalizedThis, normalizedArgs] = server$.normalizeArgs(
      route,
      this,
      args,
      meta
    );
    const execute = async () => {
      console.log("Executing", route);
      try {
        return impl.call(normalizedThis, ...normalizedArgs);
      } catch (e) {
        if (e instanceof Error && /[A-Za-z]+ is not defined/.test(e.message)) {
          const error = new Error(
            e.message + "\n You probably are using a variable defined in a closure in your server function."
          );
          error.stack = e.stack ?? "";
          throw error;
        }
        throw e;
      }
    };
    return execute();
  };
  serverFunction.url = route;
  serverFunction.action = function(...args) {
    return serverFunction.call(this, ...args);
  };
  return serverFunction;
};
server$.registerHandler = function(route, handler) {
  console.log("Registering handler", route);
  handlers.set(route, handler);
};
server$.getHandler = function(route) {
  return handlers.get(route);
};
server$.hasHandler = function(route) {
  return handlers.has(route);
};
server$.fetch = fetch;

/**
 * react-router-devtools
 *
 * Copyright (c) TanStack
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE.md file in the root directory of this source tree.
 *
 * @license MIT
 */

function _extends() {
  _extends = Object.assign ? Object.assign.bind() : function (target) {
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

const getItem = key => {
  try {
    const itemValue = localStorage.getItem(key);
    if (typeof itemValue === 'string') {
      return JSON.parse(itemValue);
    }
    return undefined;
  } catch {
    return undefined;
  }
};
function useLocalStorage(key, defaultValue) {
  const [value, setValue] = React__default.useState();
  React__default.useEffect(() => {
    const initialValue = getItem(key);
    if (typeof initialValue === 'undefined' || initialValue === null) {
      setValue(typeof defaultValue === 'function' ? defaultValue() : defaultValue);
    } else {
      setValue(initialValue);
    }
  }, [defaultValue, key]);
  const setter = React__default.useCallback(updater => {
    setValue(old => {
      let newVal = updater;
      if (typeof updater == 'function') {
        newVal = updater(old);
      }
      try {
        localStorage.setItem(key, JSON.stringify(newVal));
      } catch {}
      return newVal;
    });
  }, [key]);
  return [value, setter];
}

const defaultTheme = {
  background: '#0b1521',
  backgroundAlt: '#132337',
  foreground: 'white',
  gray: '#3f4e60',
  grayAlt: '#222e3e',
  inputBackgroundColor: '#fff',
  inputTextColor: '#000',
  success: '#00ab52',
  danger: '#ff0085',
  active: '#006bff',
  warning: '#ffb200'
};
const ThemeContext = /*#__PURE__*/React__default.createContext(defaultTheme);
function ThemeProvider({
  theme,
  ...rest
}) {
  return /*#__PURE__*/React__default.createElement(ThemeContext.Provider, _extends({
    value: theme
  }, rest));
}
function useTheme() {
  return React__default.useContext(ThemeContext);
}

function useMediaQuery(query) {
  // Keep track of the preference in state, start with the current match
  const [isMatch, setIsMatch] = React__default.useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia && window.matchMedia(query).matches;
    }
    return;
  });

  // Watch for changes
  React__default.useEffect(() => {
    if (typeof window !== 'undefined') {
      if (!window.matchMedia) {
        return;
      }

      // Create a matcher
      const matcher = window.matchMedia(query);

      // Create our handler
      const onChange = ({
        matches
      }) => setIsMatch(matches);

      // Listen for changes
      matcher.addListener(onChange);
      return () => {
        // Stop listening for changes
        matcher.removeListener(onChange);
      };
    }
    return;
  }, [isMatch, query, setIsMatch]);
  return isMatch;
}

const isServer$1 = typeof window === 'undefined';
function getStatusColor(match, theme) {
  return match.state.status === 'pending' ? theme.active : match.state.status === 'error' ? theme.danger : match.state.status === 'success' ? theme.success : theme.gray;
}
function styled(type, newStyles, queries = {}) {
  return /*#__PURE__*/React__default.forwardRef(({
    style,
    ...rest
  }, ref) => {
    const theme = useTheme();
    const mediaStyles = Object.entries(queries).reduce((current, [key, value]) => {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      return useMediaQuery(key) ? {
        ...current,
        ...(typeof value === 'function' ? value(rest, theme) : value)
      } : current;
    }, {});
    return /*#__PURE__*/React__default.createElement(type, {
      ...rest,
      style: {
        ...(typeof newStyles === 'function' ? newStyles(rest, theme) : newStyles),
        ...style,
        ...mediaStyles
      },
      ref
    });
  });
}
function useIsMounted() {
  const mountedRef = React__default.useRef(false);
  const isMounted = React__default.useCallback(() => mountedRef.current, []);
  React__default[isServer$1 ? 'useEffect' : 'useLayoutEffect'](() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  return isMounted;
}

/**
 * Displays a string regardless the type of the data
 * @param {unknown} value Value to be stringified
 */
const displayValue = value => {
  const name = Object.getOwnPropertyNames(Object(value));
  const newValue = typeof value === 'bigint' ? `${value.toString()}n` : value;
  return JSON.stringify(newValue, name);
};

/**
 * This hook is a safe useState version which schedules state updates in microtasks
 * to prevent updating a component state while React is rendering different components
 * or when the component is not mounted anymore.
 */
function useSafeState(initialState) {
  const isMounted = useIsMounted();
  const [state, setState] = React__default.useState(initialState);
  const safeSetState = React__default.useCallback(value => {
    scheduleMicrotask(() => {
      if (isMounted()) {
        setState(value);
      }
    });
  }, [isMounted]);
  return [state, safeSetState];
}

/**
 * Schedules a microtask.
 * This can be useful to schedule state updates after rendering.
 */
function scheduleMicrotask(callback) {
  Promise.resolve().then(callback).catch(error => setTimeout(() => {
    throw error;
  }));
}

const Panel = styled('div', (_props, theme) => ({
  fontSize: 'clamp(12px, 1.5vw, 14px)',
  fontFamily: `sans-serif`,
  display: 'flex',
  backgroundColor: theme.background,
  color: theme.foreground
}), {
  '(max-width: 700px)': {
    flexDirection: 'column'
  },
  '(max-width: 600px)': {
    fontSize: '.9em'
    // flexDirection: 'column',
  }
});

const ActivePanel = styled('div', () => ({
  flex: '1 1 500px',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'auto',
  height: '100%'
}), {
  '(max-width: 700px)': (_props, theme) => ({
    borderTop: `2px solid ${theme.gray}`
  })
});
const Button = styled('button', (props, theme) => ({
  appearance: 'none',
  fontSize: '.9em',
  fontWeight: 'bold',
  background: theme.gray,
  border: '0',
  borderRadius: '.3em',
  color: 'white',
  padding: '.5em',
  opacity: props.disabled ? '.5' : undefined,
  cursor: 'pointer'
}));

// export const QueryKeys = styled('span', {
//   display: 'inline-block',
//   fontSize: '0.9em',
// })

// export const QueryKey = styled('span', {
//   display: 'inline-flex',
//   alignItems: 'center',
//   padding: '.2em .4em',
//   fontWeight: 'bold',
//   textShadow: '0 0 10px black',
//   borderRadius: '.2em',
// })

const Code = styled('code', {
  fontSize: '.9em'
});

const Entry = styled('div', {
  fontFamily: 'Menlo, monospace',
  fontSize: '.7rem',
  lineHeight: '1.7',
  outline: 'none',
  wordBreak: 'break-word'
});
const Label = styled('span', {
  color: 'white'
});
const LabelButton = styled('button', {
  cursor: 'pointer',
  color: 'white'
});
const ExpandButton = styled('button', {
  cursor: 'pointer',
  color: 'inherit',
  font: 'inherit',
  outline: 'inherit',
  background: 'transparent',
  border: 'none',
  padding: 0
});
const Value = styled('span', (_props, theme) => ({
  color: theme.danger
}));
const SubEntries = styled('div', {
  marginLeft: '.1em',
  paddingLeft: '1em',
  borderLeft: '2px solid rgba(0,0,0,.15)'
});
const Info = styled('span', {
  color: 'grey',
  fontSize: '.7em'
});
const Expander = ({
  expanded,
  style = {}
}) => /*#__PURE__*/React.createElement("span", {
  style: {
    display: 'inline-block',
    transition: 'all .1s ease',
    transform: `rotate(${expanded ? 90 : 0}deg) ${style.transform || ''}`,
    ...style
  }
}, "\u25B6");
/**
 * Chunk elements in the array by size
 *
 * when the array cannot be chunked evenly by size, the last chunk will be
 * filled with the remaining elements
 *
 * @example
 * chunkArray(['a','b', 'c', 'd', 'e'], 2) // returns [['a','b'], ['c', 'd'], ['e']]
 */
function chunkArray(array, size) {
  if (size < 1) return [];
  let i = 0;
  const result = [];
  while (i < array.length) {
    result.push(array.slice(i, i + size));
    i = i + size;
  }
  return result;
}
const DefaultRenderer = ({
  handleEntry,
  label,
  value,
  subEntries = [],
  subEntryPages = [],
  type,
  expanded = false,
  toggleExpanded,
  pageSize,
  renderer
}) => {
  const [expandedPages, setExpandedPages] = React.useState([]);
  const [valueSnapshot, setValueSnapshot] = React.useState(undefined);
  const refreshValueSnapshot = () => {
    setValueSnapshot(value());
  };
  return /*#__PURE__*/React.createElement(Entry, null, subEntryPages.length ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(ExpandButton, {
    onClick: () => toggleExpanded()
  }, /*#__PURE__*/React.createElement(Expander, {
    expanded: expanded
  }), " ", label, ' ', /*#__PURE__*/React.createElement(Info, null, String(type).toLowerCase() === 'iterable' ? '(Iterable) ' : '', subEntries.length, " ", subEntries.length > 1 ? `items` : `item`)), expanded ? subEntryPages.length === 1 ? /*#__PURE__*/React.createElement(SubEntries, null, subEntries.map((entry, index) => handleEntry(entry))) : /*#__PURE__*/React.createElement(SubEntries, null, subEntryPages.map((entries, index) => /*#__PURE__*/React.createElement("div", {
    key: index
  }, /*#__PURE__*/React.createElement(Entry, null, /*#__PURE__*/React.createElement(LabelButton, {
    onClick: () => setExpandedPages(old => old.includes(index) ? old.filter(d => d !== index) : [...old, index])
  }, /*#__PURE__*/React.createElement(Expander, {
    expanded: expanded
  }), " [", index * pageSize, " ...", ' ', index * pageSize + pageSize - 1, "]"), expandedPages.includes(index) ? /*#__PURE__*/React.createElement(SubEntries, null, entries.map(entry => handleEntry(entry))) : null)))) : null) : type === 'function' ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Explorer, {
    renderer: renderer,
    label: /*#__PURE__*/React.createElement("button", {
      onClick: refreshValueSnapshot,
      style: {
        appearance: 'none',
        border: '0',
        background: 'transparent'
      }
    }, /*#__PURE__*/React.createElement(Label, null, label), " \uD83D\uDD04", ' '),
    value: valueSnapshot,
    defaultExpanded: {}
  })) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Label, null, label, ":"), " ", /*#__PURE__*/React.createElement(Value, null, displayValue(value))));
};
function isIterable(x) {
  return Symbol.iterator in x;
}
function Explorer({
  value,
  defaultExpanded,
  renderer = DefaultRenderer,
  pageSize = 100,
  ...rest
}) {
  const [expanded, setExpanded] = React.useState(Boolean(defaultExpanded));
  const toggleExpanded = React.useCallback(() => setExpanded(old => !old), []);
  let type = typeof value;
  let subEntries = [];
  const makeProperty = sub => {
    const subDefaultExpanded = defaultExpanded === true ? {
      [sub.label]: true
    } : defaultExpanded?.[sub.label];
    return {
      ...sub,
      defaultExpanded: subDefaultExpanded
    };
  };
  if (Array.isArray(value)) {
    type = 'array';
    subEntries = value.map((d, i) => makeProperty({
      label: i.toString(),
      value: d
    }));
  } else if (value !== null && typeof value === 'object' && isIterable(value) && typeof value[Symbol.iterator] === 'function') {
    type = 'Iterable';
    subEntries = Array.from(value, (val, i) => makeProperty({
      label: i.toString(),
      value: val
    }));
  } else if (typeof value === 'object' && value !== null) {
    type = 'object';
    subEntries = Object.entries(value).map(([key, val]) => makeProperty({
      label: key,
      value: val
    }));
  }
  const subEntryPages = chunkArray(subEntries, pageSize);
  return renderer({
    handleEntry: entry => /*#__PURE__*/React.createElement(Explorer, _extends({
      key: entry.label,
      value: value,
      renderer: renderer
    }, rest, entry)),
    type,
    subEntries,
    subEntryPages,
    value,
    expanded,
    toggleExpanded,
    pageSize,
    ...rest
  });
}

const isServer = typeof window === 'undefined';
function Logo(props) {
  return /*#__PURE__*/React__default.createElement("div", _extends({}, props, {
    style: {
      ...(props.style ?? {}),
      display: 'flex',
      alignItems: 'center',
      flexDirection: 'column',
      fontSize: '0.8rem',
      fontWeight: 'bolder',
      lineHeight: '1'
    }
  }), /*#__PURE__*/React__default.createElement("div", {
    style: {
      letterSpacing: '-0.05rem'
    }
  }, "TANSTACK"), /*#__PURE__*/React__default.createElement("div", {
    style: {
      backgroundImage: 'linear-gradient(to right, var(--tw-gradient-stops))',
      // @ts-ignore
      '--tw-gradient-from': '#84cc16',
      '--tw-gradient-stops': 'var(--tw-gradient-from), var(--tw-gradient-to)',
      '--tw-gradient-to': '#10b981',
      WebkitBackgroundClip: 'text',
      color: 'transparent',
      letterSpacing: '0.1rem',
      marginRight: '-0.2rem'
    }
  }, "ROUTER"));
}
function TanStackRouterDevtools({
  initialIsOpen,
  panelProps = {},
  closeButtonProps = {},
  toggleButtonProps = {},
  position = 'bottom-left',
  containerElement: Container = 'footer',
  router
}) {
  const rootRef = React__default.useRef(null);
  const panelRef = React__default.useRef(null);
  const [isOpen, setIsOpen] = useLocalStorage('tanstackRouterDevtoolsOpen', initialIsOpen);
  const [devtoolsHeight, setDevtoolsHeight] = useLocalStorage('tanstackRouterDevtoolsHeight', null);
  const [isResolvedOpen, setIsResolvedOpen] = useSafeState(false);
  const [isResizing, setIsResizing] = useSafeState(false);
  const isMounted = useIsMounted();
  const handleDragStart = (panelElement, startEvent) => {
    if (startEvent.button !== 0) return; // Only allow left click for drag

    setIsResizing(true);
    const dragInfo = {
      originalHeight: panelElement?.getBoundingClientRect().height ?? 0,
      pageY: startEvent.pageY
    };
    const run = moveEvent => {
      const delta = dragInfo.pageY - moveEvent.pageY;
      const newHeight = dragInfo?.originalHeight + delta;
      setDevtoolsHeight(newHeight);
      if (newHeight < 70) {
        setIsOpen(false);
      } else {
        setIsOpen(true);
      }
    };
    const unsub = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', run);
      document.removeEventListener('mouseUp', unsub);
    };
    document.addEventListener('mousemove', run);
    document.addEventListener('mouseup', unsub);
  };
  React__default.useEffect(() => {
    setIsResolvedOpen(isOpen ?? false);
  }, [isOpen, isResolvedOpen, setIsResolvedOpen]);

  // Toggle panel visibility before/after transition (depending on direction).
  // Prevents focusing in a closed panel.
  React__default.useEffect(() => {
    const ref = panelRef.current;
    if (ref) {
      const handlePanelTransitionStart = () => {
        if (ref && isResolvedOpen) {
          ref.style.visibility = 'visible';
        }
      };
      const handlePanelTransitionEnd = () => {
        if (ref && !isResolvedOpen) {
          ref.style.visibility = 'hidden';
        }
      };
      ref.addEventListener('transitionstart', handlePanelTransitionStart);
      ref.addEventListener('transitionend', handlePanelTransitionEnd);
      return () => {
        ref.removeEventListener('transitionstart', handlePanelTransitionStart);
        ref.removeEventListener('transitionend', handlePanelTransitionEnd);
      };
    }
    return;
  }, [isResolvedOpen]);
  React__default[isServer ? 'useEffect' : 'useLayoutEffect'](() => {
    if (isResolvedOpen) {
      const previousValue = rootRef.current?.parentElement?.style.paddingBottom;
      const run = () => {
        const containerHeight = panelRef.current?.getBoundingClientRect().height;
        if (rootRef.current?.parentElement) {
          rootRef.current.parentElement.style.paddingBottom = `${containerHeight}px`;
        }
      };
      run();
      if (typeof window !== 'undefined') {
        window.addEventListener('resize', run);
        return () => {
          window.removeEventListener('resize', run);
          if (rootRef.current?.parentElement && typeof previousValue === 'string') {
            rootRef.current.parentElement.style.paddingBottom = previousValue;
          }
        };
      }
    }
    return;
  }, [isResolvedOpen]);
  const {
    style: panelStyle = {},
    ...otherPanelProps
  } = panelProps;
  const {
    style: closeButtonStyle = {},
    onClick: onCloseClick,
    ...otherCloseButtonProps
  } = closeButtonProps;
  const {
    style: toggleButtonStyle = {},
    onClick: onToggleClick,
    ...otherToggleButtonProps
  } = toggleButtonProps;

  // Do not render on the server
  if (!isMounted()) return null;
  return /*#__PURE__*/React__default.createElement(Container, {
    ref: rootRef,
    className: "TanStackRouterDevtools"
  }, /*#__PURE__*/React__default.createElement(ThemeProvider, {
    theme: defaultTheme
  }, /*#__PURE__*/React__default.createElement(TanStackRouterDevtoolsPanel, _extends({
    ref: panelRef
  }, otherPanelProps, {
    router: router,
    style: {
      position: 'fixed',
      bottom: '0',
      right: '0',
      zIndex: 99999,
      width: '100%',
      height: devtoolsHeight ?? 500,
      maxHeight: '90%',
      boxShadow: '0 0 20px rgba(0,0,0,.3)',
      borderTop: `1px solid ${defaultTheme.gray}`,
      transformOrigin: 'top',
      // visibility will be toggled after transitions, but set initial state here
      visibility: isOpen ? 'visible' : 'hidden',
      ...panelStyle,
      ...(isResizing ? {
        transition: `none`
      } : {
        transition: `all .2s ease`
      }),
      ...(isResolvedOpen ? {
        opacity: 1,
        pointerEvents: 'all',
        transform: `translateY(0) scale(1)`
      } : {
        opacity: 0,
        pointerEvents: 'none',
        transform: `translateY(15px) scale(1.02)`
      })
    },
    isOpen: isResolvedOpen,
    setIsOpen: setIsOpen,
    handleDragStart: e => handleDragStart(panelRef.current, e)
  })), isResolvedOpen ? /*#__PURE__*/React__default.createElement(Button, _extends({
    type: "button",
    "aria-label": "Close TanStack Router Devtools"
  }, otherCloseButtonProps, {
    onClick: e => {
      setIsOpen(false);
      onCloseClick && onCloseClick(e);
    },
    style: {
      position: 'fixed',
      zIndex: 99999,
      margin: '.5em',
      bottom: 0,
      ...(position === 'top-right' ? {
        right: '0'
      } : position === 'top-left' ? {
        left: '0'
      } : position === 'bottom-right' ? {
        right: '0'
      } : {
        left: '0'
      }),
      ...closeButtonStyle
    }
  }), "Close") : null), !isResolvedOpen ? /*#__PURE__*/React__default.createElement("button", _extends({
    type: "button"
  }, otherToggleButtonProps, {
    "aria-label": "Open TanStack Router Devtools",
    onClick: e => {
      setIsOpen(true);
      onToggleClick && onToggleClick(e);
    },
    style: {
      appearance: 'none',
      background: 'none',
      border: 0,
      padding: 0,
      position: 'fixed',
      zIndex: 99999,
      display: 'inline-flex',
      fontSize: '1.5em',
      margin: '.5em',
      cursor: 'pointer',
      width: 'fit-content',
      ...(position === 'top-right' ? {
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
      }),
      ...toggleButtonStyle
    }
  }), /*#__PURE__*/React__default.createElement(Logo, {
    "aria-hidden": true
  })) : null);
}
const TanStackRouterDevtoolsPanel = /*#__PURE__*/React__default.forwardRef(function TanStackRouterDevtoolsPanel(props, ref) {
  const {
    isOpen = true,
    setIsOpen,
    handleDragStart,
    router: userRouter,
    ...panelProps
  } = props;
  const routerContextValue = React__default.useContext(routerContext);
  const router = userRouter ?? routerContextValue?.router;
  invariant(router, 'No router was found for the TanStack Router Devtools. Please place the devtools in the <RouterProvider> component tree or pass the router instance to the devtools manually.');
  useStore(router.__store);
  const [activeRouteId, setActiveRouteId] = useLocalStorage('tanstackRouterDevtoolsActiveRouteId', '');
  const [activeMatchId, setActiveMatchId] = useLocalStorage('tanstackRouterDevtoolsActiveMatchId', '');
  React__default.useEffect(() => {
    setActiveMatchId('');
  }, [activeRouteId]);
  const allMatches = React__default.useMemo(() => [...Object.values(router.state.currentMatches), ...Object.values(router.state.pendingMatches ?? [])], [router.state.currentMatches, router.state.pendingMatches]);
  const activeMatch = allMatches?.find(d => d.id === activeMatchId) || allMatches?.find(d => d.route.id === activeRouteId);
  return /*#__PURE__*/React__default.createElement(ThemeProvider, {
    theme: defaultTheme
  }, /*#__PURE__*/React__default.createElement(Panel, _extends({
    ref: ref,
    className: "TanStackRouterDevtoolsPanel"
  }, panelProps), /*#__PURE__*/React__default.createElement("style", {
    dangerouslySetInnerHTML: {
      __html: `

            .TanStackRouterDevtoolsPanel * {
              scrollbar-color: ${defaultTheme.backgroundAlt} ${defaultTheme.gray};
            }

            .TanStackRouterDevtoolsPanel *::-webkit-scrollbar, .TanStackRouterDevtoolsPanel scrollbar {
              width: 1em;
              height: 1em;
            }

            .TanStackRouterDevtoolsPanel *::-webkit-scrollbar-track, .TanStackRouterDevtoolsPanel scrollbar-track {
              background: ${defaultTheme.backgroundAlt};
            }

            .TanStackRouterDevtoolsPanel *::-webkit-scrollbar-thumb, .TanStackRouterDevtoolsPanel scrollbar-thumb {
              background: ${defaultTheme.gray};
              border-radius: .5em;
              border: 3px solid ${defaultTheme.backgroundAlt};
            }

            .TanStackRouterDevtoolsPanel table {
              width: 100%;
            }

            .TanStackRouterDevtoolsPanel table tr {
              border-bottom: 2px dotted rgba(255, 255, 255, .2);
            }

            .TanStackRouterDevtoolsPanel table tr:last-child {
              border-bottom: none
            }

            .TanStackRouterDevtoolsPanel table td {
              padding: .25rem .5rem;
              border-right: 2px dotted rgba(255, 255, 255, .05);
            }

            .TanStackRouterDevtoolsPanel table td:last-child {
              border-right: none
            }

          `
    }
  }), /*#__PURE__*/React__default.createElement("div", {
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
  }), /*#__PURE__*/React__default.createElement("div", {
    style: {
      flex: '1 1 500px',
      minHeight: '40%',
      maxHeight: '100%',
      overflow: 'auto',
      borderRight: `1px solid ${defaultTheme.grayAlt}`,
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React__default.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'start',
      gap: '1rem',
      padding: '1rem',
      alignItems: 'center',
      background: defaultTheme.backgroundAlt
    }
  }, /*#__PURE__*/React__default.createElement(Logo, {
    "aria-hidden": true
  }), /*#__PURE__*/React__default.createElement("div", {
    style: {
      fontSize: 'clamp(.8rem, 2vw, 1.3rem)',
      fontWeight: 'bold'
    }
  }, /*#__PURE__*/React__default.createElement("span", {
    style: {
      fontWeight: 100
    }
  }, "Devtools"))), /*#__PURE__*/React__default.createElement("div", {
    style: {
      overflowY: 'auto',
      flex: '1'
    }
  }, /*#__PURE__*/React__default.createElement("div", {
    style: {
      padding: '.5em'
    }
  }, /*#__PURE__*/React__default.createElement(Explorer, {
    label: "Router",
    value: router,
    defaultExpanded: {}
  })))), /*#__PURE__*/React__default.createElement("div", {
    style: {
      flex: '1 1 500px',
      minHeight: '40%',
      maxHeight: '100%',
      overflow: 'auto',
      borderRight: `1px solid ${defaultTheme.grayAlt}`,
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React__default.createElement("div", {
    style: {
      padding: '.5em',
      background: defaultTheme.backgroundAlt,
      position: 'sticky',
      top: 0,
      zIndex: 1
    }
  }, "Active Matches"), router.state.currentMatches.map((match, i) => {
    return /*#__PURE__*/React__default.createElement("div", {
      key: match.route.id || i,
      role: "button",
      "aria-label": `Open match details for ${match.route.id}`,
      onClick: () => setActiveRouteId(activeRouteId === match.route.id ? '' : match.route.id),
      style: {
        display: 'flex',
        borderBottom: `solid 1px ${defaultTheme.grayAlt}`,
        cursor: 'pointer',
        alignItems: 'center',
        background: match === activeMatch ? 'rgba(255,255,255,.1)' : undefined
      }
    }, /*#__PURE__*/React__default.createElement("div", {
      style: {
        flex: '0 0 auto',
        width: '1.3rem',
        height: '1.3rem',
        marginLeft: '.25rem',
        background: getStatusColor(match, defaultTheme),
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 'bold',
        borderRadius: '.25rem',
        transition: 'all .2s ease-out'
      }
    }), /*#__PURE__*/React__default.createElement(Code, {
      style: {
        padding: '.5em'
      }
    }, `${match.id}`));
  }), router.state.pendingMatches?.length ? /*#__PURE__*/React__default.createElement(React__default.Fragment, null, /*#__PURE__*/React__default.createElement("div", {
    style: {
      marginTop: '2rem',
      padding: '.5em',
      background: defaultTheme.backgroundAlt,
      position: 'sticky',
      top: 0,
      zIndex: 1
    }
  }, "Pending Matches"), router.state.pendingMatches?.map((match, i) => {
    return /*#__PURE__*/React__default.createElement("div", {
      key: match.route.id || i,
      role: "button",
      "aria-label": `Open match details for ${match.route.id}`,
      onClick: () => setActiveRouteId(activeRouteId === match.route.id ? '' : match.route.id),
      style: {
        display: 'flex',
        borderBottom: `solid 1px ${defaultTheme.grayAlt}`,
        cursor: 'pointer',
        background: match === activeMatch ? 'rgba(255,255,255,.1)' : undefined
      }
    }, /*#__PURE__*/React__default.createElement("div", {
      style: {
        flex: '0 0 auto',
        width: '1.3rem',
        height: '1.3rem',
        marginLeft: '.25rem',
        background: getStatusColor(match, defaultTheme),
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 'bold',
        borderRadius: '.25rem',
        transition: 'all .2s ease-out'
      }
    }), /*#__PURE__*/React__default.createElement(Code, {
      style: {
        padding: '.5em'
      }
    }, `${match.id}`));
  })) : null), activeMatch ? /*#__PURE__*/React__default.createElement(ActivePanel, null, /*#__PURE__*/React__default.createElement("div", {
    style: {
      padding: '.5em',
      background: defaultTheme.backgroundAlt,
      position: 'sticky',
      top: 0,
      bottom: 0,
      zIndex: 1
    }
  }, "Match Details"), /*#__PURE__*/React__default.createElement("div", null, /*#__PURE__*/React__default.createElement("table", null, /*#__PURE__*/React__default.createElement("tbody", null, /*#__PURE__*/React__default.createElement("tr", null, /*#__PURE__*/React__default.createElement("td", {
    style: {
      opacity: '.5'
    }
  }, "ID"), /*#__PURE__*/React__default.createElement("td", null, /*#__PURE__*/React__default.createElement(Code, {
    style: {
      lineHeight: '1.8em'
    }
  }, JSON.stringify(activeMatch.id, null, 2)))), /*#__PURE__*/React__default.createElement("tr", null, /*#__PURE__*/React__default.createElement("td", {
    style: {
      opacity: '.5'
    }
  }, "Status"), /*#__PURE__*/React__default.createElement("td", null, activeMatch.state.status)), /*#__PURE__*/React__default.createElement("tr", null, /*#__PURE__*/React__default.createElement("td", {
    style: {
      opacity: '.5'
    }
  }, "Last Updated"), /*#__PURE__*/React__default.createElement("td", null, activeMatch.state.updatedAt ? new Date(activeMatch.state.updatedAt).toLocaleTimeString() : 'N/A'))))), /*#__PURE__*/React__default.createElement("div", {
    style: {
      background: defaultTheme.backgroundAlt,
      padding: '.5em',
      position: 'sticky',
      top: 0,
      bottom: 0,
      zIndex: 1
    }
  }, "Actions"), /*#__PURE__*/React__default.createElement("div", {
    style: {
      padding: '0.5em'
    }
  }, /*#__PURE__*/React__default.createElement(Button, {
    type: "button",
    onClick: () => activeMatch.load(),
    style: {
      background: defaultTheme.gray
    }
  }, "Reload")), /*#__PURE__*/React__default.createElement("div", {
    style: {
      background: defaultTheme.backgroundAlt,
      padding: '.5em',
      position: 'sticky',
      top: 0,
      bottom: 0,
      zIndex: 1
    }
  }, "Explorer"), /*#__PURE__*/React__default.createElement("div", {
    style: {
      padding: '.5em'
    }
  }, /*#__PURE__*/React__default.createElement(Explorer, {
    label: "Match",
    value: activeMatch,
    defaultExpanded: {}
  }))) : null, /*#__PURE__*/React__default.createElement("div", {
    style: {
      flex: '1 1 500px',
      minHeight: '40%',
      maxHeight: '100%',
      overflow: 'auto',
      borderRight: `1px solid ${defaultTheme.grayAlt}`,
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React__default.createElement("div", {
    style: {
      padding: '.5em',
      background: defaultTheme.backgroundAlt,
      position: 'sticky',
      top: 0,
      bottom: 0,
      zIndex: 1
    }
  }, "Search Params"), /*#__PURE__*/React__default.createElement("div", {
    style: {
      padding: '.5em'
    }
  }, Object.keys(last(router.state.currentMatches)?.state.search || {}).length ? /*#__PURE__*/React__default.createElement(Explorer, {
    value: last(router.state.currentMatches)?.state.search || {},
    defaultExpanded: Object.keys(last(router.state.currentMatches)?.state.search || {}).reduce((obj, next) => {
      obj[next] = {};
      return obj;
    }, {})
  }) : /*#__PURE__*/React__default.createElement("em", {
    style: {
      opacity: 0.5
    }
  }, '{ }')))));
});

function Scripts() {
  const {
    dehydratedRouter,
    dehydratedLoaderClient
  } = React.useContext(hydrationContext);
  return /* @__PURE__ */ jsxs(Fragment$1, {
    children: [/* @__PURE__ */ jsx("script", {
      suppressHydrationWarning: true,
      dangerouslySetInnerHTML: {
        __html: `
          window.__DEHYDRATED__ = 
           ${JSON.stringify({
          dehydratedRouter,
          dehydratedLoaderClient
        })}
        `
      }
    }), /* @__PURE__ */ jsx("script", {
      type: "module",
      src: "/src/entry-client.tsx"
    })]
  });
}
__astro_tag_component__(Scripts, "@astrojs/react");

const rootRoute = RootRoute.withRouterContext()({
  component: Root,
  errorComponent: ({
    error
  }) => /* @__PURE__ */ jsx(ErrorComponent, {
    error
  })
});
function Root() {
  const router = useRouter();
  const titleMatch = [...router.state.currentMatches].reverse().find((d) => d.routeContext?.getTitle);
  const title = titleMatch?.context?.getTitle?.() ?? "Astro + TanStack Router";
  return /* @__PURE__ */ jsxs("html", {
    lang: "en",
    children: [/* @__PURE__ */ jsxs("head", {
      children: [/* @__PURE__ */ jsx("meta", {
        charSet: "UTF-8"
      }), /* @__PURE__ */ jsx("meta", {
        name: "viewport",
        content: "width=device-width, initial-scale=1.0"
      }), /* @__PURE__ */ jsx("title", {
        children: title
      }), /* @__PURE__ */ jsx("script", {
        src: "https://cdn.tailwindcss.com"
      })]
    }), /* @__PURE__ */ jsxs("body", {
      children: [/* @__PURE__ */ jsxs("div", {
        className: "p-2 flex gap-2 text-lg",
        children: [/* @__PURE__ */ jsx(Link, {
          to: "/",
          activeProps: {
            className: "font-bold"
          },
          activeOptions: {
            exact: true
          },
          children: "Home"
        }), " ", /* @__PURE__ */ jsx(Link, {
          to: "/posts",
          activeProps: {
            className: "font-bold"
          },
          children: "Posts"
        })]
      }), /* @__PURE__ */ jsx("hr", {}), /* @__PURE__ */ jsx(Outlet, {}), " ", /* @__PURE__ */ jsx(TanStackRouterDevtools, {
        position: "bottom-right"
      }), /* @__PURE__ */ jsx(Scripts, {})]
    })]
  });
}

const indexRoute = new Route({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => /* @__PURE__ */ jsx("div", {
    className: "p-2",
    children: /* @__PURE__ */ jsx("h3", {
      children: "Welcome Home!"
    })
  })
});

const postIdRoute = new Route({
  getParentRoute: () => postsRoute,
  path: "$postId",
  getContext: ({
    context,
    params: {
      postId
    }
  }) => ({
    getTitle: () => context.loaderClient.getLoader({
      key: "post"
    }).getInstance({
      variables: postId
    }).state.data?.title
  }),
  onLoad: async ({
    params: {
      postId
    },
    preload,
    context
  }) => context.loaderClient.getLoader({
    key: "post"
  }).load({
    variables: postId,
    preload
  }),
  component: Post
});
function Post() {
  const {
    postId
  } = useParams({
    from: postIdRoute.id
  });
  const {
    state: {
      data: post
    }
  } = useLoaderInstance({
    key: "post",
    variables: postId
  });
  return /* @__PURE__ */ jsxs("div", {
    className: "space-y-2",
    children: [/* @__PURE__ */ jsx("h4", {
      className: "text-xl font-bold underline",
      children: post.title
    }), /* @__PURE__ */ jsx("div", {
      className: "text-sm",
      children: post.body
    })]
  });
}

const postsRoute = new Route({
  getParentRoute: () => rootRoute,
  path: "posts",
  onLoad: ({
    context,
    preload
  }) => context.loaderClient.getLoader({
    key: "posts"
  }).load({
    preload
  }),
  component: Posts,
  getContext: ({
    context
  }) => ({
    getTitle: () => `${context.loaderClient.getLoader({
      key: "posts"
    }).getInstance().state.data?.length} Posts`
  })
});
function Posts() {
  const {
    state: {
      data: posts
    }
  } = useLoaderInstance({
    key: "posts"
  });
  return /* @__PURE__ */ jsxs("div", {
    className: "p-2 flex gap-2",
    children: [/* @__PURE__ */ jsx("ul", {
      className: "list-disc pl-4",
      children: posts.map((post) => {
        return /* @__PURE__ */ jsx("li", {
          className: "whitespace-nowrap",
          children: /* @__PURE__ */ jsx(Link, {
            to: postIdRoute.fullPath,
            params: {
              postId: post.id
            },
            className: "block py-1 text-blue-800 hover:text-blue-600",
            activeProps: {
              className: "text-black font-bold"
            },
            children: /* @__PURE__ */ jsx("div", {
              children: post.title.substring(0, 20)
            })
          })
        }, post.id);
      })
    }), /* @__PURE__ */ jsx("hr", {}), /* @__PURE__ */ jsx(Outlet, {})]
  });
}

const postsIndexRoute = new Route({
  getParentRoute: () => postsRoute,
  path: "/",
  component: () => /* @__PURE__ */ jsx("div", {
    children: "Select a post."
  })
});

const $$server_module0 = server$.createHandler(async function $$serverHandler0() {
  console.log("Fetching posts...");
  await new Promise((r) => setTimeout(r, 300 + Math.round(Math.random() * 300)));
  return fetch("https://jsonplaceholder.typicode.com/posts").then((d) => d.json()).then((d) => d.slice(0, 10));
}, "/_m/dc30d673a2/loader", false);
server$.registerHandler("/_m/dc30d673a2/loader", $$server_module0);
const postsLoader = new Loader({
  key: "posts",
  loader: $$server_module0
});
const $$server_module1 = server$.createHandler(async function $$serverHandler1(postId) {
  console.log(`Fetching post with id ${postId}...`);
  await new Promise((r) => setTimeout(r, Math.round(Math.random() * 300)));
  return fetch(`https://jsonplaceholder.typicode.com/posts/${postId}`).then((r) => r.json());
}, "/_m/320a0f9593/loader", false);
server$.registerHandler("/_m/320a0f9593/loader", $$server_module1);
const postLoader = new Loader({
  key: "post",
  maxAge: 5e3,
  loader: $$server_module1,
  onAllInvalidate: async () => {
    await postsLoader.invalidateAll();
  }
});

const createLoaderClient = () => {
  return new LoaderClient({
    getLoaders: () => [postsLoader, postLoader]
  });
};
const loaderClient = createLoaderClient();
__astro_tag_component__(createLoaderClient, "@astrojs/react");

const routeTree = rootRoute.addChildren([
  indexRoute,
  postsRoute.addChildren([postsIndexRoute, postIdRoute])
]);
new ReactRouter({
  routeTree,
  context: {
    loaderClient
  }
});

export { AstroJSX as A, Hydrate as H, LoaderInstance as L, ReactRouter as R, ServerContext as S, __astro_tag_component__ as _, LoaderClientProvider as a, RouterProvider as b, createLoaderClient as c, renderJSX as d, createVNode as e, createMemoryHistory as f, Router as g, handleEvent as h, routeTree as r, server$ as s };
