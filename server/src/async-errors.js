// Express 4 does not forward rejected promises from async route handlers to
// the error middleware. A rejected handler (e.g. a Prisma query against a
// database with no tables) previously left the request hanging forever: no
// response, no log line — the login/signup buttons just spun.
//
// This shim wraps every handler registered on any router so a promise
// rejection is passed to next(err), where the JSON 500 error middleware in
// index.js responds and logs it. Same technique as the express-async-errors
// package, inlined to avoid a dependency. Must be imported BEFORE any router
// is created (see index.js import order).
import Layer from 'express/lib/router/layer.js';

const kHandle = Symbol('wrapped-handle');

Object.defineProperty(Layer.prototype, 'handle', {
  configurable: true,
  enumerable: true,
  get() {
    return this[kHandle];
  },
  set(fn) {
    // Error middlewares (arity 4) must keep their arity — Express uses
    // fn.length to tell them apart — so only plain handlers are wrapped.
    if (typeof fn === 'function' && fn.length <= 3) {
      this[kHandle] = function wrapped(req, res, next) {
        const out = fn.call(this, req, res, next);
        if (out && typeof out.catch === 'function') out.catch(next);
        return out;
      };
    } else {
      this[kHandle] = fn;
    }
  }
});
