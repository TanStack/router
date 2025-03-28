import "./chunk-WDMUDEB6.js";

// node_modules/.pnpm/redaxios@0.5.1/node_modules/redaxios/dist/redaxios.module.js
var redaxios_module_default = function e(t) {
  function n(e2, t2, r2) {
    var a, o = {};
    if (Array.isArray(e2)) return e2.concat(t2);
    for (a in e2) o[r2 ? a.toLowerCase() : a] = e2[a];
    for (a in t2) {
      var i = r2 ? a.toLowerCase() : a, u = t2[a];
      o[i] = i in o && "object" == typeof u ? n(o[i], u, "headers" == i) : u;
    }
    return o;
  }
  function r(e2, r2, a, o, i) {
    var u = "string" != typeof e2 ? (r2 = e2).url : e2, c = {
      config: r2
    }, s = n(t, r2), f = {};
    o = o || s.data, (s.transformRequest || []).map(function(e3) {
      o = e3(o, s.headers) || o;
    }), s.auth && (f.authorization = s.auth), o && "object" == typeof o && "function" != typeof o.append && "function" != typeof o.text && (o = JSON.stringify(o), f["content-type"] = "application/json");
    try {
      f[s.xsrfHeaderName] = decodeURIComponent(document.cookie.match(RegExp("(^|; )" + s.xsrfCookieName + "=([^;]*)"))[2]);
    } catch (e3) {
    }
    return s.baseURL && (u = u.replace(/^(?!.*\/\/)\/?/, s.baseURL + "/")), s.params && (u += (~u.indexOf("?") ? "&" : "?") + (s.paramsSerializer ? s.paramsSerializer(s.params) : new URLSearchParams(s.params))), (s.fetch || fetch)(u, {
      method: (a || s.method || "get").toUpperCase(),
      body: o,
      headers: n(s.headers, f, true),
      credentials: s.withCredentials ? "include" : i
    }).then(function(e3) {
      for (var t2 in e3) "function" != typeof e3[t2] && (c[t2] = e3[t2]);
      return "stream" == s.responseType ? (c.data = e3.body, c) : e3[s.responseType || "text"]().then(function(e4) {
        c.data = e4, c.data = JSON.parse(e4);
      }).catch(Object).then(function() {
        return (s.validateStatus ? s.validateStatus(e3.status) : e3.ok) ? c : Promise.reject(c);
      });
    });
  }
  return t = t || {}, r.request = r, r.get = function(e2, t2) {
    return r(e2, t2, "get");
  }, r.delete = function(e2, t2) {
    return r(e2, t2, "delete");
  }, r.head = function(e2, t2) {
    return r(e2, t2, "head");
  }, r.options = function(e2, t2) {
    return r(e2, t2, "options");
  }, r.post = function(e2, t2, n2) {
    return r(e2, n2, "post", t2);
  }, r.put = function(e2, t2, n2) {
    return r(e2, n2, "put", t2);
  }, r.patch = function(e2, t2, n2) {
    return r(e2, n2, "patch", t2);
  }, r.all = Promise.all.bind(Promise), r.spread = function(e2) {
    return e2.apply.bind(e2, e2);
  }, r.CancelToken = "function" == typeof AbortController ? AbortController : Object, r.defaults = t, r.create = e, r;
}();
export {
  redaxios_module_default as default
};
//# sourceMappingURL=redaxios.js.map
