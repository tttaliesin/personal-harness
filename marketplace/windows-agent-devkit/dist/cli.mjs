#!/usr/bin/env node
import { createRequire as __devkitCreateRequire } from "node:module"; const require = __devkitCreateRequire(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key2 of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key2) && key2 !== except)
        __defProp(to, key2, { get: () => from[key2], enumerable: !(desc = __getOwnPropDesc(from, key2)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/yaml/dist/nodes/identity.js
var require_identity = __commonJS({
  "node_modules/yaml/dist/nodes/identity.js"(exports) {
    "use strict";
    var ALIAS = /* @__PURE__ */ Symbol.for("yaml.alias");
    var DOC = /* @__PURE__ */ Symbol.for("yaml.document");
    var MAP = /* @__PURE__ */ Symbol.for("yaml.map");
    var PAIR = /* @__PURE__ */ Symbol.for("yaml.pair");
    var SCALAR = /* @__PURE__ */ Symbol.for("yaml.scalar");
    var SEQ = /* @__PURE__ */ Symbol.for("yaml.seq");
    var NODE_TYPE = /* @__PURE__ */ Symbol.for("yaml.node.type");
    var isAlias = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === ALIAS;
    var isDocument = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === DOC;
    var isMap = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === MAP;
    var isPair = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === PAIR;
    var isScalar = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SCALAR;
    var isSeq = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SEQ;
    function isCollection(node) {
      if (node && typeof node === "object")
        switch (node[NODE_TYPE]) {
          case MAP:
          case SEQ:
            return true;
        }
      return false;
    }
    function isNode(node) {
      if (node && typeof node === "object")
        switch (node[NODE_TYPE]) {
          case ALIAS:
          case MAP:
          case SCALAR:
          case SEQ:
            return true;
        }
      return false;
    }
    var hasAnchor = (node) => (isScalar(node) || isCollection(node)) && !!node.anchor;
    exports.ALIAS = ALIAS;
    exports.DOC = DOC;
    exports.MAP = MAP;
    exports.NODE_TYPE = NODE_TYPE;
    exports.PAIR = PAIR;
    exports.SCALAR = SCALAR;
    exports.SEQ = SEQ;
    exports.hasAnchor = hasAnchor;
    exports.isAlias = isAlias;
    exports.isCollection = isCollection;
    exports.isDocument = isDocument;
    exports.isMap = isMap;
    exports.isNode = isNode;
    exports.isPair = isPair;
    exports.isScalar = isScalar;
    exports.isSeq = isSeq;
  }
});

// node_modules/yaml/dist/visit.js
var require_visit = __commonJS({
  "node_modules/yaml/dist/visit.js"(exports) {
    "use strict";
    var identity = require_identity();
    var BREAK = /* @__PURE__ */ Symbol("break visit");
    var SKIP = /* @__PURE__ */ Symbol("skip children");
    var REMOVE = /* @__PURE__ */ Symbol("remove node");
    function visit(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node)) {
        const cd = visit_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
          node.contents = null;
      } else
        visit_(null, node, visitor_, Object.freeze([]));
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    function visit_(key2, node, visitor, path5) {
      const ctrl = callVisitor(key2, node, visitor, path5);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key2, path5, ctrl);
        return visit_(key2, ctrl, visitor, path5);
      }
      if (typeof ctrl !== "symbol") {
        if (identity.isCollection(node)) {
          path5 = Object.freeze(path5.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            const ci = visit_(i, node.items[i], visitor, path5);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity.isPair(node)) {
          path5 = Object.freeze(path5.concat(node));
          const ck = visit_("key", node.key, visitor, path5);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node.key = null;
          const cv = visit_("value", node.value, visitor, path5);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node.value = null;
        }
      }
      return ctrl;
    }
    async function visitAsync(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node)) {
        const cd = await visitAsync_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
          node.contents = null;
      } else
        await visitAsync_(null, node, visitor_, Object.freeze([]));
    }
    visitAsync.BREAK = BREAK;
    visitAsync.SKIP = SKIP;
    visitAsync.REMOVE = REMOVE;
    async function visitAsync_(key2, node, visitor, path5) {
      const ctrl = await callVisitor(key2, node, visitor, path5);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key2, path5, ctrl);
        return visitAsync_(key2, ctrl, visitor, path5);
      }
      if (typeof ctrl !== "symbol") {
        if (identity.isCollection(node)) {
          path5 = Object.freeze(path5.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            const ci = await visitAsync_(i, node.items[i], visitor, path5);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity.isPair(node)) {
          path5 = Object.freeze(path5.concat(node));
          const ck = await visitAsync_("key", node.key, visitor, path5);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node.key = null;
          const cv = await visitAsync_("value", node.value, visitor, path5);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node.value = null;
        }
      }
      return ctrl;
    }
    function initVisitor(visitor) {
      if (typeof visitor === "object" && (visitor.Collection || visitor.Node || visitor.Value)) {
        return Object.assign({
          Alias: visitor.Node,
          Map: visitor.Node,
          Scalar: visitor.Node,
          Seq: visitor.Node
        }, visitor.Value && {
          Map: visitor.Value,
          Scalar: visitor.Value,
          Seq: visitor.Value
        }, visitor.Collection && {
          Map: visitor.Collection,
          Seq: visitor.Collection
        }, visitor);
      }
      return visitor;
    }
    function callVisitor(key2, node, visitor, path5) {
      if (typeof visitor === "function")
        return visitor(key2, node, path5);
      if (identity.isMap(node))
        return visitor.Map?.(key2, node, path5);
      if (identity.isSeq(node))
        return visitor.Seq?.(key2, node, path5);
      if (identity.isPair(node))
        return visitor.Pair?.(key2, node, path5);
      if (identity.isScalar(node))
        return visitor.Scalar?.(key2, node, path5);
      if (identity.isAlias(node))
        return visitor.Alias?.(key2, node, path5);
      return void 0;
    }
    function replaceNode(key2, path5, node) {
      const parent = path5[path5.length - 1];
      if (identity.isCollection(parent)) {
        parent.items[key2] = node;
      } else if (identity.isPair(parent)) {
        if (key2 === "key")
          parent.key = node;
        else
          parent.value = node;
      } else if (identity.isDocument(parent)) {
        parent.contents = node;
      } else {
        const pt = identity.isAlias(parent) ? "alias" : "scalar";
        throw new Error(`Cannot replace node with ${pt} parent`);
      }
    }
    exports.visit = visit;
    exports.visitAsync = visitAsync;
  }
});

// node_modules/yaml/dist/doc/directives.js
var require_directives = __commonJS({
  "node_modules/yaml/dist/doc/directives.js"(exports) {
    "use strict";
    var identity = require_identity();
    var visit = require_visit();
    var escapeChars = {
      "!": "%21",
      ",": "%2C",
      "[": "%5B",
      "]": "%5D",
      "{": "%7B",
      "}": "%7D"
    };
    var escapeTagName = (tn) => tn.replace(/[!,[\]{}]/g, (ch) => escapeChars[ch]);
    var Directives = class _Directives {
      constructor(yaml2, tags) {
        this.docStart = null;
        this.docEnd = false;
        this.yaml = Object.assign({}, _Directives.defaultYaml, yaml2);
        this.tags = Object.assign({}, _Directives.defaultTags, tags);
      }
      clone() {
        const copy = new _Directives(this.yaml, this.tags);
        copy.docStart = this.docStart;
        return copy;
      }
      /**
       * During parsing, get a Directives instance for the current document and
       * update the stream state according to the current version's spec.
       */
      atDocument() {
        const res = new _Directives(this.yaml, this.tags);
        switch (this.yaml.version) {
          case "1.1":
            this.atNextDocument = true;
            break;
          case "1.2":
            this.atNextDocument = false;
            this.yaml = {
              explicit: _Directives.defaultYaml.explicit,
              version: "1.2"
            };
            this.tags = Object.assign({}, _Directives.defaultTags);
            break;
        }
        return res;
      }
      /**
       * @param onError - May be called even if the action was successful
       * @returns `true` on success
       */
      add(line, onError) {
        if (this.atNextDocument) {
          this.yaml = { explicit: _Directives.defaultYaml.explicit, version: "1.1" };
          this.tags = Object.assign({}, _Directives.defaultTags);
          this.atNextDocument = false;
        }
        const parts = line.trim().split(/[ \t]+/);
        const name = parts.shift();
        switch (name) {
          case "%TAG": {
            if (parts.length !== 2) {
              onError(0, "%TAG directive should contain exactly two parts");
              if (parts.length < 2)
                return false;
            }
            const [handle, prefix] = parts;
            this.tags[handle] = prefix;
            return true;
          }
          case "%YAML": {
            this.yaml.explicit = true;
            if (parts.length !== 1) {
              onError(0, "%YAML directive should contain exactly one part");
              return false;
            }
            const [version] = parts;
            if (version === "1.1" || version === "1.2") {
              this.yaml.version = version;
              return true;
            } else {
              const isValid = /^\d+\.\d+$/.test(version);
              onError(6, `Unsupported YAML version ${version}`, isValid);
              return false;
            }
          }
          default:
            onError(0, `Unknown directive ${name}`, true);
            return false;
        }
      }
      /**
       * Resolves a tag, matching handles to those defined in %TAG directives.
       *
       * @returns Resolved tag, which may also be the non-specific tag `'!'` or a
       *   `'!local'` tag, or `null` if unresolvable.
       */
      tagName(source, onError) {
        if (source === "!")
          return "!";
        if (source[0] !== "!") {
          onError(`Not a valid tag: ${source}`);
          return null;
        }
        if (source[1] === "<") {
          const verbatim = source.slice(2, -1);
          if (verbatim === "!" || verbatim === "!!") {
            onError(`Verbatim tags aren't resolved, so ${source} is invalid.`);
            return null;
          }
          if (source[source.length - 1] !== ">")
            onError("Verbatim tags must end with a >");
          return verbatim;
        }
        const [, handle, suffix] = source.match(/^(.*!)([^!]*)$/s);
        if (!suffix)
          onError(`The ${source} tag has no suffix`);
        const prefix = this.tags[handle];
        if (prefix) {
          try {
            return prefix + decodeURIComponent(suffix);
          } catch (error) {
            onError(String(error));
            return null;
          }
        }
        if (handle === "!")
          return source;
        onError(`Could not resolve tag: ${source}`);
        return null;
      }
      /**
       * Given a fully resolved tag, returns its printable string form,
       * taking into account current tag prefixes and defaults.
       */
      tagString(tag) {
        for (const [handle, prefix] of Object.entries(this.tags)) {
          if (tag.startsWith(prefix))
            return handle + escapeTagName(tag.substring(prefix.length));
        }
        return tag[0] === "!" ? tag : `!<${tag}>`;
      }
      toString(doc) {
        const lines = this.yaml.explicit ? [`%YAML ${this.yaml.version || "1.2"}`] : [];
        const tagEntries = Object.entries(this.tags);
        let tagNames;
        if (doc && tagEntries.length > 0 && identity.isNode(doc.contents)) {
          const tags = {};
          visit.visit(doc.contents, (_key, node) => {
            if (identity.isNode(node) && node.tag)
              tags[node.tag] = true;
          });
          tagNames = Object.keys(tags);
        } else
          tagNames = [];
        for (const [handle, prefix] of tagEntries) {
          if (handle === "!!" && prefix === "tag:yaml.org,2002:")
            continue;
          if (!doc || tagNames.some((tn) => tn.startsWith(prefix)))
            lines.push(`%TAG ${handle} ${prefix}`);
        }
        return lines.join("\n");
      }
    };
    Directives.defaultYaml = { explicit: false, version: "1.2" };
    Directives.defaultTags = { "!!": "tag:yaml.org,2002:" };
    exports.Directives = Directives;
  }
});

// node_modules/yaml/dist/doc/anchors.js
var require_anchors = __commonJS({
  "node_modules/yaml/dist/doc/anchors.js"(exports) {
    "use strict";
    var identity = require_identity();
    var visit = require_visit();
    function anchorIsValid(anchor) {
      if (/[\x00-\x19\s,[\]{}]/.test(anchor)) {
        const sa = JSON.stringify(anchor);
        const msg = `Anchor must not contain whitespace or control characters: ${sa}`;
        throw new Error(msg);
      }
      return true;
    }
    function anchorNames(root) {
      const anchors = /* @__PURE__ */ new Set();
      visit.visit(root, {
        Value(_key, node) {
          if (node.anchor)
            anchors.add(node.anchor);
        }
      });
      return anchors;
    }
    function findNewAnchor(prefix, exclude) {
      for (let i = 1; true; ++i) {
        const name = `${prefix}${i}`;
        if (!exclude.has(name))
          return name;
      }
    }
    function createNodeAnchors(doc, prefix) {
      const aliasObjects = [];
      const sourceObjects = /* @__PURE__ */ new Map();
      let prevAnchors = null;
      return {
        onAnchor: (source) => {
          aliasObjects.push(source);
          prevAnchors ?? (prevAnchors = anchorNames(doc));
          const anchor = findNewAnchor(prefix, prevAnchors);
          prevAnchors.add(anchor);
          return anchor;
        },
        /**
         * With circular references, the source node is only resolved after all
         * of its child nodes are. This is why anchors are set only after all of
         * the nodes have been created.
         */
        setAnchors: () => {
          for (const source of aliasObjects) {
            const ref = sourceObjects.get(source);
            if (typeof ref === "object" && ref.anchor && (identity.isScalar(ref.node) || identity.isCollection(ref.node))) {
              ref.node.anchor = ref.anchor;
            } else {
              const error = new Error("Failed to resolve repeated object (this should not happen)");
              error.source = source;
              throw error;
            }
          }
        },
        sourceObjects
      };
    }
    exports.anchorIsValid = anchorIsValid;
    exports.anchorNames = anchorNames;
    exports.createNodeAnchors = createNodeAnchors;
    exports.findNewAnchor = findNewAnchor;
  }
});

// node_modules/yaml/dist/doc/applyReviver.js
var require_applyReviver = __commonJS({
  "node_modules/yaml/dist/doc/applyReviver.js"(exports) {
    "use strict";
    function applyReviver(reviver, obj, key2, val) {
      if (val && typeof val === "object") {
        if (Array.isArray(val)) {
          for (let i = 0, len = val.length; i < len; ++i) {
            const v0 = val[i];
            const v1 = applyReviver(reviver, val, String(i), v0);
            if (v1 === void 0)
              delete val[i];
            else if (v1 !== v0)
              val[i] = v1;
          }
        } else if (val instanceof Map) {
          for (const k of Array.from(val.keys())) {
            const v0 = val.get(k);
            const v1 = applyReviver(reviver, val, k, v0);
            if (v1 === void 0)
              val.delete(k);
            else if (v1 !== v0)
              val.set(k, v1);
          }
        } else if (val instanceof Set) {
          for (const v0 of Array.from(val)) {
            const v1 = applyReviver(reviver, val, v0, v0);
            if (v1 === void 0)
              val.delete(v0);
            else if (v1 !== v0) {
              val.delete(v0);
              val.add(v1);
            }
          }
        } else {
          for (const [k, v0] of Object.entries(val)) {
            const v1 = applyReviver(reviver, val, k, v0);
            if (v1 === void 0)
              delete val[k];
            else if (v1 !== v0)
              val[k] = v1;
          }
        }
      }
      return reviver.call(obj, key2, val);
    }
    exports.applyReviver = applyReviver;
  }
});

// node_modules/yaml/dist/nodes/toJS.js
var require_toJS = __commonJS({
  "node_modules/yaml/dist/nodes/toJS.js"(exports) {
    "use strict";
    var identity = require_identity();
    function toJS(value, arg, ctx) {
      if (Array.isArray(value))
        return value.map((v, i) => toJS(v, String(i), ctx));
      if (value && typeof value.toJSON === "function") {
        if (!ctx || !identity.hasAnchor(value))
          return value.toJSON(arg, ctx);
        const data = { aliasCount: 0, count: 1, res: void 0 };
        ctx.anchors.set(value, data);
        ctx.onCreate = (res2) => {
          data.res = res2;
          delete ctx.onCreate;
        };
        const res = value.toJSON(arg, ctx);
        if (ctx.onCreate)
          ctx.onCreate(res);
        return res;
      }
      if (typeof value === "bigint" && !ctx?.keep)
        return Number(value);
      return value;
    }
    exports.toJS = toJS;
  }
});

// node_modules/yaml/dist/nodes/Node.js
var require_Node = __commonJS({
  "node_modules/yaml/dist/nodes/Node.js"(exports) {
    "use strict";
    var applyReviver = require_applyReviver();
    var identity = require_identity();
    var toJS = require_toJS();
    var NodeBase = class {
      constructor(type) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: type });
      }
      /** Create a copy of this node.  */
      clone() {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /** A plain JavaScript representation of this node. */
      toJS(doc, { mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        if (!identity.isDocument(doc))
          throw new TypeError("A document argument is required");
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc,
          keep: true,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res = toJS.toJS(this, "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
    };
    exports.NodeBase = NodeBase;
  }
});

// node_modules/yaml/dist/nodes/Alias.js
var require_Alias = __commonJS({
  "node_modules/yaml/dist/nodes/Alias.js"(exports) {
    "use strict";
    var anchors = require_anchors();
    var visit = require_visit();
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var Alias = class extends Node.NodeBase {
      constructor(source) {
        super(identity.ALIAS);
        this.source = source;
        Object.defineProperty(this, "tag", {
          set() {
            throw new Error("Alias nodes cannot have tags");
          }
        });
      }
      /**
       * Resolve the value of this alias within `doc`, finding the last
       * instance of the `source` anchor before this node.
       */
      resolve(doc, ctx) {
        if (ctx?.maxAliasCount === 0)
          throw new ReferenceError("Alias resolution is disabled");
        let nodes;
        if (ctx?.aliasResolveCache) {
          nodes = ctx.aliasResolveCache;
        } else {
          nodes = [];
          visit.visit(doc, {
            Node: (_key, node) => {
              if (identity.isAlias(node) || identity.hasAnchor(node))
                nodes.push(node);
            }
          });
          if (ctx)
            ctx.aliasResolveCache = nodes;
        }
        let found = void 0;
        for (const node of nodes) {
          if (node === this)
            break;
          if (node.anchor === this.source)
            found = node;
        }
        if (found && ctx) {
          const { anchors: anchors2, doc: doc2, maxAliasCount } = ctx;
          let data = anchors2.get(found);
          if (!data) {
            toJS.toJS(found, null, ctx);
            data = anchors2.get(found);
          }
          if (data?.res === void 0) {
            const msg = "This should not happen: Alias anchor was not resolved?";
            throw new ReferenceError(msg);
          }
          if (maxAliasCount >= 0) {
            data.count += 1;
            if (data.aliasCount === 0)
              data.aliasCount = getAliasCount(doc2, found, anchors2);
            if (data.count * data.aliasCount > maxAliasCount) {
              const msg = "Excessive alias count indicates a resource exhaustion attack";
              throw new ReferenceError(msg);
            }
          }
        }
        return found;
      }
      toJSON(_arg, ctx) {
        if (!ctx)
          return { source: this.source };
        const source = this.resolve(ctx.doc, ctx);
        if (!source) {
          const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
          throw new ReferenceError(msg);
        }
        return ctx.anchors.get(source).res;
      }
      toString(ctx, _onComment, _onChompKeep) {
        const src = `*${this.source}`;
        if (ctx) {
          anchors.anchorIsValid(this.source);
          if (ctx.options.verifyAliasOrder && !ctx.anchors.has(this.source)) {
            const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
            throw new Error(msg);
          }
          if (ctx.implicitKey)
            return `${src} `;
        }
        return src;
      }
    };
    function getAliasCount(doc, node, anchors2) {
      if (identity.isAlias(node)) {
        const source = node.resolve(doc);
        const anchor = anchors2 && source && anchors2.get(source);
        return anchor ? anchor.count * anchor.aliasCount : 0;
      } else if (identity.isCollection(node)) {
        let count = 0;
        for (const item of node.items) {
          const c = getAliasCount(doc, item, anchors2);
          if (c > count)
            count = c;
        }
        return count;
      } else if (identity.isPair(node)) {
        const kc = getAliasCount(doc, node.key, anchors2);
        const vc = getAliasCount(doc, node.value, anchors2);
        return Math.max(kc, vc);
      }
      return 1;
    }
    exports.Alias = Alias;
  }
});

// node_modules/yaml/dist/nodes/Scalar.js
var require_Scalar = __commonJS({
  "node_modules/yaml/dist/nodes/Scalar.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var isScalarValue = (value) => !value || typeof value !== "function" && typeof value !== "object";
    var Scalar = class extends Node.NodeBase {
      constructor(value) {
        super(identity.SCALAR);
        this.value = value;
      }
      toJSON(arg, ctx) {
        return ctx?.keep ? this.value : toJS.toJS(this.value, arg, ctx);
      }
      toString() {
        return String(this.value);
      }
    };
    Scalar.BLOCK_FOLDED = "BLOCK_FOLDED";
    Scalar.BLOCK_LITERAL = "BLOCK_LITERAL";
    Scalar.PLAIN = "PLAIN";
    Scalar.QUOTE_DOUBLE = "QUOTE_DOUBLE";
    Scalar.QUOTE_SINGLE = "QUOTE_SINGLE";
    exports.Scalar = Scalar;
    exports.isScalarValue = isScalarValue;
  }
});

// node_modules/yaml/dist/doc/createNode.js
var require_createNode = __commonJS({
  "node_modules/yaml/dist/doc/createNode.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var defaultTagPrefix = "tag:yaml.org,2002:";
    function findTagObject(value, tagName, tags) {
      if (tagName) {
        const match = tags.filter((t) => t.tag === tagName);
        const tagObj = match.find((t) => !t.format) ?? match[0];
        if (!tagObj)
          throw new Error(`Tag ${tagName} not found`);
        return tagObj;
      }
      return tags.find((t) => t.identify?.(value) && !t.format);
    }
    function createNode(value, tagName, ctx) {
      if (identity.isDocument(value))
        value = value.contents;
      if (identity.isNode(value))
        return value;
      if (identity.isPair(value)) {
        const map = ctx.schema[identity.MAP].createNode?.(ctx.schema, null, ctx);
        map.items.push(value);
        return map;
      }
      if (value instanceof String || value instanceof Number || value instanceof Boolean || typeof BigInt !== "undefined" && value instanceof BigInt) {
        value = value.valueOf();
      }
      const { aliasDuplicateObjects, onAnchor, onTagObj, schema, sourceObjects } = ctx;
      let ref = void 0;
      if (aliasDuplicateObjects && value && typeof value === "object") {
        ref = sourceObjects.get(value);
        if (ref) {
          ref.anchor ?? (ref.anchor = onAnchor(value));
          return new Alias.Alias(ref.anchor);
        } else {
          ref = { anchor: null, node: null };
          sourceObjects.set(value, ref);
        }
      }
      if (tagName?.startsWith("!!"))
        tagName = defaultTagPrefix + tagName.slice(2);
      let tagObj = findTagObject(value, tagName, schema.tags);
      if (!tagObj) {
        if (value && typeof value.toJSON === "function") {
          value = value.toJSON();
        }
        if (!value || typeof value !== "object") {
          const node2 = new Scalar.Scalar(value);
          if (ref)
            ref.node = node2;
          return node2;
        }
        tagObj = value instanceof Map ? schema[identity.MAP] : Symbol.iterator in Object(value) ? schema[identity.SEQ] : schema[identity.MAP];
      }
      if (onTagObj) {
        onTagObj(tagObj);
        delete ctx.onTagObj;
      }
      const node = tagObj?.createNode ? tagObj.createNode(ctx.schema, value, ctx) : typeof tagObj?.nodeClass?.from === "function" ? tagObj.nodeClass.from(ctx.schema, value, ctx) : new Scalar.Scalar(value);
      if (tagName)
        node.tag = tagName;
      else if (!tagObj.default)
        node.tag = tagObj.tag;
      if (ref)
        ref.node = node;
      return node;
    }
    exports.createNode = createNode;
  }
});

// node_modules/yaml/dist/nodes/Collection.js
var require_Collection = __commonJS({
  "node_modules/yaml/dist/nodes/Collection.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var identity = require_identity();
    var Node = require_Node();
    function collectionFromPath(schema, path5, value) {
      let v = value;
      for (let i = path5.length - 1; i >= 0; --i) {
        const k = path5[i];
        if (typeof k === "number" && Number.isInteger(k) && k >= 0) {
          const a = [];
          a[k] = v;
          v = a;
        } else {
          v = /* @__PURE__ */ new Map([[k, v]]);
        }
      }
      return createNode.createNode(v, void 0, {
        aliasDuplicateObjects: false,
        keepUndefined: false,
        onAnchor: () => {
          throw new Error("This should not happen, please report a bug.");
        },
        schema,
        sourceObjects: /* @__PURE__ */ new Map()
      });
    }
    var isEmptyPath = (path5) => path5 == null || typeof path5 === "object" && !!path5[Symbol.iterator]().next().done;
    var Collection = class extends Node.NodeBase {
      constructor(type, schema) {
        super(type);
        Object.defineProperty(this, "schema", {
          value: schema,
          configurable: true,
          enumerable: false,
          writable: true
        });
      }
      /**
       * Create a copy of this collection.
       *
       * @param schema - If defined, overwrites the original's schema
       */
      clone(schema) {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (schema)
          copy.schema = schema;
        copy.items = copy.items.map((it) => identity.isNode(it) || identity.isPair(it) ? it.clone(schema) : it);
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /**
       * Adds a value to the collection. For `!!map` and `!!omap` the value must
       * be a Pair instance or a `{ key, value }` object, which may not have a key
       * that already exists in the map.
       */
      addIn(path5, value) {
        if (isEmptyPath(path5))
          this.add(value);
        else {
          const [key2, ...rest] = path5;
          const node = this.get(key2, true);
          if (identity.isCollection(node))
            node.addIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key2, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key2}. Remaining path: ${rest}`);
        }
      }
      /**
       * Removes a value from the collection.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path5) {
        const [key2, ...rest] = path5;
        if (rest.length === 0)
          return this.delete(key2);
        const node = this.get(key2, true);
        if (identity.isCollection(node))
          return node.deleteIn(rest);
        else
          throw new Error(`Expected YAML collection at ${key2}. Remaining path: ${rest}`);
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path5, keepScalar) {
        const [key2, ...rest] = path5;
        const node = this.get(key2, true);
        if (rest.length === 0)
          return !keepScalar && identity.isScalar(node) ? node.value : node;
        else
          return identity.isCollection(node) ? node.getIn(rest, keepScalar) : void 0;
      }
      hasAllNullValues(allowScalar) {
        return this.items.every((node) => {
          if (!identity.isPair(node))
            return false;
          const n = node.value;
          return n == null || allowScalar && identity.isScalar(n) && n.value == null && !n.commentBefore && !n.comment && !n.tag;
        });
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       */
      hasIn(path5) {
        const [key2, ...rest] = path5;
        if (rest.length === 0)
          return this.has(key2);
        const node = this.get(key2, true);
        return identity.isCollection(node) ? node.hasIn(rest) : false;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path5, value) {
        const [key2, ...rest] = path5;
        if (rest.length === 0) {
          this.set(key2, value);
        } else {
          const node = this.get(key2, true);
          if (identity.isCollection(node))
            node.setIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key2, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key2}. Remaining path: ${rest}`);
        }
      }
    };
    exports.Collection = Collection;
    exports.collectionFromPath = collectionFromPath;
    exports.isEmptyPath = isEmptyPath;
  }
});

// node_modules/yaml/dist/stringify/stringifyComment.js
var require_stringifyComment = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyComment.js"(exports) {
    "use strict";
    var stringifyComment = (str) => str.replace(/^(?!$)(?: $)?/gm, "#");
    function indentComment(comment, indent) {
      if (/^\n+$/.test(comment))
        return comment.substring(1);
      return indent ? comment.replace(/^(?! *$)/gm, indent) : comment;
    }
    var lineComment = (str, indent, comment) => str.endsWith("\n") ? indentComment(comment, indent) : comment.includes("\n") ? "\n" + indentComment(comment, indent) : (str.endsWith(" ") ? "" : " ") + comment;
    exports.indentComment = indentComment;
    exports.lineComment = lineComment;
    exports.stringifyComment = stringifyComment;
  }
});

// node_modules/yaml/dist/stringify/foldFlowLines.js
var require_foldFlowLines = __commonJS({
  "node_modules/yaml/dist/stringify/foldFlowLines.js"(exports) {
    "use strict";
    var FOLD_FLOW = "flow";
    var FOLD_BLOCK = "block";
    var FOLD_QUOTED = "quoted";
    function foldFlowLines(text2, indent, mode = "flow", { indentAtStart, lineWidth = 80, minContentWidth = 20, onFold, onOverflow } = {}) {
      if (!lineWidth || lineWidth < 0)
        return text2;
      if (lineWidth < minContentWidth)
        minContentWidth = 0;
      const endStep = Math.max(1 + minContentWidth, 1 + lineWidth - indent.length);
      if (text2.length <= endStep)
        return text2;
      const folds = [];
      const escapedFolds = {};
      let end = lineWidth - indent.length;
      if (typeof indentAtStart === "number") {
        if (indentAtStart > lineWidth - Math.max(2, minContentWidth))
          folds.push(0);
        else
          end = lineWidth - indentAtStart;
      }
      let split = void 0;
      let prev = void 0;
      let overflow = false;
      let i = -1;
      let escStart = -1;
      let escEnd = -1;
      if (mode === FOLD_BLOCK) {
        i = consumeMoreIndentedLines(text2, i, indent.length);
        if (i !== -1)
          end = i + endStep;
      }
      for (let ch; ch = text2[i += 1]; ) {
        if (mode === FOLD_QUOTED && ch === "\\") {
          escStart = i;
          switch (text2[i + 1]) {
            case "x":
              i += 3;
              break;
            case "u":
              i += 5;
              break;
            case "U":
              i += 9;
              break;
            default:
              i += 1;
          }
          escEnd = i;
        }
        if (ch === "\n") {
          if (mode === FOLD_BLOCK)
            i = consumeMoreIndentedLines(text2, i, indent.length);
          end = i + indent.length + endStep;
          split = void 0;
        } else {
          if (ch === " " && prev && prev !== " " && prev !== "\n" && prev !== "	") {
            const next = text2[i + 1];
            if (next && next !== " " && next !== "\n" && next !== "	")
              split = i;
          }
          if (i >= end) {
            if (split) {
              folds.push(split);
              end = split + endStep;
              split = void 0;
            } else if (mode === FOLD_QUOTED) {
              while (prev === " " || prev === "	") {
                prev = ch;
                ch = text2[i += 1];
                overflow = true;
              }
              const j = i > escEnd + 1 ? i - 2 : escStart - 1;
              if (escapedFolds[j])
                return text2;
              folds.push(j);
              escapedFolds[j] = true;
              end = j + endStep;
              split = void 0;
            } else {
              overflow = true;
            }
          }
        }
        prev = ch;
      }
      if (overflow && onOverflow)
        onOverflow();
      if (folds.length === 0)
        return text2;
      if (onFold)
        onFold();
      let res = text2.slice(0, folds[0]);
      for (let i2 = 0; i2 < folds.length; ++i2) {
        const fold = folds[i2];
        const end2 = folds[i2 + 1] || text2.length;
        if (fold === 0)
          res = `
${indent}${text2.slice(0, end2)}`;
        else {
          if (mode === FOLD_QUOTED && escapedFolds[fold])
            res += `${text2[fold]}\\`;
          res += `
${indent}${text2.slice(fold + 1, end2)}`;
        }
      }
      return res;
    }
    function consumeMoreIndentedLines(text2, i, indent) {
      let end = i;
      let start = i + 1;
      let ch = text2[start];
      while (ch === " " || ch === "	") {
        if (i < start + indent) {
          ch = text2[++i];
        } else {
          do {
            ch = text2[++i];
          } while (ch && ch !== "\n");
          end = i;
          start = i + 1;
          ch = text2[start];
        }
      }
      return end;
    }
    exports.FOLD_BLOCK = FOLD_BLOCK;
    exports.FOLD_FLOW = FOLD_FLOW;
    exports.FOLD_QUOTED = FOLD_QUOTED;
    exports.foldFlowLines = foldFlowLines;
  }
});

// node_modules/yaml/dist/stringify/stringifyString.js
var require_stringifyString = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyString.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var foldFlowLines = require_foldFlowLines();
    var getFoldOptions = (ctx, isBlock) => ({
      indentAtStart: isBlock ? ctx.indent.length : ctx.indentAtStart,
      lineWidth: ctx.options.lineWidth,
      minContentWidth: ctx.options.minContentWidth
    });
    var containsDocumentMarker = (str) => /^(%|---|\.\.\.)/m.test(str);
    function lineLengthOverLimit(str, lineWidth, indentLength) {
      if (!lineWidth || lineWidth < 0)
        return false;
      const limit = lineWidth - indentLength;
      const strLen = str.length;
      if (strLen <= limit)
        return false;
      for (let i = 0, start = 0; i < strLen; ++i) {
        if (str[i] === "\n") {
          if (i - start > limit)
            return true;
          start = i + 1;
          if (strLen - start <= limit)
            return false;
        }
      }
      return true;
    }
    function doubleQuotedString(value, ctx) {
      const json3 = JSON.stringify(value);
      if (ctx.options.doubleQuotedAsJSON)
        return json3;
      const { implicitKey } = ctx;
      const minMultiLineLength = ctx.options.doubleQuotedMinMultiLineLength;
      const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      let str = "";
      let start = 0;
      for (let i = 0, ch = json3[i]; ch; ch = json3[++i]) {
        if (ch === " " && json3[i + 1] === "\\" && json3[i + 2] === "n") {
          str += json3.slice(start, i) + "\\ ";
          i += 1;
          start = i;
          ch = "\\";
        }
        if (ch === "\\")
          switch (json3[i + 1]) {
            case "u":
              {
                str += json3.slice(start, i);
                const code = json3.substr(i + 2, 4);
                switch (code) {
                  case "0000":
                    str += "\\0";
                    break;
                  case "0007":
                    str += "\\a";
                    break;
                  case "000b":
                    str += "\\v";
                    break;
                  case "001b":
                    str += "\\e";
                    break;
                  case "0085":
                    str += "\\N";
                    break;
                  case "00a0":
                    str += "\\_";
                    break;
                  case "2028":
                    str += "\\L";
                    break;
                  case "2029":
                    str += "\\P";
                    break;
                  default:
                    if (code.substr(0, 2) === "00")
                      str += "\\x" + code.substr(2);
                    else
                      str += json3.substr(i, 6);
                }
                i += 5;
                start = i + 1;
              }
              break;
            case "n":
              if (implicitKey || json3[i + 2] === '"' || json3.length < minMultiLineLength) {
                i += 1;
              } else {
                str += json3.slice(start, i) + "\n\n";
                while (json3[i + 2] === "\\" && json3[i + 3] === "n" && json3[i + 4] !== '"') {
                  str += "\n";
                  i += 2;
                }
                str += indent;
                if (json3[i + 2] === " ")
                  str += "\\";
                i += 1;
                start = i + 1;
              }
              break;
            default:
              i += 1;
          }
      }
      str = start ? str + json3.slice(start) : json3;
      return implicitKey ? str : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_QUOTED, getFoldOptions(ctx, false));
    }
    function singleQuotedString(value, ctx) {
      if (ctx.options.singleQuote === false || ctx.implicitKey && value.includes("\n") || /[ \t]\n|\n[ \t]/.test(value))
        return doubleQuotedString(value, ctx);
      const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      const res = "'" + value.replace(/'/g, "''").replace(/\n+/g, `$&
${indent}`) + "'";
      return ctx.implicitKey ? res : foldFlowLines.foldFlowLines(res, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function quotedString(value, ctx) {
      const { singleQuote } = ctx.options;
      let qs;
      if (singleQuote === false)
        qs = doubleQuotedString;
      else {
        const hasDouble = value.includes('"');
        const hasSingle = value.includes("'");
        if (hasDouble && !hasSingle)
          qs = singleQuotedString;
        else if (hasSingle && !hasDouble)
          qs = doubleQuotedString;
        else
          qs = singleQuote ? singleQuotedString : doubleQuotedString;
      }
      return qs(value, ctx);
    }
    var blockEndNewlines;
    try {
      blockEndNewlines = new RegExp("(^|(?<!\n))\n+(?!\n|$)", "g");
    } catch {
      blockEndNewlines = /\n+(?!\n|$)/g;
    }
    function blockString({ comment, type, value }, ctx, onComment, onChompKeep) {
      const { blockQuote, commentString, lineWidth } = ctx.options;
      if (!blockQuote || /\n[\t ]+$/.test(value)) {
        return quotedString(value, ctx);
      }
      const indent = ctx.indent || (ctx.forceBlockIndent || containsDocumentMarker(value) ? "  " : "");
      const literal = blockQuote === "literal" ? true : blockQuote === "folded" || type === Scalar.Scalar.BLOCK_FOLDED ? false : type === Scalar.Scalar.BLOCK_LITERAL ? true : !lineLengthOverLimit(value, lineWidth, indent.length);
      if (!value)
        return literal ? "|\n" : ">\n";
      let chomp;
      let endStart;
      for (endStart = value.length; endStart > 0; --endStart) {
        const ch = value[endStart - 1];
        if (ch !== "\n" && ch !== "	" && ch !== " ")
          break;
      }
      let end = value.substring(endStart);
      const endNlPos = end.indexOf("\n");
      if (endNlPos === -1) {
        chomp = "-";
      } else if (value === end || endNlPos !== end.length - 1) {
        chomp = "+";
        if (onChompKeep)
          onChompKeep();
      } else {
        chomp = "";
      }
      if (end) {
        value = value.slice(0, -end.length);
        if (end[end.length - 1] === "\n")
          end = end.slice(0, -1);
        end = end.replace(blockEndNewlines, `$&${indent}`);
      }
      let startWithSpace = false;
      let startEnd;
      let startNlPos = -1;
      for (startEnd = 0; startEnd < value.length; ++startEnd) {
        const ch = value[startEnd];
        if (ch === " ")
          startWithSpace = true;
        else if (ch === "\n")
          startNlPos = startEnd;
        else
          break;
      }
      let start = value.substring(0, startNlPos < startEnd ? startNlPos + 1 : startEnd);
      if (start) {
        value = value.substring(start.length);
        start = start.replace(/\n+/g, `$&${indent}`);
      }
      const indentSize = indent ? "2" : "1";
      let header = (startWithSpace ? indentSize : "") + chomp;
      if (comment) {
        header += " " + commentString(comment.replace(/ ?[\r\n]+/g, " "));
        if (onComment)
          onComment();
      }
      if (!literal) {
        const foldedValue = value.replace(/\n+/g, "\n$&").replace(/(?:^|\n)([\t ].*)(?:([\n\t ]*)\n(?![\n\t ]))?/g, "$1$2").replace(/\n+/g, `$&${indent}`);
        let literalFallback = false;
        const foldOptions = getFoldOptions(ctx, true);
        if (blockQuote !== "folded" && type !== Scalar.Scalar.BLOCK_FOLDED) {
          foldOptions.onOverflow = () => {
            literalFallback = true;
          };
        }
        const body = foldFlowLines.foldFlowLines(`${start}${foldedValue}${end}`, indent, foldFlowLines.FOLD_BLOCK, foldOptions);
        if (!literalFallback)
          return `>${header}
${indent}${body}`;
      }
      value = value.replace(/\n+/g, `$&${indent}`);
      return `|${header}
${indent}${start}${value}${end}`;
    }
    function plainString(item, ctx, onComment, onChompKeep) {
      const { type, value } = item;
      const { actualString, implicitKey, indent, indentStep, inFlow } = ctx;
      if (implicitKey && value.includes("\n") || inFlow && /[[\]{},]/.test(value)) {
        return quotedString(value, ctx);
      }
      if (/^[\n\t ,[\]{}#&*!|>'"%@`]|^[?-]$|^[?-][ \t]|[\n:][ \t]|[ \t]\n|[\n\t ]#|[\n\t :]$/.test(value)) {
        return implicitKey || inFlow || !value.includes("\n") ? quotedString(value, ctx) : blockString(item, ctx, onComment, onChompKeep);
      }
      if (!implicitKey && !inFlow && type !== Scalar.Scalar.PLAIN && value.includes("\n")) {
        return blockString(item, ctx, onComment, onChompKeep);
      }
      if (containsDocumentMarker(value)) {
        if (indent === "") {
          ctx.forceBlockIndent = true;
          return blockString(item, ctx, onComment, onChompKeep);
        } else if (implicitKey && indent === indentStep) {
          return quotedString(value, ctx);
        }
      }
      const str = value.replace(/\n+/g, `$&
${indent}`);
      if (actualString) {
        const test = (tag) => tag.default && tag.tag !== "tag:yaml.org,2002:str" && tag.test?.test(str);
        const { compat, tags } = ctx.doc.schema;
        if (tags.some(test) || compat?.some(test))
          return quotedString(value, ctx);
      }
      return implicitKey ? str : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function stringifyString(item, ctx, onComment, onChompKeep) {
      const { implicitKey, inFlow } = ctx;
      const ss = typeof item.value === "string" ? item : Object.assign({}, item, { value: String(item.value) });
      let { type } = item;
      if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
        if (/[\x00-\x08\x0b-\x1f\x7f-\x9f\u{D800}-\u{DFFF}]/u.test(ss.value))
          type = Scalar.Scalar.QUOTE_DOUBLE;
      }
      const _stringify = (_type) => {
        switch (_type) {
          case Scalar.Scalar.BLOCK_FOLDED:
          case Scalar.Scalar.BLOCK_LITERAL:
            return implicitKey || inFlow ? quotedString(ss.value, ctx) : blockString(ss, ctx, onComment, onChompKeep);
          case Scalar.Scalar.QUOTE_DOUBLE:
            return doubleQuotedString(ss.value, ctx);
          case Scalar.Scalar.QUOTE_SINGLE:
            return singleQuotedString(ss.value, ctx);
          case Scalar.Scalar.PLAIN:
            return plainString(ss, ctx, onComment, onChompKeep);
          default:
            return null;
        }
      };
      let res = _stringify(type);
      if (res === null) {
        const { defaultKeyType, defaultStringType } = ctx.options;
        const t = implicitKey && defaultKeyType || defaultStringType;
        res = _stringify(t);
        if (res === null)
          throw new Error(`Unsupported default string type ${t}`);
      }
      return res;
    }
    exports.stringifyString = stringifyString;
  }
});

// node_modules/yaml/dist/stringify/stringify.js
var require_stringify = __commonJS({
  "node_modules/yaml/dist/stringify/stringify.js"(exports) {
    "use strict";
    var anchors = require_anchors();
    var identity = require_identity();
    var stringifyComment = require_stringifyComment();
    var stringifyString = require_stringifyString();
    function createStringifyContext(doc, options) {
      const opt = Object.assign({
        blockQuote: true,
        commentString: stringifyComment.stringifyComment,
        defaultKeyType: null,
        defaultStringType: "PLAIN",
        directives: null,
        doubleQuotedAsJSON: false,
        doubleQuotedMinMultiLineLength: 40,
        falseStr: "false",
        flowCollectionPadding: true,
        indentSeq: true,
        lineWidth: 80,
        minContentWidth: 20,
        nullStr: "null",
        simpleKeys: false,
        singleQuote: null,
        trailingComma: false,
        trueStr: "true",
        verifyAliasOrder: true
      }, doc.schema.toStringOptions, options);
      let inFlow;
      switch (opt.collectionStyle) {
        case "block":
          inFlow = false;
          break;
        case "flow":
          inFlow = true;
          break;
        default:
          inFlow = null;
      }
      return {
        anchors: /* @__PURE__ */ new Set(),
        doc,
        flowCollectionPadding: opt.flowCollectionPadding ? " " : "",
        indent: "",
        indentStep: typeof opt.indent === "number" ? " ".repeat(opt.indent) : "  ",
        inFlow,
        options: opt
      };
    }
    function getTagObject(tags, item) {
      if (item.tag) {
        const match = tags.filter((t) => t.tag === item.tag);
        if (match.length > 0)
          return match.find((t) => t.format === item.format) ?? match[0];
      }
      let tagObj = void 0;
      let obj;
      if (identity.isScalar(item)) {
        obj = item.value;
        let match = tags.filter((t) => t.identify?.(obj));
        if (match.length > 1) {
          const testMatch = match.filter((t) => t.test);
          if (testMatch.length > 0)
            match = testMatch;
        }
        tagObj = match.find((t) => t.format === item.format) ?? match.find((t) => !t.format);
      } else {
        obj = item;
        tagObj = tags.find((t) => t.nodeClass && obj instanceof t.nodeClass);
      }
      if (!tagObj) {
        const name = obj?.constructor?.name ?? (obj === null ? "null" : typeof obj);
        throw new Error(`Tag not resolved for ${name} value`);
      }
      return tagObj;
    }
    function stringifyProps(node, tagObj, { anchors: anchors$1, doc }) {
      if (!doc.directives)
        return "";
      const props = [];
      const anchor = (identity.isScalar(node) || identity.isCollection(node)) && node.anchor;
      if (anchor && anchors.anchorIsValid(anchor)) {
        anchors$1.add(anchor);
        props.push(`&${anchor}`);
      }
      const tag = node.tag ?? (tagObj.default ? null : tagObj.tag);
      if (tag)
        props.push(doc.directives.tagString(tag));
      return props.join(" ");
    }
    function stringify3(item, ctx, onComment, onChompKeep) {
      if (identity.isPair(item))
        return item.toString(ctx, onComment, onChompKeep);
      if (identity.isAlias(item)) {
        if (ctx.doc.directives)
          return item.toString(ctx);
        if (ctx.resolvedAliases?.has(item)) {
          throw new TypeError(`Cannot stringify circular structure without alias nodes`);
        } else {
          if (ctx.resolvedAliases)
            ctx.resolvedAliases.add(item);
          else
            ctx.resolvedAliases = /* @__PURE__ */ new Set([item]);
          item = item.resolve(ctx.doc);
        }
      }
      let tagObj = void 0;
      const node = identity.isNode(item) ? item : ctx.doc.createNode(item, { onTagObj: (o) => tagObj = o });
      tagObj ?? (tagObj = getTagObject(ctx.doc.schema.tags, node));
      const props = stringifyProps(node, tagObj, ctx);
      if (props.length > 0)
        ctx.indentAtStart = (ctx.indentAtStart ?? 0) + props.length + 1;
      const str = typeof tagObj.stringify === "function" ? tagObj.stringify(node, ctx, onComment, onChompKeep) : identity.isScalar(node) ? stringifyString.stringifyString(node, ctx, onComment, onChompKeep) : node.toString(ctx, onComment, onChompKeep);
      if (!props)
        return str;
      return identity.isScalar(node) || str[0] === "{" || str[0] === "[" ? `${props} ${str}` : `${props}
${ctx.indent}${str}`;
    }
    exports.createStringifyContext = createStringifyContext;
    exports.stringify = stringify3;
  }
});

// node_modules/yaml/dist/stringify/stringifyPair.js
var require_stringifyPair = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyPair.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var stringify3 = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyPair({ key: key2, value }, ctx, onComment, onChompKeep) {
      const { allNullValues, doc, indent, indentStep, options: { commentString, indentSeq, simpleKeys } } = ctx;
      let keyComment = identity.isNode(key2) && key2.comment || null;
      if (simpleKeys) {
        if (keyComment) {
          throw new Error("With simple keys, key nodes cannot have comments");
        }
        if (identity.isCollection(key2) || !identity.isNode(key2) && typeof key2 === "object") {
          const msg = "With simple keys, collection cannot be used as a key value";
          throw new Error(msg);
        }
      }
      let explicitKey = !simpleKeys && (!key2 || keyComment && value == null && !ctx.inFlow || identity.isCollection(key2) || (identity.isScalar(key2) ? key2.type === Scalar.Scalar.BLOCK_FOLDED || key2.type === Scalar.Scalar.BLOCK_LITERAL : typeof key2 === "object"));
      ctx = Object.assign({}, ctx, {
        allNullValues: false,
        implicitKey: !explicitKey && (simpleKeys || !allNullValues),
        indent: indent + indentStep
      });
      let keyCommentDone = false;
      let chompKeep = false;
      let str = stringify3.stringify(key2, ctx, () => keyCommentDone = true, () => chompKeep = true);
      if (!explicitKey && !ctx.inFlow && str.length > 1024) {
        if (simpleKeys)
          throw new Error("With simple keys, single line scalar must not span more than 1024 characters");
        explicitKey = true;
      }
      if (ctx.inFlow) {
        if (allNullValues || value == null) {
          if (keyCommentDone && onComment)
            onComment();
          return str === "" ? "?" : explicitKey ? `? ${str}` : str;
        }
      } else if (allNullValues && !simpleKeys || value == null && explicitKey) {
        str = `? ${str}`;
        if (keyComment && !keyCommentDone) {
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
        } else if (chompKeep && onChompKeep)
          onChompKeep();
        return str;
      }
      if (keyCommentDone)
        keyComment = null;
      if (explicitKey) {
        if (keyComment)
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
        str = `? ${str}
${indent}:`;
      } else {
        str = `${str}:`;
        if (keyComment)
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
      }
      let vsb, vcb, valueComment;
      if (identity.isNode(value)) {
        vsb = !!value.spaceBefore;
        vcb = value.commentBefore;
        valueComment = value.comment;
      } else {
        vsb = false;
        vcb = null;
        valueComment = null;
        if (value && typeof value === "object")
          value = doc.createNode(value);
      }
      ctx.implicitKey = false;
      if (!explicitKey && !keyComment && identity.isScalar(value))
        ctx.indentAtStart = str.length + 1;
      chompKeep = false;
      if (!indentSeq && indentStep.length >= 2 && !ctx.inFlow && !explicitKey && identity.isSeq(value) && !value.flow && !value.tag && !value.anchor) {
        ctx.indent = ctx.indent.substring(2);
      }
      let valueCommentDone = false;
      const valueStr = stringify3.stringify(value, ctx, () => valueCommentDone = true, () => chompKeep = true);
      let ws = " ";
      if (keyComment || vsb || vcb) {
        ws = vsb ? "\n" : "";
        if (vcb) {
          const cs = commentString(vcb);
          ws += `
${stringifyComment.indentComment(cs, ctx.indent)}`;
        }
        if (valueStr === "" && !ctx.inFlow) {
          if (ws === "\n" && valueComment)
            ws = "\n\n";
        } else {
          ws += `
${ctx.indent}`;
        }
      } else if (!explicitKey && identity.isCollection(value)) {
        const vs0 = valueStr[0];
        const nl0 = valueStr.indexOf("\n");
        const hasNewline = nl0 !== -1;
        const flow = ctx.inFlow ?? value.flow ?? value.items.length === 0;
        if (hasNewline || !flow) {
          let hasPropsLine = false;
          if (hasNewline && (vs0 === "&" || vs0 === "!")) {
            let sp0 = valueStr.indexOf(" ");
            if (vs0 === "&" && sp0 !== -1 && sp0 < nl0 && valueStr[sp0 + 1] === "!") {
              sp0 = valueStr.indexOf(" ", sp0 + 1);
            }
            if (sp0 === -1 || nl0 < sp0)
              hasPropsLine = true;
          }
          if (!hasPropsLine)
            ws = `
${ctx.indent}`;
        }
      } else if (valueStr === "" || valueStr[0] === "\n") {
        ws = "";
      }
      str += ws + valueStr;
      if (ctx.inFlow) {
        if (valueCommentDone && onComment)
          onComment();
      } else if (valueComment && !valueCommentDone) {
        str += stringifyComment.lineComment(str, ctx.indent, commentString(valueComment));
      } else if (chompKeep && onChompKeep) {
        onChompKeep();
      }
      return str;
    }
    exports.stringifyPair = stringifyPair;
  }
});

// node_modules/yaml/dist/log.js
var require_log = __commonJS({
  "node_modules/yaml/dist/log.js"(exports) {
    "use strict";
    var node_process = __require("process");
    function debug(logLevel, ...messages) {
      if (logLevel === "debug")
        console.log(...messages);
    }
    function warn(logLevel, warning) {
      if (logLevel === "debug" || logLevel === "warn") {
        if (typeof node_process.emitWarning === "function")
          node_process.emitWarning(warning);
        else
          console.warn(warning);
      }
    }
    exports.debug = debug;
    exports.warn = warn;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/merge.js
var require_merge = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/merge.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var MERGE_KEY = "<<";
    var merge = {
      identify: (value) => value === MERGE_KEY || typeof value === "symbol" && value.description === MERGE_KEY,
      default: "key",
      tag: "tag:yaml.org,2002:merge",
      test: /^<<$/,
      resolve: () => Object.assign(new Scalar.Scalar(Symbol(MERGE_KEY)), {
        addToJSMap: addMergeToJSMap
      }),
      stringify: () => MERGE_KEY
    };
    var isMergeKey = (ctx, key2) => (merge.identify(key2) || identity.isScalar(key2) && (!key2.type || key2.type === Scalar.Scalar.PLAIN) && merge.identify(key2.value)) && ctx?.doc.schema.tags.some((tag) => tag.tag === merge.tag && tag.default);
    function addMergeToJSMap(ctx, map, value) {
      const source = resolveAliasValue(ctx, value);
      if (identity.isSeq(source))
        for (const it of source.items)
          mergeValue(ctx, map, it);
      else if (Array.isArray(source))
        for (const it of source)
          mergeValue(ctx, map, it);
      else
        mergeValue(ctx, map, source);
    }
    function mergeValue(ctx, map, value) {
      const source = resolveAliasValue(ctx, value);
      if (!identity.isMap(source))
        throw new Error("Merge sources must be maps or map aliases");
      const srcMap = source.toJSON(null, ctx, Map);
      for (const [key2, value2] of srcMap) {
        if (map instanceof Map) {
          if (!map.has(key2))
            map.set(key2, value2);
        } else if (map instanceof Set) {
          map.add(key2);
        } else if (!Object.prototype.hasOwnProperty.call(map, key2)) {
          Object.defineProperty(map, key2, {
            value: value2,
            writable: true,
            enumerable: true,
            configurable: true
          });
        }
      }
      return map;
    }
    function resolveAliasValue(ctx, value) {
      return ctx && identity.isAlias(value) ? value.resolve(ctx.doc, ctx) : value;
    }
    exports.addMergeToJSMap = addMergeToJSMap;
    exports.isMergeKey = isMergeKey;
    exports.merge = merge;
  }
});

// node_modules/yaml/dist/nodes/addPairToJSMap.js
var require_addPairToJSMap = __commonJS({
  "node_modules/yaml/dist/nodes/addPairToJSMap.js"(exports) {
    "use strict";
    var log = require_log();
    var merge = require_merge();
    var stringify3 = require_stringify();
    var identity = require_identity();
    var toJS = require_toJS();
    function addPairToJSMap(ctx, map, { key: key2, value }) {
      if (identity.isNode(key2) && key2.addToJSMap)
        key2.addToJSMap(ctx, map, value);
      else if (merge.isMergeKey(ctx, key2))
        merge.addMergeToJSMap(ctx, map, value);
      else {
        const jsKey = toJS.toJS(key2, "", ctx);
        if (map instanceof Map) {
          map.set(jsKey, toJS.toJS(value, jsKey, ctx));
        } else if (map instanceof Set) {
          map.add(jsKey);
        } else {
          const stringKey = stringifyKey(key2, jsKey, ctx);
          const jsValue = toJS.toJS(value, stringKey, ctx);
          if (stringKey in map)
            Object.defineProperty(map, stringKey, {
              value: jsValue,
              writable: true,
              enumerable: true,
              configurable: true
            });
          else
            map[stringKey] = jsValue;
        }
      }
      return map;
    }
    function stringifyKey(key2, jsKey, ctx) {
      if (jsKey === null)
        return "";
      if (typeof jsKey !== "object")
        return String(jsKey);
      if (identity.isNode(key2) && ctx?.doc) {
        const strCtx = stringify3.createStringifyContext(ctx.doc, {});
        strCtx.anchors = /* @__PURE__ */ new Set();
        for (const node of ctx.anchors.keys())
          strCtx.anchors.add(node.anchor);
        strCtx.inFlow = true;
        strCtx.inStringifyKey = true;
        const strKey = key2.toString(strCtx);
        if (!ctx.mapKeyWarned) {
          let jsonStr = JSON.stringify(strKey);
          if (jsonStr.length > 40)
            jsonStr = jsonStr.substring(0, 36) + '..."';
          log.warn(ctx.doc.options.logLevel, `Keys with collection values will be stringified due to JS Object restrictions: ${jsonStr}. Set mapAsMap: true to use object keys.`);
          ctx.mapKeyWarned = true;
        }
        return strKey;
      }
      return JSON.stringify(jsKey);
    }
    exports.addPairToJSMap = addPairToJSMap;
  }
});

// node_modules/yaml/dist/nodes/Pair.js
var require_Pair = __commonJS({
  "node_modules/yaml/dist/nodes/Pair.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var stringifyPair = require_stringifyPair();
    var addPairToJSMap = require_addPairToJSMap();
    var identity = require_identity();
    function createPair(key2, value, ctx) {
      const k = createNode.createNode(key2, void 0, ctx);
      const v = createNode.createNode(value, void 0, ctx);
      return new Pair(k, v);
    }
    var Pair = class _Pair {
      constructor(key2, value = null) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.PAIR });
        this.key = key2;
        this.value = value;
      }
      clone(schema) {
        let { key: key2, value } = this;
        if (identity.isNode(key2))
          key2 = key2.clone(schema);
        if (identity.isNode(value))
          value = value.clone(schema);
        return new _Pair(key2, value);
      }
      toJSON(_, ctx) {
        const pair = ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        return addPairToJSMap.addPairToJSMap(ctx, pair, this);
      }
      toString(ctx, onComment, onChompKeep) {
        return ctx?.doc ? stringifyPair.stringifyPair(this, ctx, onComment, onChompKeep) : JSON.stringify(this);
      }
    };
    exports.Pair = Pair;
    exports.createPair = createPair;
  }
});

// node_modules/yaml/dist/stringify/stringifyCollection.js
var require_stringifyCollection = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyCollection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var stringify3 = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyCollection(collection, ctx, options) {
      const flow = ctx.inFlow ?? collection.flow;
      const stringify4 = flow ? stringifyFlowCollection : stringifyBlockCollection;
      return stringify4(collection, ctx, options);
    }
    function stringifyBlockCollection({ comment, items }, ctx, { blockItemPrefix, flowChars, itemIndent, onChompKeep, onComment }) {
      const { indent, options: { commentString } } = ctx;
      const itemCtx = Object.assign({}, ctx, { indent: itemIndent, type: null });
      let chompKeep = false;
      const lines = [];
      for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment2 = null;
        if (identity.isNode(item)) {
          if (!chompKeep && item.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, item.commentBefore, chompKeep);
          if (item.comment)
            comment2 = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (!chompKeep && ik.spaceBefore)
              lines.push("");
            addCommentBefore(ctx, lines, ik.commentBefore, chompKeep);
          }
        }
        chompKeep = false;
        let str2 = stringify3.stringify(item, itemCtx, () => comment2 = null, () => chompKeep = true);
        if (comment2)
          str2 += stringifyComment.lineComment(str2, itemIndent, commentString(comment2));
        if (chompKeep && comment2)
          chompKeep = false;
        lines.push(blockItemPrefix + str2);
      }
      let str;
      if (lines.length === 0) {
        str = flowChars.start + flowChars.end;
      } else {
        str = lines[0];
        for (let i = 1; i < lines.length; ++i) {
          const line = lines[i];
          str += line ? `
${indent}${line}` : "\n";
        }
      }
      if (comment) {
        str += "\n" + stringifyComment.indentComment(commentString(comment), indent);
        if (onComment)
          onComment();
      } else if (chompKeep && onChompKeep)
        onChompKeep();
      return str;
    }
    function stringifyFlowCollection({ items }, ctx, { flowChars, itemIndent }) {
      const { indent, indentStep, flowCollectionPadding: fcPadding, options: { commentString } } = ctx;
      itemIndent += indentStep;
      const itemCtx = Object.assign({}, ctx, {
        indent: itemIndent,
        inFlow: true,
        type: null
      });
      let reqNewline = false;
      let linesAtValue = 0;
      const lines = [];
      for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment = null;
        if (identity.isNode(item)) {
          if (item.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, item.commentBefore, false);
          if (item.comment)
            comment = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (ik.spaceBefore)
              lines.push("");
            addCommentBefore(ctx, lines, ik.commentBefore, false);
            if (ik.comment)
              reqNewline = true;
          }
          const iv = identity.isNode(item.value) ? item.value : null;
          if (iv) {
            if (iv.comment)
              comment = iv.comment;
            if (iv.commentBefore)
              reqNewline = true;
          } else if (item.value == null && ik?.comment) {
            comment = ik.comment;
          }
        }
        if (comment)
          reqNewline = true;
        let str = stringify3.stringify(item, itemCtx, () => comment = null);
        reqNewline || (reqNewline = lines.length > linesAtValue || str.includes("\n"));
        if (i < items.length - 1) {
          str += ",";
        } else if (ctx.options.trailingComma) {
          if (ctx.options.lineWidth > 0) {
            reqNewline || (reqNewline = lines.reduce((sum, line) => sum + line.length + 2, 2) + (str.length + 2) > ctx.options.lineWidth);
          }
          if (reqNewline) {
            str += ",";
          }
        }
        if (comment)
          str += stringifyComment.lineComment(str, itemIndent, commentString(comment));
        lines.push(str);
        linesAtValue = lines.length;
      }
      const { start, end } = flowChars;
      if (lines.length === 0) {
        return start + end;
      } else {
        if (!reqNewline) {
          const len = lines.reduce((sum, line) => sum + line.length + 2, 2);
          reqNewline = ctx.options.lineWidth > 0 && len > ctx.options.lineWidth;
        }
        if (reqNewline) {
          let str = start;
          for (const line of lines)
            str += line ? `
${indentStep}${indent}${line}` : "\n";
          return `${str}
${indent}${end}`;
        } else {
          return `${start}${fcPadding}${lines.join(" ")}${fcPadding}${end}`;
        }
      }
    }
    function addCommentBefore({ indent, options: { commentString } }, lines, comment, chompKeep) {
      if (comment && chompKeep)
        comment = comment.replace(/^\n+/, "");
      if (comment) {
        const ic = stringifyComment.indentComment(commentString(comment), indent);
        lines.push(ic.trimStart());
      }
    }
    exports.stringifyCollection = stringifyCollection;
  }
});

// node_modules/yaml/dist/nodes/YAMLMap.js
var require_YAMLMap = __commonJS({
  "node_modules/yaml/dist/nodes/YAMLMap.js"(exports) {
    "use strict";
    var stringifyCollection = require_stringifyCollection();
    var addPairToJSMap = require_addPairToJSMap();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    function findPair(items, key2) {
      const k = identity.isScalar(key2) ? key2.value : key2;
      for (const it of items) {
        if (identity.isPair(it)) {
          if (it.key === key2 || it.key === k)
            return it;
          if (identity.isScalar(it.key) && it.key.value === k)
            return it;
        }
      }
      return void 0;
    }
    var YAMLMap = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:map";
      }
      constructor(schema) {
        super(identity.MAP, schema);
        this.items = [];
      }
      /**
       * A generic collection parsing method that can be extended
       * to other node classes that inherit from YAMLMap
       */
      static from(schema, obj, ctx) {
        const { keepUndefined, replacer } = ctx;
        const map = new this(schema);
        const add = (key2, value) => {
          if (typeof replacer === "function")
            value = replacer.call(obj, key2, value);
          else if (Array.isArray(replacer) && !replacer.includes(key2))
            return;
          if (value !== void 0 || keepUndefined)
            map.items.push(Pair.createPair(key2, value, ctx));
        };
        if (obj instanceof Map) {
          for (const [key2, value] of obj)
            add(key2, value);
        } else if (obj && typeof obj === "object") {
          for (const key2 of Object.keys(obj))
            add(key2, obj[key2]);
        }
        if (typeof schema.sortMapEntries === "function") {
          map.items.sort(schema.sortMapEntries);
        }
        return map;
      }
      /**
       * Adds a value to the collection.
       *
       * @param overwrite - If not set `true`, using a key that is already in the
       *   collection will throw. Otherwise, overwrites the previous value.
       */
      add(pair, overwrite) {
        let _pair;
        if (identity.isPair(pair))
          _pair = pair;
        else if (!pair || typeof pair !== "object" || !("key" in pair)) {
          _pair = new Pair.Pair(pair, pair?.value);
        } else
          _pair = new Pair.Pair(pair.key, pair.value);
        const prev = findPair(this.items, _pair.key);
        const sortEntries = this.schema?.sortMapEntries;
        if (prev) {
          if (!overwrite)
            throw new Error(`Key ${_pair.key} already set`);
          if (identity.isScalar(prev.value) && Scalar.isScalarValue(_pair.value))
            prev.value.value = _pair.value;
          else
            prev.value = _pair.value;
        } else if (sortEntries) {
          const i = this.items.findIndex((item) => sortEntries(_pair, item) < 0);
          if (i === -1)
            this.items.push(_pair);
          else
            this.items.splice(i, 0, _pair);
        } else {
          this.items.push(_pair);
        }
      }
      delete(key2) {
        const it = findPair(this.items, key2);
        if (!it)
          return false;
        const del = this.items.splice(this.items.indexOf(it), 1);
        return del.length > 0;
      }
      get(key2, keepScalar) {
        const it = findPair(this.items, key2);
        const node = it?.value;
        return (!keepScalar && identity.isScalar(node) ? node.value : node) ?? void 0;
      }
      has(key2) {
        return !!findPair(this.items, key2);
      }
      set(key2, value) {
        this.add(new Pair.Pair(key2, value), true);
      }
      /**
       * @param ctx - Conversion context, originally set in Document#toJS()
       * @param {Class} Type - If set, forces the returned collection type
       * @returns Instance of Type, Map, or Object
       */
      toJSON(_, ctx, Type) {
        const map = Type ? new Type() : ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        if (ctx?.onCreate)
          ctx.onCreate(map);
        for (const item of this.items)
          addPairToJSMap.addPairToJSMap(ctx, map, item);
        return map;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        for (const item of this.items) {
          if (!identity.isPair(item))
            throw new Error(`Map items must all be pairs; found ${JSON.stringify(item)} instead`);
        }
        if (!ctx.allNullValues && this.hasAllNullValues(false))
          ctx = Object.assign({}, ctx, { allNullValues: true });
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "",
          flowChars: { start: "{", end: "}" },
          itemIndent: ctx.indent || "",
          onChompKeep,
          onComment
        });
      }
    };
    exports.YAMLMap = YAMLMap;
    exports.findPair = findPair;
  }
});

// node_modules/yaml/dist/schema/common/map.js
var require_map = __commonJS({
  "node_modules/yaml/dist/schema/common/map.js"(exports) {
    "use strict";
    var identity = require_identity();
    var YAMLMap = require_YAMLMap();
    var map = {
      collection: "map",
      default: true,
      nodeClass: YAMLMap.YAMLMap,
      tag: "tag:yaml.org,2002:map",
      resolve(map2, onError) {
        if (!identity.isMap(map2))
          onError("Expected a mapping for this tag");
        return map2;
      },
      createNode: (schema, obj, ctx) => YAMLMap.YAMLMap.from(schema, obj, ctx)
    };
    exports.map = map;
  }
});

// node_modules/yaml/dist/nodes/YAMLSeq.js
var require_YAMLSeq = __commonJS({
  "node_modules/yaml/dist/nodes/YAMLSeq.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var stringifyCollection = require_stringifyCollection();
    var Collection = require_Collection();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var toJS = require_toJS();
    var YAMLSeq = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:seq";
      }
      constructor(schema) {
        super(identity.SEQ, schema);
        this.items = [];
      }
      add(value) {
        this.items.push(value);
      }
      /**
       * Removes a value from the collection.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       *
       * @returns `true` if the item was found and removed.
       */
      delete(key2) {
        const idx = asItemIndex(key2);
        if (typeof idx !== "number")
          return false;
        const del = this.items.splice(idx, 1);
        return del.length > 0;
      }
      get(key2, keepScalar) {
        const idx = asItemIndex(key2);
        if (typeof idx !== "number")
          return void 0;
        const it = this.items[idx];
        return !keepScalar && identity.isScalar(it) ? it.value : it;
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       */
      has(key2) {
        const idx = asItemIndex(key2);
        return typeof idx === "number" && idx < this.items.length;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       *
       * If `key` does not contain a representation of an integer, this will throw.
       * It may be wrapped in a `Scalar`.
       */
      set(key2, value) {
        const idx = asItemIndex(key2);
        if (typeof idx !== "number")
          throw new Error(`Expected a valid index, not ${key2}.`);
        const prev = this.items[idx];
        if (identity.isScalar(prev) && Scalar.isScalarValue(value))
          prev.value = value;
        else
          this.items[idx] = value;
      }
      toJSON(_, ctx) {
        const seq = [];
        if (ctx?.onCreate)
          ctx.onCreate(seq);
        let i = 0;
        for (const item of this.items)
          seq.push(toJS.toJS(item, String(i++), ctx));
        return seq;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "- ",
          flowChars: { start: "[", end: "]" },
          itemIndent: (ctx.indent || "") + "  ",
          onChompKeep,
          onComment
        });
      }
      static from(schema, obj, ctx) {
        const { replacer } = ctx;
        const seq = new this(schema);
        if (obj && Symbol.iterator in Object(obj)) {
          let i = 0;
          for (let it of obj) {
            if (typeof replacer === "function") {
              const key2 = obj instanceof Set ? it : String(i++);
              it = replacer.call(obj, key2, it);
            }
            seq.items.push(createNode.createNode(it, void 0, ctx));
          }
        }
        return seq;
      }
    };
    function asItemIndex(key2) {
      let idx = identity.isScalar(key2) ? key2.value : key2;
      if (idx && typeof idx === "string")
        idx = Number(idx);
      return typeof idx === "number" && Number.isInteger(idx) && idx >= 0 ? idx : null;
    }
    exports.YAMLSeq = YAMLSeq;
  }
});

// node_modules/yaml/dist/schema/common/seq.js
var require_seq = __commonJS({
  "node_modules/yaml/dist/schema/common/seq.js"(exports) {
    "use strict";
    var identity = require_identity();
    var YAMLSeq = require_YAMLSeq();
    var seq = {
      collection: "seq",
      default: true,
      nodeClass: YAMLSeq.YAMLSeq,
      tag: "tag:yaml.org,2002:seq",
      resolve(seq2, onError) {
        if (!identity.isSeq(seq2))
          onError("Expected a sequence for this tag");
        return seq2;
      },
      createNode: (schema, obj, ctx) => YAMLSeq.YAMLSeq.from(schema, obj, ctx)
    };
    exports.seq = seq;
  }
});

// node_modules/yaml/dist/schema/common/string.js
var require_string = __commonJS({
  "node_modules/yaml/dist/schema/common/string.js"(exports) {
    "use strict";
    var stringifyString = require_stringifyString();
    var string = {
      identify: (value) => typeof value === "string",
      default: true,
      tag: "tag:yaml.org,2002:str",
      resolve: (str) => str,
      stringify(item, ctx, onComment, onChompKeep) {
        ctx = Object.assign({ actualString: true }, ctx);
        return stringifyString.stringifyString(item, ctx, onComment, onChompKeep);
      }
    };
    exports.string = string;
  }
});

// node_modules/yaml/dist/schema/common/null.js
var require_null = __commonJS({
  "node_modules/yaml/dist/schema/common/null.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var nullTag = {
      identify: (value) => value == null,
      createNode: () => new Scalar.Scalar(null),
      default: true,
      tag: "tag:yaml.org,2002:null",
      test: /^(?:~|[Nn]ull|NULL)?$/,
      resolve: () => new Scalar.Scalar(null),
      stringify: ({ source }, ctx) => typeof source === "string" && nullTag.test.test(source) ? source : ctx.options.nullStr
    };
    exports.nullTag = nullTag;
  }
});

// node_modules/yaml/dist/schema/core/bool.js
var require_bool = __commonJS({
  "node_modules/yaml/dist/schema/core/bool.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var boolTag = {
      identify: (value) => typeof value === "boolean",
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:[Tt]rue|TRUE|[Ff]alse|FALSE)$/,
      resolve: (str) => new Scalar.Scalar(str[0] === "t" || str[0] === "T"),
      stringify({ source, value }, ctx) {
        if (source && boolTag.test.test(source)) {
          const sv = source[0] === "t" || source[0] === "T";
          if (value === sv)
            return source;
        }
        return value ? ctx.options.trueStr : ctx.options.falseStr;
      }
    };
    exports.boolTag = boolTag;
  }
});

// node_modules/yaml/dist/stringify/stringifyNumber.js
var require_stringifyNumber = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyNumber.js"(exports) {
    "use strict";
    function stringifyNumber({ format, minFractionDigits, tag, value }) {
      if (typeof value === "bigint")
        return String(value);
      const num = typeof value === "number" ? value : Number(value);
      if (!isFinite(num))
        return isNaN(num) ? ".nan" : num < 0 ? "-.inf" : ".inf";
      let n = Object.is(value, -0) ? "-0" : JSON.stringify(value);
      if (!format && minFractionDigits && (!tag || tag === "tag:yaml.org,2002:float") && /^-?\d/.test(n) && !n.includes("e")) {
        let i = n.indexOf(".");
        if (i < 0) {
          i = n.length;
          n += ".";
        }
        let d = minFractionDigits - (n.length - i - 1);
        while (d-- > 0)
          n += "0";
      }
      return n;
    }
    exports.stringifyNumber = stringifyNumber;
  }
});

// node_modules/yaml/dist/schema/core/float.js
var require_float = __commonJS({
  "node_modules/yaml/dist/schema/core/float.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)[eE][-+]?[0-9]+$/,
      resolve: (str) => parseFloat(str),
      stringify(node) {
        const num = Number(node.value);
        return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+\.[0-9]*)$/,
      resolve(str) {
        const node = new Scalar.Scalar(parseFloat(str));
        const dot = str.indexOf(".");
        if (dot !== -1 && str[str.length - 1] === "0")
          node.minFractionDigits = str.length - dot - 1;
        return node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports.float = float;
    exports.floatExp = floatExp;
    exports.floatNaN = floatNaN;
  }
});

// node_modules/yaml/dist/schema/core/int.js
var require_int = __commonJS({
  "node_modules/yaml/dist/schema/core/int.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    var intResolve = (str, offset, radix, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str.substring(offset), radix);
    function intStringify(node, radix, prefix) {
      const { value } = node;
      if (intIdentify(value) && value >= 0)
        return prefix + value.toString(radix);
      return stringifyNumber.stringifyNumber(node);
    }
    var intOct = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^0o[0-7]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 8, opt),
      stringify: (node) => intStringify(node, 8, "0o")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^0x[0-9a-fA-F]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports.int = int;
    exports.intHex = intHex;
    exports.intOct = intOct;
  }
});

// node_modules/yaml/dist/schema/core/schema.js
var require_schema = __commonJS({
  "node_modules/yaml/dist/schema/core/schema.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = [
      map.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.boolTag,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float
    ];
    exports.schema = schema;
  }
});

// node_modules/yaml/dist/schema/json/schema.js
var require_schema2 = __commonJS({
  "node_modules/yaml/dist/schema/json/schema.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var map = require_map();
    var seq = require_seq();
    function intIdentify(value) {
      return typeof value === "bigint" || Number.isInteger(value);
    }
    var stringifyJSON = ({ value }) => JSON.stringify(value);
    var jsonScalars = [
      {
        identify: (value) => typeof value === "string",
        default: true,
        tag: "tag:yaml.org,2002:str",
        resolve: (str) => str,
        stringify: stringifyJSON
      },
      {
        identify: (value) => value == null,
        createNode: () => new Scalar.Scalar(null),
        default: true,
        tag: "tag:yaml.org,2002:null",
        test: /^null$/,
        resolve: () => null,
        stringify: stringifyJSON
      },
      {
        identify: (value) => typeof value === "boolean",
        default: true,
        tag: "tag:yaml.org,2002:bool",
        test: /^true$|^false$/,
        resolve: (str) => str === "true",
        stringify: stringifyJSON
      },
      {
        identify: intIdentify,
        default: true,
        tag: "tag:yaml.org,2002:int",
        test: /^-?(?:0|[1-9][0-9]*)$/,
        resolve: (str, _onError, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str, 10),
        stringify: ({ value }) => intIdentify(value) ? value.toString() : JSON.stringify(value)
      },
      {
        identify: (value) => typeof value === "number",
        default: true,
        tag: "tag:yaml.org,2002:float",
        test: /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*)?(?:[eE][-+]?[0-9]+)?$/,
        resolve: (str) => parseFloat(str),
        stringify: stringifyJSON
      }
    ];
    var jsonError = {
      default: true,
      tag: "",
      test: /^/,
      resolve(str, onError) {
        onError(`Unresolved plain scalar ${JSON.stringify(str)}`);
        return str;
      }
    };
    var schema = [map.map, seq.seq].concat(jsonScalars, jsonError);
    exports.schema = schema;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/binary.js
var require_binary = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/binary.js"(exports) {
    "use strict";
    var node_buffer = __require("buffer");
    var Scalar = require_Scalar();
    var stringifyString = require_stringifyString();
    var binary2 = {
      identify: (value) => value instanceof Uint8Array,
      // Buffer inherits from Uint8Array
      default: false,
      tag: "tag:yaml.org,2002:binary",
      /**
       * Returns a Buffer in node and an Uint8Array in browsers
       *
       * To use the resulting buffer as an image, you'll want to do something like:
       *
       *   const blob = new Blob([buffer], { type: 'image/jpeg' })
       *   document.querySelector('#photo').src = URL.createObjectURL(blob)
       */
      resolve(src, onError) {
        if (typeof node_buffer.Buffer === "function") {
          return node_buffer.Buffer.from(src, "base64");
        } else if (typeof atob === "function") {
          const str = atob(src.replace(/[\n\r]/g, ""));
          const buffer = new Uint8Array(str.length);
          for (let i = 0; i < str.length; ++i)
            buffer[i] = str.charCodeAt(i);
          return buffer;
        } else {
          onError("This environment does not support reading binary tags; either Buffer or atob is required");
          return src;
        }
      },
      stringify({ comment, type, value }, ctx, onComment, onChompKeep) {
        if (!value)
          return "";
        const buf = value;
        let str;
        if (typeof node_buffer.Buffer === "function") {
          str = buf instanceof node_buffer.Buffer ? buf.toString("base64") : node_buffer.Buffer.from(buf.buffer).toString("base64");
        } else if (typeof btoa === "function") {
          let s = "";
          for (let i = 0; i < buf.length; ++i)
            s += String.fromCharCode(buf[i]);
          str = btoa(s);
        } else {
          throw new Error("This environment does not support writing binary tags; either Buffer or btoa is required");
        }
        type ?? (type = Scalar.Scalar.BLOCK_LITERAL);
        if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
          const lineWidth = Math.max(ctx.options.lineWidth - ctx.indent.length, ctx.options.minContentWidth);
          const n = Math.ceil(str.length / lineWidth);
          const lines = new Array(n);
          for (let i = 0, o = 0; i < n; ++i, o += lineWidth) {
            lines[i] = str.substr(o, lineWidth);
          }
          str = lines.join(type === Scalar.Scalar.BLOCK_LITERAL ? "\n" : " ");
        }
        return stringifyString.stringifyString({ comment, type, value: str }, ctx, onComment, onChompKeep);
      }
    };
    exports.binary = binary2;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/pairs.js
var require_pairs = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/pairs.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLSeq = require_YAMLSeq();
    function resolvePairs(seq, onError) {
      if (identity.isSeq(seq)) {
        for (let i = 0; i < seq.items.length; ++i) {
          let item = seq.items[i];
          if (identity.isPair(item))
            continue;
          else if (identity.isMap(item)) {
            if (item.items.length > 1)
              onError("Each pair must have its own sequence indicator");
            const pair = item.items[0] || new Pair.Pair(new Scalar.Scalar(null));
            if (item.commentBefore)
              pair.key.commentBefore = pair.key.commentBefore ? `${item.commentBefore}
${pair.key.commentBefore}` : item.commentBefore;
            if (item.comment) {
              const cn = pair.value ?? pair.key;
              cn.comment = cn.comment ? `${item.comment}
${cn.comment}` : item.comment;
            }
            item = pair;
          }
          seq.items[i] = identity.isPair(item) ? item : new Pair.Pair(item);
        }
      } else
        onError("Expected a sequence for this tag");
      return seq;
    }
    function createPairs(schema, iterable, ctx) {
      const { replacer } = ctx;
      const pairs2 = new YAMLSeq.YAMLSeq(schema);
      pairs2.tag = "tag:yaml.org,2002:pairs";
      let i = 0;
      if (iterable && Symbol.iterator in Object(iterable))
        for (let it of iterable) {
          if (typeof replacer === "function")
            it = replacer.call(iterable, String(i++), it);
          let key2, value;
          if (Array.isArray(it)) {
            if (it.length === 2) {
              key2 = it[0];
              value = it[1];
            } else
              throw new TypeError(`Expected [key, value] tuple: ${it}`);
          } else if (it && it instanceof Object) {
            const keys = Object.keys(it);
            if (keys.length === 1) {
              key2 = keys[0];
              value = it[key2];
            } else {
              throw new TypeError(`Expected tuple with one key, not ${keys.length} keys`);
            }
          } else {
            key2 = it;
          }
          pairs2.items.push(Pair.createPair(key2, value, ctx));
        }
      return pairs2;
    }
    var pairs = {
      collection: "seq",
      default: false,
      tag: "tag:yaml.org,2002:pairs",
      resolve: resolvePairs,
      createNode: createPairs
    };
    exports.createPairs = createPairs;
    exports.pairs = pairs;
    exports.resolvePairs = resolvePairs;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/omap.js
var require_omap = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/omap.js"(exports) {
    "use strict";
    var identity = require_identity();
    var toJS = require_toJS();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var pairs = require_pairs();
    var YAMLOMap = class _YAMLOMap extends YAMLSeq.YAMLSeq {
      constructor() {
        super();
        this.add = YAMLMap.YAMLMap.prototype.add.bind(this);
        this.delete = YAMLMap.YAMLMap.prototype.delete.bind(this);
        this.get = YAMLMap.YAMLMap.prototype.get.bind(this);
        this.has = YAMLMap.YAMLMap.prototype.has.bind(this);
        this.set = YAMLMap.YAMLMap.prototype.set.bind(this);
        this.tag = _YAMLOMap.tag;
      }
      /**
       * If `ctx` is given, the return type is actually `Map<unknown, unknown>`,
       * but TypeScript won't allow widening the signature of a child method.
       */
      toJSON(_, ctx) {
        if (!ctx)
          return super.toJSON(_);
        const map = /* @__PURE__ */ new Map();
        if (ctx?.onCreate)
          ctx.onCreate(map);
        for (const pair of this.items) {
          let key2, value;
          if (identity.isPair(pair)) {
            key2 = toJS.toJS(pair.key, "", ctx);
            value = toJS.toJS(pair.value, key2, ctx);
          } else {
            key2 = toJS.toJS(pair, "", ctx);
          }
          if (map.has(key2))
            throw new Error("Ordered maps must not include duplicate keys");
          map.set(key2, value);
        }
        return map;
      }
      static from(schema, iterable, ctx) {
        const pairs$1 = pairs.createPairs(schema, iterable, ctx);
        const omap2 = new this();
        omap2.items = pairs$1.items;
        return omap2;
      }
    };
    YAMLOMap.tag = "tag:yaml.org,2002:omap";
    var omap = {
      collection: "seq",
      identify: (value) => value instanceof Map,
      nodeClass: YAMLOMap,
      default: false,
      tag: "tag:yaml.org,2002:omap",
      resolve(seq, onError) {
        const pairs$1 = pairs.resolvePairs(seq, onError);
        const seenKeys = [];
        for (const { key: key2 } of pairs$1.items) {
          if (identity.isScalar(key2)) {
            if (seenKeys.includes(key2.value)) {
              onError(`Ordered maps must not include duplicate keys: ${key2.value}`);
            } else {
              seenKeys.push(key2.value);
            }
          }
        }
        return Object.assign(new YAMLOMap(), pairs$1);
      },
      createNode: (schema, iterable, ctx) => YAMLOMap.from(schema, iterable, ctx)
    };
    exports.YAMLOMap = YAMLOMap;
    exports.omap = omap;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/bool.js
var require_bool2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/bool.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    function boolStringify({ value, source }, ctx) {
      const boolObj = value ? trueTag : falseTag;
      if (source && boolObj.test.test(source))
        return source;
      return value ? ctx.options.trueStr : ctx.options.falseStr;
    }
    var trueTag = {
      identify: (value) => value === true,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:Y|y|[Yy]es|YES|[Tt]rue|TRUE|[Oo]n|ON)$/,
      resolve: () => new Scalar.Scalar(true),
      stringify: boolStringify
    };
    var falseTag = {
      identify: (value) => value === false,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:N|n|[Nn]o|NO|[Ff]alse|FALSE|[Oo]ff|OFF)$/,
      resolve: () => new Scalar.Scalar(false),
      stringify: boolStringify
    };
    exports.falseTag = falseTag;
    exports.trueTag = trueTag;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/float.js
var require_float2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/float.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:[0-9][0-9_]*)?(?:\.[0-9_]*)?[eE][-+]?[0-9]+$/,
      resolve: (str) => parseFloat(str.replace(/_/g, "")),
      stringify(node) {
        const num = Number(node.value);
        return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:[0-9][0-9_]*)?\.[0-9_]*$/,
      resolve(str) {
        const node = new Scalar.Scalar(parseFloat(str.replace(/_/g, "")));
        const dot = str.indexOf(".");
        if (dot !== -1) {
          const f = str.substring(dot + 1).replace(/_/g, "");
          if (f[f.length - 1] === "0")
            node.minFractionDigits = f.length;
        }
        return node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports.float = float;
    exports.floatExp = floatExp;
    exports.floatNaN = floatNaN;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/int.js
var require_int2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/int.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    function intResolve(str, offset, radix, { intAsBigInt }) {
      const sign = str[0];
      if (sign === "-" || sign === "+")
        offset += 1;
      str = str.substring(offset).replace(/_/g, "");
      if (intAsBigInt) {
        switch (radix) {
          case 2:
            str = `0b${str}`;
            break;
          case 8:
            str = `0o${str}`;
            break;
          case 16:
            str = `0x${str}`;
            break;
        }
        const n2 = BigInt(str);
        return sign === "-" ? BigInt(-1) * n2 : n2;
      }
      const n = parseInt(str, radix);
      return sign === "-" ? -1 * n : n;
    }
    function intStringify(node, radix, prefix) {
      const { value } = node;
      if (intIdentify(value)) {
        const str = value.toString(radix);
        return value < 0 ? "-" + prefix + str.substr(1) : prefix + str;
      }
      return stringifyNumber.stringifyNumber(node);
    }
    var intBin = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "BIN",
      test: /^[-+]?0b[0-1_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 2, opt),
      stringify: (node) => intStringify(node, 2, "0b")
    };
    var intOct = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^[-+]?0[0-7_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 1, 8, opt),
      stringify: (node) => intStringify(node, 8, "0")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9][0-9_]*$/,
      resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^[-+]?0x[0-9a-fA-F_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports.int = int;
    exports.intBin = intBin;
    exports.intHex = intHex;
    exports.intOct = intOct;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/set.js
var require_set = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/set.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSet = class _YAMLSet extends YAMLMap.YAMLMap {
      constructor(schema) {
        super(schema);
        this.tag = _YAMLSet.tag;
      }
      add(key2) {
        let pair;
        if (identity.isPair(key2))
          pair = key2;
        else if (key2 && typeof key2 === "object" && "key" in key2 && "value" in key2 && key2.value === null)
          pair = new Pair.Pair(key2.key, null);
        else
          pair = new Pair.Pair(key2, null);
        const prev = YAMLMap.findPair(this.items, pair.key);
        if (!prev)
          this.items.push(pair);
      }
      /**
       * If `keepPair` is `true`, returns the Pair matching `key`.
       * Otherwise, returns the value of that Pair's key.
       */
      get(key2, keepPair) {
        const pair = YAMLMap.findPair(this.items, key2);
        return !keepPair && identity.isPair(pair) ? identity.isScalar(pair.key) ? pair.key.value : pair.key : pair;
      }
      set(key2, value) {
        if (typeof value !== "boolean")
          throw new Error(`Expected boolean value for set(key, value) in a YAML set, not ${typeof value}`);
        const prev = YAMLMap.findPair(this.items, key2);
        if (prev && !value) {
          this.items.splice(this.items.indexOf(prev), 1);
        } else if (!prev && value) {
          this.items.push(new Pair.Pair(key2));
        }
      }
      toJSON(_, ctx) {
        return super.toJSON(_, ctx, Set);
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        if (this.hasAllNullValues(true))
          return super.toString(Object.assign({}, ctx, { allNullValues: true }), onComment, onChompKeep);
        else
          throw new Error("Set items must all have null values");
      }
      static from(schema, iterable, ctx) {
        const { replacer } = ctx;
        const set2 = new this(schema);
        if (iterable && Symbol.iterator in Object(iterable))
          for (let value of iterable) {
            if (typeof replacer === "function")
              value = replacer.call(iterable, value, value);
            set2.items.push(Pair.createPair(value, null, ctx));
          }
        return set2;
      }
    };
    YAMLSet.tag = "tag:yaml.org,2002:set";
    var set = {
      collection: "map",
      identify: (value) => value instanceof Set,
      nodeClass: YAMLSet,
      default: false,
      tag: "tag:yaml.org,2002:set",
      createNode: (schema, iterable, ctx) => YAMLSet.from(schema, iterable, ctx),
      resolve(map, onError) {
        if (identity.isMap(map)) {
          if (map.hasAllNullValues(true))
            return Object.assign(new YAMLSet(), map);
          else
            onError("Set items must all have null values");
        } else
          onError("Expected a mapping for this tag");
        return map;
      }
    };
    exports.YAMLSet = YAMLSet;
    exports.set = set;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/timestamp.js
var require_timestamp = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/timestamp.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    function parseSexagesimal(str, asBigInt) {
      const sign = str[0];
      const parts = sign === "-" || sign === "+" ? str.substring(1) : str;
      const num = (n) => asBigInt ? BigInt(n) : Number(n);
      const res = parts.replace(/_/g, "").split(":").reduce((res2, p) => res2 * num(60) + num(p), num(0));
      return sign === "-" ? num(-1) * res : res;
    }
    function stringifySexagesimal(node) {
      let { value } = node;
      let num = (n) => n;
      if (typeof value === "bigint")
        num = (n) => BigInt(n);
      else if (isNaN(value) || !isFinite(value))
        return stringifyNumber.stringifyNumber(node);
      let sign = "";
      if (value < 0) {
        sign = "-";
        value *= num(-1);
      }
      const _60 = num(60);
      const parts = [value % _60];
      if (value < 60) {
        parts.unshift(0);
      } else {
        value = (value - parts[0]) / _60;
        parts.unshift(value % _60);
        if (value >= 60) {
          value = (value - parts[0]) / _60;
          parts.unshift(value);
        }
      }
      return sign + parts.map((n) => String(n).padStart(2, "0")).join(":").replace(/000000\d*$/, "");
    }
    var intTime = {
      identify: (value) => typeof value === "bigint" || Number.isInteger(value),
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+$/,
      resolve: (str, _onError, { intAsBigInt }) => parseSexagesimal(str, intAsBigInt),
      stringify: stringifySexagesimal
    };
    var floatTime = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*$/,
      resolve: (str) => parseSexagesimal(str, false),
      stringify: stringifySexagesimal
    };
    var timestamp = {
      identify: (value) => value instanceof Date,
      default: true,
      tag: "tag:yaml.org,2002:timestamp",
      // If the time zone is omitted, the timestamp is assumed to be specified in UTC. The time part
      // may be omitted altogether, resulting in a date format. In such a case, the time part is
      // assumed to be 00:00:00Z (start of day, UTC).
      test: RegExp("^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})(?:(?:t|T|[ \\t]+)([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2}(\\.[0-9]+)?)(?:[ \\t]*(Z|[-+][012]?[0-9](?::[0-9]{2})?))?)?$"),
      resolve(str) {
        const match = str.match(timestamp.test);
        if (!match)
          throw new Error("!!timestamp expects a date, starting with yyyy-mm-dd");
        const [, year, month, day, hour, minute, second] = match.map(Number);
        const millisec = match[7] ? Number((match[7] + "00").substr(1, 3)) : 0;
        let date = Date.UTC(year, month - 1, day, hour || 0, minute || 0, second || 0, millisec);
        const tz = match[8];
        if (tz && tz !== "Z") {
          let d = parseSexagesimal(tz, false);
          if (Math.abs(d) < 30)
            d *= 60;
          date -= 6e4 * d;
        }
        return new Date(date);
      },
      stringify: ({ value }) => value?.toISOString().replace(/(T00:00:00)?\.000Z$/, "") ?? ""
    };
    exports.floatTime = floatTime;
    exports.intTime = intTime;
    exports.timestamp = timestamp;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/schema.js
var require_schema3 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/schema.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var binary2 = require_binary();
    var bool = require_bool2();
    var float = require_float2();
    var int = require_int2();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var set = require_set();
    var timestamp = require_timestamp();
    var schema = [
      map.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.trueTag,
      bool.falseTag,
      int.intBin,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float,
      binary2.binary,
      merge.merge,
      omap.omap,
      pairs.pairs,
      set.set,
      timestamp.intTime,
      timestamp.floatTime,
      timestamp.timestamp
    ];
    exports.schema = schema;
  }
});

// node_modules/yaml/dist/schema/tags.js
var require_tags = __commonJS({
  "node_modules/yaml/dist/schema/tags.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = require_schema();
    var schema$1 = require_schema2();
    var binary2 = require_binary();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var schema$2 = require_schema3();
    var set = require_set();
    var timestamp = require_timestamp();
    var schemas = /* @__PURE__ */ new Map([
      ["core", schema.schema],
      ["failsafe", [map.map, seq.seq, string.string]],
      ["json", schema$1.schema],
      ["yaml11", schema$2.schema],
      ["yaml-1.1", schema$2.schema]
    ]);
    var tagsByName = {
      binary: binary2.binary,
      bool: bool.boolTag,
      float: float.float,
      floatExp: float.floatExp,
      floatNaN: float.floatNaN,
      floatTime: timestamp.floatTime,
      int: int.int,
      intHex: int.intHex,
      intOct: int.intOct,
      intTime: timestamp.intTime,
      map: map.map,
      merge: merge.merge,
      null: _null.nullTag,
      omap: omap.omap,
      pairs: pairs.pairs,
      seq: seq.seq,
      set: set.set,
      timestamp: timestamp.timestamp
    };
    var coreKnownTags = {
      "tag:yaml.org,2002:binary": binary2.binary,
      "tag:yaml.org,2002:merge": merge.merge,
      "tag:yaml.org,2002:omap": omap.omap,
      "tag:yaml.org,2002:pairs": pairs.pairs,
      "tag:yaml.org,2002:set": set.set,
      "tag:yaml.org,2002:timestamp": timestamp.timestamp
    };
    function getTags(customTags, schemaName, addMergeTag) {
      const schemaTags = schemas.get(schemaName);
      if (schemaTags && !customTags) {
        return addMergeTag && !schemaTags.includes(merge.merge) ? schemaTags.concat(merge.merge) : schemaTags.slice();
      }
      let tags = schemaTags;
      if (!tags) {
        if (Array.isArray(customTags))
          tags = [];
        else {
          const keys = Array.from(schemas.keys()).filter((key2) => key2 !== "yaml11").map((key2) => JSON.stringify(key2)).join(", ");
          throw new Error(`Unknown schema "${schemaName}"; use one of ${keys} or define customTags array`);
        }
      }
      if (Array.isArray(customTags)) {
        for (const tag of customTags)
          tags = tags.concat(tag);
      } else if (typeof customTags === "function") {
        tags = customTags(tags.slice());
      }
      if (addMergeTag)
        tags = tags.concat(merge.merge);
      return tags.reduce((tags2, tag) => {
        const tagObj = typeof tag === "string" ? tagsByName[tag] : tag;
        if (!tagObj) {
          const tagName = JSON.stringify(tag);
          const keys = Object.keys(tagsByName).map((key2) => JSON.stringify(key2)).join(", ");
          throw new Error(`Unknown custom tag ${tagName}; use one of ${keys}`);
        }
        if (!tags2.includes(tagObj))
          tags2.push(tagObj);
        return tags2;
      }, []);
    }
    exports.coreKnownTags = coreKnownTags;
    exports.getTags = getTags;
  }
});

// node_modules/yaml/dist/schema/Schema.js
var require_Schema = __commonJS({
  "node_modules/yaml/dist/schema/Schema.js"(exports) {
    "use strict";
    var identity = require_identity();
    var map = require_map();
    var seq = require_seq();
    var string = require_string();
    var tags = require_tags();
    var sortMapEntriesByKey = (a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    var Schema = class _Schema {
      constructor({ compat, customTags, merge, resolveKnownTags, schema, sortMapEntries, toStringDefaults }) {
        this.compat = Array.isArray(compat) ? tags.getTags(compat, "compat") : compat ? tags.getTags(null, compat) : null;
        this.name = typeof schema === "string" && schema || "core";
        this.knownTags = resolveKnownTags ? tags.coreKnownTags : {};
        this.tags = tags.getTags(customTags, this.name, merge);
        this.toStringOptions = toStringDefaults ?? null;
        Object.defineProperty(this, identity.MAP, { value: map.map });
        Object.defineProperty(this, identity.SCALAR, { value: string.string });
        Object.defineProperty(this, identity.SEQ, { value: seq.seq });
        this.sortMapEntries = typeof sortMapEntries === "function" ? sortMapEntries : sortMapEntries === true ? sortMapEntriesByKey : null;
      }
      clone() {
        const copy = Object.create(_Schema.prototype, Object.getOwnPropertyDescriptors(this));
        copy.tags = this.tags.slice();
        return copy;
      }
    };
    exports.Schema = Schema;
  }
});

// node_modules/yaml/dist/stringify/stringifyDocument.js
var require_stringifyDocument = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyDocument.js"(exports) {
    "use strict";
    var identity = require_identity();
    var stringify3 = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyDocument(doc, options) {
      const lines = [];
      let hasDirectives = options.directives === true;
      if (options.directives !== false && doc.directives) {
        const dir = doc.directives.toString(doc);
        if (dir) {
          lines.push(dir);
          hasDirectives = true;
        } else if (doc.directives.docStart)
          hasDirectives = true;
      }
      if (hasDirectives)
        lines.push("---");
      const ctx = stringify3.createStringifyContext(doc, options);
      const { commentString } = ctx.options;
      if (doc.commentBefore) {
        if (lines.length !== 1)
          lines.unshift("");
        const cs = commentString(doc.commentBefore);
        lines.unshift(stringifyComment.indentComment(cs, ""));
      }
      let chompKeep = false;
      let contentComment = null;
      if (doc.contents) {
        if (identity.isNode(doc.contents)) {
          if (doc.contents.spaceBefore && hasDirectives)
            lines.push("");
          if (doc.contents.commentBefore) {
            const cs = commentString(doc.contents.commentBefore);
            lines.push(stringifyComment.indentComment(cs, ""));
          }
          ctx.forceBlockIndent = !!doc.comment;
          contentComment = doc.contents.comment;
        }
        const onChompKeep = contentComment ? void 0 : () => chompKeep = true;
        let body = stringify3.stringify(doc.contents, ctx, () => contentComment = null, onChompKeep);
        if (contentComment)
          body += stringifyComment.lineComment(body, "", commentString(contentComment));
        if ((body[0] === "|" || body[0] === ">") && lines[lines.length - 1] === "---") {
          lines[lines.length - 1] = `--- ${body}`;
        } else
          lines.push(body);
      } else {
        lines.push(stringify3.stringify(doc.contents, ctx));
      }
      if (doc.directives?.docEnd) {
        if (doc.comment) {
          const cs = commentString(doc.comment);
          if (cs.includes("\n")) {
            lines.push("...");
            lines.push(stringifyComment.indentComment(cs, ""));
          } else {
            lines.push(`... ${cs}`);
          }
        } else {
          lines.push("...");
        }
      } else {
        let dc = doc.comment;
        if (dc && chompKeep)
          dc = dc.replace(/^\n+/, "");
        if (dc) {
          if ((!chompKeep || contentComment) && lines[lines.length - 1] !== "")
            lines.push("");
          lines.push(stringifyComment.indentComment(commentString(dc), ""));
        }
      }
      return lines.join("\n") + "\n";
    }
    exports.stringifyDocument = stringifyDocument;
  }
});

// node_modules/yaml/dist/doc/Document.js
var require_Document = __commonJS({
  "node_modules/yaml/dist/doc/Document.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var toJS = require_toJS();
    var Schema = require_Schema();
    var stringifyDocument = require_stringifyDocument();
    var anchors = require_anchors();
    var applyReviver = require_applyReviver();
    var createNode = require_createNode();
    var directives = require_directives();
    var Document = class _Document {
      constructor(value, replacer, options) {
        this.commentBefore = null;
        this.comment = null;
        this.errors = [];
        this.warnings = [];
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.DOC });
        let _replacer = null;
        if (typeof replacer === "function" || Array.isArray(replacer)) {
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const opt = Object.assign({
          intAsBigInt: false,
          keepSourceTokens: false,
          logLevel: "warn",
          prettyErrors: true,
          strict: true,
          stringKeys: false,
          uniqueKeys: true,
          version: "1.2"
        }, options);
        this.options = opt;
        let { version } = opt;
        if (options?._directives) {
          this.directives = options._directives.atDocument();
          if (this.directives.yaml.explicit)
            version = this.directives.yaml.version;
        } else
          this.directives = new directives.Directives({ version });
        this.setSchema(version, options);
        this.contents = value === void 0 ? null : this.createNode(value, _replacer, options);
      }
      /**
       * Create a deep copy of this Document and its contents.
       *
       * Custom Node values that inherit from `Object` still refer to their original instances.
       */
      clone() {
        const copy = Object.create(_Document.prototype, {
          [identity.NODE_TYPE]: { value: identity.DOC }
        });
        copy.commentBefore = this.commentBefore;
        copy.comment = this.comment;
        copy.errors = this.errors.slice();
        copy.warnings = this.warnings.slice();
        copy.options = Object.assign({}, this.options);
        if (this.directives)
          copy.directives = this.directives.clone();
        copy.schema = this.schema.clone();
        copy.contents = identity.isNode(this.contents) ? this.contents.clone(copy.schema) : this.contents;
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /** Adds a value to the document. */
      add(value) {
        if (assertCollection(this.contents))
          this.contents.add(value);
      }
      /** Adds a value to the document. */
      addIn(path5, value) {
        if (assertCollection(this.contents))
          this.contents.addIn(path5, value);
      }
      /**
       * Create a new `Alias` node, ensuring that the target `node` has the required anchor.
       *
       * If `node` already has an anchor, `name` is ignored.
       * Otherwise, the `node.anchor` value will be set to `name`,
       * or if an anchor with that name is already present in the document,
       * `name` will be used as a prefix for a new unique anchor.
       * If `name` is undefined, the generated anchor will use 'a' as a prefix.
       */
      createAlias(node, name) {
        if (!node.anchor) {
          const prev = anchors.anchorNames(this);
          node.anchor = // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          !name || prev.has(name) ? anchors.findNewAnchor(name || "a", prev) : name;
        }
        return new Alias.Alias(node.anchor);
      }
      createNode(value, replacer, options) {
        let _replacer = void 0;
        if (typeof replacer === "function") {
          value = replacer.call({ "": value }, "", value);
          _replacer = replacer;
        } else if (Array.isArray(replacer)) {
          const keyToStr = (v) => typeof v === "number" || v instanceof String || v instanceof Number;
          const asStr = replacer.filter(keyToStr).map(String);
          if (asStr.length > 0)
            replacer = replacer.concat(asStr);
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const { aliasDuplicateObjects, anchorPrefix, flow, keepUndefined, onTagObj, tag } = options ?? {};
        const { onAnchor, setAnchors, sourceObjects } = anchors.createNodeAnchors(
          this,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          anchorPrefix || "a"
        );
        const ctx = {
          aliasDuplicateObjects: aliasDuplicateObjects ?? true,
          keepUndefined: keepUndefined ?? false,
          onAnchor,
          onTagObj,
          replacer: _replacer,
          schema: this.schema,
          sourceObjects
        };
        const node = createNode.createNode(value, tag, ctx);
        if (flow && identity.isCollection(node))
          node.flow = true;
        setAnchors();
        return node;
      }
      /**
       * Convert a key and a value into a `Pair` using the current schema,
       * recursively wrapping all values as `Scalar` or `Collection` nodes.
       */
      createPair(key2, value, options = {}) {
        const k = this.createNode(key2, null, options);
        const v = this.createNode(value, null, options);
        return new Pair.Pair(k, v);
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      delete(key2) {
        return assertCollection(this.contents) ? this.contents.delete(key2) : false;
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path5) {
        if (Collection.isEmptyPath(path5)) {
          if (this.contents == null)
            return false;
          this.contents = null;
          return true;
        }
        return assertCollection(this.contents) ? this.contents.deleteIn(path5) : false;
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      get(key2, keepScalar) {
        return identity.isCollection(this.contents) ? this.contents.get(key2, keepScalar) : void 0;
      }
      /**
       * Returns item at `path`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path5, keepScalar) {
        if (Collection.isEmptyPath(path5))
          return !keepScalar && identity.isScalar(this.contents) ? this.contents.value : this.contents;
        return identity.isCollection(this.contents) ? this.contents.getIn(path5, keepScalar) : void 0;
      }
      /**
       * Checks if the document includes a value with the key `key`.
       */
      has(key2) {
        return identity.isCollection(this.contents) ? this.contents.has(key2) : false;
      }
      /**
       * Checks if the document includes a value at `path`.
       */
      hasIn(path5) {
        if (Collection.isEmptyPath(path5))
          return this.contents !== void 0;
        return identity.isCollection(this.contents) ? this.contents.hasIn(path5) : false;
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      set(key2, value) {
        if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, [key2], value);
        } else if (assertCollection(this.contents)) {
          this.contents.set(key2, value);
        }
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path5, value) {
        if (Collection.isEmptyPath(path5)) {
          this.contents = value;
        } else if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, Array.from(path5), value);
        } else if (assertCollection(this.contents)) {
          this.contents.setIn(path5, value);
        }
      }
      /**
       * Change the YAML version and schema used by the document.
       * A `null` version disables support for directives, explicit tags, anchors, and aliases.
       * It also requires the `schema` option to be given as a `Schema` instance value.
       *
       * Overrides all previously set schema options.
       */
      setSchema(version, options = {}) {
        if (typeof version === "number")
          version = String(version);
        let opt;
        switch (version) {
          case "1.1":
            if (this.directives)
              this.directives.yaml.version = "1.1";
            else
              this.directives = new directives.Directives({ version: "1.1" });
            opt = { resolveKnownTags: false, schema: "yaml-1.1" };
            break;
          case "1.2":
          case "next":
            if (this.directives)
              this.directives.yaml.version = version;
            else
              this.directives = new directives.Directives({ version });
            opt = { resolveKnownTags: true, schema: "core" };
            break;
          case null:
            if (this.directives)
              delete this.directives;
            opt = null;
            break;
          default: {
            const sv = JSON.stringify(version);
            throw new Error(`Expected '1.1', '1.2' or null as first argument, but found: ${sv}`);
          }
        }
        if (options.schema instanceof Object)
          this.schema = options.schema;
        else if (opt)
          this.schema = new Schema.Schema(Object.assign(opt, options));
        else
          throw new Error(`With a null YAML version, the { schema: Schema } option is required`);
      }
      // json & jsonArg are only used from toJSON()
      toJS({ json: json3, jsonArg, mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc: this,
          keep: !json3,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res = toJS.toJS(this.contents, jsonArg ?? "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
      /**
       * A JSON representation of the document `contents`.
       *
       * @param jsonArg Used by `JSON.stringify` to indicate the array index or
       *   property name.
       */
      toJSON(jsonArg, onAnchor) {
        return this.toJS({ json: true, jsonArg, mapAsMap: false, onAnchor });
      }
      /** A YAML representation of the document. */
      toString(options = {}) {
        if (this.errors.length > 0)
          throw new Error("Document with errors cannot be stringified");
        if ("indent" in options && (!Number.isInteger(options.indent) || Number(options.indent) <= 0)) {
          const s = JSON.stringify(options.indent);
          throw new Error(`"indent" option must be a positive integer, not ${s}`);
        }
        return stringifyDocument.stringifyDocument(this, options);
      }
    };
    function assertCollection(contents) {
      if (identity.isCollection(contents))
        return true;
      throw new Error("Expected a YAML collection as document contents");
    }
    exports.Document = Document;
  }
});

// node_modules/yaml/dist/errors.js
var require_errors = __commonJS({
  "node_modules/yaml/dist/errors.js"(exports) {
    "use strict";
    var YAMLError = class extends Error {
      constructor(name, pos, code, message) {
        super();
        this.name = name;
        this.code = code;
        this.message = message;
        this.pos = pos;
      }
    };
    var YAMLParseError = class extends YAMLError {
      constructor(pos, code, message) {
        super("YAMLParseError", pos, code, message);
      }
    };
    var YAMLWarning = class extends YAMLError {
      constructor(pos, code, message) {
        super("YAMLWarning", pos, code, message);
      }
    };
    var prettifyError = (src, lc) => (error) => {
      if (error.pos[0] === -1)
        return;
      error.linePos = error.pos.map((pos) => lc.linePos(pos));
      const { line, col } = error.linePos[0];
      error.message += ` at line ${line}, column ${col}`;
      let ci = col - 1;
      let lineStr = src.substring(lc.lineStarts[line - 1], lc.lineStarts[line]).replace(/[\n\r]+$/, "");
      if (ci >= 60 && lineStr.length > 80) {
        const trimStart = Math.min(ci - 39, lineStr.length - 79);
        lineStr = "\u2026" + lineStr.substring(trimStart);
        ci -= trimStart - 1;
      }
      if (lineStr.length > 80)
        lineStr = lineStr.substring(0, 79) + "\u2026";
      if (line > 1 && /^ *$/.test(lineStr.substring(0, ci))) {
        let prev = src.substring(lc.lineStarts[line - 2], lc.lineStarts[line - 1]);
        if (prev.length > 80)
          prev = prev.substring(0, 79) + "\u2026\n";
        lineStr = prev + lineStr;
      }
      if (/[^ ]/.test(lineStr)) {
        let count = 1;
        const end = error.linePos[1];
        if (end?.line === line && end.col > col) {
          count = Math.max(1, Math.min(end.col - col, 80 - ci));
        }
        const pointer = " ".repeat(ci) + "^".repeat(count);
        error.message += `:

${lineStr}
${pointer}
`;
      }
    };
    exports.YAMLError = YAMLError;
    exports.YAMLParseError = YAMLParseError;
    exports.YAMLWarning = YAMLWarning;
    exports.prettifyError = prettifyError;
  }
});

// node_modules/yaml/dist/compose/resolve-props.js
var require_resolve_props = __commonJS({
  "node_modules/yaml/dist/compose/resolve-props.js"(exports) {
    "use strict";
    function resolveProps(tokens, { flow, indicator, next, offset, onError, parentIndent, startOnNewline }) {
      let spaceBefore = false;
      let atNewline = startOnNewline;
      let hasSpace = startOnNewline;
      let comment = "";
      let commentSep = "";
      let hasNewline = false;
      let reqSpace = false;
      let tab = null;
      let anchor = null;
      let tag = null;
      let newlineAfterProp = null;
      let comma = null;
      let found = null;
      let start = null;
      for (const token of tokens) {
        if (reqSpace) {
          if (token.type !== "space" && token.type !== "newline" && token.type !== "comma")
            onError(token.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
          reqSpace = false;
        }
        if (tab) {
          if (atNewline && token.type !== "comment" && token.type !== "newline") {
            onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
          }
          tab = null;
        }
        switch (token.type) {
          case "space":
            if (!flow && (indicator !== "doc-start" || next?.type !== "flow-collection") && token.source.includes("	")) {
              tab = token;
            }
            hasSpace = true;
            break;
          case "comment": {
            if (!hasSpace)
              onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
            const cb = token.source.substring(1) || " ";
            if (!comment)
              comment = cb;
            else
              comment += commentSep + cb;
            commentSep = "";
            atNewline = false;
            break;
          }
          case "newline":
            if (atNewline) {
              if (comment)
                comment += token.source;
              else if (!found || indicator !== "seq-item-ind")
                spaceBefore = true;
            } else
              commentSep += token.source;
            atNewline = true;
            hasNewline = true;
            if (anchor || tag)
              newlineAfterProp = token;
            hasSpace = true;
            break;
          case "anchor":
            if (anchor)
              onError(token, "MULTIPLE_ANCHORS", "A node can have at most one anchor");
            if (token.source.endsWith(":"))
              onError(token.offset + token.source.length - 1, "BAD_ALIAS", "Anchor ending in : is ambiguous", true);
            anchor = token;
            start ?? (start = token.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          case "tag": {
            if (tag)
              onError(token, "MULTIPLE_TAGS", "A node can have at most one tag");
            tag = token;
            start ?? (start = token.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          }
          case indicator:
            if (anchor || tag)
              onError(token, "BAD_PROP_ORDER", `Anchors and tags must be after the ${token.source} indicator`);
            if (found)
              onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.source} in ${flow ?? "collection"}`);
            found = token;
            atNewline = indicator === "seq-item-ind" || indicator === "explicit-key-ind";
            hasSpace = false;
            break;
          case "comma":
            if (flow) {
              if (comma)
                onError(token, "UNEXPECTED_TOKEN", `Unexpected , in ${flow}`);
              comma = token;
              atNewline = false;
              hasSpace = false;
              break;
            }
          // else fallthrough
          default:
            onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.type} token`);
            atNewline = false;
            hasSpace = false;
        }
      }
      const last = tokens[tokens.length - 1];
      const end = last ? last.offset + last.source.length : offset;
      if (reqSpace && next && next.type !== "space" && next.type !== "newline" && next.type !== "comma" && (next.type !== "scalar" || next.source !== "")) {
        onError(next.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
      }
      if (tab && (atNewline && tab.indent <= parentIndent || next?.type === "block-map" || next?.type === "block-seq"))
        onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
      return {
        comma,
        found,
        spaceBefore,
        comment,
        hasNewline,
        anchor,
        tag,
        newlineAfterProp,
        end,
        start: start ?? end
      };
    }
    exports.resolveProps = resolveProps;
  }
});

// node_modules/yaml/dist/compose/util-contains-newline.js
var require_util_contains_newline = __commonJS({
  "node_modules/yaml/dist/compose/util-contains-newline.js"(exports) {
    "use strict";
    function containsNewline(key2) {
      if (!key2)
        return null;
      switch (key2.type) {
        case "alias":
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          if (key2.source.includes("\n"))
            return true;
          if (key2.end) {
            for (const st of key2.end)
              if (st.type === "newline")
                return true;
          }
          return false;
        case "flow-collection":
          for (const it of key2.items) {
            for (const st of it.start)
              if (st.type === "newline")
                return true;
            if (it.sep) {
              for (const st of it.sep)
                if (st.type === "newline")
                  return true;
            }
            if (containsNewline(it.key) || containsNewline(it.value))
              return true;
          }
          return false;
        default:
          return true;
      }
    }
    exports.containsNewline = containsNewline;
  }
});

// node_modules/yaml/dist/compose/util-flow-indent-check.js
var require_util_flow_indent_check = __commonJS({
  "node_modules/yaml/dist/compose/util-flow-indent-check.js"(exports) {
    "use strict";
    var utilContainsNewline = require_util_contains_newline();
    function flowIndentCheck(indent, fc, onError) {
      if (fc?.type === "flow-collection") {
        const end = fc.end[0];
        if (end.indent === indent && (end.source === "]" || end.source === "}") && utilContainsNewline.containsNewline(fc)) {
          const msg = "Flow end indicator should be more indented than parent";
          onError(end, "BAD_INDENT", msg, true);
        }
      }
    }
    exports.flowIndentCheck = flowIndentCheck;
  }
});

// node_modules/yaml/dist/compose/util-map-includes.js
var require_util_map_includes = __commonJS({
  "node_modules/yaml/dist/compose/util-map-includes.js"(exports) {
    "use strict";
    var identity = require_identity();
    function mapIncludes(ctx, items, search) {
      const { uniqueKeys } = ctx.options;
      if (uniqueKeys === false)
        return false;
      const isEqual = typeof uniqueKeys === "function" ? uniqueKeys : (a, b) => a === b || identity.isScalar(a) && identity.isScalar(b) && a.value === b.value;
      return items.some((pair) => isEqual(pair.key, search));
    }
    exports.mapIncludes = mapIncludes;
  }
});

// node_modules/yaml/dist/compose/resolve-block-map.js
var require_resolve_block_map = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-map.js"(exports) {
    "use strict";
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    var utilMapIncludes = require_util_map_includes();
    var startColMsg = "All mapping items must start at the same column";
    function resolveBlockMap({ composeNode, composeEmptyNode }, ctx, bm, onError, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLMap.YAMLMap;
      const map = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      let offset = bm.offset;
      let commentEnd = null;
      for (const collItem of bm.items) {
        const { start, key: key2, sep, value } = collItem;
        const keyProps = resolveProps.resolveProps(start, {
          indicator: "explicit-key-ind",
          next: key2 ?? sep?.[0],
          offset,
          onError,
          parentIndent: bm.indent,
          startOnNewline: true
        });
        const implicitKey = !keyProps.found;
        if (implicitKey) {
          if (key2) {
            if (key2.type === "block-seq")
              onError(offset, "BLOCK_AS_IMPLICIT_KEY", "A block sequence may not be used as an implicit map key");
            else if ("indent" in key2 && key2.indent !== bm.indent)
              onError(offset, "BAD_INDENT", startColMsg);
          }
          if (!keyProps.anchor && !keyProps.tag && !sep) {
            commentEnd = keyProps.end;
            if (keyProps.comment) {
              if (map.comment)
                map.comment += "\n" + keyProps.comment;
              else
                map.comment = keyProps.comment;
            }
            continue;
          }
          if (keyProps.newlineAfterProp || utilContainsNewline.containsNewline(key2)) {
            onError(key2 ?? start[start.length - 1], "MULTILINE_IMPLICIT_KEY", "Implicit keys need to be on a single line");
          }
        } else if (keyProps.found?.indent !== bm.indent) {
          onError(offset, "BAD_INDENT", startColMsg);
        }
        ctx.atKey = true;
        const keyStart = keyProps.end;
        const keyNode = key2 ? composeNode(ctx, key2, keyProps, onError) : composeEmptyNode(ctx, keyStart, start, null, keyProps, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bm.indent, key2, onError);
        ctx.atKey = false;
        if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
          onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
        const valueProps = resolveProps.resolveProps(sep ?? [], {
          indicator: "map-value-ind",
          next: value,
          offset: keyNode.range[2],
          onError,
          parentIndent: bm.indent,
          startOnNewline: !key2 || key2.type === "block-scalar"
        });
        offset = valueProps.end;
        if (valueProps.found) {
          if (implicitKey) {
            if (value?.type === "block-map" && !valueProps.hasNewline)
              onError(offset, "BLOCK_AS_IMPLICIT_KEY", "Nested mappings are not allowed in compact mappings");
            if (ctx.options.strict && keyProps.start < valueProps.found.offset - 1024)
              onError(keyNode.range, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit block mapping key");
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError) : composeEmptyNode(ctx, offset, sep, null, valueProps, onError);
          if (ctx.schema.compat)
            utilFlowIndentCheck.flowIndentCheck(bm.indent, value, onError);
          offset = valueNode.range[2];
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          map.items.push(pair);
        } else {
          if (implicitKey)
            onError(keyNode.range, "MISSING_CHAR", "Implicit map keys need to be followed by map values");
          if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          map.items.push(pair);
        }
      }
      if (commentEnd && commentEnd < offset)
        onError(commentEnd, "IMPOSSIBLE", "Map comment with trailing content");
      map.range = [bm.offset, offset, commentEnd ?? offset];
      return map;
    }
    exports.resolveBlockMap = resolveBlockMap;
  }
});

// node_modules/yaml/dist/compose/resolve-block-seq.js
var require_resolve_block_seq = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-seq.js"(exports) {
    "use strict";
    var YAMLSeq = require_YAMLSeq();
    var resolveProps = require_resolve_props();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    function resolveBlockSeq({ composeNode, composeEmptyNode }, ctx, bs, onError, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLSeq.YAMLSeq;
      const seq = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = bs.offset;
      let commentEnd = null;
      for (const { start, value } of bs.items) {
        const props = resolveProps.resolveProps(start, {
          indicator: "seq-item-ind",
          next: value,
          offset,
          onError,
          parentIndent: bs.indent,
          startOnNewline: true
        });
        if (!props.found) {
          if (props.anchor || props.tag || value) {
            if (value?.type === "block-seq")
              onError(props.end, "BAD_INDENT", "All sequence items must start at the same column");
            else
              onError(offset, "MISSING_CHAR", "Sequence item without - indicator");
          } else {
            commentEnd = props.end;
            if (props.comment)
              seq.comment = props.comment;
            continue;
          }
        }
        const node = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, start, null, props, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bs.indent, value, onError);
        offset = node.range[2];
        seq.items.push(node);
      }
      seq.range = [bs.offset, offset, commentEnd ?? offset];
      return seq;
    }
    exports.resolveBlockSeq = resolveBlockSeq;
  }
});

// node_modules/yaml/dist/compose/resolve-end.js
var require_resolve_end = __commonJS({
  "node_modules/yaml/dist/compose/resolve-end.js"(exports) {
    "use strict";
    function resolveEnd(end, offset, reqSpace, onError) {
      let comment = "";
      if (end) {
        let hasSpace = false;
        let sep = "";
        for (const token of end) {
          const { source, type } = token;
          switch (type) {
            case "space":
              hasSpace = true;
              break;
            case "comment": {
              if (reqSpace && !hasSpace)
                onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
              const cb = source.substring(1) || " ";
              if (!comment)
                comment = cb;
              else
                comment += sep + cb;
              sep = "";
              break;
            }
            case "newline":
              if (comment)
                sep += source;
              hasSpace = true;
              break;
            default:
              onError(token, "UNEXPECTED_TOKEN", `Unexpected ${type} at node end`);
          }
          offset += source.length;
        }
      }
      return { comment, offset };
    }
    exports.resolveEnd = resolveEnd;
  }
});

// node_modules/yaml/dist/compose/resolve-flow-collection.js
var require_resolve_flow_collection = __commonJS({
  "node_modules/yaml/dist/compose/resolve-flow-collection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilMapIncludes = require_util_map_includes();
    var blockMsg = "Block collections are not allowed within flow collections";
    var isBlock = (token) => token && (token.type === "block-map" || token.type === "block-seq");
    function resolveFlowCollection({ composeNode, composeEmptyNode }, ctx, fc, onError, tag) {
      const isMap = fc.start.source === "{";
      const fcName = isMap ? "flow map" : "flow sequence";
      const NodeClass = tag?.nodeClass ?? (isMap ? YAMLMap.YAMLMap : YAMLSeq.YAMLSeq);
      const coll = new NodeClass(ctx.schema);
      coll.flow = true;
      const atRoot = ctx.atRoot;
      if (atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = fc.offset + fc.start.source.length;
      for (let i = 0; i < fc.items.length; ++i) {
        const collItem = fc.items[i];
        const { start, key: key2, sep, value } = collItem;
        const props = resolveProps.resolveProps(start, {
          flow: fcName,
          indicator: "explicit-key-ind",
          next: key2 ?? sep?.[0],
          offset,
          onError,
          parentIndent: fc.indent,
          startOnNewline: false
        });
        if (!props.found) {
          if (!props.anchor && !props.tag && !sep && !value) {
            if (i === 0 && props.comma)
              onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
            else if (i < fc.items.length - 1)
              onError(props.start, "UNEXPECTED_TOKEN", `Unexpected empty item in ${fcName}`);
            if (props.comment) {
              if (coll.comment)
                coll.comment += "\n" + props.comment;
              else
                coll.comment = props.comment;
            }
            offset = props.end;
            continue;
          }
          if (!isMap && ctx.options.strict && utilContainsNewline.containsNewline(key2))
            onError(
              key2,
              // checked by containsNewline()
              "MULTILINE_IMPLICIT_KEY",
              "Implicit keys of flow sequence pairs need to be on a single line"
            );
        }
        if (i === 0) {
          if (props.comma)
            onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
        } else {
          if (!props.comma)
            onError(props.start, "MISSING_CHAR", `Missing , between ${fcName} items`);
          if (props.comment) {
            let prevItemComment = "";
            loop: for (const st of start) {
              switch (st.type) {
                case "comma":
                case "space":
                  break;
                case "comment":
                  prevItemComment = st.source.substring(1);
                  break loop;
                default:
                  break loop;
              }
            }
            if (prevItemComment) {
              let prev = coll.items[coll.items.length - 1];
              if (identity.isPair(prev))
                prev = prev.value ?? prev.key;
              if (prev.comment)
                prev.comment += "\n" + prevItemComment;
              else
                prev.comment = prevItemComment;
              props.comment = props.comment.substring(prevItemComment.length + 1);
            }
          }
        }
        if (!isMap && !sep && !props.found) {
          const valueNode = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, sep, null, props, onError);
          coll.items.push(valueNode);
          offset = valueNode.range[2];
          if (isBlock(value))
            onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
        } else {
          ctx.atKey = true;
          const keyStart = props.end;
          const keyNode = key2 ? composeNode(ctx, key2, props, onError) : composeEmptyNode(ctx, keyStart, start, null, props, onError);
          if (isBlock(key2))
            onError(keyNode.range, "BLOCK_IN_FLOW", blockMsg);
          ctx.atKey = false;
          const valueProps = resolveProps.resolveProps(sep ?? [], {
            flow: fcName,
            indicator: "map-value-ind",
            next: value,
            offset: keyNode.range[2],
            onError,
            parentIndent: fc.indent,
            startOnNewline: false
          });
          if (valueProps.found) {
            if (!isMap && !props.found && ctx.options.strict) {
              if (sep)
                for (const st of sep) {
                  if (st === valueProps.found)
                    break;
                  if (st.type === "newline") {
                    onError(st, "MULTILINE_IMPLICIT_KEY", "Implicit keys of flow sequence pairs need to be on a single line");
                    break;
                  }
                }
              if (props.start < valueProps.found.offset - 1024)
                onError(valueProps.found, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit flow sequence key");
            }
          } else if (value) {
            if ("source" in value && value.source?.[0] === ":")
              onError(value, "MISSING_CHAR", `Missing space after : in ${fcName}`);
            else
              onError(valueProps.start, "MISSING_CHAR", `Missing , or : between ${fcName} items`);
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError) : valueProps.found ? composeEmptyNode(ctx, valueProps.end, sep, null, valueProps, onError) : null;
          if (valueNode) {
            if (isBlock(value))
              onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
          } else if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          if (isMap) {
            const map = coll;
            if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
              onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
            map.items.push(pair);
          } else {
            const map = new YAMLMap.YAMLMap(ctx.schema);
            map.flow = true;
            map.items.push(pair);
            const endRange = (valueNode ?? keyNode).range;
            map.range = [keyNode.range[0], endRange[1], endRange[2]];
            coll.items.push(map);
          }
          offset = valueNode ? valueNode.range[2] : valueProps.end;
        }
      }
      const expectedEnd = isMap ? "}" : "]";
      const [ce, ...ee] = fc.end;
      let cePos = offset;
      if (ce?.source === expectedEnd)
        cePos = ce.offset + ce.source.length;
      else {
        const name = fcName[0].toUpperCase() + fcName.substring(1);
        const msg = atRoot ? `${name} must end with a ${expectedEnd}` : `${name} in block collection must be sufficiently indented and end with a ${expectedEnd}`;
        onError(offset, atRoot ? "MISSING_CHAR" : "BAD_INDENT", msg);
        if (ce && ce.source.length !== 1)
          ee.unshift(ce);
      }
      if (ee.length > 0) {
        const end = resolveEnd.resolveEnd(ee, cePos, ctx.options.strict, onError);
        if (end.comment) {
          if (coll.comment)
            coll.comment += "\n" + end.comment;
          else
            coll.comment = end.comment;
        }
        coll.range = [fc.offset, cePos, end.offset];
      } else {
        coll.range = [fc.offset, cePos, cePos];
      }
      return coll;
    }
    exports.resolveFlowCollection = resolveFlowCollection;
  }
});

// node_modules/yaml/dist/compose/compose-collection.js
var require_compose_collection = __commonJS({
  "node_modules/yaml/dist/compose/compose-collection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveBlockMap = require_resolve_block_map();
    var resolveBlockSeq = require_resolve_block_seq();
    var resolveFlowCollection = require_resolve_flow_collection();
    function resolveCollection(CN, ctx, token, onError, tagName, tag) {
      const coll = token.type === "block-map" ? resolveBlockMap.resolveBlockMap(CN, ctx, token, onError, tag) : token.type === "block-seq" ? resolveBlockSeq.resolveBlockSeq(CN, ctx, token, onError, tag) : resolveFlowCollection.resolveFlowCollection(CN, ctx, token, onError, tag);
      const Coll = coll.constructor;
      if (tagName === "!" || tagName === Coll.tagName) {
        coll.tag = Coll.tagName;
        return coll;
      }
      if (tagName)
        coll.tag = tagName;
      return coll;
    }
    function composeCollection(CN, ctx, token, props, onError) {
      const tagToken = props.tag;
      const tagName = !tagToken ? null : ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg));
      if (token.type === "block-seq") {
        const { anchor, newlineAfterProp: nl } = props;
        const lastProp = anchor && tagToken ? anchor.offset > tagToken.offset ? anchor : tagToken : anchor ?? tagToken;
        if (lastProp && (!nl || nl.offset < lastProp.offset)) {
          const message = "Missing newline after block sequence props";
          onError(lastProp, "MISSING_CHAR", message);
        }
      }
      const expType = token.type === "block-map" ? "map" : token.type === "block-seq" ? "seq" : token.start.source === "{" ? "map" : "seq";
      if (!tagToken || !tagName || tagName === "!" || tagName === YAMLMap.YAMLMap.tagName && expType === "map" || tagName === YAMLSeq.YAMLSeq.tagName && expType === "seq") {
        return resolveCollection(CN, ctx, token, onError, tagName);
      }
      let tag = ctx.schema.tags.find((t) => t.tag === tagName && t.collection === expType);
      if (!tag) {
        const kt = ctx.schema.knownTags[tagName];
        if (kt?.collection === expType) {
          ctx.schema.tags.push(Object.assign({}, kt, { default: false }));
          tag = kt;
        } else {
          if (kt) {
            onError(tagToken, "BAD_COLLECTION_TYPE", `${kt.tag} used for ${expType} collection, but expects ${kt.collection ?? "scalar"}`, true);
          } else {
            onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, true);
          }
          return resolveCollection(CN, ctx, token, onError, tagName);
        }
      }
      const coll = resolveCollection(CN, ctx, token, onError, tagName, tag);
      const res = tag.resolve?.(coll, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg), ctx.options) ?? coll;
      const node = identity.isNode(res) ? res : new Scalar.Scalar(res);
      node.range = coll.range;
      node.tag = tagName;
      if (tag?.format)
        node.format = tag.format;
      return node;
    }
    exports.composeCollection = composeCollection;
  }
});

// node_modules/yaml/dist/compose/resolve-block-scalar.js
var require_resolve_block_scalar = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-scalar.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    function resolveBlockScalar(ctx, scalar, onError) {
      const start = scalar.offset;
      const header = parseBlockScalarHeader(scalar, ctx.options.strict, onError);
      if (!header)
        return { value: "", type: null, comment: "", range: [start, start, start] };
      const type = header.mode === ">" ? Scalar.Scalar.BLOCK_FOLDED : Scalar.Scalar.BLOCK_LITERAL;
      const lines = scalar.source ? splitLines(scalar.source) : [];
      let chompStart = lines.length;
      for (let i = lines.length - 1; i >= 0; --i) {
        const content = lines[i][1];
        if (content === "" || content === "\r")
          chompStart = i;
        else
          break;
      }
      if (chompStart === 0) {
        const value2 = header.chomp === "+" && lines.length > 0 ? "\n".repeat(Math.max(1, lines.length - 1)) : "";
        let end2 = start + header.length;
        if (scalar.source)
          end2 += scalar.source.length;
        return { value: value2, type, comment: header.comment, range: [start, end2, end2] };
      }
      let trimIndent = scalar.indent + header.indent;
      let offset = scalar.offset + header.length;
      let contentStart = 0;
      for (let i = 0; i < chompStart; ++i) {
        const [indent, content] = lines[i];
        if (content === "" || content === "\r") {
          if (header.indent === 0 && indent.length > trimIndent)
            trimIndent = indent.length;
        } else {
          if (indent.length < trimIndent) {
            const message = "Block scalars with more-indented leading empty lines must use an explicit indentation indicator";
            onError(offset + indent.length, "MISSING_CHAR", message);
          }
          if (header.indent === 0)
            trimIndent = indent.length;
          contentStart = i;
          if (trimIndent === 0 && !ctx.atRoot) {
            const message = "Block scalar values in collections must be indented";
            onError(offset, "BAD_INDENT", message);
          }
          break;
        }
        offset += indent.length + content.length + 1;
      }
      for (let i = lines.length - 1; i >= chompStart; --i) {
        if (lines[i][0].length > trimIndent)
          chompStart = i + 1;
      }
      let value = "";
      let sep = "";
      let prevMoreIndented = false;
      for (let i = 0; i < contentStart; ++i)
        value += lines[i][0].slice(trimIndent) + "\n";
      for (let i = contentStart; i < chompStart; ++i) {
        let [indent, content] = lines[i];
        offset += indent.length + content.length + 1;
        const crlf = content[content.length - 1] === "\r";
        if (crlf)
          content = content.slice(0, -1);
        if (content && indent.length < trimIndent) {
          const src = header.indent ? "explicit indentation indicator" : "first line";
          const message = `Block scalar lines must not be less indented than their ${src}`;
          onError(offset - content.length - (crlf ? 2 : 1), "BAD_INDENT", message);
          indent = "";
        }
        if (type === Scalar.Scalar.BLOCK_LITERAL) {
          value += sep + indent.slice(trimIndent) + content;
          sep = "\n";
        } else if (indent.length > trimIndent || content[0] === "	") {
          if (sep === " ")
            sep = "\n";
          else if (!prevMoreIndented && sep === "\n")
            sep = "\n\n";
          value += sep + indent.slice(trimIndent) + content;
          sep = "\n";
          prevMoreIndented = true;
        } else if (content === "") {
          if (sep === "\n")
            value += "\n";
          else
            sep = "\n";
        } else {
          value += sep + content;
          sep = " ";
          prevMoreIndented = false;
        }
      }
      switch (header.chomp) {
        case "-":
          break;
        case "+":
          for (let i = chompStart; i < lines.length; ++i)
            value += "\n" + lines[i][0].slice(trimIndent);
          if (value[value.length - 1] !== "\n")
            value += "\n";
          break;
        default:
          value += "\n";
      }
      const end = start + header.length + scalar.source.length;
      return { value, type, comment: header.comment, range: [start, end, end] };
    }
    function parseBlockScalarHeader({ offset, props }, strict, onError) {
      if (props[0].type !== "block-scalar-header") {
        onError(props[0], "IMPOSSIBLE", "Block scalar header not found");
        return null;
      }
      const { source } = props[0];
      const mode = source[0];
      let indent = 0;
      let chomp = "";
      let error = -1;
      for (let i = 1; i < source.length; ++i) {
        const ch = source[i];
        if (!chomp && (ch === "-" || ch === "+"))
          chomp = ch;
        else {
          const n = Number(ch);
          if (!indent && n)
            indent = n;
          else if (error === -1)
            error = offset + i;
        }
      }
      if (error !== -1)
        onError(error, "UNEXPECTED_TOKEN", `Block scalar header includes extra characters: ${source}`);
      let hasSpace = false;
      let comment = "";
      let length = source.length;
      for (let i = 1; i < props.length; ++i) {
        const token = props[i];
        switch (token.type) {
          case "space":
            hasSpace = true;
          // fallthrough
          case "newline":
            length += token.source.length;
            break;
          case "comment":
            if (strict && !hasSpace) {
              const message = "Comments must be separated from other tokens by white space characters";
              onError(token, "MISSING_CHAR", message);
            }
            length += token.source.length;
            comment = token.source.substring(1);
            break;
          case "error":
            onError(token, "UNEXPECTED_TOKEN", token.message);
            length += token.source.length;
            break;
          /* istanbul ignore next should not happen */
          default: {
            const message = `Unexpected token in block scalar header: ${token.type}`;
            onError(token, "UNEXPECTED_TOKEN", message);
            const ts = token.source;
            if (ts && typeof ts === "string")
              length += ts.length;
          }
        }
      }
      return { mode, indent, chomp, comment, length };
    }
    function splitLines(source) {
      const split = source.split(/\n( *)/);
      const first = split[0];
      const m = first.match(/^( *)/);
      const line0 = m?.[1] ? [m[1], first.slice(m[1].length)] : ["", first];
      const lines = [line0];
      for (let i = 1; i < split.length; i += 2)
        lines.push([split[i], split[i + 1]]);
      return lines;
    }
    exports.resolveBlockScalar = resolveBlockScalar;
  }
});

// node_modules/yaml/dist/compose/resolve-flow-scalar.js
var require_resolve_flow_scalar = __commonJS({
  "node_modules/yaml/dist/compose/resolve-flow-scalar.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var resolveEnd = require_resolve_end();
    function resolveFlowScalar(scalar, strict, onError) {
      const { offset, type, source, end } = scalar;
      let _type;
      let value;
      const _onError = (rel, code, msg) => onError(offset + rel, code, msg);
      switch (type) {
        case "scalar":
          _type = Scalar.Scalar.PLAIN;
          value = plainValue(source, _onError);
          break;
        case "single-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_SINGLE;
          value = singleQuotedValue(source, _onError);
          break;
        case "double-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_DOUBLE;
          value = doubleQuotedValue(source, _onError);
          break;
        /* istanbul ignore next should not happen */
        default:
          onError(scalar, "UNEXPECTED_TOKEN", `Expected a flow scalar value, but found: ${type}`);
          return {
            value: "",
            type: null,
            comment: "",
            range: [offset, offset + source.length, offset + source.length]
          };
      }
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, strict, onError);
      return {
        value,
        type: _type,
        comment: re.comment,
        range: [offset, valueEnd, re.offset]
      };
    }
    function plainValue(source, onError) {
      let badChar = "";
      switch (source[0]) {
        /* istanbul ignore next should not happen */
        case "	":
          badChar = "a tab character";
          break;
        case ",":
          badChar = "flow indicator character ,";
          break;
        case "%":
          badChar = "directive indicator character %";
          break;
        case "|":
        case ">": {
          badChar = `block scalar indicator ${source[0]}`;
          break;
        }
        case "@":
        case "`": {
          badChar = `reserved character ${source[0]}`;
          break;
        }
      }
      if (badChar)
        onError(0, "BAD_SCALAR_START", `Plain value cannot start with ${badChar}`);
      return unfoldLines(source);
    }
    function singleQuotedValue(source, onError) {
      if (source[source.length - 1] !== "'" || source.length === 1)
        onError(source.length, "MISSING_CHAR", "Missing closing 'quote");
      return unfoldLines(source.slice(1, -1)).replace(/''/g, "'");
    }
    function unfoldLines(source) {
      const line = /(.*?)\r?\n/sy;
      let match = line.exec(source);
      if (!match)
        return source;
      let trimEnd, trimBoth;
      try {
        trimEnd = new RegExp("(?<![ 	])[ 	]+$");
        trimBoth = new RegExp("^[ 	]+|(?<![ 	])[ 	]+$", "g");
      } catch {
        trimEnd = /[ \t]+$/;
        trimBoth = /^[ \t]+|[ \t]+$/g;
      }
      let res = match[1].replace(trimEnd, "");
      let sep = " ";
      let pos = line.lastIndex;
      while (match = line.exec(source)) {
        const lm = match[1].replace(trimBoth, "");
        if (lm === "") {
          if (sep === "\n")
            res += sep;
          else
            sep = "\n";
        } else {
          res += sep + lm;
          sep = " ";
        }
        pos = line.lastIndex;
      }
      const last = /[ \t]*(.*)/sy;
      last.lastIndex = pos;
      match = last.exec(source);
      return res + sep + (match?.[1] ?? "");
    }
    function doubleQuotedValue(source, onError) {
      let res = "";
      for (let i = 1; i < source.length - 1; ++i) {
        const ch = source[i];
        if (ch === "\r" && source[i + 1] === "\n")
          continue;
        if (ch === "\n") {
          const { fold, offset } = foldNewline(source, i);
          res += fold;
          i = offset;
        } else if (ch === "\\") {
          let next = source[++i];
          const cc = escapeCodes[next];
          if (cc)
            res += cc;
          else if (next === "\n") {
            next = source[i + 1];
            while (next === " " || next === "	")
              next = source[++i + 1];
          } else if (next === "\r" && source[i + 1] === "\n") {
            next = source[++i + 1];
            while (next === " " || next === "	")
              next = source[++i + 1];
          } else if (next === "x" || next === "u" || next === "U") {
            const length = next === "x" ? 2 : next === "u" ? 4 : 8;
            res += parseCharCode(source, i + 1, length, onError);
            i += length;
          } else {
            const raw = source.substr(i - 1, 2);
            onError(i - 1, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
            res += raw;
          }
        } else if (ch === " " || ch === "	") {
          const wsStart = i;
          let next = source[i + 1];
          while (next === " " || next === "	")
            next = source[++i + 1];
          if (next !== "\n" && !(next === "\r" && source[i + 2] === "\n"))
            res += i > wsStart ? source.slice(wsStart, i + 1) : ch;
        } else {
          res += ch;
        }
      }
      if (source[source.length - 1] !== '"' || source.length === 1)
        onError(source.length, "MISSING_CHAR", 'Missing closing "quote');
      return res;
    }
    function foldNewline(source, offset) {
      let fold = "";
      let ch = source[offset + 1];
      while (ch === " " || ch === "	" || ch === "\n" || ch === "\r") {
        if (ch === "\r" && source[offset + 2] !== "\n")
          break;
        if (ch === "\n")
          fold += "\n";
        offset += 1;
        ch = source[offset + 1];
      }
      if (!fold)
        fold = " ";
      return { fold, offset };
    }
    var escapeCodes = {
      "0": "\0",
      // null character
      a: "\x07",
      // bell character
      b: "\b",
      // backspace
      e: "\x1B",
      // escape character
      f: "\f",
      // form feed
      n: "\n",
      // line feed
      r: "\r",
      // carriage return
      t: "	",
      // horizontal tab
      v: "\v",
      // vertical tab
      N: "\x85",
      // Unicode next line
      _: "\xA0",
      // Unicode non-breaking space
      L: "\u2028",
      // Unicode line separator
      P: "\u2029",
      // Unicode paragraph separator
      " ": " ",
      '"': '"',
      "/": "/",
      "\\": "\\",
      "	": "	"
    };
    function parseCharCode(source, offset, length, onError) {
      const cc = source.substr(offset, length);
      const ok = cc.length === length && /^[0-9a-fA-F]+$/.test(cc);
      const code = ok ? parseInt(cc, 16) : NaN;
      try {
        return String.fromCodePoint(code);
      } catch {
        const raw = source.substr(offset - 2, length + 2);
        onError(offset - 2, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
        return raw;
      }
    }
    exports.resolveFlowScalar = resolveFlowScalar;
  }
});

// node_modules/yaml/dist/compose/compose-scalar.js
var require_compose_scalar = __commonJS({
  "node_modules/yaml/dist/compose/compose-scalar.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    function composeScalar(ctx, token, tagToken, onError) {
      const { value, type, comment, range } = token.type === "block-scalar" ? resolveBlockScalar.resolveBlockScalar(ctx, token, onError) : resolveFlowScalar.resolveFlowScalar(token, ctx.options.strict, onError);
      const tagName = tagToken ? ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg)) : null;
      let tag;
      if (ctx.options.stringKeys && ctx.atKey) {
        tag = ctx.schema[identity.SCALAR];
      } else if (tagName)
        tag = findScalarTagByName(ctx.schema, value, tagName, tagToken, onError);
      else if (token.type === "scalar")
        tag = findScalarTagByTest(ctx, value, token, onError);
      else
        tag = ctx.schema[identity.SCALAR];
      let scalar;
      try {
        const res = tag.resolve(value, (msg) => onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg), ctx.options);
        scalar = identity.isScalar(res) ? res : new Scalar.Scalar(res);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg);
        scalar = new Scalar.Scalar(value);
      }
      scalar.range = range;
      scalar.source = value;
      if (type)
        scalar.type = type;
      if (tagName)
        scalar.tag = tagName;
      if (tag.format)
        scalar.format = tag.format;
      if (comment)
        scalar.comment = comment;
      return scalar;
    }
    function findScalarTagByName(schema, value, tagName, tagToken, onError) {
      if (tagName === "!")
        return schema[identity.SCALAR];
      const matchWithTest = [];
      for (const tag of schema.tags) {
        if (!tag.collection && tag.tag === tagName) {
          if (tag.default && tag.test)
            matchWithTest.push(tag);
          else
            return tag;
        }
      }
      for (const tag of matchWithTest)
        if (tag.test?.test(value))
          return tag;
      const kt = schema.knownTags[tagName];
      if (kt && !kt.collection) {
        schema.tags.push(Object.assign({}, kt, { default: false, test: void 0 }));
        return kt;
      }
      onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, tagName !== "tag:yaml.org,2002:str");
      return schema[identity.SCALAR];
    }
    function findScalarTagByTest({ atKey, directives, schema }, value, token, onError) {
      const tag = schema.tags.find((tag2) => (tag2.default === true || atKey && tag2.default === "key") && tag2.test?.test(value)) || schema[identity.SCALAR];
      if (schema.compat) {
        const compat = schema.compat.find((tag2) => tag2.default && tag2.test?.test(value)) ?? schema[identity.SCALAR];
        if (tag.tag !== compat.tag) {
          const ts = directives.tagString(tag.tag);
          const cs = directives.tagString(compat.tag);
          const msg = `Value may be parsed as either ${ts} or ${cs}`;
          onError(token, "TAG_RESOLVE_FAILED", msg, true);
        }
      }
      return tag;
    }
    exports.composeScalar = composeScalar;
  }
});

// node_modules/yaml/dist/compose/util-empty-scalar-position.js
var require_util_empty_scalar_position = __commonJS({
  "node_modules/yaml/dist/compose/util-empty-scalar-position.js"(exports) {
    "use strict";
    function emptyScalarPosition(offset, before, pos) {
      if (before) {
        pos ?? (pos = before.length);
        for (let i = pos - 1; i >= 0; --i) {
          let st = before[i];
          switch (st.type) {
            case "space":
            case "comment":
            case "newline":
              offset -= st.source.length;
              continue;
          }
          st = before[++i];
          while (st?.type === "space") {
            offset += st.source.length;
            st = before[++i];
          }
          break;
        }
      }
      return offset;
    }
    exports.emptyScalarPosition = emptyScalarPosition;
  }
});

// node_modules/yaml/dist/compose/compose-node.js
var require_compose_node = __commonJS({
  "node_modules/yaml/dist/compose/compose-node.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var identity = require_identity();
    var composeCollection = require_compose_collection();
    var composeScalar = require_compose_scalar();
    var resolveEnd = require_resolve_end();
    var utilEmptyScalarPosition = require_util_empty_scalar_position();
    var CN = { composeNode, composeEmptyNode };
    function composeNode(ctx, token, props, onError) {
      const atKey = ctx.atKey;
      const { spaceBefore, comment, anchor, tag } = props;
      let node;
      let isSrcToken = true;
      switch (token.type) {
        case "alias":
          node = composeAlias(ctx, token, onError);
          if (anchor || tag)
            onError(token, "ALIAS_PROPS", "An alias node must not specify any properties");
          break;
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "block-scalar":
          node = composeScalar.composeScalar(ctx, token, tag, onError);
          if (anchor)
            node.anchor = anchor.source.substring(1);
          break;
        case "block-map":
        case "block-seq":
        case "flow-collection":
          try {
            node = composeCollection.composeCollection(CN, ctx, token, props, onError);
            if (anchor)
              node.anchor = anchor.source.substring(1);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            onError(token, "RESOURCE_EXHAUSTION", message);
          }
          break;
        default: {
          const message = token.type === "error" ? token.message : `Unsupported token (type: ${token.type})`;
          onError(token, "UNEXPECTED_TOKEN", message);
          isSrcToken = false;
        }
      }
      node ?? (node = composeEmptyNode(ctx, token.offset, void 0, null, props, onError));
      if (anchor && node.anchor === "")
        onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
      if (atKey && ctx.options.stringKeys && (!identity.isScalar(node) || typeof node.value !== "string" || node.tag && node.tag !== "tag:yaml.org,2002:str")) {
        const msg = "With stringKeys, all keys must be strings";
        onError(tag ?? token, "NON_STRING_KEY", msg);
      }
      if (spaceBefore)
        node.spaceBefore = true;
      if (comment) {
        if (token.type === "scalar" && token.source === "")
          node.comment = comment;
        else
          node.commentBefore = comment;
      }
      if (ctx.options.keepSourceTokens && isSrcToken)
        node.srcToken = token;
      return node;
    }
    function composeEmptyNode(ctx, offset, before, pos, { spaceBefore, comment, anchor, tag, end }, onError) {
      const token = {
        type: "scalar",
        offset: utilEmptyScalarPosition.emptyScalarPosition(offset, before, pos),
        indent: -1,
        source: ""
      };
      const node = composeScalar.composeScalar(ctx, token, tag, onError);
      if (anchor) {
        node.anchor = anchor.source.substring(1);
        if (node.anchor === "")
          onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
      }
      if (spaceBefore)
        node.spaceBefore = true;
      if (comment) {
        node.comment = comment;
        node.range[2] = end;
      }
      return node;
    }
    function composeAlias({ options }, { offset, source, end }, onError) {
      const alias = new Alias.Alias(source.substring(1));
      if (alias.source === "")
        onError(offset, "BAD_ALIAS", "Alias cannot be an empty string");
      if (alias.source.endsWith(":"))
        onError(offset + source.length - 1, "BAD_ALIAS", "Alias ending in : is ambiguous", true);
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, options.strict, onError);
      alias.range = [offset, valueEnd, re.offset];
      if (re.comment)
        alias.comment = re.comment;
      return alias;
    }
    exports.composeEmptyNode = composeEmptyNode;
    exports.composeNode = composeNode;
  }
});

// node_modules/yaml/dist/compose/compose-doc.js
var require_compose_doc = __commonJS({
  "node_modules/yaml/dist/compose/compose-doc.js"(exports) {
    "use strict";
    var Document = require_Document();
    var composeNode = require_compose_node();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    function composeDoc(options, directives, { offset, start, value, end }, onError) {
      const opts = Object.assign({ _directives: directives }, options);
      const doc = new Document.Document(void 0, opts);
      const ctx = {
        atKey: false,
        atRoot: true,
        directives: doc.directives,
        options: doc.options,
        schema: doc.schema
      };
      const props = resolveProps.resolveProps(start, {
        indicator: "doc-start",
        next: value ?? end?.[0],
        offset,
        onError,
        parentIndent: 0,
        startOnNewline: true
      });
      if (props.found) {
        doc.directives.docStart = true;
        if (value && (value.type === "block-map" || value.type === "block-seq") && !props.hasNewline)
          onError(props.end, "MISSING_CHAR", "Block collection cannot start on same line with directives-end marker");
      }
      doc.contents = value ? composeNode.composeNode(ctx, value, props, onError) : composeNode.composeEmptyNode(ctx, props.end, start, null, props, onError);
      const contentEnd = doc.contents.range[2];
      const re = resolveEnd.resolveEnd(end, contentEnd, false, onError);
      if (re.comment)
        doc.comment = re.comment;
      doc.range = [offset, contentEnd, re.offset];
      return doc;
    }
    exports.composeDoc = composeDoc;
  }
});

// node_modules/yaml/dist/compose/composer.js
var require_composer = __commonJS({
  "node_modules/yaml/dist/compose/composer.js"(exports) {
    "use strict";
    var node_process = __require("process");
    var directives = require_directives();
    var Document = require_Document();
    var errors = require_errors();
    var identity = require_identity();
    var composeDoc = require_compose_doc();
    var resolveEnd = require_resolve_end();
    function getErrorPos(src) {
      if (typeof src === "number")
        return [src, src + 1];
      if (Array.isArray(src))
        return src.length === 2 ? src : [src[0], src[1]];
      const { offset, source } = src;
      return [offset, offset + (typeof source === "string" ? source.length : 1)];
    }
    function parsePrelude(prelude) {
      let comment = "";
      let atComment = false;
      let afterEmptyLine = false;
      for (let i = 0; i < prelude.length; ++i) {
        const source = prelude[i];
        switch (source[0]) {
          case "#":
            comment += (comment === "" ? "" : afterEmptyLine ? "\n\n" : "\n") + (source.substring(1) || " ");
            atComment = true;
            afterEmptyLine = false;
            break;
          case "%":
            if (prelude[i + 1]?.[0] !== "#")
              i += 1;
            atComment = false;
            break;
          default:
            if (!atComment)
              afterEmptyLine = true;
            atComment = false;
        }
      }
      return { comment, afterEmptyLine };
    }
    var Composer = class {
      constructor(options = {}) {
        this.doc = null;
        this.atDirectives = false;
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
        this.onError = (source, code, message, warning) => {
          const pos = getErrorPos(source);
          if (warning)
            this.warnings.push(new errors.YAMLWarning(pos, code, message));
          else
            this.errors.push(new errors.YAMLParseError(pos, code, message));
        };
        this.directives = new directives.Directives({ version: options.version || "1.2" });
        this.options = options;
      }
      decorate(doc, afterDoc) {
        const { comment, afterEmptyLine } = parsePrelude(this.prelude);
        if (comment) {
          const dc = doc.contents;
          if (afterDoc) {
            doc.comment = doc.comment ? `${doc.comment}
${comment}` : comment;
          } else if (afterEmptyLine || doc.directives.docStart || !dc) {
            doc.commentBefore = comment;
          } else if (identity.isCollection(dc) && !dc.flow && dc.items.length > 0) {
            let it = dc.items[0];
            if (identity.isPair(it))
              it = it.key;
            const cb = it.commentBefore;
            it.commentBefore = cb ? `${comment}
${cb}` : comment;
          } else {
            const cb = dc.commentBefore;
            dc.commentBefore = cb ? `${comment}
${cb}` : comment;
          }
        }
        if (afterDoc) {
          for (let i = 0; i < this.errors.length; ++i)
            doc.errors.push(this.errors[i]);
          for (let i = 0; i < this.warnings.length; ++i)
            doc.warnings.push(this.warnings[i]);
        } else {
          doc.errors = this.errors;
          doc.warnings = this.warnings;
        }
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
      }
      /**
       * Current stream status information.
       *
       * Mostly useful at the end of input for an empty stream.
       */
      streamInfo() {
        return {
          comment: parsePrelude(this.prelude).comment,
          directives: this.directives,
          errors: this.errors,
          warnings: this.warnings
        };
      }
      /**
       * Compose tokens into documents.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *compose(tokens, forceDoc = false, endOffset = -1) {
        for (const token of tokens)
          yield* this.next(token);
        yield* this.end(forceDoc, endOffset);
      }
      /** Advance the composer by one CST token. */
      *next(token) {
        if (node_process.env.LOG_STREAM)
          console.dir(token, { depth: null });
        switch (token.type) {
          case "directive":
            this.directives.add(token.source, (offset, message, warning) => {
              const pos = getErrorPos(token);
              pos[0] += offset;
              this.onError(pos, "BAD_DIRECTIVE", message, warning);
            });
            this.prelude.push(token.source);
            this.atDirectives = true;
            break;
          case "document": {
            const doc = composeDoc.composeDoc(this.options, this.directives, token, this.onError);
            if (this.atDirectives && !doc.directives.docStart)
              this.onError(token, "MISSING_CHAR", "Missing directives-end/doc-start indicator line");
            this.decorate(doc, false);
            if (this.doc)
              yield this.doc;
            this.doc = doc;
            this.atDirectives = false;
            break;
          }
          case "byte-order-mark":
          case "space":
            break;
          case "comment":
          case "newline":
            this.prelude.push(token.source);
            break;
          case "error": {
            const msg = token.source ? `${token.message}: ${JSON.stringify(token.source)}` : token.message;
            const error = new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg);
            if (this.atDirectives || !this.doc)
              this.errors.push(error);
            else
              this.doc.errors.push(error);
            break;
          }
          case "doc-end": {
            if (!this.doc) {
              const msg = "Unexpected doc-end without preceding document";
              this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg));
              break;
            }
            this.doc.directives.docEnd = true;
            const end = resolveEnd.resolveEnd(token.end, token.offset + token.source.length, this.doc.options.strict, this.onError);
            this.decorate(this.doc, true);
            if (end.comment) {
              const dc = this.doc.comment;
              this.doc.comment = dc ? `${dc}
${end.comment}` : end.comment;
            }
            this.doc.range[2] = end.offset;
            break;
          }
          default:
            this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", `Unsupported token ${token.type}`));
        }
      }
      /**
       * Call at end of input to yield any remaining document.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *end(forceDoc = false, endOffset = -1) {
        if (this.doc) {
          this.decorate(this.doc, true);
          yield this.doc;
          this.doc = null;
        } else if (forceDoc) {
          const opts = Object.assign({ _directives: this.directives }, this.options);
          const doc = new Document.Document(void 0, opts);
          if (this.atDirectives)
            this.onError(endOffset, "MISSING_CHAR", "Missing directives-end indicator line");
          doc.range = [0, endOffset, endOffset];
          this.decorate(doc, false);
          yield doc;
        }
      }
    };
    exports.Composer = Composer;
  }
});

// node_modules/yaml/dist/parse/cst-scalar.js
var require_cst_scalar = __commonJS({
  "node_modules/yaml/dist/parse/cst-scalar.js"(exports) {
    "use strict";
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    var errors = require_errors();
    var stringifyString = require_stringifyString();
    function resolveAsScalar(token, strict = true, onError) {
      if (token) {
        const _onError = (pos, code, message) => {
          const offset = typeof pos === "number" ? pos : Array.isArray(pos) ? pos[0] : pos.offset;
          if (onError)
            onError(offset, code, message);
          else
            throw new errors.YAMLParseError([offset, offset + 1], code, message);
        };
        switch (token.type) {
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return resolveFlowScalar.resolveFlowScalar(token, strict, _onError);
          case "block-scalar":
            return resolveBlockScalar.resolveBlockScalar({ options: { strict } }, token, _onError);
        }
      }
      return null;
    }
    function createScalarToken(value, context2) {
      const { implicitKey = false, indent, inFlow = false, offset = -1, type = "PLAIN" } = context2;
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey,
        indent: indent > 0 ? " ".repeat(indent) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      const end = context2.end ?? [
        { type: "newline", offset: -1, indent, source: "\n" }
      ];
      switch (source[0]) {
        case "|":
        case ">": {
          const he = source.indexOf("\n");
          const head = source.substring(0, he);
          const body = source.substring(he + 1) + "\n";
          const props = [
            { type: "block-scalar-header", offset, indent, source: head }
          ];
          if (!addEndtoBlockProps(props, end))
            props.push({ type: "newline", offset: -1, indent, source: "\n" });
          return { type: "block-scalar", offset, indent, props, source: body };
        }
        case '"':
          return { type: "double-quoted-scalar", offset, indent, source, end };
        case "'":
          return { type: "single-quoted-scalar", offset, indent, source, end };
        default:
          return { type: "scalar", offset, indent, source, end };
      }
    }
    function setScalarValue(token, value, context2 = {}) {
      let { afterKey = false, implicitKey = false, inFlow = false, type } = context2;
      let indent = "indent" in token ? token.indent : null;
      if (afterKey && typeof indent === "number")
        indent += 2;
      if (!type)
        switch (token.type) {
          case "single-quoted-scalar":
            type = "QUOTE_SINGLE";
            break;
          case "double-quoted-scalar":
            type = "QUOTE_DOUBLE";
            break;
          case "block-scalar": {
            const header = token.props[0];
            if (header.type !== "block-scalar-header")
              throw new Error("Invalid block scalar header");
            type = header.source[0] === ">" ? "BLOCK_FOLDED" : "BLOCK_LITERAL";
            break;
          }
          default:
            type = "PLAIN";
        }
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey: implicitKey || indent === null,
        indent: indent !== null && indent > 0 ? " ".repeat(indent) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      switch (source[0]) {
        case "|":
        case ">":
          setBlockScalarValue(token, source);
          break;
        case '"':
          setFlowScalarValue(token, source, "double-quoted-scalar");
          break;
        case "'":
          setFlowScalarValue(token, source, "single-quoted-scalar");
          break;
        default:
          setFlowScalarValue(token, source, "scalar");
      }
    }
    function setBlockScalarValue(token, source) {
      const he = source.indexOf("\n");
      const head = source.substring(0, he);
      const body = source.substring(he + 1) + "\n";
      if (token.type === "block-scalar") {
        const header = token.props[0];
        if (header.type !== "block-scalar-header")
          throw new Error("Invalid block scalar header");
        header.source = head;
        token.source = body;
      } else {
        const { offset } = token;
        const indent = "indent" in token ? token.indent : -1;
        const props = [
          { type: "block-scalar-header", offset, indent, source: head }
        ];
        if (!addEndtoBlockProps(props, "end" in token ? token.end : void 0))
          props.push({ type: "newline", offset: -1, indent, source: "\n" });
        for (const key2 of Object.keys(token))
          if (key2 !== "type" && key2 !== "offset")
            delete token[key2];
        Object.assign(token, { type: "block-scalar", indent, props, source: body });
      }
    }
    function addEndtoBlockProps(props, end) {
      if (end)
        for (const st of end)
          switch (st.type) {
            case "space":
            case "comment":
              props.push(st);
              break;
            case "newline":
              props.push(st);
              return true;
          }
      return false;
    }
    function setFlowScalarValue(token, source, type) {
      switch (token.type) {
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          token.type = type;
          token.source = source;
          break;
        case "block-scalar": {
          const end = token.props.slice(1);
          let oa = source.length;
          if (token.props[0].type === "block-scalar-header")
            oa -= token.props[0].source.length;
          for (const tok of end)
            tok.offset += oa;
          delete token.props;
          Object.assign(token, { type, source, end });
          break;
        }
        case "block-map":
        case "block-seq": {
          const offset = token.offset + source.length;
          const nl = { type: "newline", offset, indent: token.indent, source: "\n" };
          delete token.items;
          Object.assign(token, { type, source, end: [nl] });
          break;
        }
        default: {
          const indent = "indent" in token ? token.indent : -1;
          const end = "end" in token && Array.isArray(token.end) ? token.end.filter((st) => st.type === "space" || st.type === "comment" || st.type === "newline") : [];
          for (const key2 of Object.keys(token))
            if (key2 !== "type" && key2 !== "offset")
              delete token[key2];
          Object.assign(token, { type, indent, source, end });
        }
      }
    }
    exports.createScalarToken = createScalarToken;
    exports.resolveAsScalar = resolveAsScalar;
    exports.setScalarValue = setScalarValue;
  }
});

// node_modules/yaml/dist/parse/cst-stringify.js
var require_cst_stringify = __commonJS({
  "node_modules/yaml/dist/parse/cst-stringify.js"(exports) {
    "use strict";
    var stringify3 = (cst) => "type" in cst ? stringifyToken(cst) : stringifyItem(cst);
    function stringifyToken(token) {
      switch (token.type) {
        case "block-scalar": {
          let res = "";
          for (const tok of token.props)
            res += stringifyToken(tok);
          return res + token.source;
        }
        case "block-map":
        case "block-seq": {
          let res = "";
          for (const item of token.items)
            res += stringifyItem(item);
          return res;
        }
        case "flow-collection": {
          let res = token.start.source;
          for (const item of token.items)
            res += stringifyItem(item);
          for (const st of token.end)
            res += st.source;
          return res;
        }
        case "document": {
          let res = stringifyItem(token);
          if (token.end)
            for (const st of token.end)
              res += st.source;
          return res;
        }
        default: {
          let res = token.source;
          if ("end" in token && token.end)
            for (const st of token.end)
              res += st.source;
          return res;
        }
      }
    }
    function stringifyItem({ start, key: key2, sep, value }) {
      let res = "";
      for (const st of start)
        res += st.source;
      if (key2)
        res += stringifyToken(key2);
      if (sep)
        for (const st of sep)
          res += st.source;
      if (value)
        res += stringifyToken(value);
      return res;
    }
    exports.stringify = stringify3;
  }
});

// node_modules/yaml/dist/parse/cst-visit.js
var require_cst_visit = __commonJS({
  "node_modules/yaml/dist/parse/cst-visit.js"(exports) {
    "use strict";
    var BREAK = /* @__PURE__ */ Symbol("break visit");
    var SKIP = /* @__PURE__ */ Symbol("skip children");
    var REMOVE = /* @__PURE__ */ Symbol("remove item");
    function visit(cst, visitor) {
      if ("type" in cst && cst.type === "document")
        cst = { start: cst.start, value: cst.value };
      _visit(Object.freeze([]), cst, visitor);
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    visit.itemAtPath = (cst, path5) => {
      let item = cst;
      for (const [field, index] of path5) {
        const tok = item?.[field];
        if (tok && "items" in tok) {
          item = tok.items[index];
        } else
          return void 0;
      }
      return item;
    };
    visit.parentCollection = (cst, path5) => {
      const parent = visit.itemAtPath(cst, path5.slice(0, -1));
      const field = path5[path5.length - 1][0];
      const coll = parent?.[field];
      if (coll && "items" in coll)
        return coll;
      throw new Error("Parent collection not found");
    };
    function _visit(path5, item, visitor) {
      let ctrl = visitor(item, path5);
      if (typeof ctrl === "symbol")
        return ctrl;
      for (const field of ["key", "value"]) {
        const token = item[field];
        if (token && "items" in token) {
          for (let i = 0; i < token.items.length; ++i) {
            const ci = _visit(Object.freeze(path5.concat([[field, i]])), token.items[i], visitor);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              token.items.splice(i, 1);
              i -= 1;
            }
          }
          if (typeof ctrl === "function" && field === "key")
            ctrl = ctrl(item, path5);
        }
      }
      return typeof ctrl === "function" ? ctrl(item, path5) : ctrl;
    }
    exports.visit = visit;
  }
});

// node_modules/yaml/dist/parse/cst.js
var require_cst = __commonJS({
  "node_modules/yaml/dist/parse/cst.js"(exports) {
    "use strict";
    var cstScalar = require_cst_scalar();
    var cstStringify = require_cst_stringify();
    var cstVisit = require_cst_visit();
    var BOM = "\uFEFF";
    var DOCUMENT = "";
    var FLOW_END = "";
    var SCALAR = "";
    var isCollection = (token) => !!token && "items" in token;
    var isScalar = (token) => !!token && (token.type === "scalar" || token.type === "single-quoted-scalar" || token.type === "double-quoted-scalar" || token.type === "block-scalar");
    function prettyToken(token) {
      switch (token) {
        case BOM:
          return "<BOM>";
        case DOCUMENT:
          return "<DOC>";
        case FLOW_END:
          return "<FLOW_END>";
        case SCALAR:
          return "<SCALAR>";
        default:
          return JSON.stringify(token);
      }
    }
    function tokenType(source) {
      switch (source) {
        case BOM:
          return "byte-order-mark";
        case DOCUMENT:
          return "doc-mode";
        case FLOW_END:
          return "flow-error-end";
        case SCALAR:
          return "scalar";
        case "---":
          return "doc-start";
        case "...":
          return "doc-end";
        case "":
        case "\n":
        case "\r\n":
          return "newline";
        case "-":
          return "seq-item-ind";
        case "?":
          return "explicit-key-ind";
        case ":":
          return "map-value-ind";
        case "{":
          return "flow-map-start";
        case "}":
          return "flow-map-end";
        case "[":
          return "flow-seq-start";
        case "]":
          return "flow-seq-end";
        case ",":
          return "comma";
      }
      switch (source[0]) {
        case " ":
        case "	":
          return "space";
        case "#":
          return "comment";
        case "%":
          return "directive-line";
        case "*":
          return "alias";
        case "&":
          return "anchor";
        case "!":
          return "tag";
        case "'":
          return "single-quoted-scalar";
        case '"':
          return "double-quoted-scalar";
        case "|":
        case ">":
          return "block-scalar-header";
      }
      return null;
    }
    exports.createScalarToken = cstScalar.createScalarToken;
    exports.resolveAsScalar = cstScalar.resolveAsScalar;
    exports.setScalarValue = cstScalar.setScalarValue;
    exports.stringify = cstStringify.stringify;
    exports.visit = cstVisit.visit;
    exports.BOM = BOM;
    exports.DOCUMENT = DOCUMENT;
    exports.FLOW_END = FLOW_END;
    exports.SCALAR = SCALAR;
    exports.isCollection = isCollection;
    exports.isScalar = isScalar;
    exports.prettyToken = prettyToken;
    exports.tokenType = tokenType;
  }
});

// node_modules/yaml/dist/parse/lexer.js
var require_lexer = __commonJS({
  "node_modules/yaml/dist/parse/lexer.js"(exports) {
    "use strict";
    var cst = require_cst();
    function isEmpty(ch) {
      switch (ch) {
        case void 0:
        case " ":
        case "\n":
        case "\r":
        case "	":
          return true;
        default:
          return false;
      }
    }
    var hexDigits = new Set("0123456789ABCDEFabcdef");
    var tagChars = new Set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-#;/?:@&=+$_.!~*'()");
    var flowIndicatorChars = new Set(",[]{}");
    var invalidAnchorChars = new Set(" ,[]{}\n\r	");
    var isNotAnchorChar = (ch) => !ch || invalidAnchorChars.has(ch);
    var Lexer = class {
      constructor() {
        this.atEnd = false;
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        this.buffer = "";
        this.flowKey = false;
        this.flowLevel = 0;
        this.indentNext = 0;
        this.indentValue = 0;
        this.lineEndPos = null;
        this.next = null;
        this.pos = 0;
      }
      /**
       * Generate YAML tokens from the `source` string. If `incomplete`,
       * a part of the last line may be left as a buffer for the next call.
       *
       * @returns A generator of lexical tokens
       */
      *lex(source, incomplete = false) {
        if (source) {
          if (typeof source !== "string")
            throw TypeError("source is not a string");
          this.buffer = this.buffer ? this.buffer + source : source;
          this.lineEndPos = null;
        }
        this.atEnd = !incomplete;
        let next = this.next ?? "stream";
        while (next && (incomplete || this.hasChars(1)))
          next = yield* this.parseNext(next);
      }
      atLineEnd() {
        let i = this.pos;
        let ch = this.buffer[i];
        while (ch === " " || ch === "	")
          ch = this.buffer[++i];
        if (!ch || ch === "#" || ch === "\n")
          return true;
        if (ch === "\r")
          return this.buffer[i + 1] === "\n";
        return false;
      }
      charAt(n) {
        return this.buffer[this.pos + n];
      }
      continueScalar(offset) {
        let ch = this.buffer[offset];
        if (this.indentNext > 0) {
          let indent = 0;
          while (ch === " ")
            ch = this.buffer[++indent + offset];
          if (ch === "\r") {
            const next = this.buffer[indent + offset + 1];
            if (next === "\n" || !next && !this.atEnd)
              return offset + indent + 1;
          }
          return ch === "\n" || indent >= this.indentNext || !ch && !this.atEnd ? offset + indent : -1;
        }
        if (ch === "-" || ch === ".") {
          const dt = this.buffer.substr(offset, 3);
          if ((dt === "---" || dt === "...") && isEmpty(this.buffer[offset + 3]))
            return -1;
        }
        return offset;
      }
      getLine() {
        let end = this.lineEndPos;
        if (typeof end !== "number" || end !== -1 && end < this.pos) {
          end = this.buffer.indexOf("\n", this.pos);
          this.lineEndPos = end;
        }
        if (end === -1)
          return this.atEnd ? this.buffer.substring(this.pos) : null;
        if (this.buffer[end - 1] === "\r")
          end -= 1;
        return this.buffer.substring(this.pos, end);
      }
      hasChars(n) {
        return this.pos + n <= this.buffer.length;
      }
      setNext(state) {
        this.buffer = this.buffer.substring(this.pos);
        this.pos = 0;
        this.lineEndPos = null;
        this.next = state;
        return null;
      }
      peek(n) {
        return this.buffer.substr(this.pos, n);
      }
      *parseNext(next) {
        switch (next) {
          case "stream":
            return yield* this.parseStream();
          case "line-start":
            return yield* this.parseLineStart();
          case "block-start":
            return yield* this.parseBlockStart();
          case "doc":
            return yield* this.parseDocument();
          case "flow":
            return yield* this.parseFlowCollection();
          case "quoted-scalar":
            return yield* this.parseQuotedScalar();
          case "block-scalar":
            return yield* this.parseBlockScalar();
          case "plain-scalar":
            return yield* this.parsePlainScalar();
        }
      }
      *parseStream() {
        let line = this.getLine();
        if (line === null)
          return this.setNext("stream");
        if (line[0] === cst.BOM) {
          yield* this.pushCount(1);
          line = line.substring(1);
        }
        if (line[0] === "%") {
          let dirEnd = line.length;
          let cs = line.indexOf("#");
          while (cs !== -1) {
            const ch = line[cs - 1];
            if (ch === " " || ch === "	") {
              dirEnd = cs - 1;
              break;
            } else {
              cs = line.indexOf("#", cs + 1);
            }
          }
          while (true) {
            const ch = line[dirEnd - 1];
            if (ch === " " || ch === "	")
              dirEnd -= 1;
            else
              break;
          }
          const n = (yield* this.pushCount(dirEnd)) + (yield* this.pushSpaces(true));
          yield* this.pushCount(line.length - n);
          this.pushNewline();
          return "stream";
        }
        if (this.atLineEnd()) {
          const sp = yield* this.pushSpaces(true);
          yield* this.pushCount(line.length - sp);
          yield* this.pushNewline();
          return "stream";
        }
        yield cst.DOCUMENT;
        return yield* this.parseLineStart();
      }
      *parseLineStart() {
        const ch = this.charAt(0);
        if (!ch && !this.atEnd)
          return this.setNext("line-start");
        if (ch === "-" || ch === ".") {
          if (!this.atEnd && !this.hasChars(4))
            return this.setNext("line-start");
          const s = this.peek(3);
          if ((s === "---" || s === "...") && isEmpty(this.charAt(3))) {
            yield* this.pushCount(3);
            this.indentValue = 0;
            this.indentNext = 0;
            return s === "---" ? "doc" : "stream";
          }
        }
        this.indentValue = yield* this.pushSpaces(false);
        if (this.indentNext > this.indentValue && !isEmpty(this.charAt(1)))
          this.indentNext = this.indentValue;
        return yield* this.parseBlockStart();
      }
      *parseBlockStart() {
        const [ch0, ch1] = this.peek(2);
        if (!ch1 && !this.atEnd)
          return this.setNext("block-start");
        if ((ch0 === "-" || ch0 === "?" || ch0 === ":") && isEmpty(ch1)) {
          const n = (yield* this.pushCount(1)) + (yield* this.pushSpaces(true));
          this.indentNext = this.indentValue + 1;
          this.indentValue += n;
          return "block-start";
        }
        return "doc";
      }
      *parseDocument() {
        yield* this.pushSpaces(true);
        const line = this.getLine();
        if (line === null)
          return this.setNext("doc");
        let n = yield* this.pushIndicators();
        switch (line[n]) {
          case "#":
            yield* this.pushCount(line.length - n);
          // fallthrough
          case void 0:
            yield* this.pushNewline();
            return yield* this.parseLineStart();
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel = 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            return "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "doc";
          case '"':
          case "'":
            return yield* this.parseQuotedScalar();
          case "|":
          case ">":
            n += yield* this.parseBlockScalarHeader();
            n += yield* this.pushSpaces(true);
            yield* this.pushCount(line.length - n);
            yield* this.pushNewline();
            return yield* this.parseBlockScalar();
          default:
            return yield* this.parsePlainScalar();
        }
      }
      *parseFlowCollection() {
        let nl, sp;
        let indent = -1;
        do {
          nl = yield* this.pushNewline();
          if (nl > 0) {
            sp = yield* this.pushSpaces(false);
            this.indentValue = indent = sp;
          } else {
            sp = 0;
          }
          sp += yield* this.pushSpaces(true);
        } while (nl + sp > 0);
        const line = this.getLine();
        if (line === null)
          return this.setNext("flow");
        if (indent !== -1 && indent < this.indentNext && line[0] !== "#" || indent === 0 && (line.startsWith("---") || line.startsWith("...")) && isEmpty(line[3])) {
          const atFlowEndMarker = indent === this.indentNext - 1 && this.flowLevel === 1 && (line[0] === "]" || line[0] === "}");
          if (!atFlowEndMarker) {
            this.flowLevel = 0;
            yield cst.FLOW_END;
            return yield* this.parseLineStart();
          }
        }
        let n = 0;
        while (line[n] === ",") {
          n += yield* this.pushCount(1);
          n += yield* this.pushSpaces(true);
          this.flowKey = false;
        }
        n += yield* this.pushIndicators();
        switch (line[n]) {
          case void 0:
            return "flow";
          case "#":
            yield* this.pushCount(line.length - n);
            return "flow";
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel += 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            this.flowKey = true;
            this.flowLevel -= 1;
            return this.flowLevel ? "flow" : "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "flow";
          case '"':
          case "'":
            this.flowKey = true;
            return yield* this.parseQuotedScalar();
          case ":": {
            const next = this.charAt(1);
            if (this.flowKey || isEmpty(next) || next === ",") {
              this.flowKey = false;
              yield* this.pushCount(1);
              yield* this.pushSpaces(true);
              return "flow";
            }
          }
          // fallthrough
          default:
            this.flowKey = false;
            return yield* this.parsePlainScalar();
        }
      }
      *parseQuotedScalar() {
        const quote = this.charAt(0);
        let end = this.buffer.indexOf(quote, this.pos + 1);
        if (quote === "'") {
          while (end !== -1 && this.buffer[end + 1] === "'")
            end = this.buffer.indexOf("'", end + 2);
        } else {
          while (end !== -1) {
            let n = 0;
            while (this.buffer[end - 1 - n] === "\\")
              n += 1;
            if (n % 2 === 0)
              break;
            end = this.buffer.indexOf('"', end + 1);
          }
        }
        const qb = this.buffer.substring(0, end);
        let nl = qb.indexOf("\n", this.pos);
        if (nl !== -1) {
          while (nl !== -1) {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = qb.indexOf("\n", cs);
          }
          if (nl !== -1) {
            end = nl - (qb[nl - 1] === "\r" ? 2 : 1);
          }
        }
        if (end === -1) {
          if (!this.atEnd)
            return this.setNext("quoted-scalar");
          end = this.buffer.length;
        }
        yield* this.pushToIndex(end + 1, false);
        return this.flowLevel ? "flow" : "doc";
      }
      *parseBlockScalarHeader() {
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        let i = this.pos;
        while (true) {
          const ch = this.buffer[++i];
          if (ch === "+")
            this.blockScalarKeep = true;
          else if (ch > "0" && ch <= "9")
            this.blockScalarIndent = Number(ch) - 1;
          else if (ch !== "-")
            break;
        }
        return yield* this.pushUntil((ch) => isEmpty(ch) || ch === "#");
      }
      *parseBlockScalar() {
        let nl = this.pos - 1;
        let indent = 0;
        let ch;
        loop: for (let i2 = this.pos; ch = this.buffer[i2]; ++i2) {
          switch (ch) {
            case " ":
              indent += 1;
              break;
            case "\n":
              nl = i2;
              indent = 0;
              break;
            case "\r": {
              const next = this.buffer[i2 + 1];
              if (!next && !this.atEnd)
                return this.setNext("block-scalar");
              if (next === "\n")
                break;
            }
            // fallthrough
            default:
              break loop;
          }
        }
        if (!ch && !this.atEnd)
          return this.setNext("block-scalar");
        if (indent >= this.indentNext) {
          if (this.blockScalarIndent === -1)
            this.indentNext = indent;
          else {
            this.indentNext = this.blockScalarIndent + (this.indentNext === 0 ? 1 : this.indentNext);
          }
          do {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = this.buffer.indexOf("\n", cs);
          } while (nl !== -1);
          if (nl === -1) {
            if (!this.atEnd)
              return this.setNext("block-scalar");
            nl = this.buffer.length;
          }
        }
        let i = nl + 1;
        ch = this.buffer[i];
        while (ch === " ")
          ch = this.buffer[++i];
        if (ch === "	") {
          while (ch === "	" || ch === " " || ch === "\r" || ch === "\n")
            ch = this.buffer[++i];
          nl = i - 1;
        } else if (!this.blockScalarKeep) {
          do {
            let i2 = nl - 1;
            let ch2 = this.buffer[i2];
            if (ch2 === "\r")
              ch2 = this.buffer[--i2];
            const lastChar = i2;
            while (ch2 === " ")
              ch2 = this.buffer[--i2];
            if (ch2 === "\n" && i2 >= this.pos && i2 + 1 + indent > lastChar)
              nl = i2;
            else
              break;
          } while (true);
        }
        yield cst.SCALAR;
        yield* this.pushToIndex(nl + 1, true);
        return yield* this.parseLineStart();
      }
      *parsePlainScalar() {
        const inFlow = this.flowLevel > 0;
        let end = this.pos - 1;
        let i = this.pos - 1;
        let ch;
        while (ch = this.buffer[++i]) {
          if (ch === ":") {
            const next = this.buffer[i + 1];
            if (isEmpty(next) || inFlow && flowIndicatorChars.has(next))
              break;
            end = i;
          } else if (isEmpty(ch)) {
            let next = this.buffer[i + 1];
            if (ch === "\r") {
              if (next === "\n") {
                i += 1;
                ch = "\n";
                next = this.buffer[i + 1];
              } else
                end = i;
            }
            if (next === "#" || inFlow && flowIndicatorChars.has(next))
              break;
            if (ch === "\n") {
              const cs = this.continueScalar(i + 1);
              if (cs === -1)
                break;
              i = Math.max(i, cs - 2);
            }
          } else {
            if (inFlow && flowIndicatorChars.has(ch))
              break;
            end = i;
          }
        }
        if (!ch && !this.atEnd)
          return this.setNext("plain-scalar");
        yield cst.SCALAR;
        yield* this.pushToIndex(end + 1, true);
        return inFlow ? "flow" : "doc";
      }
      *pushCount(n) {
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos += n;
          return n;
        }
        return 0;
      }
      *pushToIndex(i, allowEmpty) {
        const s = this.buffer.slice(this.pos, i);
        if (s) {
          yield s;
          this.pos += s.length;
          return s.length;
        } else if (allowEmpty)
          yield "";
        return 0;
      }
      *pushIndicators() {
        let n = 0;
        loop: while (true) {
          switch (this.charAt(0)) {
            case "!":
              n += yield* this.pushTag();
              n += yield* this.pushSpaces(true);
              continue loop;
            case "&":
              n += yield* this.pushUntil(isNotAnchorChar);
              n += yield* this.pushSpaces(true);
              continue loop;
            case "-":
            // this is an error
            case "?":
            // this is an error outside flow collections
            case ":": {
              const inFlow = this.flowLevel > 0;
              const ch1 = this.charAt(1);
              if (isEmpty(ch1) || inFlow && flowIndicatorChars.has(ch1)) {
                if (!inFlow)
                  this.indentNext = this.indentValue + 1;
                else if (this.flowKey)
                  this.flowKey = false;
                n += yield* this.pushCount(1);
                n += yield* this.pushSpaces(true);
                continue loop;
              }
            }
          }
          break loop;
        }
        return n;
      }
      *pushTag() {
        if (this.charAt(1) === "<") {
          let i = this.pos + 2;
          let ch = this.buffer[i];
          while (!isEmpty(ch) && ch !== ">")
            ch = this.buffer[++i];
          return yield* this.pushToIndex(ch === ">" ? i + 1 : i, false);
        } else {
          let i = this.pos + 1;
          let ch = this.buffer[i];
          while (ch) {
            if (tagChars.has(ch))
              ch = this.buffer[++i];
            else if (ch === "%" && hexDigits.has(this.buffer[i + 1]) && hexDigits.has(this.buffer[i + 2])) {
              ch = this.buffer[i += 3];
            } else
              break;
          }
          return yield* this.pushToIndex(i, false);
        }
      }
      *pushNewline() {
        const ch = this.buffer[this.pos];
        if (ch === "\n")
          return yield* this.pushCount(1);
        else if (ch === "\r" && this.charAt(1) === "\n")
          return yield* this.pushCount(2);
        else
          return 0;
      }
      *pushSpaces(allowTabs) {
        let i = this.pos - 1;
        let ch;
        do {
          ch = this.buffer[++i];
        } while (ch === " " || allowTabs && ch === "	");
        const n = i - this.pos;
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos = i;
        }
        return n;
      }
      *pushUntil(test) {
        let i = this.pos;
        let ch = this.buffer[i];
        while (!test(ch))
          ch = this.buffer[++i];
        return yield* this.pushToIndex(i, false);
      }
    };
    exports.Lexer = Lexer;
  }
});

// node_modules/yaml/dist/parse/line-counter.js
var require_line_counter = __commonJS({
  "node_modules/yaml/dist/parse/line-counter.js"(exports) {
    "use strict";
    var LineCounter = class {
      constructor() {
        this.lineStarts = [];
        this.addNewLine = (offset) => this.lineStarts.push(offset);
        this.linePos = (offset) => {
          let low = 0;
          let high = this.lineStarts.length;
          while (low < high) {
            const mid = low + high >> 1;
            if (this.lineStarts[mid] < offset)
              low = mid + 1;
            else
              high = mid;
          }
          if (this.lineStarts[low] === offset)
            return { line: low + 1, col: 1 };
          if (low === 0)
            return { line: 0, col: offset };
          const start = this.lineStarts[low - 1];
          return { line: low, col: offset - start + 1 };
        };
      }
    };
    exports.LineCounter = LineCounter;
  }
});

// node_modules/yaml/dist/parse/parser.js
var require_parser = __commonJS({
  "node_modules/yaml/dist/parse/parser.js"(exports) {
    "use strict";
    var node_process = __require("process");
    var cst = require_cst();
    var lexer = require_lexer();
    function includesToken(list, type) {
      for (let i = 0; i < list.length; ++i)
        if (list[i].type === type)
          return true;
      return false;
    }
    function findNonEmptyIndex(list) {
      for (let i = 0; i < list.length; ++i) {
        switch (list[i].type) {
          case "space":
          case "comment":
          case "newline":
            break;
          default:
            return i;
        }
      }
      return -1;
    }
    function isFlowToken(token) {
      switch (token?.type) {
        case "alias":
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "flow-collection":
          return true;
        default:
          return false;
      }
    }
    function getPrevProps(parent) {
      switch (parent.type) {
        case "document":
          return parent.start;
        case "block-map": {
          const it = parent.items[parent.items.length - 1];
          return it.sep ?? it.start;
        }
        case "block-seq":
          return parent.items[parent.items.length - 1].start;
        /* istanbul ignore next should not happen */
        default:
          return [];
      }
    }
    function getFirstKeyStartProps(prev) {
      if (prev.length === 0)
        return [];
      let i = prev.length;
      loop: while (--i >= 0) {
        switch (prev[i].type) {
          case "doc-start":
          case "explicit-key-ind":
          case "map-value-ind":
          case "seq-item-ind":
          case "newline":
            break loop;
        }
      }
      while (prev[++i]?.type === "space") {
      }
      return prev.splice(i, prev.length);
    }
    function arrayPushArray(target, source) {
      if (source.length < 1e5)
        Array.prototype.push.apply(target, source);
      else
        for (let i = 0; i < source.length; ++i)
          target.push(source[i]);
    }
    function fixFlowSeqItems(fc) {
      if (fc.start.type === "flow-seq-start") {
        for (const it of fc.items) {
          if (it.sep && !it.value && !includesToken(it.start, "explicit-key-ind") && !includesToken(it.sep, "map-value-ind")) {
            if (it.key)
              it.value = it.key;
            delete it.key;
            if (isFlowToken(it.value)) {
              if (it.value.end)
                arrayPushArray(it.value.end, it.sep);
              else
                it.value.end = it.sep;
            } else
              arrayPushArray(it.start, it.sep);
            delete it.sep;
          }
        }
      }
    }
    var Parser = class {
      /**
       * @param onNewLine - If defined, called separately with the start position of
       *   each new line (in `parse()`, including the start of input).
       */
      constructor(onNewLine) {
        this.atNewLine = true;
        this.atScalar = false;
        this.indent = 0;
        this.offset = 0;
        this.onKeyLine = false;
        this.stack = [];
        this.source = "";
        this.type = "";
        this.lexer = new lexer.Lexer();
        this.onNewLine = onNewLine;
      }
      /**
       * Parse `source` as a YAML stream.
       * If `incomplete`, a part of the last line may be left as a buffer for the next call.
       *
       * Errors are not thrown, but yielded as `{ type: 'error', message }` tokens.
       *
       * @returns A generator of tokens representing each directive, document, and other structure.
       */
      *parse(source, incomplete = false) {
        if (this.onNewLine && this.offset === 0)
          this.onNewLine(0);
        for (const lexeme of this.lexer.lex(source, incomplete))
          yield* this.next(lexeme);
        if (!incomplete)
          yield* this.end();
      }
      /**
       * Advance the parser by the `source` of one lexical token.
       */
      *next(source) {
        this.source = source;
        if (node_process.env.LOG_TOKENS)
          console.log("|", cst.prettyToken(source));
        if (this.atScalar) {
          this.atScalar = false;
          yield* this.step();
          this.offset += source.length;
          return;
        }
        const type = cst.tokenType(source);
        if (!type) {
          const message = `Not a YAML token: ${source}`;
          yield* this.pop({ type: "error", offset: this.offset, message, source });
          this.offset += source.length;
        } else if (type === "scalar") {
          this.atNewLine = false;
          this.atScalar = true;
          this.type = "scalar";
        } else {
          this.type = type;
          yield* this.step();
          switch (type) {
            case "newline":
              this.atNewLine = true;
              this.indent = 0;
              if (this.onNewLine)
                this.onNewLine(this.offset + source.length);
              break;
            case "space":
              if (this.atNewLine && source[0] === " ")
                this.indent += source.length;
              break;
            case "explicit-key-ind":
            case "map-value-ind":
            case "seq-item-ind":
              if (this.atNewLine)
                this.indent += source.length;
              break;
            case "doc-mode":
            case "flow-error-end":
              return;
            default:
              this.atNewLine = false;
          }
          this.offset += source.length;
        }
      }
      /** Call at end of input to push out any remaining constructions */
      *end() {
        while (this.stack.length > 0)
          yield* this.pop();
      }
      get sourceToken() {
        const st = {
          type: this.type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
        return st;
      }
      *step() {
        const top = this.peek(1);
        if (this.type === "doc-end" && top?.type !== "doc-end") {
          while (this.stack.length > 0)
            yield* this.pop();
          this.stack.push({
            type: "doc-end",
            offset: this.offset,
            source: this.source
          });
          return;
        }
        if (!top)
          return yield* this.stream();
        switch (top.type) {
          case "document":
            return yield* this.document(top);
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return yield* this.scalar(top);
          case "block-scalar":
            return yield* this.blockScalar(top);
          case "block-map":
            return yield* this.blockMap(top);
          case "block-seq":
            return yield* this.blockSequence(top);
          case "flow-collection":
            return yield* this.flowCollection(top);
          case "doc-end":
            return yield* this.documentEnd(top);
        }
        yield* this.pop();
      }
      peek(n) {
        return this.stack[this.stack.length - n];
      }
      *pop(error) {
        const token = error ?? this.stack.pop();
        if (!token) {
          const message = "Tried to pop an empty stack";
          yield { type: "error", offset: this.offset, source: "", message };
        } else if (this.stack.length === 0) {
          yield token;
        } else {
          const top = this.peek(1);
          if (token.type === "block-scalar") {
            token.indent = "indent" in top ? top.indent : 0;
          } else if (token.type === "flow-collection" && top.type === "document") {
            token.indent = 0;
          }
          if (token.type === "flow-collection")
            fixFlowSeqItems(token);
          switch (top.type) {
            case "document":
              top.value = token;
              break;
            case "block-scalar":
              top.props.push(token);
              break;
            case "block-map": {
              const it = top.items[top.items.length - 1];
              if (it.value) {
                top.items.push({ start: [], key: token, sep: [] });
                this.onKeyLine = true;
                return;
              } else if (it.sep) {
                it.value = token;
              } else {
                Object.assign(it, { key: token, sep: [] });
                this.onKeyLine = !it.explicitKey;
                return;
              }
              break;
            }
            case "block-seq": {
              const it = top.items[top.items.length - 1];
              if (it.value)
                top.items.push({ start: [], value: token });
              else
                it.value = token;
              break;
            }
            case "flow-collection": {
              const it = top.items[top.items.length - 1];
              if (!it || it.value)
                top.items.push({ start: [], key: token, sep: [] });
              else if (it.sep)
                it.value = token;
              else
                Object.assign(it, { key: token, sep: [] });
              return;
            }
            /* istanbul ignore next should not happen */
            default:
              yield* this.pop();
              yield* this.pop(token);
          }
          if ((top.type === "document" || top.type === "block-map" || top.type === "block-seq") && (token.type === "block-map" || token.type === "block-seq")) {
            const last = token.items[token.items.length - 1];
            if (last && !last.sep && !last.value && last.start.length > 0 && findNonEmptyIndex(last.start) === -1 && (token.indent === 0 || last.start.every((st) => st.type !== "comment" || st.indent < token.indent))) {
              if (top.type === "document")
                top.end = last.start;
              else
                top.items.push({ start: last.start });
              token.items.splice(-1, 1);
            }
          }
        }
      }
      *stream() {
        switch (this.type) {
          case "directive-line":
            yield { type: "directive", offset: this.offset, source: this.source };
            return;
          case "byte-order-mark":
          case "space":
          case "comment":
          case "newline":
            yield this.sourceToken;
            return;
          case "doc-mode":
          case "doc-start": {
            const doc = {
              type: "document",
              offset: this.offset,
              start: []
            };
            if (this.type === "doc-start")
              doc.start.push(this.sourceToken);
            this.stack.push(doc);
            return;
          }
        }
        yield {
          type: "error",
          offset: this.offset,
          message: `Unexpected ${this.type} token in YAML stream`,
          source: this.source
        };
      }
      *document(doc) {
        if (doc.value)
          return yield* this.lineEnd(doc);
        switch (this.type) {
          case "doc-start": {
            if (findNonEmptyIndex(doc.start) !== -1) {
              yield* this.pop();
              yield* this.step();
            } else
              doc.start.push(this.sourceToken);
            return;
          }
          case "anchor":
          case "tag":
          case "space":
          case "comment":
          case "newline":
            doc.start.push(this.sourceToken);
            return;
        }
        const bv = this.startBlockValue(doc);
        if (bv)
          this.stack.push(bv);
        else {
          yield {
            type: "error",
            offset: this.offset,
            message: `Unexpected ${this.type} token in YAML document`,
            source: this.source
          };
        }
      }
      *scalar(scalar) {
        if (this.type === "map-value-ind") {
          const prev = getPrevProps(this.peek(2));
          const start = getFirstKeyStartProps(prev);
          let sep;
          if (scalar.end) {
            sep = scalar.end;
            sep.push(this.sourceToken);
            delete scalar.end;
          } else
            sep = [this.sourceToken];
          const map = {
            type: "block-map",
            offset: scalar.offset,
            indent: scalar.indent,
            items: [{ start, key: scalar, sep }]
          };
          this.onKeyLine = true;
          this.stack[this.stack.length - 1] = map;
        } else
          yield* this.lineEnd(scalar);
      }
      *blockScalar(scalar) {
        switch (this.type) {
          case "space":
          case "comment":
          case "newline":
            scalar.props.push(this.sourceToken);
            return;
          case "scalar":
            scalar.source = this.source;
            this.atNewLine = true;
            this.indent = 0;
            if (this.onNewLine) {
              let nl = this.source.indexOf("\n") + 1;
              while (nl !== 0) {
                this.onNewLine(this.offset + nl);
                nl = this.source.indexOf("\n", nl) + 1;
              }
            }
            yield* this.pop();
            break;
          /* istanbul ignore next should not happen */
          default:
            yield* this.pop();
            yield* this.step();
        }
      }
      *blockMap(map) {
        const it = map.items[map.items.length - 1];
        switch (this.type) {
          case "newline":
            this.onKeyLine = false;
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === "comment")
                end?.push(this.sourceToken);
              else
                map.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              it.start.push(this.sourceToken);
            }
            return;
          case "space":
          case "comment":
            if (it.value) {
              map.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              if (this.atIndentedComment(it.start, map.indent)) {
                const prev = map.items[map.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  arrayPushArray(end, it.start);
                  end.push(this.sourceToken);
                  map.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
        }
        if (this.indent >= map.indent) {
          const atMapIndent = !this.onKeyLine && this.indent === map.indent;
          const atNextItem = atMapIndent && (it.sep || it.explicitKey) && this.type !== "seq-item-ind";
          let start = [];
          if (atNextItem && it.sep && !it.value) {
            const nl = [];
            for (let i = 0; i < it.sep.length; ++i) {
              const st = it.sep[i];
              switch (st.type) {
                case "newline":
                  nl.push(i);
                  break;
                case "space":
                  break;
                case "comment":
                  if (st.indent > map.indent)
                    nl.length = 0;
                  break;
                default:
                  nl.length = 0;
              }
            }
            if (nl.length >= 2)
              start = it.sep.splice(nl[1]);
          }
          switch (this.type) {
            case "anchor":
            case "tag":
              if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map.items.push({ start });
                this.onKeyLine = true;
              } else if (it.sep) {
                it.sep.push(this.sourceToken);
              } else {
                it.start.push(this.sourceToken);
              }
              return;
            case "explicit-key-ind":
              if (!it.sep && !it.explicitKey) {
                it.start.push(this.sourceToken);
                it.explicitKey = true;
              } else if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map.items.push({ start, explicitKey: true });
              } else {
                this.stack.push({
                  type: "block-map",
                  offset: this.offset,
                  indent: this.indent,
                  items: [{ start: [this.sourceToken], explicitKey: true }]
                });
              }
              this.onKeyLine = true;
              return;
            case "map-value-ind":
              if (it.explicitKey) {
                if (!it.sep) {
                  if (includesToken(it.start, "newline")) {
                    Object.assign(it, { key: null, sep: [this.sourceToken] });
                  } else {
                    const start2 = getFirstKeyStartProps(it.start);
                    this.stack.push({
                      type: "block-map",
                      offset: this.offset,
                      indent: this.indent,
                      items: [{ start: start2, key: null, sep: [this.sourceToken] }]
                    });
                  }
                } else if (it.value) {
                  map.items.push({ start: [], key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start, key: null, sep: [this.sourceToken] }]
                  });
                } else if (isFlowToken(it.key) && !includesToken(it.sep, "newline")) {
                  const start2 = getFirstKeyStartProps(it.start);
                  const key2 = it.key;
                  const sep = it.sep;
                  sep.push(this.sourceToken);
                  delete it.key;
                  delete it.sep;
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: start2, key: key2, sep }]
                  });
                } else if (start.length > 0) {
                  it.sep = it.sep.concat(start, this.sourceToken);
                } else {
                  it.sep.push(this.sourceToken);
                }
              } else {
                if (!it.sep) {
                  Object.assign(it, { key: null, sep: [this.sourceToken] });
                } else if (it.value || atNextItem) {
                  map.items.push({ start, key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: [], key: null, sep: [this.sourceToken] }]
                  });
                } else {
                  it.sep.push(this.sourceToken);
                }
              }
              this.onKeyLine = true;
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs2 = this.flowScalar(this.type);
              if (atNextItem || it.value) {
                map.items.push({ start, key: fs2, sep: [] });
                this.onKeyLine = true;
              } else if (it.sep) {
                this.stack.push(fs2);
              } else {
                Object.assign(it, { key: fs2, sep: [] });
                this.onKeyLine = true;
              }
              return;
            }
            default: {
              const bv = this.startBlockValue(map);
              if (bv) {
                if (bv.type === "block-seq") {
                  if (!it.explicitKey && it.sep && !includesToken(it.sep, "newline")) {
                    yield* this.pop({
                      type: "error",
                      offset: this.offset,
                      message: "Unexpected block-seq-ind on same line with key",
                      source: this.source
                    });
                    return;
                  }
                } else if (atMapIndent) {
                  map.items.push({ start });
                }
                this.stack.push(bv);
                return;
              }
            }
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *blockSequence(seq) {
        const it = seq.items[seq.items.length - 1];
        switch (this.type) {
          case "newline":
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === "comment")
                end?.push(this.sourceToken);
              else
                seq.items.push({ start: [this.sourceToken] });
            } else
              it.start.push(this.sourceToken);
            return;
          case "space":
          case "comment":
            if (it.value)
              seq.items.push({ start: [this.sourceToken] });
            else {
              if (this.atIndentedComment(it.start, seq.indent)) {
                const prev = seq.items[seq.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  arrayPushArray(end, it.start);
                  end.push(this.sourceToken);
                  seq.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
          case "anchor":
          case "tag":
            if (it.value || this.indent <= seq.indent)
              break;
            it.start.push(this.sourceToken);
            return;
          case "seq-item-ind":
            if (this.indent !== seq.indent)
              break;
            if (it.value || includesToken(it.start, "seq-item-ind"))
              seq.items.push({ start: [this.sourceToken] });
            else
              it.start.push(this.sourceToken);
            return;
        }
        if (this.indent > seq.indent) {
          const bv = this.startBlockValue(seq);
          if (bv) {
            this.stack.push(bv);
            return;
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *flowCollection(fc) {
        const it = fc.items[fc.items.length - 1];
        if (this.type === "flow-error-end") {
          let top;
          do {
            yield* this.pop();
            top = this.peek(1);
          } while (top?.type === "flow-collection");
        } else if (fc.end.length === 0) {
          switch (this.type) {
            case "comma":
            case "explicit-key-ind":
              if (!it || it.sep)
                fc.items.push({ start: [this.sourceToken] });
              else
                it.start.push(this.sourceToken);
              return;
            case "map-value-ind":
              if (!it || it.value)
                fc.items.push({ start: [], key: null, sep: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                Object.assign(it, { key: null, sep: [this.sourceToken] });
              return;
            case "space":
            case "comment":
            case "newline":
            case "anchor":
            case "tag":
              if (!it || it.value)
                fc.items.push({ start: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                it.start.push(this.sourceToken);
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs2 = this.flowScalar(this.type);
              if (!it || it.value)
                fc.items.push({ start: [], key: fs2, sep: [] });
              else if (it.sep)
                this.stack.push(fs2);
              else
                Object.assign(it, { key: fs2, sep: [] });
              return;
            }
            case "flow-map-end":
            case "flow-seq-end":
              fc.end.push(this.sourceToken);
              return;
          }
          const bv = this.startBlockValue(fc);
          if (bv)
            this.stack.push(bv);
          else {
            yield* this.pop();
            yield* this.step();
          }
        } else {
          const parent = this.peek(2);
          if (parent.type === "block-map" && (this.type === "map-value-ind" && parent.indent === fc.indent || this.type === "newline" && !parent.items[parent.items.length - 1].sep)) {
            yield* this.pop();
            yield* this.step();
          } else if (this.type === "map-value-ind" && parent.type !== "flow-collection") {
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            fixFlowSeqItems(fc);
            const sep = fc.end.splice(1, fc.end.length);
            sep.push(this.sourceToken);
            const map = {
              type: "block-map",
              offset: fc.offset,
              indent: fc.indent,
              items: [{ start, key: fc, sep }]
            };
            this.onKeyLine = true;
            this.stack[this.stack.length - 1] = map;
          } else {
            yield* this.lineEnd(fc);
          }
        }
      }
      flowScalar(type) {
        if (this.onNewLine) {
          let nl = this.source.indexOf("\n") + 1;
          while (nl !== 0) {
            this.onNewLine(this.offset + nl);
            nl = this.source.indexOf("\n", nl) + 1;
          }
        }
        return {
          type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
      }
      startBlockValue(parent) {
        switch (this.type) {
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return this.flowScalar(this.type);
          case "block-scalar-header":
            return {
              type: "block-scalar",
              offset: this.offset,
              indent: this.indent,
              props: [this.sourceToken],
              source: ""
            };
          case "flow-map-start":
          case "flow-seq-start":
            return {
              type: "flow-collection",
              offset: this.offset,
              indent: this.indent,
              start: this.sourceToken,
              items: [],
              end: []
            };
          case "seq-item-ind":
            return {
              type: "block-seq",
              offset: this.offset,
              indent: this.indent,
              items: [{ start: [this.sourceToken] }]
            };
          case "explicit-key-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            start.push(this.sourceToken);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, explicitKey: true }]
            };
          }
          case "map-value-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, key: null, sep: [this.sourceToken] }]
            };
          }
        }
        return null;
      }
      atIndentedComment(start, indent) {
        if (this.type !== "comment")
          return false;
        if (this.indent <= indent)
          return false;
        return start.every((st) => st.type === "newline" || st.type === "space");
      }
      *documentEnd(docEnd) {
        if (this.type !== "doc-mode") {
          if (docEnd.end)
            docEnd.end.push(this.sourceToken);
          else
            docEnd.end = [this.sourceToken];
          if (this.type === "newline")
            yield* this.pop();
        }
      }
      *lineEnd(token) {
        switch (this.type) {
          case "comma":
          case "doc-start":
          case "doc-end":
          case "flow-seq-end":
          case "flow-map-end":
          case "map-value-ind":
            yield* this.pop();
            yield* this.step();
            break;
          case "newline":
            this.onKeyLine = false;
          // fallthrough
          case "space":
          case "comment":
          default:
            if (token.end)
              token.end.push(this.sourceToken);
            else
              token.end = [this.sourceToken];
            if (this.type === "newline")
              yield* this.pop();
        }
      }
    };
    exports.Parser = Parser;
  }
});

// node_modules/yaml/dist/public-api.js
var require_public_api = __commonJS({
  "node_modules/yaml/dist/public-api.js"(exports) {
    "use strict";
    var composer = require_composer();
    var Document = require_Document();
    var errors = require_errors();
    var log = require_log();
    var identity = require_identity();
    var lineCounter = require_line_counter();
    var parser = require_parser();
    function parseOptions2(options) {
      const prettyErrors = options.prettyErrors !== false;
      const lineCounter$1 = options.lineCounter || prettyErrors && new lineCounter.LineCounter() || null;
      return { lineCounter: lineCounter$1, prettyErrors };
    }
    function parseAllDocuments(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions2(options);
      const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      const docs = Array.from(composer$1.compose(parser$1.parse(source)));
      if (prettyErrors && lineCounter2)
        for (const doc of docs) {
          doc.errors.forEach(errors.prettifyError(source, lineCounter2));
          doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
        }
      if (docs.length > 0)
        return docs;
      return Object.assign([], { empty: true }, composer$1.streamInfo());
    }
    function parseDocument4(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions2(options);
      const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      let doc = null;
      for (const _doc of composer$1.compose(parser$1.parse(source), true, source.length)) {
        if (!doc)
          doc = _doc;
        else if (doc.options.logLevel !== "silent") {
          doc.errors.push(new errors.YAMLParseError(_doc.range.slice(0, 2), "MULTIPLE_DOCS", "Source contains multiple documents; please use YAML.parseAllDocuments()"));
          break;
        }
      }
      if (prettyErrors && lineCounter2) {
        doc.errors.forEach(errors.prettifyError(source, lineCounter2));
        doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
      }
      return doc;
    }
    function parse4(src, reviver, options) {
      let _reviver = void 0;
      if (typeof reviver === "function") {
        _reviver = reviver;
      } else if (options === void 0 && reviver && typeof reviver === "object") {
        options = reviver;
      }
      const doc = parseDocument4(src, options);
      if (!doc)
        return null;
      doc.warnings.forEach((warning) => log.warn(doc.options.logLevel, warning));
      if (doc.errors.length > 0) {
        if (doc.options.logLevel !== "silent")
          throw doc.errors[0];
        else
          doc.errors = [];
      }
      return doc.toJS(Object.assign({ reviver: _reviver }, options));
    }
    function stringify3(value, replacer, options) {
      let _replacer = null;
      if (typeof replacer === "function" || Array.isArray(replacer)) {
        _replacer = replacer;
      } else if (options === void 0 && replacer) {
        options = replacer;
      }
      if (typeof options === "string")
        options = options.length;
      if (typeof options === "number") {
        const indent = Math.round(options);
        options = indent < 1 ? void 0 : indent > 8 ? { indent: 8 } : { indent };
      }
      if (value === void 0) {
        const { keepUndefined } = options ?? replacer ?? {};
        if (!keepUndefined)
          return void 0;
      }
      if (identity.isDocument(value) && !_replacer)
        return value.toString(options);
      return new Document.Document(value, _replacer, options).toString(options);
    }
    exports.parse = parse4;
    exports.parseAllDocuments = parseAllDocuments;
    exports.parseDocument = parseDocument4;
    exports.stringify = stringify3;
  }
});

// node_modules/yaml/dist/index.js
var require_dist = __commonJS({
  "node_modules/yaml/dist/index.js"(exports) {
    "use strict";
    var composer = require_composer();
    var Document = require_Document();
    var Schema = require_Schema();
    var errors = require_errors();
    var Alias = require_Alias();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var cst = require_cst();
    var lexer = require_lexer();
    var lineCounter = require_line_counter();
    var parser = require_parser();
    var publicApi = require_public_api();
    var visit = require_visit();
    exports.Composer = composer.Composer;
    exports.Document = Document.Document;
    exports.Schema = Schema.Schema;
    exports.YAMLError = errors.YAMLError;
    exports.YAMLParseError = errors.YAMLParseError;
    exports.YAMLWarning = errors.YAMLWarning;
    exports.Alias = Alias.Alias;
    exports.isAlias = identity.isAlias;
    exports.isCollection = identity.isCollection;
    exports.isDocument = identity.isDocument;
    exports.isMap = identity.isMap;
    exports.isNode = identity.isNode;
    exports.isPair = identity.isPair;
    exports.isScalar = identity.isScalar;
    exports.isSeq = identity.isSeq;
    exports.Pair = Pair.Pair;
    exports.Scalar = Scalar.Scalar;
    exports.YAMLMap = YAMLMap.YAMLMap;
    exports.YAMLSeq = YAMLSeq.YAMLSeq;
    exports.CST = cst;
    exports.Lexer = lexer.Lexer;
    exports.LineCounter = lineCounter.LineCounter;
    exports.Parser = parser.Parser;
    exports.parse = publicApi.parse;
    exports.parseAllDocuments = publicApi.parseAllDocuments;
    exports.parseDocument = publicApi.parseDocument;
    exports.stringify = publicApi.stringify;
    exports.visit = visit.visit;
    exports.visitAsync = visit.visitAsync;
  }
});

// node_modules/semver/internal/constants.js
var require_constants = __commonJS({
  "node_modules/semver/internal/constants.js"(exports, module) {
    "use strict";
    var SEMVER_SPEC_VERSION = "2.0.0";
    var MAX_LENGTH = 256;
    var MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER || /* istanbul ignore next */
    9007199254740991;
    var MAX_SAFE_COMPONENT_LENGTH = 16;
    var MAX_SAFE_BUILD_LENGTH = MAX_LENGTH - 6;
    var WHITESPACE_CHARACTERS = [
      "	",
      "\n",
      "\v",
      "\f",
      "\r",
      " ",
      "\xA0",
      "\u1680",
      "\u2000",
      "\u2001",
      "\u2002",
      "\u2003",
      "\u2004",
      "\u2005",
      "\u2006",
      "\u2007",
      "\u2008",
      "\u2009",
      "\u200A",
      "\u2028",
      "\u2029",
      "\u202F",
      "\u205F",
      "\u3000",
      "\uFEFF"
    ];
    var RELEASE_TYPES = [
      "major",
      "premajor",
      "minor",
      "preminor",
      "patch",
      "prepatch",
      "prerelease"
    ];
    module.exports = {
      MAX_LENGTH,
      MAX_SAFE_COMPONENT_LENGTH,
      MAX_SAFE_BUILD_LENGTH,
      MAX_SAFE_INTEGER,
      WHITESPACE_CHARACTERS,
      RELEASE_TYPES,
      SEMVER_SPEC_VERSION,
      FLAG_INCLUDE_PRERELEASE: 1,
      FLAG_LOOSE: 2
    };
  }
});

// node_modules/semver/internal/debug.js
var require_debug = __commonJS({
  "node_modules/semver/internal/debug.js"(exports, module) {
    "use strict";
    var debug = typeof process === "object" && process.env && process.env.NODE_DEBUG && /\bsemver\b/i.test(process.env.NODE_DEBUG) ? (...args) => console.error("SEMVER", ...args) : () => {
    };
    module.exports = debug;
  }
});

// node_modules/semver/internal/re.js
var require_re = __commonJS({
  "node_modules/semver/internal/re.js"(exports, module) {
    "use strict";
    var {
      MAX_SAFE_COMPONENT_LENGTH,
      MAX_SAFE_BUILD_LENGTH,
      MAX_LENGTH
    } = require_constants();
    var debug = require_debug();
    exports = module.exports = {};
    var re = exports.re = [];
    var safeRe = exports.safeRe = [];
    var src = exports.src = [];
    var safeSrc = exports.safeSrc = [];
    var t = exports.t = {};
    var R = 0;
    var LETTERDASHNUMBER = "[a-zA-Z0-9-]";
    var safeRegexReplacements = [
      ["\\s", 1],
      ["\\d", MAX_LENGTH],
      [LETTERDASHNUMBER, MAX_SAFE_BUILD_LENGTH]
    ];
    var makeSafeRegex = (value) => {
      for (const [token, max] of safeRegexReplacements) {
        value = value.split(`${token}*`).join(`${token}{0,${max}}`).split(`${token}+`).join(`${token}{1,${max}}`);
      }
      return value;
    };
    var createToken = (name, value, isGlobal) => {
      const safe = makeSafeRegex(value);
      const index = R++;
      debug(name, index, value);
      t[name] = index;
      src[index] = value;
      safeSrc[index] = safe;
      re[index] = new RegExp(value, isGlobal ? "g" : void 0);
      safeRe[index] = new RegExp(safe, isGlobal ? "g" : void 0);
    };
    createToken("NUMERICIDENTIFIER", "0|[1-9]\\d*");
    createToken("NUMERICIDENTIFIERLOOSE", "\\d+");
    createToken("NONNUMERICIDENTIFIER", `\\d*[a-zA-Z-]${LETTERDASHNUMBER}*`);
    createToken("MAINVERSION", `(${src[t.NUMERICIDENTIFIER]})\\.(${src[t.NUMERICIDENTIFIER]})\\.(${src[t.NUMERICIDENTIFIER]})`);
    createToken("MAINVERSIONLOOSE", `(${src[t.NUMERICIDENTIFIERLOOSE]})\\.(${src[t.NUMERICIDENTIFIERLOOSE]})\\.(${src[t.NUMERICIDENTIFIERLOOSE]})`);
    createToken("PRERELEASEIDENTIFIER", `(?:${src[t.NONNUMERICIDENTIFIER]}|${src[t.NUMERICIDENTIFIER]})`);
    createToken("PRERELEASEIDENTIFIERLOOSE", `(?:${src[t.NONNUMERICIDENTIFIER]}|${src[t.NUMERICIDENTIFIERLOOSE]})`);
    createToken("PRERELEASE", `(?:-(${src[t.PRERELEASEIDENTIFIER]}(?:\\.${src[t.PRERELEASEIDENTIFIER]})*))`);
    createToken("PRERELEASELOOSE", `(?:-?(${src[t.PRERELEASEIDENTIFIERLOOSE]}(?:\\.${src[t.PRERELEASEIDENTIFIERLOOSE]})*))`);
    createToken("BUILDIDENTIFIER", `${LETTERDASHNUMBER}+`);
    createToken("BUILD", `(?:\\+(${src[t.BUILDIDENTIFIER]}(?:\\.${src[t.BUILDIDENTIFIER]})*))`);
    createToken("FULLPLAIN", `v?${src[t.MAINVERSION]}${src[t.PRERELEASE]}?${src[t.BUILD]}?`);
    createToken("FULL", `^${src[t.FULLPLAIN]}$`);
    createToken("LOOSEPLAIN", `[v=\\s]*${src[t.MAINVERSIONLOOSE]}${src[t.PRERELEASELOOSE]}?${src[t.BUILD]}?`);
    createToken("LOOSE", `^${src[t.LOOSEPLAIN]}$`);
    createToken("GTLT", "((?:<|>)?=?)");
    createToken("XRANGEIDENTIFIERLOOSE", `${src[t.NUMERICIDENTIFIERLOOSE]}|x|X|\\*`);
    createToken("XRANGEIDENTIFIER", `${src[t.NUMERICIDENTIFIER]}|x|X|\\*`);
    createToken("XRANGEPLAIN", `[v=\\s]*(${src[t.XRANGEIDENTIFIER]})(?:\\.(${src[t.XRANGEIDENTIFIER]})(?:\\.(${src[t.XRANGEIDENTIFIER]})(?:${src[t.PRERELEASE]})?${src[t.BUILD]}?)?)?`);
    createToken("XRANGEPLAINLOOSE", `[v=\\s]*(${src[t.XRANGEIDENTIFIERLOOSE]})(?:\\.(${src[t.XRANGEIDENTIFIERLOOSE]})(?:\\.(${src[t.XRANGEIDENTIFIERLOOSE]})(?:${src[t.PRERELEASELOOSE]})?${src[t.BUILD]}?)?)?`);
    createToken("XRANGE", `^${src[t.GTLT]}\\s*${src[t.XRANGEPLAIN]}$`);
    createToken("XRANGELOOSE", `^${src[t.GTLT]}\\s*${src[t.XRANGEPLAINLOOSE]}$`);
    createToken("COERCEPLAIN", `${"(^|[^\\d])(\\d{1,"}${MAX_SAFE_COMPONENT_LENGTH}})(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?`);
    createToken("COERCE", `${src[t.COERCEPLAIN]}(?:$|[^\\d])`);
    createToken("COERCEFULL", src[t.COERCEPLAIN] + `(?:${src[t.PRERELEASE]})?(?:${src[t.BUILD]})?(?:$|[^\\d])`);
    createToken("COERCERTL", src[t.COERCE], true);
    createToken("COERCERTLFULL", src[t.COERCEFULL], true);
    createToken("LONETILDE", "(?:~>?)");
    createToken("TILDETRIM", `(\\s*)${src[t.LONETILDE]}\\s+`, true);
    exports.tildeTrimReplace = "$1~";
    createToken("TILDE", `^${src[t.LONETILDE]}${src[t.XRANGEPLAIN]}$`);
    createToken("TILDELOOSE", `^${src[t.LONETILDE]}${src[t.XRANGEPLAINLOOSE]}$`);
    createToken("LONECARET", "(?:\\^)");
    createToken("CARETTRIM", `(\\s*)${src[t.LONECARET]}\\s+`, true);
    exports.caretTrimReplace = "$1^";
    createToken("CARET", `^${src[t.LONECARET]}${src[t.XRANGEPLAIN]}$`);
    createToken("CARETLOOSE", `^${src[t.LONECARET]}${src[t.XRANGEPLAINLOOSE]}$`);
    createToken("COMPARATORLOOSE", `^${src[t.GTLT]}\\s*(${src[t.LOOSEPLAIN]})$|^$`);
    createToken("COMPARATOR", `^${src[t.GTLT]}\\s*(${src[t.FULLPLAIN]})$|^$`);
    createToken("COMPARATORTRIM", `(\\s*)${src[t.GTLT]}\\s*(${src[t.LOOSEPLAIN]}|${src[t.XRANGEPLAIN]})`, true);
    exports.comparatorTrimReplace = "$1$2$3";
    createToken("HYPHENRANGE", `^\\s*(${src[t.XRANGEPLAIN]})\\s+-\\s+(${src[t.XRANGEPLAIN]})\\s*$`);
    createToken("HYPHENRANGELOOSE", `^\\s*(${src[t.XRANGEPLAINLOOSE]})\\s+-\\s+(${src[t.XRANGEPLAINLOOSE]})\\s*$`);
    createToken("STAR", "(<|>)?=?\\s*\\*");
    createToken("GTE0", "^\\s*>=\\s*0\\.0\\.0\\s*$");
    createToken("GTE0PRE", "^\\s*>=\\s*0\\.0\\.0-0\\s*$");
  }
});

// node_modules/semver/internal/parse-options.js
var require_parse_options = __commonJS({
  "node_modules/semver/internal/parse-options.js"(exports, module) {
    "use strict";
    var looseOption = Object.freeze({ loose: true });
    var emptyOpts = Object.freeze({});
    var parseOptions2 = (options) => {
      if (!options) {
        return emptyOpts;
      }
      if (typeof options !== "object") {
        return looseOption;
      }
      return options;
    };
    module.exports = parseOptions2;
  }
});

// node_modules/semver/internal/identifiers.js
var require_identifiers = __commonJS({
  "node_modules/semver/internal/identifiers.js"(exports, module) {
    "use strict";
    var numeric = /^[0-9]+$/;
    var compareIdentifiers = (a, b) => {
      if (typeof a === "number" && typeof b === "number") {
        return a === b ? 0 : a < b ? -1 : 1;
      }
      const anum = numeric.test(a);
      const bnum = numeric.test(b);
      if (anum && bnum) {
        a = +a;
        b = +b;
      }
      return a === b ? 0 : anum && !bnum ? -1 : bnum && !anum ? 1 : a < b ? -1 : 1;
    };
    var rcompareIdentifiers = (a, b) => compareIdentifiers(b, a);
    module.exports = {
      compareIdentifiers,
      rcompareIdentifiers
    };
  }
});

// node_modules/semver/classes/semver.js
var require_semver = __commonJS({
  "node_modules/semver/classes/semver.js"(exports, module) {
    "use strict";
    var debug = require_debug();
    var { MAX_LENGTH, MAX_SAFE_INTEGER } = require_constants();
    var { safeRe: re, t } = require_re();
    var parseOptions2 = require_parse_options();
    var { compareIdentifiers } = require_identifiers();
    var isPrereleaseIdentifier = (prerelease, identifier2) => {
      const identifiers = identifier2.split(".");
      if (identifiers.length > prerelease.length) {
        return false;
      }
      for (let i = 0; i < identifiers.length; i++) {
        if (compareIdentifiers(prerelease[i], identifiers[i]) !== 0) {
          return false;
        }
      }
      return true;
    };
    var SemVer = class _SemVer {
      constructor(version, options) {
        options = parseOptions2(options);
        if (version instanceof _SemVer) {
          if (version.loose === !!options.loose && version.includePrerelease === !!options.includePrerelease) {
            return version;
          } else {
            version = version.version;
          }
        } else if (typeof version !== "string") {
          throw new TypeError(`Invalid version. Must be a string. Got type "${typeof version}".`);
        }
        if (version.length > MAX_LENGTH) {
          throw new TypeError(
            `version is longer than ${MAX_LENGTH} characters`
          );
        }
        debug("SemVer", version, options);
        this.options = options;
        this.loose = !!options.loose;
        this.includePrerelease = !!options.includePrerelease;
        const m = version.trim().match(options.loose ? re[t.LOOSE] : re[t.FULL]);
        if (!m) {
          throw new TypeError(`Invalid Version: ${version}`);
        }
        this.raw = version;
        this.major = +m[1];
        this.minor = +m[2];
        this.patch = +m[3];
        if (this.major > MAX_SAFE_INTEGER || this.major < 0) {
          throw new TypeError("Invalid major version");
        }
        if (this.minor > MAX_SAFE_INTEGER || this.minor < 0) {
          throw new TypeError("Invalid minor version");
        }
        if (this.patch > MAX_SAFE_INTEGER || this.patch < 0) {
          throw new TypeError("Invalid patch version");
        }
        if (!m[4]) {
          this.prerelease = [];
        } else {
          this.prerelease = m[4].split(".").map((id) => {
            if (/^[0-9]+$/.test(id)) {
              const num = +id;
              if (num >= 0 && num < MAX_SAFE_INTEGER) {
                return num;
              }
            }
            return id;
          });
        }
        this.build = m[5] ? m[5].split(".") : [];
        this.format();
      }
      format() {
        this.version = `${this.major}.${this.minor}.${this.patch}`;
        if (this.prerelease.length) {
          this.version += `-${this.prerelease.join(".")}`;
        }
        return this.version;
      }
      toString() {
        return this.version;
      }
      compare(other) {
        debug("SemVer.compare", this.version, this.options, other);
        if (!(other instanceof _SemVer)) {
          if (typeof other === "string" && other === this.version) {
            return 0;
          }
          other = new _SemVer(other, this.options);
        }
        if (other.version === this.version) {
          return 0;
        }
        return this.compareMain(other) || this.comparePre(other);
      }
      compareMain(other) {
        if (!(other instanceof _SemVer)) {
          other = new _SemVer(other, this.options);
        }
        if (this.major < other.major) {
          return -1;
        }
        if (this.major > other.major) {
          return 1;
        }
        if (this.minor < other.minor) {
          return -1;
        }
        if (this.minor > other.minor) {
          return 1;
        }
        if (this.patch < other.patch) {
          return -1;
        }
        if (this.patch > other.patch) {
          return 1;
        }
        return 0;
      }
      comparePre(other) {
        if (!(other instanceof _SemVer)) {
          other = new _SemVer(other, this.options);
        }
        if (this.prerelease.length && !other.prerelease.length) {
          return -1;
        } else if (!this.prerelease.length && other.prerelease.length) {
          return 1;
        } else if (!this.prerelease.length && !other.prerelease.length) {
          return 0;
        }
        let i = 0;
        do {
          const a = this.prerelease[i];
          const b = other.prerelease[i];
          debug("prerelease compare", i, a, b);
          if (a === void 0 && b === void 0) {
            return 0;
          } else if (b === void 0) {
            return 1;
          } else if (a === void 0) {
            return -1;
          } else if (a === b) {
            continue;
          } else {
            return compareIdentifiers(a, b);
          }
        } while (++i);
      }
      compareBuild(other) {
        if (!(other instanceof _SemVer)) {
          other = new _SemVer(other, this.options);
        }
        let i = 0;
        do {
          const a = this.build[i];
          const b = other.build[i];
          debug("build compare", i, a, b);
          if (a === void 0 && b === void 0) {
            return 0;
          } else if (b === void 0) {
            return 1;
          } else if (a === void 0) {
            return -1;
          } else if (a === b) {
            continue;
          } else {
            return compareIdentifiers(a, b);
          }
        } while (++i);
      }
      // preminor will bump the version up to the next minor release, and immediately
      // down to pre-release. premajor and prepatch work the same way.
      inc(release, identifier2, identifierBase) {
        if (release.startsWith("pre")) {
          if (!identifier2 && identifierBase === false) {
            throw new Error("invalid increment argument: identifier is empty");
          }
          if (identifier2) {
            const match = `-${identifier2}`.match(this.options.loose ? re[t.PRERELEASELOOSE] : re[t.PRERELEASE]);
            if (!match || match[1] !== identifier2) {
              throw new Error(`invalid identifier: ${identifier2}`);
            }
          }
        }
        switch (release) {
          case "premajor":
            this.prerelease.length = 0;
            this.patch = 0;
            this.minor = 0;
            this.major++;
            this.inc("pre", identifier2, identifierBase);
            break;
          case "preminor":
            this.prerelease.length = 0;
            this.patch = 0;
            this.minor++;
            this.inc("pre", identifier2, identifierBase);
            break;
          case "prepatch":
            this.prerelease.length = 0;
            this.inc("patch", identifier2, identifierBase);
            this.inc("pre", identifier2, identifierBase);
            break;
          // If the input is a non-prerelease version, this acts the same as
          // prepatch.
          case "prerelease":
            if (this.prerelease.length === 0) {
              this.inc("patch", identifier2, identifierBase);
            }
            this.inc("pre", identifier2, identifierBase);
            break;
          case "release":
            if (this.prerelease.length === 0) {
              throw new Error(`version ${this.raw} is not a prerelease`);
            }
            this.prerelease.length = 0;
            break;
          case "major":
            if (this.minor !== 0 || this.patch !== 0 || this.prerelease.length === 0) {
              this.major++;
            }
            this.minor = 0;
            this.patch = 0;
            this.prerelease = [];
            break;
          case "minor":
            if (this.patch !== 0 || this.prerelease.length === 0) {
              this.minor++;
            }
            this.patch = 0;
            this.prerelease = [];
            break;
          case "patch":
            if (this.prerelease.length === 0) {
              this.patch++;
            }
            this.prerelease = [];
            break;
          // This probably shouldn't be used publicly.
          // 1.0.0 'pre' would become 1.0.0-0 which is the wrong direction.
          case "pre": {
            const base = Number(identifierBase) ? 1 : 0;
            if (this.prerelease.length === 0) {
              this.prerelease = [base];
            } else {
              let i = this.prerelease.length;
              while (--i >= 0) {
                if (typeof this.prerelease[i] === "number") {
                  this.prerelease[i]++;
                  i = -2;
                }
              }
              if (i === -1) {
                if (identifier2 === this.prerelease.join(".") && identifierBase === false) {
                  throw new Error("invalid increment argument: identifier already exists");
                }
                this.prerelease.push(base);
              }
            }
            if (identifier2) {
              let prerelease = [identifier2, base];
              if (identifierBase === false) {
                prerelease = [identifier2];
              }
              if (isPrereleaseIdentifier(this.prerelease, identifier2)) {
                const prereleaseBase = this.prerelease[identifier2.split(".").length];
                if (isNaN(prereleaseBase)) {
                  this.prerelease = prerelease;
                }
              } else {
                this.prerelease = prerelease;
              }
            }
            break;
          }
          default:
            throw new Error(`invalid increment argument: ${release}`);
        }
        this.raw = this.format();
        if (this.build.length) {
          this.raw += `+${this.build.join(".")}`;
        }
        return this;
      }
    };
    module.exports = SemVer;
  }
});

// node_modules/semver/functions/parse.js
var require_parse = __commonJS({
  "node_modules/semver/functions/parse.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var parse4 = (version, options, throwErrors = false) => {
      if (version instanceof SemVer) {
        return version;
      }
      try {
        return new SemVer(version, options);
      } catch (er) {
        if (!throwErrors) {
          return null;
        }
        throw er;
      }
    };
    module.exports = parse4;
  }
});

// node_modules/semver/functions/valid.js
var require_valid = __commonJS({
  "node_modules/semver/functions/valid.js"(exports, module) {
    "use strict";
    var parse4 = require_parse();
    var valid2 = (version, options) => {
      const v = parse4(version, options);
      return v ? v.version : null;
    };
    module.exports = valid2;
  }
});

// node_modules/semver/functions/clean.js
var require_clean = __commonJS({
  "node_modules/semver/functions/clean.js"(exports, module) {
    "use strict";
    var parse4 = require_parse();
    var clean2 = (version, options) => {
      const s = parse4(version.trim().replace(/^[=v]+/, ""), options);
      return s ? s.version : null;
    };
    module.exports = clean2;
  }
});

// node_modules/semver/functions/inc.js
var require_inc = __commonJS({
  "node_modules/semver/functions/inc.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var inc2 = (version, release, options, identifier2, identifierBase) => {
      if (typeof options === "string") {
        identifierBase = identifier2;
        identifier2 = options;
        options = void 0;
      }
      try {
        return new SemVer(
          version instanceof SemVer ? version.version : version,
          options
        ).inc(release, identifier2, identifierBase).version;
      } catch (er) {
        return null;
      }
    };
    module.exports = inc2;
  }
});

// node_modules/semver/functions/diff.js
var require_diff = __commonJS({
  "node_modules/semver/functions/diff.js"(exports, module) {
    "use strict";
    var parse4 = require_parse();
    var diff = (version1, version2) => {
      const v1 = parse4(version1, null, true);
      const v2 = parse4(version2, null, true);
      const comparison = v1.compare(v2);
      if (comparison === 0) {
        return null;
      }
      const v1Higher = comparison > 0;
      const highVersion = v1Higher ? v1 : v2;
      const lowVersion = v1Higher ? v2 : v1;
      const highHasPre = !!highVersion.prerelease.length;
      const lowHasPre = !!lowVersion.prerelease.length;
      if (lowHasPre && !highHasPre) {
        if (!lowVersion.patch && !lowVersion.minor) {
          return "major";
        }
        if (lowVersion.compareMain(highVersion) === 0) {
          if (lowVersion.minor && !lowVersion.patch) {
            return "minor";
          }
          return "patch";
        }
      }
      const prefix = highHasPre ? "pre" : "";
      if (v1.major !== v2.major) {
        return prefix + "major";
      }
      if (v1.minor !== v2.minor) {
        return prefix + "minor";
      }
      if (v1.patch !== v2.patch) {
        return prefix + "patch";
      }
      return "prerelease";
    };
    module.exports = diff;
  }
});

// node_modules/semver/functions/major.js
var require_major = __commonJS({
  "node_modules/semver/functions/major.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var major2 = (a, loose) => new SemVer(a, loose).major;
    module.exports = major2;
  }
});

// node_modules/semver/functions/minor.js
var require_minor = __commonJS({
  "node_modules/semver/functions/minor.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var minor2 = (a, loose) => new SemVer(a, loose).minor;
    module.exports = minor2;
  }
});

// node_modules/semver/functions/patch.js
var require_patch = __commonJS({
  "node_modules/semver/functions/patch.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var patch2 = (a, loose) => new SemVer(a, loose).patch;
    module.exports = patch2;
  }
});

// node_modules/semver/functions/prerelease.js
var require_prerelease = __commonJS({
  "node_modules/semver/functions/prerelease.js"(exports, module) {
    "use strict";
    var parse4 = require_parse();
    var prerelease = (version, options) => {
      const parsed = parse4(version, options);
      return parsed && parsed.prerelease.length ? parsed.prerelease : null;
    };
    module.exports = prerelease;
  }
});

// node_modules/semver/functions/compare.js
var require_compare = __commonJS({
  "node_modules/semver/functions/compare.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var compare3 = (a, b, loose) => new SemVer(a, loose).compare(new SemVer(b, loose));
    module.exports = compare3;
  }
});

// node_modules/semver/functions/rcompare.js
var require_rcompare = __commonJS({
  "node_modules/semver/functions/rcompare.js"(exports, module) {
    "use strict";
    var compare3 = require_compare();
    var rcompare2 = (a, b, loose) => compare3(b, a, loose);
    module.exports = rcompare2;
  }
});

// node_modules/semver/functions/compare-loose.js
var require_compare_loose = __commonJS({
  "node_modules/semver/functions/compare-loose.js"(exports, module) {
    "use strict";
    var compare3 = require_compare();
    var compareLoose = (a, b) => compare3(a, b, true);
    module.exports = compareLoose;
  }
});

// node_modules/semver/functions/compare-build.js
var require_compare_build = __commonJS({
  "node_modules/semver/functions/compare-build.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var compareBuild = (a, b, loose) => {
      const versionA = new SemVer(a, loose);
      const versionB = new SemVer(b, loose);
      return versionA.compare(versionB) || versionA.compareBuild(versionB);
    };
    module.exports = compareBuild;
  }
});

// node_modules/semver/functions/sort.js
var require_sort = __commonJS({
  "node_modules/semver/functions/sort.js"(exports, module) {
    "use strict";
    var compareBuild = require_compare_build();
    var sort = (list, loose) => list.sort((a, b) => compareBuild(a, b, loose));
    module.exports = sort;
  }
});

// node_modules/semver/functions/rsort.js
var require_rsort = __commonJS({
  "node_modules/semver/functions/rsort.js"(exports, module) {
    "use strict";
    var compareBuild = require_compare_build();
    var rsort = (list, loose) => list.sort((a, b) => compareBuild(b, a, loose));
    module.exports = rsort;
  }
});

// node_modules/semver/functions/gt.js
var require_gt = __commonJS({
  "node_modules/semver/functions/gt.js"(exports, module) {
    "use strict";
    var compare3 = require_compare();
    var gt2 = (a, b, loose) => compare3(a, b, loose) > 0;
    module.exports = gt2;
  }
});

// node_modules/semver/functions/lt.js
var require_lt = __commonJS({
  "node_modules/semver/functions/lt.js"(exports, module) {
    "use strict";
    var compare3 = require_compare();
    var lt2 = (a, b, loose) => compare3(a, b, loose) < 0;
    module.exports = lt2;
  }
});

// node_modules/semver/functions/eq.js
var require_eq = __commonJS({
  "node_modules/semver/functions/eq.js"(exports, module) {
    "use strict";
    var compare3 = require_compare();
    var eq2 = (a, b, loose) => compare3(a, b, loose) === 0;
    module.exports = eq2;
  }
});

// node_modules/semver/functions/neq.js
var require_neq = __commonJS({
  "node_modules/semver/functions/neq.js"(exports, module) {
    "use strict";
    var compare3 = require_compare();
    var neq = (a, b, loose) => compare3(a, b, loose) !== 0;
    module.exports = neq;
  }
});

// node_modules/semver/functions/gte.js
var require_gte = __commonJS({
  "node_modules/semver/functions/gte.js"(exports, module) {
    "use strict";
    var compare3 = require_compare();
    var gte = (a, b, loose) => compare3(a, b, loose) >= 0;
    module.exports = gte;
  }
});

// node_modules/semver/functions/lte.js
var require_lte = __commonJS({
  "node_modules/semver/functions/lte.js"(exports, module) {
    "use strict";
    var compare3 = require_compare();
    var lte = (a, b, loose) => compare3(a, b, loose) <= 0;
    module.exports = lte;
  }
});

// node_modules/semver/functions/cmp.js
var require_cmp = __commonJS({
  "node_modules/semver/functions/cmp.js"(exports, module) {
    "use strict";
    var eq2 = require_eq();
    var neq = require_neq();
    var gt2 = require_gt();
    var gte = require_gte();
    var lt2 = require_lt();
    var lte = require_lte();
    var cmp = (a, op, b, loose) => {
      switch (op) {
        case "===":
          if (typeof a === "object") {
            a = a.version;
          }
          if (typeof b === "object") {
            b = b.version;
          }
          return a === b;
        case "!==":
          if (typeof a === "object") {
            a = a.version;
          }
          if (typeof b === "object") {
            b = b.version;
          }
          return a !== b;
        case "":
        case "=":
        case "==":
          return eq2(a, b, loose);
        case "!=":
          return neq(a, b, loose);
        case ">":
          return gt2(a, b, loose);
        case ">=":
          return gte(a, b, loose);
        case "<":
          return lt2(a, b, loose);
        case "<=":
          return lte(a, b, loose);
        default:
          throw new TypeError(`Invalid operator: ${op}`);
      }
    };
    module.exports = cmp;
  }
});

// node_modules/semver/functions/coerce.js
var require_coerce = __commonJS({
  "node_modules/semver/functions/coerce.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var parse4 = require_parse();
    var { safeRe: re, t } = require_re();
    var coerce = (version, options) => {
      if (version instanceof SemVer) {
        return version;
      }
      if (typeof version === "number") {
        version = String(version);
      }
      if (typeof version !== "string") {
        return null;
      }
      options = options || {};
      let match = null;
      if (!options.rtl) {
        match = version.match(options.includePrerelease ? re[t.COERCEFULL] : re[t.COERCE]);
      } else {
        const coerceRtlRegex = options.includePrerelease ? re[t.COERCERTLFULL] : re[t.COERCERTL];
        let next;
        while ((next = coerceRtlRegex.exec(version)) && (!match || match.index + match[0].length !== version.length)) {
          if (!match || next.index + next[0].length !== match.index + match[0].length) {
            match = next;
          }
          coerceRtlRegex.lastIndex = next.index + next[1].length + next[2].length;
        }
        coerceRtlRegex.lastIndex = -1;
      }
      if (match === null) {
        return null;
      }
      const major2 = match[2];
      const minor2 = match[3] || "0";
      const patch2 = match[4] || "0";
      const prerelease = options.includePrerelease && match[5] ? `-${match[5]}` : "";
      const build = options.includePrerelease && match[6] ? `+${match[6]}` : "";
      return parse4(`${major2}.${minor2}.${patch2}${prerelease}${build}`, options);
    };
    module.exports = coerce;
  }
});

// node_modules/semver/functions/truncate.js
var require_truncate = __commonJS({
  "node_modules/semver/functions/truncate.js"(exports, module) {
    "use strict";
    var parse4 = require_parse();
    var constants3 = require_constants();
    var SemVer = require_semver();
    var truncate = (version, truncation, options) => {
      if (!constants3.RELEASE_TYPES.includes(truncation)) {
        return null;
      }
      const clonedVersion = cloneInputVersion(version, options);
      return clonedVersion && doTruncation(clonedVersion, truncation);
    };
    var cloneInputVersion = (version, options) => {
      const versionStringToParse = version instanceof SemVer ? version.version : version;
      return parse4(versionStringToParse, options);
    };
    var doTruncation = (version, truncation) => {
      if (isPrerelease(truncation)) {
        return version.version;
      }
      version.prerelease = [];
      switch (truncation) {
        case "major":
          version.minor = 0;
          version.patch = 0;
          break;
        case "minor":
          version.patch = 0;
          break;
      }
      return version.format();
    };
    var isPrerelease = (type) => {
      return type.startsWith("pre");
    };
    module.exports = truncate;
  }
});

// node_modules/semver/internal/lrucache.js
var require_lrucache = __commonJS({
  "node_modules/semver/internal/lrucache.js"(exports, module) {
    "use strict";
    var LRUCache = class {
      constructor() {
        this.max = 1e3;
        this.map = /* @__PURE__ */ new Map();
      }
      get(key2) {
        const value = this.map.get(key2);
        if (value === void 0) {
          return void 0;
        } else {
          this.map.delete(key2);
          this.map.set(key2, value);
          return value;
        }
      }
      delete(key2) {
        return this.map.delete(key2);
      }
      set(key2, value) {
        const deleted = this.delete(key2);
        if (!deleted && value !== void 0) {
          if (this.map.size >= this.max) {
            const firstKey = this.map.keys().next().value;
            this.delete(firstKey);
          }
          this.map.set(key2, value);
        }
        return this;
      }
    };
    module.exports = LRUCache;
  }
});

// node_modules/semver/internal/trim-comparator-whitespace.js
var require_trim_comparator_whitespace = __commonJS({
  "node_modules/semver/internal/trim-comparator-whitespace.js"(exports, module) {
    "use strict";
    var {
      MAX_LENGTH,
      MAX_SAFE_BUILD_LENGTH,
      WHITESPACE_CHARACTERS
    } = require_constants();
    var whitespace = new Uint8Array(65536);
    for (const char of WHITESPACE_CHARACTERS) {
      whitespace[char.charCodeAt(0)] = 1;
    }
    var isWhitespace = (char) => char !== void 0 && whitespace[char.charCodeAt(0)] === 1;
    var isVersionPrefix = (char) => char === "v" || char === "=" || isWhitespace(char);
    var isDigit2 = (char) => char !== void 0 && char >= "0" && char <= "9";
    var isLetter = (char) => char !== void 0 && (char >= "a" && char <= "z" || char >= "A" && char <= "Z");
    var isIdentifierCharacter = (char) => isDigit2(char) || isLetter(char) || char === "-";
    var isVersionStart = (char) => isDigit2(char) || char === "x" || char === "X" || char === "*";
    var findDigitsEndIndex = (range, start, limit, digitRuns) => {
      if (!isDigit2(range[start])) {
        return start;
      }
      if (start >= digitRuns.start && start < digitRuns.end) {
        return Math.min(start + limit, digitRuns.end);
      }
      if (start >= digitRuns.previousStart && start < digitRuns.previousEnd) {
        return Math.min(start + limit, digitRuns.previousEnd);
      }
      let end = start + 1;
      while (isDigit2(range[end])) {
        end++;
      }
      digitRuns.previousStart = digitRuns.start;
      digitRuns.previousEnd = digitRuns.end;
      digitRuns.start = start;
      digitRuns.end = end;
      return Math.min(start + limit, end);
    };
    var findVersionNumberEndIndex = (range, start, loose, digitRuns) => {
      if (!loose && range[start] === "0") {
        return start + 1;
      }
      return findDigitsEndIndex(range, start, loose ? MAX_LENGTH : MAX_LENGTH + 1, digitRuns);
    };
    var findPrereleaseIdentifierEndIndex = (range, start, loose, digitRuns) => {
      const digitsEnd = findDigitsEndIndex(range, start, MAX_LENGTH, digitRuns);
      if (isLetter(range[digitsEnd]) || range[digitsEnd] === "-") {
        let end = digitsEnd + 1;
        const limit = end + MAX_SAFE_BUILD_LENGTH;
        while (end < limit && isIdentifierCharacter(range[end])) {
          end++;
        }
        return end;
      }
      return findVersionNumberEndIndex(range, start, loose, digitRuns);
    };
    var findPrereleaseEndIndex = (range, start, loose, digitRuns) => {
      const hyphen = range[start] === "-";
      if (!loose && !hyphen) {
        return start;
      }
      const identifierStart = start + (hyphen ? 1 : 0);
      let end = findPrereleaseIdentifierEndIndex(range, identifierStart, loose, digitRuns);
      if (end === identifierStart) {
        if (!loose || !hyphen) {
          return start;
        }
        end = findPrereleaseIdentifierEndIndex(range, start, loose, digitRuns);
      }
      while (range[end] === ".") {
        const next = findPrereleaseIdentifierEndIndex(range, end + 1, loose, digitRuns);
        if (next === end + 1) {
          break;
        }
        end = next;
      }
      return end;
    };
    var findBuildIdentifierEndIndex = (range, start) => {
      let end = start;
      while (end - start < MAX_SAFE_BUILD_LENGTH && isIdentifierCharacter(range[end])) {
        end++;
      }
      return end;
    };
    var findBuildEndIndex = (range, start) => {
      if (range[start] !== "+") {
        return start;
      }
      let end = findBuildIdentifierEndIndex(range, start + 1);
      if (end === start + 1) {
        return start;
      }
      while (range[end] === ".") {
        const next = findBuildIdentifierEndIndex(range, end + 1);
        if (next === end + 1) {
          break;
        }
        end = next;
      }
      return end;
    };
    var findLooseFullVersionEndIndex = (range, start, digitRuns) => {
      let end = start;
      for (let component = 0; component < 3; component++) {
        const next = findVersionNumberEndIndex(range, end, true, digitRuns);
        if (next === end) {
          return start;
        }
        end = next;
        if (component < 2) {
          if (range[end] !== ".") {
            return start;
          }
          end++;
        }
      }
      const prereleaseEnd = findPrereleaseEndIndex(range, end, true, digitRuns);
      return findBuildEndIndex(range, prereleaseEnd);
    };
    var findPartialVersionComponentEndIndex = (range, start, digitRuns) => {
      if (isDigit2(range[start])) {
        return findVersionNumberEndIndex(range, start, false, digitRuns);
      }
      return isVersionStart(range[start]) ? start + 1 : start;
    };
    var findPartialVersionEndIndex = (range, start, digitRuns) => {
      let end = findPartialVersionComponentEndIndex(range, start, digitRuns);
      for (let component = 0; component < 2; component++) {
        if (range[end] !== ".") {
          return end;
        }
        const next = findPartialVersionComponentEndIndex(range, end + 1, digitRuns);
        if (next === end + 1) {
          return end;
        }
        end = next;
      }
      const prereleaseEnd = findPrereleaseEndIndex(range, end, false, digitRuns);
      return findBuildEndIndex(range, prereleaseEnd);
    };
    var findVersionEndIndex = (range, start, digitRuns) => {
      const fullVersionEnd = findLooseFullVersionEndIndex(range, start, digitRuns);
      return fullVersionEnd !== start ? fullVersionEnd : findPartialVersionEndIndex(range, start, digitRuns);
    };
    var findRemovableWhitespaceIndex = (range, matchStart) => {
      let position = matchStart;
      if (isWhitespace(range[position])) {
        position++;
      }
      if (range[position] === "<" || range[position] === ">") {
        position++;
      }
      if (range[position] === "=") {
        position++;
      }
      return isWhitespace(range[position]) ? position : -1;
    };
    var trimComparatorWhitespace = (range) => {
      let result3 = "";
      let copyFrom = 0;
      let cursor = 0;
      const digitRuns = { start: -1, end: -1, previousStart: -1, previousEnd: -1 };
      while (cursor < range.length) {
        const matchStart = cursor;
        if (range[cursor] === "<" || range[cursor] === ">") {
          cursor++;
        } else if (!isVersionPrefix(range[cursor]) && !isVersionStart(range[cursor])) {
          cursor++;
          continue;
        }
        while (cursor < range.length && isVersionPrefix(range[cursor])) {
          cursor++;
        }
        if (!isVersionStart(range[cursor])) {
          continue;
        }
        const whitespacePosition = findRemovableWhitespaceIndex(range, matchStart);
        if (whitespacePosition !== -1) {
          result3 += range.slice(copyFrom, whitespacePosition);
          copyFrom = whitespacePosition + 1;
        }
        cursor = findVersionEndIndex(range, cursor, digitRuns);
      }
      return result3 + range.slice(copyFrom);
    };
    module.exports = trimComparatorWhitespace;
  }
});

// node_modules/semver/classes/range.js
var require_range = __commonJS({
  "node_modules/semver/classes/range.js"(exports, module) {
    "use strict";
    var SPACE_CHARACTERS = /\s+/g;
    var Range = class _Range {
      constructor(range, options) {
        options = parseOptions2(options);
        if (range instanceof _Range) {
          if (range.loose === !!options.loose && range.includePrerelease === !!options.includePrerelease) {
            return range;
          } else {
            return new _Range(range.raw, options);
          }
        }
        if (range instanceof Comparator) {
          this.raw = range.value;
          this.set = [[range]];
          this.formatted = void 0;
          return this;
        }
        this.options = options;
        this.loose = !!options.loose;
        this.includePrerelease = !!options.includePrerelease;
        this.raw = range.trim().replace(SPACE_CHARACTERS, " ");
        this.set = this.raw.split("||").map((r) => this.parseRange(r.trim())).filter((c) => c.length);
        if (!this.set.length) {
          throw new TypeError(`Invalid SemVer Range: ${this.raw}`);
        }
        if (this.set.length > 1) {
          const first = this.set[0];
          this.set = this.set.filter((c) => !isNullSet(c[0]));
          if (this.set.length === 0) {
            this.set = [first];
          } else if (this.set.length > 1) {
            for (const c of this.set) {
              if (c.length === 1 && isAny(c[0])) {
                this.set = [c];
                break;
              }
            }
          }
        }
        this.formatted = void 0;
      }
      get range() {
        if (this.formatted === void 0) {
          this.formatted = "";
          for (let i = 0; i < this.set.length; i++) {
            if (i > 0) {
              this.formatted += "||";
            }
            const comps = this.set[i];
            for (let k = 0; k < comps.length; k++) {
              if (k > 0) {
                this.formatted += " ";
              }
              this.formatted += comps[k].toString().trim();
            }
          }
        }
        return this.formatted;
      }
      format() {
        return this.range;
      }
      toString() {
        return this.range;
      }
      parseRange(range) {
        range = range.replace(BUILDSTRIPRE, "");
        const memoOpts = (this.options.includePrerelease && FLAG_INCLUDE_PRERELEASE) | (this.options.loose && FLAG_LOOSE);
        const memoKey = memoOpts + ":" + range;
        const cached = cache.get(memoKey);
        if (cached) {
          return cached;
        }
        const loose = this.options.loose;
        const hr = loose ? re[t.HYPHENRANGELOOSE] : re[t.HYPHENRANGE];
        range = range.replace(hr, hyphenReplace(this.options.includePrerelease));
        debug("hyphen replace", range);
        range = trimComparatorWhitespace(range);
        debug("comparator trim", range);
        range = range.replace(re[t.TILDETRIM], tildeTrimReplace);
        debug("tilde trim", range);
        range = range.replace(re[t.CARETTRIM], caretTrimReplace);
        debug("caret trim", range);
        let rangeList = range.split(" ").map((comp) => parseComparator(comp, this.options)).join(" ").split(/\s+/).map((comp) => replaceGTE0(comp, this.options));
        if (loose) {
          rangeList = rangeList.filter((comp) => {
            debug("loose invalid filter", comp, this.options);
            return !!comp.match(re[t.COMPARATORLOOSE]);
          });
        }
        debug("range list", rangeList);
        const rangeMap = /* @__PURE__ */ new Map();
        const comparators = rangeList.map((comp) => new Comparator(comp, this.options));
        for (const comp of comparators) {
          if (isNullSet(comp)) {
            return [comp];
          }
          rangeMap.set(comp.value, comp);
        }
        if (rangeMap.size > 1 && rangeMap.has("")) {
          rangeMap.delete("");
        }
        const result3 = [...rangeMap.values()];
        cache.set(memoKey, result3);
        return result3;
      }
      intersects(range, options) {
        if (!(range instanceof _Range)) {
          throw new TypeError("a Range is required");
        }
        return this.set.some((thisComparators) => {
          return isSatisfiable(thisComparators, options) && range.set.some((rangeComparators) => {
            return isSatisfiable(rangeComparators, options) && thisComparators.every((thisComparator) => {
              return rangeComparators.every((rangeComparator) => {
                return thisComparator.intersects(rangeComparator, options);
              });
            });
          });
        });
      }
      // if ANY of the sets match ALL of its comparators, then pass
      test(version) {
        if (!version) {
          return false;
        }
        if (typeof version === "string") {
          try {
            version = new SemVer(version, this.options);
          } catch (er) {
            return false;
          }
        }
        for (let i = 0; i < this.set.length; i++) {
          if (testSet(this.set[i], version, this.options)) {
            return true;
          }
        }
        return false;
      }
    };
    module.exports = Range;
    var LRU = require_lrucache();
    var cache = new LRU();
    var parseOptions2 = require_parse_options();
    var Comparator = require_comparator();
    var debug = require_debug();
    var SemVer = require_semver();
    var trimComparatorWhitespace = require_trim_comparator_whitespace();
    var {
      safeRe: re,
      src,
      t,
      tildeTrimReplace,
      caretTrimReplace
    } = require_re();
    var { FLAG_INCLUDE_PRERELEASE, FLAG_LOOSE } = require_constants();
    var BUILDSTRIPRE = new RegExp(src[t.BUILD], "g");
    var isNullSet = (c) => c.value === "<0.0.0-0";
    var isAny = (c) => c.value === "";
    var isSatisfiable = (comparators, options) => {
      let result3 = true;
      const remainingComparators = comparators.slice();
      let testComparator = remainingComparators.pop();
      while (result3 && remainingComparators.length) {
        result3 = remainingComparators.every((otherComparator) => {
          return testComparator.intersects(otherComparator, options);
        });
        testComparator = remainingComparators.pop();
      }
      return result3;
    };
    var parseComparator = (comp, options) => {
      comp = comp.replace(re[t.BUILD], "");
      debug("comp", comp, options);
      comp = replaceCarets(comp, options);
      debug("caret", comp);
      comp = replaceTildes(comp, options);
      debug("tildes", comp);
      comp = replaceXRanges(comp, options);
      debug("xrange", comp);
      comp = replaceStars(comp, options);
      debug("stars", comp);
      return comp;
    };
    var isX = (id) => !id || id.toLowerCase() === "x" || id === "*";
    var invalidXRangeOrder = (M, m, p) => isX(M) && !isX(m) || isX(m) && p && !isX(p);
    var replaceTildes = (comp, options) => {
      return comp.trim().split(/\s+/).map((c) => replaceTilde(c, options)).join(" ");
    };
    var replaceTilde = (comp, options) => {
      const r = options.loose ? re[t.TILDELOOSE] : re[t.TILDE];
      const z = options.includePrerelease ? "-0" : "";
      return comp.replace(r, (_, M, m, p, pr) => {
        debug("tilde", comp, _, M, m, p, pr);
        let ret;
        if (isX(M)) {
          ret = "";
        } else if (isX(m)) {
          ret = `>=${M}.0.0${z} <${+M + 1}.0.0-0`;
        } else if (isX(p)) {
          ret = `>=${M}.${m}.0${z} <${M}.${+m + 1}.0-0`;
        } else if (pr) {
          debug("replaceTilde pr", pr);
          ret = `>=${M}.${m}.${p}-${pr} <${M}.${+m + 1}.0-0`;
        } else {
          ret = `>=${M}.${m}.${p} <${M}.${+m + 1}.0-0`;
        }
        debug("tilde return", ret);
        return ret;
      });
    };
    var replaceCarets = (comp, options) => {
      return comp.trim().split(/\s+/).map((c) => replaceCaret(c, options)).join(" ");
    };
    var replaceCaret = (comp, options) => {
      debug("caret", comp, options);
      const r = options.loose ? re[t.CARETLOOSE] : re[t.CARET];
      const z = options.includePrerelease ? "-0" : "";
      return comp.replace(r, (_, M, m, p, pr) => {
        debug("caret", comp, _, M, m, p, pr);
        let ret;
        if (isX(M)) {
          ret = "";
        } else if (isX(m)) {
          ret = `>=${M}.0.0${z} <${+M + 1}.0.0-0`;
        } else if (isX(p)) {
          if (M === "0") {
            ret = `>=${M}.${m}.0${z} <${M}.${+m + 1}.0-0`;
          } else {
            ret = `>=${M}.${m}.0${z} <${+M + 1}.0.0-0`;
          }
        } else if (pr) {
          debug("replaceCaret pr", pr);
          if (M === "0") {
            if (m === "0") {
              ret = `>=${M}.${m}.${p}-${pr} <${M}.${m}.${+p + 1}-0`;
            } else {
              ret = `>=${M}.${m}.${p}-${pr} <${M}.${+m + 1}.0-0`;
            }
          } else {
            ret = `>=${M}.${m}.${p}-${pr} <${+M + 1}.0.0-0`;
          }
        } else {
          debug("no pr");
          if (M === "0") {
            if (m === "0") {
              ret = `>=${M}.${m}.${p} <${M}.${m}.${+p + 1}-0`;
            } else {
              ret = `>=${M}.${m}.${p} <${M}.${+m + 1}.0-0`;
            }
          } else {
            ret = `>=${M}.${m}.${p} <${+M + 1}.0.0-0`;
          }
        }
        debug("caret return", ret);
        return ret;
      });
    };
    var replaceXRanges = (comp, options) => {
      debug("replaceXRanges", comp, options);
      return comp.split(/\s+/).map((c) => replaceXRange(c, options)).join(" ");
    };
    var replaceXRange = (comp, options) => {
      comp = comp.trim();
      const r = options.loose ? re[t.XRANGELOOSE] : re[t.XRANGE];
      return comp.replace(r, (ret, gtlt, M, m, p, pr) => {
        debug("xRange", comp, ret, gtlt, M, m, p, pr);
        if (invalidXRangeOrder(M, m, p)) {
          return comp;
        }
        const xM = isX(M);
        const xm = xM || isX(m);
        const xp = xm || isX(p);
        const anyX = xp;
        if (gtlt === "=" && anyX) {
          gtlt = "";
        }
        pr = options.includePrerelease ? "-0" : "";
        if (xM) {
          if (gtlt === ">" || gtlt === "<") {
            ret = "<0.0.0-0";
          } else {
            ret = "*";
          }
        } else if (gtlt && anyX) {
          if (xm) {
            m = 0;
          }
          p = 0;
          if (gtlt === ">") {
            gtlt = ">=";
            if (xm) {
              M = +M + 1;
              m = 0;
              p = 0;
            } else {
              m = +m + 1;
              p = 0;
            }
          } else if (gtlt === "<=") {
            gtlt = "<";
            if (xm) {
              M = +M + 1;
            } else {
              m = +m + 1;
            }
          }
          if (gtlt === "<") {
            pr = "-0";
          }
          ret = `${gtlt + M}.${m}.${p}${pr}`;
        } else if (xm) {
          ret = `>=${M}.0.0${pr} <${+M + 1}.0.0-0`;
        } else if (xp) {
          ret = `>=${M}.${m}.0${pr} <${M}.${+m + 1}.0-0`;
        }
        debug("xRange return", ret);
        return ret;
      });
    };
    var replaceStars = (comp, options) => {
      debug("replaceStars", comp, options);
      return comp.trim().replace(re[t.STAR], "");
    };
    var replaceGTE0 = (comp, options) => {
      debug("replaceGTE0", comp, options);
      return comp.trim().replace(re[options.includePrerelease ? t.GTE0PRE : t.GTE0], "");
    };
    var hyphenReplace = (incPr) => ($0, from, fM, fm, fp, fpr, fb, to, tM, tm, tp, tpr) => {
      if (isX(fM)) {
        from = "";
      } else if (isX(fm)) {
        from = `>=${fM}.0.0${incPr ? "-0" : ""}`;
      } else if (isX(fp)) {
        from = `>=${fM}.${fm}.0${incPr ? "-0" : ""}`;
      } else if (fpr) {
        from = `>=${from}`;
      } else {
        from = `>=${from}${incPr ? "-0" : ""}`;
      }
      if (isX(tM)) {
        to = "";
      } else if (isX(tm)) {
        to = `<${+tM + 1}.0.0-0`;
      } else if (isX(tp)) {
        to = `<${tM}.${+tm + 1}.0-0`;
      } else if (tpr) {
        to = `<=${tM}.${tm}.${tp}-${tpr}`;
      } else if (incPr) {
        to = `<${tM}.${tm}.${+tp + 1}-0`;
      } else {
        to = `<=${to}`;
      }
      return `${from} ${to}`.trim();
    };
    var testSet = (set, version, options) => {
      for (let i = 0; i < set.length; i++) {
        if (!set[i].test(version)) {
          return false;
        }
      }
      if (version.prerelease.length && !options.includePrerelease) {
        for (let i = 0; i < set.length; i++) {
          debug(set[i].semver);
          if (set[i].semver === Comparator.ANY) {
            continue;
          }
          if (set[i].semver.prerelease.length > 0) {
            const allowed = set[i].semver;
            if (allowed.major === version.major && allowed.minor === version.minor && allowed.patch === version.patch) {
              return true;
            }
          }
        }
        return false;
      }
      return true;
    };
  }
});

// node_modules/semver/classes/comparator.js
var require_comparator = __commonJS({
  "node_modules/semver/classes/comparator.js"(exports, module) {
    "use strict";
    var ANY = /* @__PURE__ */ Symbol("SemVer ANY");
    var Comparator = class _Comparator {
      static get ANY() {
        return ANY;
      }
      constructor(comp, options) {
        options = parseOptions2(options);
        if (comp instanceof _Comparator) {
          if (comp.loose === !!options.loose) {
            return comp;
          } else {
            comp = comp.value;
          }
        }
        comp = comp.trim().split(/\s+/).join(" ");
        debug("comparator", comp, options);
        this.options = options;
        this.loose = !!options.loose;
        this.parse(comp);
        if (this.semver === ANY) {
          this.value = "";
        } else {
          this.value = this.operator + this.semver.version;
        }
        debug("comp", this);
      }
      parse(comp) {
        const r = this.options.loose ? re[t.COMPARATORLOOSE] : re[t.COMPARATOR];
        const m = comp.match(r);
        if (!m) {
          throw new TypeError(`Invalid comparator: ${comp}`);
        }
        this.operator = m[1] !== void 0 ? m[1] : "";
        if (this.operator === "=") {
          this.operator = "";
        }
        if (!m[2]) {
          this.semver = ANY;
        } else {
          this.semver = new SemVer(m[2], this.options.loose);
        }
      }
      toString() {
        return this.value;
      }
      test(version) {
        debug("Comparator.test", version, this.options.loose);
        if (this.semver === ANY || version === ANY) {
          return true;
        }
        if (typeof version === "string") {
          try {
            version = new SemVer(version, this.options);
          } catch (er) {
            return false;
          }
        }
        return cmp(version, this.operator, this.semver, this.options);
      }
      intersects(comp, options) {
        if (!(comp instanceof _Comparator)) {
          throw new TypeError("a Comparator is required");
        }
        if (this.operator === "") {
          if (this.value === "") {
            return true;
          }
          return new Range(comp.value, options).test(this.value);
        } else if (comp.operator === "") {
          if (comp.value === "") {
            return true;
          }
          return new Range(this.value, options).test(comp.semver);
        }
        options = parseOptions2(options);
        if (options.includePrerelease && (this.value === "<0.0.0-0" || comp.value === "<0.0.0-0")) {
          return false;
        }
        if (!options.includePrerelease && (this.value.startsWith("<0.0.0") || comp.value.startsWith("<0.0.0"))) {
          return false;
        }
        if (this.operator.startsWith(">") && comp.operator.startsWith(">")) {
          return true;
        }
        if (this.operator.startsWith("<") && comp.operator.startsWith("<")) {
          return true;
        }
        if (this.semver.version === comp.semver.version && this.operator.includes("=") && comp.operator.includes("=")) {
          return true;
        }
        if (cmp(this.semver, "<", comp.semver, options) && this.operator.startsWith(">") && comp.operator.startsWith("<")) {
          return true;
        }
        if (cmp(this.semver, ">", comp.semver, options) && this.operator.startsWith("<") && comp.operator.startsWith(">")) {
          return true;
        }
        return false;
      }
    };
    module.exports = Comparator;
    var parseOptions2 = require_parse_options();
    var { safeRe: re, t } = require_re();
    var cmp = require_cmp();
    var debug = require_debug();
    var SemVer = require_semver();
    var Range = require_range();
  }
});

// node_modules/semver/functions/satisfies.js
var require_satisfies = __commonJS({
  "node_modules/semver/functions/satisfies.js"(exports, module) {
    "use strict";
    var Range = require_range();
    var satisfies2 = (version, range, options) => {
      try {
        range = new Range(range, options);
      } catch (er) {
        return false;
      }
      return range.test(version);
    };
    module.exports = satisfies2;
  }
});

// node_modules/semver/ranges/to-comparators.js
var require_to_comparators = __commonJS({
  "node_modules/semver/ranges/to-comparators.js"(exports, module) {
    "use strict";
    var Range = require_range();
    var toComparators = (range, options) => new Range(range, options).set.map((comp) => comp.map((c) => c.value).join(" ").trim().split(" "));
    module.exports = toComparators;
  }
});

// node_modules/semver/ranges/max-satisfying.js
var require_max_satisfying = __commonJS({
  "node_modules/semver/ranges/max-satisfying.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var Range = require_range();
    var maxSatisfying2 = (versions, range, options) => {
      let max = null;
      let maxSV = null;
      let rangeObj = null;
      try {
        rangeObj = new Range(range, options);
      } catch (er) {
        return null;
      }
      versions.forEach((v) => {
        if (rangeObj.test(v)) {
          if (!max || maxSV.compare(v) === -1) {
            max = v;
            maxSV = new SemVer(max, options);
          }
        }
      });
      return max;
    };
    module.exports = maxSatisfying2;
  }
});

// node_modules/semver/ranges/min-satisfying.js
var require_min_satisfying = __commonJS({
  "node_modules/semver/ranges/min-satisfying.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var Range = require_range();
    var minSatisfying2 = (versions, range, options) => {
      let min = null;
      let minSV = null;
      let rangeObj = null;
      try {
        rangeObj = new Range(range, options);
      } catch (er) {
        return null;
      }
      versions.forEach((v) => {
        if (rangeObj.test(v)) {
          if (!min || minSV.compare(v) === 1) {
            min = v;
            minSV = new SemVer(min, options);
          }
        }
      });
      return min;
    };
    module.exports = minSatisfying2;
  }
});

// node_modules/semver/ranges/min-version.js
var require_min_version = __commonJS({
  "node_modules/semver/ranges/min-version.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var Range = require_range();
    var gt2 = require_gt();
    var minVersion = (range, loose) => {
      range = new Range(range, loose);
      let minver = new SemVer("0.0.0");
      if (range.test(minver)) {
        return minver;
      }
      minver = new SemVer("0.0.0-0");
      if (range.test(minver)) {
        return minver;
      }
      minver = null;
      for (let i = 0; i < range.set.length; ++i) {
        const comparators = range.set[i];
        let setMin = null;
        comparators.forEach((comparator) => {
          const compver = new SemVer(comparator.semver.version);
          switch (comparator.operator) {
            case ">":
              if (compver.prerelease.length === 0) {
                compver.patch++;
              } else {
                compver.prerelease.push(0);
              }
              compver.raw = compver.format();
            /* fallthrough */
            case "":
            case ">=":
              if (!setMin || gt2(compver, setMin)) {
                setMin = compver;
              }
              break;
            case "<":
            case "<=":
              break;
            /* istanbul ignore next */
            default:
              throw new Error(`Unexpected operation: ${comparator.operator}`);
          }
        });
        if (setMin && (!minver || gt2(minver, setMin))) {
          minver = setMin;
        }
      }
      if (minver && range.test(minver)) {
        return minver;
      }
      return null;
    };
    module.exports = minVersion;
  }
});

// node_modules/semver/ranges/valid.js
var require_valid2 = __commonJS({
  "node_modules/semver/ranges/valid.js"(exports, module) {
    "use strict";
    var Range = require_range();
    var validRange2 = (range, options) => {
      try {
        return new Range(range, options).range || "*";
      } catch (er) {
        return null;
      }
    };
    module.exports = validRange2;
  }
});

// node_modules/semver/ranges/outside.js
var require_outside = __commonJS({
  "node_modules/semver/ranges/outside.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var Comparator = require_comparator();
    var { ANY } = Comparator;
    var Range = require_range();
    var satisfies2 = require_satisfies();
    var gt2 = require_gt();
    var lt2 = require_lt();
    var lte = require_lte();
    var gte = require_gte();
    var outside = (version, range, hilo, options) => {
      version = new SemVer(version, options);
      range = new Range(range, options);
      let gtfn, ltefn, ltfn, comp, ecomp;
      switch (hilo) {
        case ">":
          gtfn = gt2;
          ltefn = lte;
          ltfn = lt2;
          comp = ">";
          ecomp = ">=";
          break;
        case "<":
          gtfn = lt2;
          ltefn = gte;
          ltfn = gt2;
          comp = "<";
          ecomp = "<=";
          break;
        default:
          throw new TypeError('Must provide a hilo val of "<" or ">"');
      }
      if (satisfies2(version, range, options)) {
        return false;
      }
      for (let i = 0; i < range.set.length; ++i) {
        const comparators = range.set[i];
        let high = null;
        let low = null;
        comparators.forEach((comparator) => {
          if (comparator.semver === ANY) {
            comparator = new Comparator(">=0.0.0");
          }
          high = high || comparator;
          low = low || comparator;
          if (gtfn(comparator.semver, high.semver, options)) {
            high = comparator;
          } else if (ltfn(comparator.semver, low.semver, options)) {
            low = comparator;
          }
        });
        if (high.operator === comp || high.operator === ecomp) {
          return false;
        }
        if ((!low.operator || low.operator === comp) && ltefn(version, low.semver)) {
          return false;
        } else if (low.operator === ecomp && ltfn(version, low.semver)) {
          return false;
        }
      }
      return true;
    };
    module.exports = outside;
  }
});

// node_modules/semver/ranges/gtr.js
var require_gtr = __commonJS({
  "node_modules/semver/ranges/gtr.js"(exports, module) {
    "use strict";
    var outside = require_outside();
    var gtr = (version, range, options) => outside(version, range, ">", options);
    module.exports = gtr;
  }
});

// node_modules/semver/ranges/ltr.js
var require_ltr = __commonJS({
  "node_modules/semver/ranges/ltr.js"(exports, module) {
    "use strict";
    var outside = require_outside();
    var ltr = (version, range, options) => outside(version, range, "<", options);
    module.exports = ltr;
  }
});

// node_modules/semver/ranges/intersects.js
var require_intersects = __commonJS({
  "node_modules/semver/ranges/intersects.js"(exports, module) {
    "use strict";
    var Range = require_range();
    var intersects = (r1, r2, options) => {
      r1 = new Range(r1, options);
      r2 = new Range(r2, options);
      return r1.intersects(r2, options);
    };
    module.exports = intersects;
  }
});

// node_modules/semver/ranges/simplify.js
var require_simplify = __commonJS({
  "node_modules/semver/ranges/simplify.js"(exports, module) {
    "use strict";
    var satisfies2 = require_satisfies();
    var compare3 = require_compare();
    module.exports = (versions, range, options) => {
      const set = [];
      let first = null;
      let prev = null;
      const v = versions.sort((a, b) => compare3(a, b, options));
      for (const version of v) {
        const included = satisfies2(version, range, options);
        if (included) {
          prev = version;
          if (!first) {
            first = version;
          }
        } else {
          if (prev) {
            set.push([first, prev]);
          }
          prev = null;
          first = null;
        }
      }
      if (first) {
        set.push([first, null]);
      }
      const ranges = [];
      for (const [min, max] of set) {
        if (min === max) {
          ranges.push(min);
        } else if (!max && min === v[0]) {
          ranges.push("*");
        } else if (!max) {
          ranges.push(`>=${min}`);
        } else if (min === v[0]) {
          ranges.push(`<=${max}`);
        } else {
          ranges.push(`${min} - ${max}`);
        }
      }
      const simplified = ranges.join(" || ");
      const original = typeof range.raw === "string" ? range.raw : String(range);
      return simplified.length < original.length ? simplified : range;
    };
  }
});

// node_modules/semver/ranges/subset.js
var require_subset = __commonJS({
  "node_modules/semver/ranges/subset.js"(exports, module) {
    "use strict";
    var Range = require_range();
    var Comparator = require_comparator();
    var { ANY } = Comparator;
    var satisfies2 = require_satisfies();
    var compare3 = require_compare();
    var subset = (sub, dom, options = {}) => {
      if (sub === dom) {
        return true;
      }
      sub = new Range(sub, options);
      dom = new Range(dom, options);
      let sawNonNull = false;
      OUTER: for (const simpleSub of sub.set) {
        for (const simpleDom of dom.set) {
          const isSub = simpleSubset(simpleSub, simpleDom, options);
          sawNonNull = sawNonNull || isSub !== null;
          if (isSub) {
            continue OUTER;
          }
        }
        if (sawNonNull) {
          return false;
        }
      }
      return true;
    };
    var minimumVersionWithPreRelease = [new Comparator(">=0.0.0-0")];
    var minimumVersion = [new Comparator(">=0.0.0")];
    var simpleSubset = (sub, dom, options) => {
      if (sub === dom) {
        return true;
      }
      if (sub.length === 1 && sub[0].semver === ANY) {
        if (dom.length === 1 && dom[0].semver === ANY) {
          return true;
        } else if (options.includePrerelease) {
          sub = minimumVersionWithPreRelease;
        } else {
          sub = minimumVersion;
        }
      }
      if (dom.length === 1 && dom[0].semver === ANY) {
        if (options.includePrerelease) {
          return true;
        } else {
          dom = minimumVersion;
        }
      }
      const eqSet = /* @__PURE__ */ new Set();
      let gt2, lt2;
      for (const c of sub) {
        if (c.operator === ">" || c.operator === ">=") {
          gt2 = higherGT(gt2, c, options);
        } else if (c.operator === "<" || c.operator === "<=") {
          lt2 = lowerLT(lt2, c, options);
        } else {
          eqSet.add(c.semver);
        }
      }
      if (eqSet.size > 1) {
        return null;
      }
      let gtltComp;
      if (gt2 && lt2) {
        gtltComp = compare3(gt2.semver, lt2.semver, options);
        if (gtltComp > 0) {
          return null;
        } else if (gtltComp === 0 && (gt2.operator !== ">=" || lt2.operator !== "<=")) {
          return null;
        }
      }
      for (const eq2 of eqSet) {
        if (gt2 && !satisfies2(eq2, String(gt2), options)) {
          return null;
        }
        if (lt2 && !satisfies2(eq2, String(lt2), options)) {
          return null;
        }
        for (const c of dom) {
          if (!satisfies2(eq2, String(c), options)) {
            return false;
          }
        }
        return true;
      }
      let higher, lower;
      let hasDomLT, hasDomGT;
      let needDomLTPre = lt2 && !options.includePrerelease && lt2.semver.prerelease.length ? lt2.semver : false;
      let needDomGTPre = gt2 && !options.includePrerelease && gt2.semver.prerelease.length ? gt2.semver : false;
      if (needDomLTPre && needDomLTPre.prerelease.length === 1 && lt2.operator === "<" && needDomLTPre.prerelease[0] === 0) {
        needDomLTPre = false;
      }
      for (const c of dom) {
        hasDomGT = hasDomGT || c.operator === ">" || c.operator === ">=";
        hasDomLT = hasDomLT || c.operator === "<" || c.operator === "<=";
        if (gt2) {
          if (needDomGTPre) {
            if (c.semver.prerelease && c.semver.prerelease.length && c.semver.major === needDomGTPre.major && c.semver.minor === needDomGTPre.minor && c.semver.patch === needDomGTPre.patch) {
              needDomGTPre = false;
            }
          }
          if (c.operator === ">" || c.operator === ">=") {
            higher = higherGT(gt2, c, options);
            if (higher === c && higher !== gt2) {
              return false;
            }
          } else if (gt2.operator === ">=" && !c.test(gt2.semver)) {
            return false;
          }
        }
        if (lt2) {
          if (needDomLTPre) {
            if (c.semver.prerelease && c.semver.prerelease.length && c.semver.major === needDomLTPre.major && c.semver.minor === needDomLTPre.minor && c.semver.patch === needDomLTPre.patch) {
              needDomLTPre = false;
            }
          }
          if (c.operator === "<" || c.operator === "<=") {
            lower = lowerLT(lt2, c, options);
            if (lower === c && lower !== lt2) {
              return false;
            }
          } else if (lt2.operator === "<=" && !c.test(lt2.semver)) {
            return false;
          }
        }
        if (!c.operator && (lt2 || gt2) && gtltComp !== 0) {
          return false;
        }
      }
      if (gt2 && hasDomLT && !lt2 && gtltComp !== 0) {
        return false;
      }
      if (lt2 && hasDomGT && !gt2 && gtltComp !== 0) {
        return false;
      }
      if (needDomGTPre || needDomLTPre) {
        return false;
      }
      return true;
    };
    var higherGT = (a, b, options) => {
      if (!a) {
        return b;
      }
      const comp = compare3(a.semver, b.semver, options);
      return comp > 0 ? a : comp < 0 ? b : b.operator === ">" && a.operator === ">=" ? b : a;
    };
    var lowerLT = (a, b, options) => {
      if (!a) {
        return b;
      }
      const comp = compare3(a.semver, b.semver, options);
      return comp < 0 ? a : comp > 0 ? b : b.operator === "<" && a.operator === "<=" ? b : a;
    };
    module.exports = subset;
  }
});

// node_modules/semver/index.js
var require_semver2 = __commonJS({
  "node_modules/semver/index.js"(exports, module) {
    "use strict";
    var internalRe = require_re();
    var constants3 = require_constants();
    var SemVer = require_semver();
    var identifiers = require_identifiers();
    var parse4 = require_parse();
    var valid2 = require_valid();
    var clean2 = require_clean();
    var inc2 = require_inc();
    var diff = require_diff();
    var major2 = require_major();
    var minor2 = require_minor();
    var patch2 = require_patch();
    var prerelease = require_prerelease();
    var compare3 = require_compare();
    var rcompare2 = require_rcompare();
    var compareLoose = require_compare_loose();
    var compareBuild = require_compare_build();
    var sort = require_sort();
    var rsort = require_rsort();
    var gt2 = require_gt();
    var lt2 = require_lt();
    var eq2 = require_eq();
    var neq = require_neq();
    var gte = require_gte();
    var lte = require_lte();
    var cmp = require_cmp();
    var coerce = require_coerce();
    var truncate = require_truncate();
    var Comparator = require_comparator();
    var Range = require_range();
    var satisfies2 = require_satisfies();
    var toComparators = require_to_comparators();
    var maxSatisfying2 = require_max_satisfying();
    var minSatisfying2 = require_min_satisfying();
    var minVersion = require_min_version();
    var validRange2 = require_valid2();
    var outside = require_outside();
    var gtr = require_gtr();
    var ltr = require_ltr();
    var intersects = require_intersects();
    var simplifyRange = require_simplify();
    var subset = require_subset();
    module.exports = {
      parse: parse4,
      valid: valid2,
      clean: clean2,
      inc: inc2,
      diff,
      major: major2,
      minor: minor2,
      patch: patch2,
      prerelease,
      compare: compare3,
      rcompare: rcompare2,
      compareLoose,
      compareBuild,
      sort,
      rsort,
      gt: gt2,
      lt: lt2,
      eq: eq2,
      neq,
      gte,
      lte,
      cmp,
      coerce,
      truncate,
      Comparator,
      Range,
      satisfies: satisfies2,
      toComparators,
      maxSatisfying: maxSatisfying2,
      minSatisfying: minSatisfying2,
      minVersion,
      validRange: validRange2,
      outside,
      gtr,
      ltr,
      intersects,
      simplifyRange,
      subset,
      SemVer,
      re: internalRe.re,
      src: internalRe.src,
      tokens: internalRe.t,
      SEMVER_SPEC_VERSION: constants3.SEMVER_SPEC_VERSION,
      RELEASE_TYPES: constants3.RELEASE_TYPES,
      compareIdentifiers: identifiers.compareIdentifiers,
      rcompareIdentifiers: identifiers.rcompareIdentifiers
    };
  }
});

// src/cli.mjs
import { resolve as resolve2 } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

// src/doctor.mjs
import { realpath as realpath6, stat as stat3 } from "node:fs/promises";

// src/project.mjs
import { lstat as lstat2, realpath as realpath2 } from "node:fs/promises";
import path2 from "node:path";
import { homedir } from "node:os";

// node_modules/smol-toml/dist/error.js
function getLineColFromPtr(string, ptr) {
  let lines = string.slice(0, ptr).split(/\r?\n/);
  return [lines.length, lines.pop().length + 1];
}
function makeCodeBlock(string, line, column) {
  let lines = string.split(/\r?\n/);
  let codeblock = "";
  let numberLen = (Math.log10(line + 1) | 0) + 1;
  for (let i = line - 1; i <= line + 1; i++) {
    let l = lines[i - 1];
    if (!l)
      continue;
    codeblock += i.toString().padEnd(numberLen, " ");
    codeblock += ":  ";
    codeblock += l;
    codeblock += "\n";
    if (i === line) {
      codeblock += " ".repeat(numberLen + column + 2);
      codeblock += "^\n";
    }
  }
  return codeblock;
}
var TomlError = class _TomlError extends Error {
  line;
  column;
  codeblock;
  constructor(message, options) {
    const [line, column] = getLineColFromPtr(options.toml, options.ptr);
    const codeblock = makeCodeBlock(options.toml, line, column);
    super(`Invalid TOML document: ${message}

${codeblock}`, options);
    this.line = line;
    this.column = column;
    this.codeblock = codeblock;
  }
  /** @internal */
  static x(message, ctx, ptr) {
    throw new _TomlError(message, { toml: ctx.s, ptr: ptr ?? ctx.p });
  }
};

// node_modules/smol-toml/dist/primitive.js
function parseString(ctx) {
  let startPtr = ctx.p;
  let c = ctx.s.charCodeAt(ctx.p++);
  let first = c;
  let isLiteral = c === 39;
  let isMultiline = c === ctx.s.charCodeAt(ctx.p) && c === ctx.s.charCodeAt(ctx.p + 1);
  if (isMultiline) {
    if ((c = ctx.s.charCodeAt(ctx.p += 2)) === 10)
      ctx.p++;
    else if (c === 13 && ctx.s.charCodeAt(ctx.p + 1) === 10)
      ctx.p += 2;
  }
  let parsed = "";
  let sliceStart = ctx.p;
  let state = 0;
  for (; ctx.p < ctx.s.length; ctx.p++) {
    c = ctx.s.charCodeAt(ctx.p);
    if (isMultiline && (c === 10 || c === 13 && ctx.s.charCodeAt(ctx.p + 1) === 10)) {
      state = state && 3;
    } else if (c < 32 && c !== 9 || c === 127) {
      TomlError.x("control characters are not allowed in strings", ctx);
    } else if ((!state || state === 3) && c === first && (!isMultiline || ctx.s.charCodeAt(ctx.p + 1) === first && ctx.s.charCodeAt(ctx.p + 2) === first)) {
      if (isMultiline) {
        if (ctx.s.charCodeAt(ctx.p + 3) === first)
          ctx.p++;
        if (ctx.s.charCodeAt(ctx.p + 3) === first)
          ctx.p++;
      }
      if (!state) {
        let s = ctx.s.slice(sliceStart, ctx.p);
        parsed = parsed ? parsed + s : s;
      }
      ctx.p += isMultiline ? 3 : 1;
      return parsed;
    } else if (!state) {
      if (!isLiteral && c === 92) {
        parsed += ctx.s.slice(sliceStart, sliceStart = ctx.p);
        state = 1;
      }
    } else if (state === 1) {
      if (c === 120 || c === 117 || c === 85) {
        let errPtr = ctx.p++ - 1;
        let value = 0;
        let len = c === 120 ? 2 : c === 117 ? 4 : 8;
        for (let j = 0; j < len; j++, ctx.p++) {
          let hex = ctx.s.charCodeAt(ctx.p);
          let digit = (
            /* 0-9 */
            hex >= 48 && hex <= 57 ? hex - 48 : (
              /* A-F */
              hex >= 65 && hex <= 70 ? hex - 65 + 10 : (
                /* a-f */
                hex >= 97 && hex <= 102 ? hex - 97 + 10 : -1
              )
            )
          );
          if (digit < 0)
            TomlError.x("invalid non-hex character in unicode escape", ctx);
          value = value << 4 | digit;
        }
        if (value < 0 || value > 1114111 || value >= 55296 && value <= 57343) {
          TomlError.x("invalid unicode escape", ctx, errPtr);
        }
        parsed += String.fromCodePoint(value);
        sliceStart = ctx.p--;
        state = 0;
      } else if (isMultiline && (c === 32 || c === 9)) {
        state = 2;
      } else {
        if (c === 98)
          parsed += "\b";
        else if (c === 116)
          parsed += "	";
        else if (c === 110)
          parsed += "\n";
        else if (c === 102)
          parsed += "\f";
        else if (c === 114)
          parsed += "\r";
        else if (c === 101)
          parsed += "\x1B";
        else if (c === 34)
          parsed += '"';
        else if (c === 92)
          parsed += "\\";
        else
          TomlError.x("unrecognised escape sequence", ctx);
        sliceStart = ctx.p + 1;
        state = 0;
      }
    } else if (c !== 32 && c !== 9) {
      if (state === 2)
        TomlError.x("invalid escape: only line-ending whitespace may be escaped", ctx, sliceStart);
      state = !isLiteral && c === 92 ? 1 : 0;
      sliceStart = ctx.p;
    }
  }
  TomlError.x("unfinished string", ctx, startPtr);
}

// node_modules/smol-toml/dist/date.js
var DATE_TIME_RE = /^(\d{4}-\d{2}-\d{2})?[Tt ]?(?:(\d{2}):\d{2}(?::\d{2}(?:\.\d+)?)?)?(Z|z|[-+]\d{2}:\d{2})?$/i;
var TomlDate = class _TomlDate extends Date {
  #hasDate = false;
  #hasTime = false;
  #offset = null;
  constructor(date, fasttype, unsafeDelim) {
    let hasDate = true;
    let hasTime = true;
    let offset = "Z";
    let c;
    if (typeof date === "string") {
      if (fasttype)
        prep: {
          if (fasttype < 3) {
            if (+date.slice(11, 13) > 23) {
              date = "";
              break prep;
            }
            if (fasttype === 2) {
              offset = null;
              date += "Z";
            } else if ((c = date.charCodeAt(date.length - 1)) !== 90 && c !== 122) {
              offset = date.slice(date.length - 6);
            }
            if (unsafeDelim)
              date = date.slice(0, 10) + "T" + date.slice(11);
          } else if (fasttype === 4) {
            date = +date.slice(0, 2) > 23 ? "" : `0000-01-01T${date}Z`;
          }
          hasDate = fasttype !== 4;
          hasTime = fasttype !== 3;
        }
      else {
        let match = date.match(DATE_TIME_RE);
        if (match) {
          if (!match[1]) {
            hasDate = false;
            date = `0000-01-01T${date}`;
          }
          hasTime = !!match[2];
          hasTime && date[10] === " " && (date = date.replace(" ", "T"));
          if (match[2] && +match[2] > 23) {
            date = "";
          } else {
            offset = match[3] || null;
            if (!offset && hasTime)
              date += "Z";
          }
        } else {
          date = "";
        }
      }
    }
    super(date);
    if (!isNaN(this.getTime())) {
      this.#hasDate = hasDate;
      this.#hasTime = hasTime;
      this.#offset = offset;
    }
  }
  isDateTime() {
    return this.#hasDate && this.#hasTime;
  }
  isLocal() {
    return !this.#hasDate || !this.#hasTime || !this.#offset;
  }
  isDate() {
    return this.#hasDate && !this.#hasTime;
  }
  isTime() {
    return this.#hasTime && !this.#hasDate;
  }
  isValid() {
    return this.#hasDate || this.#hasTime;
  }
  toISOString() {
    let iso = super.toISOString();
    if (this.isDate())
      return iso.slice(0, 10);
    if (this.isTime())
      return iso.slice(11, 23);
    if (this.#offset === null)
      return iso.slice(0, -1);
    if (this.#offset === "Z" || this.#offset === "z")
      return iso;
    let offset = +this.#offset.slice(1, 3) * 60 + +this.#offset.slice(4, 6);
    offset = this.#offset[0] === "-" ? offset : -offset;
    let offsetDate = new Date(this.getTime() - offset * 6e4);
    return offsetDate.toISOString().slice(0, -1) + this.#offset;
  }
  static wrapAsOffsetDateTime(jsDate, offset = "Z") {
    let date = new _TomlDate(jsDate);
    date.#offset = offset;
    return date;
  }
  static wrapAsLocalDateTime(jsDate) {
    let date = new _TomlDate(jsDate);
    date.#offset = null;
    return date;
  }
  static wrapAsLocalDate(jsDate) {
    let date = new _TomlDate(jsDate);
    date.#hasTime = false;
    date.#offset = null;
    return date;
  }
  static wrapAsLocalTime(jsDate) {
    let date = new _TomlDate(jsDate);
    date.#hasDate = false;
    date.#offset = null;
    return date;
  }
};

// node_modules/smol-toml/dist/extract.js
function isDigit(char, base = 10) {
  return base === 16 ? char > 47 && char < 58 || char > 64 && char < 71 || char > 96 && char < 103 : char > 47 && char < 48 + base;
}
function isEndOfValue(char, delim) {
  return char === 32 || char === 9 || char === 10 || char === 13 || // Structure end or next value delimiter
  delim && (char === delim || char === 44) || // Comment
  char === 35;
}
function extractValue(ctx, end) {
  let errPtr = ctx.p;
  let c = ctx.s.charCodeAt(ctx.p);
  if (c === 91 || c === 123) {
    ctx.d-- || TomlError.x("document contains excessively nested structures. aborting.", ctx);
    let value = c === 91 ? parseArray(ctx) : parseInlineTable(ctx);
    ctx.d++;
    return value;
  }
  if (c === 34 || c === 39) {
    return parseString(ctx);
  }
  if (c === 116) {
    if (ctx.s.charCodeAt(++ctx.p) !== 114 || ctx.s.charCodeAt(++ctx.p) !== 117 || ctx.s.charCodeAt(++ctx.p) !== 101)
      TomlError.x("invalid value", ctx, errPtr);
    return ctx.p++, true;
  }
  if (c === 102) {
    if (ctx.s.charCodeAt(++ctx.p) !== 97 || ctx.s.charCodeAt(++ctx.p) !== 108 || ctx.s.charCodeAt(++ctx.p) !== 115 || ctx.s.charCodeAt(++ctx.p) !== 101)
      TomlError.x("invalid value", ctx, errPtr);
    return ctx.p++, false;
  }
  if (c === 43 || c === 45) {
    return parseNumber(ctx, ctx.p, ctx.s.charCodeAt(++ctx.p), 44 - c, end);
  }
  if (ctx.s.charCodeAt(ctx.p + 4) === 45 && ctx.s.charCodeAt(ctx.p + 7) === 45) {
    return parseDate(ctx, c, end);
  }
  if (ctx.s.charCodeAt(ctx.p + 2) === 58) {
    return parseTime(ctx, c, end);
  }
  return parseNumber(ctx, ctx.p, c, 0, end);
}
function parseNumber(ctx, startPtr, startChr, sign, endChr) {
  let c = startChr;
  let state = 0;
  let hasUnderscores = false;
  if (c === 105) {
    if (ctx.s.charCodeAt(++ctx.p) !== 110 || ctx.s.charCodeAt(++ctx.p) !== 102)
      TomlError.x("invalid value", ctx, startPtr);
    return ctx.p++, (sign || 1) / 0;
  }
  if (c === 110) {
    if (ctx.s.charCodeAt(++ctx.p) !== 97 || ctx.s.charCodeAt(++ctx.p) !== 110)
      TomlError.x("invalid value", ctx, startPtr);
    return ctx.p++, NaN;
  }
  if (c === 48) {
    if (++ctx.p >= ctx.s.length || isEndOfValue(c = ctx.s.charCodeAt(ctx.p), endChr))
      return ctx.bi === true ? 0n : 0;
    if (!sign) {
      if (c === 120)
        return parseIntegerBaseN(ctx, startPtr, 16, endChr);
      else if (c === 98)
        return parseIntegerBaseN(ctx, startPtr, 2, endChr);
      else if (c === 111)
        return parseIntegerBaseN(ctx, startPtr, 8, endChr);
    }
    if (c === 46)
      state = 2;
    else if (c === 101 || c === 69)
      state = 4;
    else
      TomlError.x("illegal leading zero", ctx, startPtr);
  } else if (!isDigit(c))
    TomlError.x("invalid value", ctx, startPtr);
  while (++ctx.p < ctx.s.length && (c = ctx.s.charCodeAt(ctx.p), !isEndOfValue(c, endChr))) {
    if (!state)
      state = 1;
    if (c === 95) {
      if (!(state & 1))
        TomlError.x("illegal underscore", ctx);
      state += 11;
      hasUnderscores = true;
    } else if (state === 1 && c === 46)
      state = 2;
    else if ((state === 1 || state === 3) && (c === 101 || c === 69))
      state = 4;
    else if (state === 4 && (c === 43 || c === 45)) {
      state = 6;
    } else if (!isDigit(c))
      TomlError.x(`illegal character in numeric literal`, ctx);
    else if (state > 9)
      state -= 11;
    else if (!(state & 1))
      state++;
  }
  if (!state) {
    let val = (startChr - 48) * (sign || 1);
    return ctx.bi === true ? BigInt(val) : val;
  }
  if (!(state & 1))
    TomlError.x("unfinished numeric value", ctx, startPtr);
  let str = ctx.s.slice(startPtr, ctx.p);
  if (hasUnderscores)
    str = str.replaceAll("_", "");
  return state > 1 ? parseFloat(str) : parseInteger(ctx, str, 10, startPtr);
}
function parseIntegerBaseN(ctx, startPtr, base, endChr) {
  let c, underscore = 1;
  while (++ctx.p < ctx.s.length && (c = ctx.s.charCodeAt(ctx.p), !isEndOfValue(c, endChr))) {
    if (c === 95) {
      if (underscore & 1)
        TomlError.x("illegal underscore", ctx);
      underscore = 3;
    } else if (!isDigit(c, base))
      TomlError.x(`illegal character in numeric literal`, ctx);
    else if (underscore & 1)
      underscore--;
  }
  if (underscore & 1)
    TomlError.x("unfinished numeric value", ctx);
  let str = ctx.s.slice(startPtr + 2, ctx.p);
  if (underscore)
    str = str.replaceAll("_", "");
  return parseInteger(ctx, str, base, startPtr);
}
function parseInteger(ctx, str, base, startPtr) {
  if (ctx.bi !== true)
    int: {
      let val = parseInt(str, base);
      if (!Number.isSafeInteger(val)) {
        if (ctx.bi)
          break int;
        TomlError.x("integer value cannot be represented losslessly", ctx, startPtr);
      }
      return val;
    }
  return base === 10 ? BigInt(str) : BigInt((base === 2 ? "0b" : base === 8 ? "0o" : "0x") + str);
}
function parseDate(ctx, c, endChr) {
  let startPtr = ctx.p++, unsafeSeparator;
  if (!isDigit(c) || !isDigit(ctx.s.charCodeAt(ctx.p++)) || !isDigit(ctx.s.charCodeAt(ctx.p++)) || !isDigit(ctx.s.charCodeAt(ctx.p++))) {
    return parseNumber(ctx, ctx.p = startPtr, c, 0, endChr);
  }
  ctx.p += 5;
  if (!isDigit(ctx.s.charCodeAt(ctx.p++)))
    TomlError.x("invalid date-time: date part is malformed", ctx, startPtr);
  if (ctx.p >= ctx.s.length || ((c = ctx.s.charCodeAt(ctx.p)) !== 32 || (unsafeSeparator = true, !isDigit(ctx.s.charCodeAt(ctx.p + 1)))) && c !== 84 && c !== 116) {
    let t2 = ctx.s.slice(startPtr, ctx.p);
    return readDate(ctx, t2, 3, false, startPtr);
  }
  if (ctx.s.charCodeAt(ctx.p += 3) !== 58)
    TomlError.x("invalid date-time: time part is malformed", ctx, startPtr);
  if (ctx.s.charCodeAt(ctx.p += 3) === 58)
    ctx.p += 3;
  if (ctx.s.charCodeAt(ctx.p) === 46)
    while (isDigit(ctx.s.charCodeAt(++ctx.p)))
      ;
  if (c = ctx.s.charCodeAt(ctx.p)) {
    if (c === 90 || c === 122) {
      let t2 = ctx.s.slice(startPtr, ++ctx.p);
      return readDate(ctx, t2, 1, unsafeSeparator, startPtr, "[+00:00]");
    }
    if (c === 43 || c === 45) {
      let t2 = ctx.s.slice(startPtr, ctx.p += 6);
      return readDate(ctx, t2, 1, unsafeSeparator, startPtr, !ctx.ld && "[" + ctx.s.slice(ctx.p - 6, ctx.p) + "]");
    }
  }
  let t = ctx.s.slice(startPtr, ctx.p);
  return readDate(ctx, t, 2, unsafeSeparator, startPtr);
}
function parseTime(ctx, c, endChr) {
  let start = ctx.p;
  if (!isDigit(c) || !isDigit(ctx.s.charCodeAt(++ctx.p))) {
    return parseNumber(ctx, --ctx.p, c, 0, endChr);
  }
  if (ctx.s.charCodeAt(ctx.p += 4) === 58)
    ctx.p += 3;
  if (ctx.s.charCodeAt(ctx.p) === 46)
    while (isDigit(ctx.s.charCodeAt(++ctx.p)))
      ;
  let t = ctx.s.slice(start, ctx.p);
  return readDate(ctx, t, 4, false, start);
}
function readDate(ctx, str, type, unsafeDelim, errPtr, temporalSuffix) {
  if (ctx.ld) {
    let date = new TomlDate(str, type, unsafeDelim);
    if (!date.isValid())
      TomlError.x("invalid date", ctx, errPtr);
    return date;
  }
  try {
    if (temporalSuffix)
      str += temporalSuffix;
    switch (type) {
      case 1:
        return Temporal.ZonedDateTime.from(str);
      case 2:
        return Temporal.PlainDateTime.from(str);
      case 3:
        return Temporal.PlainDate.from(str);
      case 4:
        return Temporal.PlainTime.from(str);
    }
  } catch (e) {
    TomlError.x(e instanceof Error ? e.message : "" + e, ctx, errPtr);
  }
}

// node_modules/smol-toml/dist/util.js
function skipComment(ctx) {
  for (; ctx.p < ctx.s.length; ctx.p++) {
    let c = ctx.s.charCodeAt(ctx.p);
    if (c === 10)
      break;
    if (c === 13 && ctx.s.charCodeAt(ctx.p + 1) === 10) {
      ctx.p++;
      break;
    }
    if (c < 32 && c !== 9 || c === 127) {
      TomlError.x("control characters are not allowed in comments", ctx);
    }
  }
}
function skipVoid(ctx, banNewLines, banComments) {
  let c;
  while (ctx.p < ctx.s.length) {
    while (ctx.p < ctx.s.length && ((c = ctx.s.charCodeAt(ctx.p)) === 32 || c === 9 || !banNewLines && (c === 10 || c === 13 && ctx.s.charCodeAt(ctx.p + 1) === 10)))
      ctx.p++;
    if (banComments || c !== 35)
      break;
    skipComment(ctx);
  }
}

// node_modules/smol-toml/dist/struct.js
function parseKey(ctx, end = 61) {
  let startPtr;
  let state = 0;
  let parsed = [];
  let sliceStart;
  let c = ctx.s.charCodeAt(startPtr = ctx.p);
  do {
    if (c === end) {
      if (!state)
        TomlError.x("unexpected end of key", ctx);
      if (state === 1)
        parsed.push(ctx.s.slice(sliceStart, ctx.p));
      return ctx.p++, parsed;
    } else if (c === 46) {
      if (!state)
        TomlError.x("illegal empty bare key", ctx);
      if (state === 1)
        parsed.push(ctx.s.slice(sliceStart, ctx.p));
      state = 0;
    } else if (!state && (c === 34 || c === 39)) {
      if (c === ctx.s.charCodeAt(ctx.p + 1) && c === ctx.s.charCodeAt(ctx.p + 2))
        TomlError.x("illegal quoted key: multiline strings are not allowed", ctx);
      parsed.push(parseString(ctx));
      state = 2;
      ctx.p--;
    } else if (c === 32 || c === 9) {
      if (state === 1) {
        parsed.push(ctx.s.slice(sliceStart, ctx.p));
        state = 2;
      }
    } else if (state === 2 || c < 48 && c !== 45 || c > 57 && c < 65 || c > 90 && c < 97 && c !== 95 || c > 122) {
      TomlError.x("illegal character in key", ctx);
    } else if (!state) {
      state = 1;
      sliceStart = ctx.p;
    }
  } while (c = ctx.s.charCodeAt(++ctx.p));
  TomlError.x("incomplete key-value: cannot find end of key", ctx, startPtr);
}
function parseInlineTable(ctx) {
  let startPtr = ctx.p++;
  let res = /* @__PURE__ */ Object.create(null);
  let seen = /* @__PURE__ */ new Set();
  let c;
  while (ctx.p < ctx.s.length) {
    skipVoid(ctx);
    if ((c = ctx.s.charCodeAt(ctx.p)) === 125) {
      ctx.p++;
      return res;
    }
    let k;
    let t = res;
    let hasOwn = false;
    let errPtr = ctx.p;
    let key2 = parseKey(ctx);
    for (let i = 0; i < key2.length; i++) {
      if (i)
        t = hasOwn ? t[k] : t[k] = /* @__PURE__ */ Object.create(null);
      k = key2[i];
      if ((hasOwn = Object.hasOwn(t, k)) && (typeof t[k] !== "object" || seen.has(t[k]))) {
        TomlError.x("trying to redefine an already defined value", ctx, errPtr);
      }
      let unsafe = k === "__proto__";
      if (ctx.uk && (unsafe || k === "constructor")) {
        t = ctx.uk !== 1 && TomlError.x("document contains an unsafe property", ctx, errPtr);
        break;
      }
      if (!hasOwn && unsafe) {
        Object.defineProperty(t, k, { enumerable: true, configurable: true, writable: true });
      }
    }
    if (hasOwn) {
      TomlError.x("trying to redefine an already defined value", ctx, errPtr);
    }
    skipVoid(ctx, true, true);
    let value = extractValue(
      ctx,
      125
      /* } */
    );
    if (t && typeof (t[k] = value) === "object")
      seen.add(value);
    skipVoid(ctx);
    if ((c = ctx.s.charCodeAt(ctx.p++)) === 125) {
      return res;
    }
    if (c !== 44)
      TomlError.x("expected comma or end of structure", ctx, ctx.p - 1);
  }
  TomlError.x("unfinished table", ctx, startPtr);
}
function parseArray(ctx) {
  let startPtr = ctx.p++;
  let res = [];
  let c;
  while (ctx.p < ctx.s.length) {
    skipVoid(ctx);
    if ((c = ctx.s.charCodeAt(ctx.p)) === 93) {
      ctx.p++;
      return res;
    }
    res.push(extractValue(
      ctx,
      93
      /* ] */
    ));
    skipVoid(ctx);
    if ((c = ctx.s.charCodeAt(ctx.p++)) === 93) {
      return res;
    }
    if (c !== 44)
      TomlError.x("expected comma or end of structure", ctx, ctx.p - 1);
  }
  TomlError.x("unfinished array", ctx, startPtr);
}

// node_modules/smol-toml/dist/parse.js
function peekTable(ctx, key2, table, meta, type) {
  let t = table;
  let m = meta;
  let k;
  let hasOwn = false;
  let state;
  for (let i = 0; i < key2.length; i++) {
    if (i) {
      t = hasOwn ? t[k] : t[k] = /* @__PURE__ */ Object.create(null);
      m = (state = m[k]).c;
      if (type === 0 && (state.t === 1 || state.t === 2)) {
        return null;
      }
      if (state.t === 2) {
        let l = t.length - 1;
        t = t[l];
        m = m[l].c;
      }
    }
    k = key2[i];
    if ((hasOwn = Object.hasOwn(t, k)) && m[k]?.t === 0 && m[k]?.d) {
      return null;
    }
    if (!hasOwn) {
      let unsafe = k === "__proto__";
      if (ctx.uk && (unsafe || k === "constructor"))
        return false;
      if (unsafe) {
        Object.defineProperty(t, k, { enumerable: true, configurable: true, writable: true });
        Object.defineProperty(m, k, { enumerable: true, configurable: true, writable: true });
      }
      m[k] = {
        t: i < key2.length - 1 && type === 2 ? 3 : type,
        d: false,
        i: 0,
        c: /* @__PURE__ */ Object.create(null)
      };
    }
  }
  state = m[k];
  if (state.t !== type && !(type === 1 && state.t === 3)) {
    return null;
  }
  if (type === 2) {
    if (!state.d) {
      state.d = true;
      t[k] = [];
    }
    t[k].push(t = /* @__PURE__ */ Object.create(null));
    state.c[state.i++] = state = { t: 1, d: false, i: 0, c: /* @__PURE__ */ Object.create(null) };
  }
  if (state.d) {
    return null;
  }
  state.d = true;
  if (type === 1) {
    t = hasOwn ? t[k] : t[k] = /* @__PURE__ */ Object.create(null);
  } else if (type === 0 && hasOwn) {
    return null;
  }
  return [k, t, state.c];
}
function validateTablePeek(ctx, peek, ptr) {
  if (peek === null || ctx.uk === 2)
    TomlError.x(peek === null ? "trying to redefine an already defined table or value" : "document contains an unsafe property", ctx, ptr);
}
function parse(toml, options = {}) {
  let ctx = {
    s: toml,
    p: 0,
    d: options.maxDepth ?? 1e3,
    bi: options.integersAsBigInt ?? false,
    ld: options.useLegacyDate ?? true,
    uk: options.unsafeKeyBehaviour === "throw" ? 2 : options.unsafeKeyBehaviour === "drop" ? 1 : 0
  };
  let res = /* @__PURE__ */ Object.create(null);
  let meta = /* @__PURE__ */ Object.create(null);
  let tmp;
  let skipping = false;
  let tbl = res;
  let m = meta;
  if (toml.charCodeAt(0) === 65279)
    ctx.p++;
  skipVoid(ctx);
  while (ctx.p < toml.length) {
    if (toml.charCodeAt(ctx.p) === 91) {
      let isTableArray = toml.charCodeAt(++ctx.p) === 91;
      tmp = ctx.p += +isTableArray;
      skipping = false;
      let k = parseKey(
        ctx,
        93
        /* ] */
      );
      if (isTableArray) {
        if (toml.charCodeAt(ctx.p) !== 93) {
          TomlError.x("expected end of table array declaration", ctx);
        }
        ctx.p++;
      }
      let p = peekTable(
        ctx,
        k,
        res,
        meta,
        isTableArray ? 2 : 1
        /* Type.EXPLICIT */
      );
      if (!p) {
        validateTablePeek(ctx, p, tmp);
        skipping = true;
      } else {
        m = p[2];
        tbl = p[1];
      }
    } else {
      tmp = ctx.p;
      let k = parseKey(ctx);
      let p = peekTable(
        ctx,
        k,
        tbl,
        m,
        0
        /* Type.DOTTED */
      );
      if (!p && !skipping)
        validateTablePeek(ctx, p, tmp);
      skipVoid(ctx, true, true);
      let v = extractValue(ctx, void 0);
      if (p && !skipping)
        p[1][p[0]] = v;
    }
    skipVoid(ctx, true);
    if (ctx.p < toml.length && (tmp = toml.charCodeAt(ctx.p)) !== 10 && (tmp !== 13 || toml.charCodeAt(ctx.p + 1) !== 10)) {
      TomlError.x("each key-value declaration must be followed by an end-of-line", ctx);
    }
    skipVoid(ctx);
  }
  return res;
}

// node_modules/smol-toml/dist/stringify.js
var HAS_WELLFORMED = !!"".isWellFormed;

// src/project.mjs
var import_yaml2 = __toESM(require_dist(), 1);

// src/project/files.mjs
import { constants } from "node:fs";
import { lstat, open, opendir, realpath } from "node:fs/promises";
import path from "node:path";
var MAX_BYTES = 256 * 1024;
var MAX_ENTRIES = 4096;
var MAX_FILES = 128;
var MAX_DEPTH = 32;
function inside(base, target) {
  const relative2 = path.relative(base, target);
  return relative2 !== ".." && !relative2.startsWith(".." + path.sep) && !path.isAbsolute(relative2);
}
var portable = (value) => value.split(path.sep).join("/");
function matches(pattern, value) {
  const pieces = pattern.replace(/^!/, "").replace(/^\.\//, "").replace(/\/$/, "").split("/");
  const parts = value.split("/");
  const memo = /* @__PURE__ */ new Map();
  function match(left, right) {
    const key2 = `${left}:${right}`;
    if (memo.has(key2)) return memo.get(key2);
    let yes;
    if (left === pieces.length) yes = right === parts.length;
    else if (pieces[left] === "**") yes = match(left + 1, right) || right < parts.length && match(left, right + 1);
    else yes = right < parts.length && new RegExp(`^${pieces[left].split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*")}$`).test(parts[right]) && match(left + 1, right + 1);
    memo.set(key2, yes);
    return yes;
  }
  return match(0, 0);
}
var memberOf = (patterns, value) => Array.isArray(patterns) && patterns.some((pattern) => typeof pattern === "string" && !pattern.startsWith("!") && matches(pattern, value)) && !patterns.some((pattern) => typeof pattern === "string" && pattern.startsWith("!") && matches(pattern, value));
async function existingEntry(filename) {
  try {
    return await lstat(filename);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
async function safeDirectories(base, directory, physicalBase) {
  if (!inside(base, directory)) throw new Error();
  if (physicalBase !== void 0) {
    if (await realpath(base) !== physicalBase) throw new Error();
  } else {
    const info = await lstat(base);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error();
  }
  let cursor = base;
  for (const segment of path.relative(base, directory).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    const info = await lstat(cursor);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error();
  }
  return inside(await realpath(base), await realpath(directory));
}
var unreadable = "\uC120\uC5B8 \uD30C\uC77C\uC758 \uD3F4\uB354 \uB9C1\uD06C\xB7\uC811\uADFC \uAD8C\uD55C\xB7\uB300\uC0C1\uC744 \uC548\uC804\uD558\uAC8C \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.";
var tooLarge = "\uC120\uC5B8 \uD30C\uC77C\uC774 256 KiB \uC77D\uAE30 \uD55C\uB3C4\uB97C \uCD08\uACFC\uD588\uC2B5\uB2C8\uB2E4.";
var readFailure = (state, error) => ({ state, error, text: null });
async function readDeclarationFile(filename, { anchor = path.dirname(filename), physicalAnchor, contents = true } = {}) {
  let handle;
  try {
    const directory = path.dirname(filename);
    if (!await safeDirectories(anchor, directory, physicalAnchor)) throw new Error();
    const before = await existingEntry(filename);
    if (!before) return readFailure("absent", unreadable);
    if (!before.isFile() || before.isSymbolicLink()) {
      return readFailure("unsupported_file", "\uC120\uC5B8 \uD30C\uC77C\uC774 \uC77C\uBC18 \uD30C\uC77C\uC774 \uC544\uB2C8\uAC70\uB098 \uB9C1\uD06C\uC774\uBBC0\uB85C \uC77D\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.");
    }
    if (!inside(await realpath(anchor), await realpath(filename))) {
      return readFailure("unreadable", "\uD5C8\uC6A9\uD55C \uC120\uC5B8 \uACBD\uACC4 \uBC16\uC758 \uD30C\uC77C\uC740 \uC77D\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.");
    }
    handle = await open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const info = await handle.stat();
    if (!info.isFile() || info.ino !== before.ino || info.dev !== before.dev) {
      return readFailure("unreadable", "\uC870\uD68C \uC911 \uC120\uC5B8 \uD30C\uC77C\uC758 \uB300\uC0C1\uC774 \uBCC0\uACBD\uB418\uC5B4 \uC77D\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.");
    }
    let text2 = "";
    if (contents) {
      if (info.size > MAX_BYTES) return readFailure("file_too_large", tooLarge);
      const bytes = Buffer.alloc(MAX_BYTES + 1);
      let length = 0;
      while (length < bytes.length) {
        const chunk = await handle.read(bytes, length, bytes.length - length, length);
        if (!chunk.bytesRead) break;
        length += chunk.bytesRead;
      }
      if (length > MAX_BYTES) return readFailure("file_too_large", tooLarge);
      try {
        text2 = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, length)).replace(/^\uFEFF/, "");
      } catch {
        return readFailure("unreadable", "\uC120\uC5B8 \uD30C\uC77C\uC744 UTF-8 \uD14D\uC2A4\uD2B8\uB85C \uC77D\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      }
      if (text2.includes("\0")) return readFailure("unreadable", "\uC120\uC5B8 \uD30C\uC77C\uC5D0 \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uBC14\uC774\uB108\uB9AC \uB370\uC774\uD130\uAC00 \uC788\uC2B5\uB2C8\uB2E4.");
    }
    const after = await handle.stat(), linked = await lstat(filename);
    if (after.size !== info.size || after.mtimeMs !== info.mtimeMs || linked.isSymbolicLink() || linked.ino !== info.ino || linked.dev !== info.dev || !await safeDirectories(anchor, directory, physicalAnchor) || !inside(await realpath(anchor), await realpath(filename))) {
      return readFailure("unreadable", "\uC870\uD68C \uC911 \uC120\uC5B8 \uD30C\uC77C\uC774\uB098 \uD3F4\uB354\uAC00 \uBCC0\uACBD\uB418\uC5B4 \uC694\uAD6C\uB97C \uD655\uC815\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.");
    }
    return { state: "read", text: text2 };
  } catch {
    return readFailure("unreadable", unreadable);
  } finally {
    if (handle) await handle.close().catch(() => {
    });
  }
}
function projectFileAccess(root, physicalRoot) {
  const cache = /* @__PURE__ */ new Map();
  let reads = 0;
  const physical2 = (base) => base === root ? physicalRoot : void 0;
  const checkDirectory = (base, directory) => safeDirectories(base, directory, physical2(base));
  async function list(directory, base = root) {
    if (!await checkDirectory(base, directory)) throw new Error();
    const entries2 = [];
    for await (const entry of await opendir(directory)) {
      if (entries2.length >= MAX_ENTRIES) throw new Error("\uB514\uB809\uD130\uB9AC \uD56D\uBAA9 \uC218\uAC00 \uC815\uC801 \uD0D0\uC0C9 \uD55C\uB3C4\uB97C \uCD08\uACFC\uD588\uC2B5\uB2C8\uB2E4.");
      entries2.push(entry);
    }
    return entries2.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  }
  async function read2({ filename, anchor, spec }) {
    if (cache.has(filename)) return cache.get(filename);
    const result3 = ++reads > MAX_FILES ? readFailure("file_limit", "\uC120\uC5B8 \uD30C\uC77C \uC218\uAC00 \uC815\uC801 \uBD84\uC11D \uD55C\uB3C4\uB97C \uCD08\uACFC\uD588\uC2B5\uB2C8\uB2E4.") : await readDeclarationFile(filename, { anchor, physicalAnchor: physical2(anchor), contents: Boolean(spec.parser) });
    cache.set(filename, result3);
    return result3;
  }
  return { safeDirectories: checkDirectory, list, read: read2 };
}

// src/project/global-json.mjs
var import_semver = __toESM(require_semver2(), 1);

// src/project/json.mjs
function parseJsonObject(text2) {
  const value = JSON.parse(text2);
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new SyntaxError();
  const stack = [];
  const tokens = text2.match(/"(?:\\.|[^"\\])*"|[{}\[\]:,]/g) ?? [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "{") stack.push(/* @__PURE__ */ new Set());
    else if (token === "[") stack.push(null);
    else if (token === "}" || token === "]") stack.pop();
    else if (token.startsWith('"') && tokens[index + 1] === ":") {
      const key2 = JSON.parse(token);
      const keys = stack.at(-1);
      if (!keys || keys.has(key2)) throw new SyntaxError();
      keys.add(key2);
    }
  }
  return value;
}
function stripJsonComments(text2) {
  let clean2 = "";
  for (let index = 0; index < text2.length; index += 1) {
    const char = text2[index], pair = text2.slice(index, index + 2);
    if (char === '"') {
      clean2 += char;
      let closed = false;
      for (index += 1; index < text2.length; index += 1) {
        clean2 += text2[index];
        if (text2[index] === "\\") clean2 += text2[++index] ?? "";
        else if (text2[index] === '"') {
          closed = true;
          break;
        }
      }
      if (!closed) throw new SyntaxError();
    } else if (pair === "//") {
      while (index < text2.length && text2[index] !== "\n") index += 1;
      clean2 += "\n";
    } else if (pair === "/*") {
      const end = text2.indexOf("*/", index + 2);
      if (end < 0) throw new SyntaxError();
      clean2 += " ";
      index = end + 1;
    } else clean2 += char;
  }
  return clean2;
}

// src/project/global-json.mjs
var SDK_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
var ROLL_FORWARD = ["patch", "feature", "minor", "major", "latestPatch", "latestFeature", "latestMinor", "latestMajor", "disable"];
function sdkPath(value) {
  if (value === "$host$") return true;
  return typeof value === "string" && value.length > 0 && value.length <= 240 && value.trim() === value && !/[\x00-\x1f\x7f@$%{}?*|<>"]/.test(value) && !value.replace(/^[A-Za-z]:[\\/]/, "").includes(":");
}
function validateSdkOptions(sdk = {}) {
  if (sdk === null || typeof sdk !== "object" || Array.isArray(sdk)) throw new TypeError("sdk \uD544\uB4DC\uC758 \uAC1D\uCCB4 \uD615\uC2DD\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  const options = {};
  if (Object.hasOwn(sdk, "version")) {
    if (typeof sdk.version !== "string" || sdk.version.length > 160 || sdk.version.trim() !== sdk.version || !SDK_VERSION.test(sdk.version) || !import_semver.default.valid(sdk.version)) {
      throw new TypeError("sdk.version \uD544\uB4DC\uC758 \uBC84\uC804 \uD45C\uD604\uC744 \uC815\uC801\uC73C\uB85C \uD574\uC11D\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    }
    options.version = sdk.version;
  }
  if (Object.hasOwn(sdk, "rollForward")) {
    if (!ROLL_FORWARD.includes(sdk.rollForward) || !options.version && sdk.rollForward !== "latestMajor") {
      throw new TypeError("sdk.rollForward \uD544\uB4DC\uC758 \uC815\uCC45 \uB610\uB294 \uD544\uC218 \uBC84\uC804\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    }
    options.rollForward = sdk.rollForward;
  }
  if (Object.hasOwn(sdk, "allowPrerelease")) {
    if (typeof sdk.allowPrerelease !== "boolean") throw new TypeError("sdk.allowPrerelease \uD544\uB4DC\uC758 \uBD88\uB9AC\uC5B8 \uD615\uC2DD\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    options.allowPrerelease = sdk.allowPrerelease;
  }
  if (Object.hasOwn(sdk, "paths")) {
    if (!Array.isArray(sdk.paths) || sdk.paths.length > 32 || !sdk.paths.every(sdkPath)) {
      throw new TypeError("sdk.paths \uD544\uB4DC\uC5D0 \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uACBD\uB85C \uD45C\uD604\uC774 \uC788\uC2B5\uB2C8\uB2E4.");
    }
    options.paths = sdk.paths;
  }
  if (Object.hasOwn(sdk, "errorMessage") && sdk.errorMessage != null && typeof sdk.errorMessage !== "string") {
    throw new TypeError("sdk.errorMessage \uD544\uB4DC\uC758 \uBB38\uC790\uC5F4 \uD615\uC2DD\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  }
  return options;
}
function parseGlobalJson(text2) {
  let data;
  try {
    data = parseJsonObject(stripJsonComments(text2));
  } catch {
    throw new SyntaxError("global.json\uC758 \uC8FC\uC11D \uB610\uB294 JSON \uAC1D\uCCB4 \uD615\uC2DD\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  }
  return Object.hasOwn(data, "sdk") ? validateSdkOptions(data.sdk) : void 0;
}

// src/task-runners.mjs
var import_yaml = __toESM(require_dist(), 1);
var MAX_BYTES2 = 256 * 1024;
var MAX_ENTRIES2 = 4096;
var MAX_DEPTH2 = 32;
var has = (value, key2) => Object.hasOwn(value, key2);
var object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
var unique = (values) => [...new Set(values)];
var safeName = (value) => typeof value === "string" && /^[\p{L}\p{N}_][\p{L}\p{N}_.:-]{0,127}$/u.test(value) && !["__proto__", "prototype", "constructor"].includes(value);
var dynamic = (value) => typeof value === "string" && /\{\{|\$\{|\$\(|`|\$[A-Za-z_]/.test(value);
var safeDirectory = (value) => typeof value === "string" && value.length > 0 && value.length <= 240 && value.trim() === value && !/[\x00-\x1f\x7f@$%{}?*`|&;<>"']|:\/\//.test(value) && !value.replace(/^[A-Za-z]:[\\/]/, "").includes(":");
var TASK_RUNNER_FILES = [
  "mise.toml",
  ".mise.toml",
  ...["Taskfile", "taskfile"].flatMap((name) => ["yml", "yaml"].flatMap((extension) => [
    `${name}.${extension}`,
    `${name}.dist.${extension}`,
    `${name}.${extension}.dist`
  ])),
  "Justfile",
  "justfile",
  ".justfile",
  "Makefile",
  "makefile",
  "GNUmakefile",
  "package.json",
  "mise-tasks"
];
function taskRunnerTool(name) {
  if (name === "mise.toml" || name === ".mise.toml" || name === "mise-tasks") return "mise";
  if (/^(?:Taskfile|taskfile)(?:\.dist\.ya?ml|\.ya?ml(?:\.dist)?)$/.test(name)) return "task";
  if (["Justfile", "justfile", ".justfile"].includes(name)) return "just";
  if (["Makefile", "makefile", "GNUmakefile"].includes(name)) return "make";
  if (name === "package.json") return "npm";
  return null;
}
function boundedGraph(data) {
  let count = 0;
  const ancestors2 = /* @__PURE__ */ new Set();
  function visit(value, depth) {
    if (++count > MAX_ENTRIES2 || depth > MAX_DEPTH2) throw new Error();
    if (value === null || typeof value !== "object") return;
    if (ancestors2.has(value)) throw new Error();
    ancestors2.add(value);
    for (const [key2, item] of Object.entries(value)) {
      if (["__proto__", "prototype", "constructor"].includes(key2)) throw new Error();
      visit(item, depth + 1);
    }
    ancestors2.delete(value);
  }
  visit(data, 0);
  if (!object(data)) throw new Error();
  return data;
}
function yaml(text2) {
  const document = (0, import_yaml.parseDocument)(text2, { merge: true, uniqueKeys: true, stringKeys: true, prettyErrors: false });
  if (document.errors.length || document.warnings.length) throw new Error();
  return boundedGraph(document.toJS({ maxAliasCount: 64 }) ?? {});
}
function json(text2) {
  const data = JSON.parse(text2), stack = [];
  const tokens = text2.match(/"(?:\\.|[^"\\])*"|[{}\[\]:,]/g) ?? [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "{") stack.push(/* @__PURE__ */ new Set());
    else if (token === "[") stack.push(null);
    else if (token === "}" || token === "]") stack.pop();
    else if (token.startsWith('"') && tokens[index + 1] === ":") {
      const key2 = JSON.parse(token), keys = stack.at(-1);
      if (!keys || keys.has(key2)) throw new Error();
      keys.add(key2);
    }
  }
  return boundedGraph(data);
}
function unknown(record, note) {
  record.state = "unknown";
  if (!record.notes.includes(note)) record.notes.push(note);
}
function environmentKeys(value, record) {
  if (!object(value)) {
    unknown(record, "\uD658\uACBD \uC120\uC5B8\uC758 \uC815\uC801 \uD0A4 \uB9E4\uD551\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    return [];
  }
  const keys = [];
  for (const [key2, entry] of Object.entries(value)) {
    if (/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(key2) && !["__proto__", "constructor", "prototype"].includes(key2)) keys.push(key2);
    else unknown(record, "\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uD658\uACBD \uD0A4\uB098 \uD658\uACBD \uB85C\uB354\uB294 \uD574\uC11D\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
    if (object(entry) || Array.isArray(entry) || dynamic(entry)) unknown(record, "\uD658\uACBD \uAC12\uC758 \uD15C\uD50C\uB9BF\xB7\uB3D9\uC801 \uACC4\uC0B0\uC740 \uD3C9\uAC00\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
  }
  return keys;
}
function shell(value, record) {
  const parts = Array.isArray(value) ? value : typeof value === "string" ? value.trim().split(/\s+/) : [];
  const executable = parts[0];
  const flags = /* @__PURE__ */ new Set([
    "-c",
    "-e",
    "-u",
    "-x",
    "-s",
    "-ec",
    "-eu",
    "-euc",
    "-eux",
    "-euxc",
    "-o",
    "pipefail",
    "--noprofile",
    "--norc",
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    "-File",
    "/C",
    "/D",
    "/S"
  ]);
  if (!parts.length || parts.length > 16 || typeof executable !== "string" || !/^(?:sh|bash|zsh|fish|nu|pwsh|powershell|cmd)(?:\.exe)?$/i.test(executable) || !parts.slice(1).every((part) => flags.has(part))) {
    unknown(record, "\uC178\uC758 \uC815\uC801 \uC2E4\uD589 \uD30C\uC77C\uACFC \uC54C\uB824\uC9C4 \uC778\uC218\uB9CC \uAE30\uB85D\uD569\uB2C8\uB2E4.");
    return void 0;
  }
  return parts;
}
function names(values, record) {
  if (!Array.isArray(values)) {
    unknown(record, "\uC791\uC5C5 \uC758\uC874\uC131\uC758 \uC815\uC801 \uC774\uB984 \uBAA9\uB85D\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    return [];
  }
  const result3 = [];
  for (const value of values) {
    if (safeName(value)) result3.push(value);
    else unknown(record, "\uC791\uC5C5 \uC758\uC874\uC131\uC758 \uD15C\uD50C\uB9BF\xB7\uD328\uD134\xB7\uC778\uC218 \uACC4\uC0B0\uC740 \uD574\uC11D\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
  }
  return unique(result3);
}
function context(data, record, inherited = {}) {
  const detail = { ...inherited };
  if (has(data, "dir")) {
    delete detail.directory;
    if (safeDirectory(data.dir)) detail.directory = data.dir;
    else unknown(record, "\uC791\uC5C5 \uB514\uB809\uD130\uB9AC\uC758 \uB3D9\uC801 \uD45C\uD604\uC774\uB098 \uBE44\uC815\uC801 \uAC12\uC740 \uD574\uC11D\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
  }
  if (has(data, "shell")) {
    delete detail.shell;
    const argv = shell(data.shell, record);
    if (argv) detail.shell = argv;
  }
  if (has(data, "env")) detail.environmentKeys = unique([...inherited.environmentKeys ?? [], ...environmentKeys(data.env, record)]);
  return detail;
}
function inspectExpressions(value, record) {
  if (dynamic(value)) unknown(record, "\uD15C\uD50C\uB9BF\xB7\uBCC0\uC218 \uCC38\uC870\xB7\uB3D9\uC801 \uACC4\uC0B0\uC740 \uC2E4\uD589\uD558\uAC70\uB098 \uD655\uC7A5\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
  else if (value !== null && typeof value === "object") for (const item of Object.values(value)) inspectExpressions(item, record);
}
function addTask(record, name, detail) {
  if (!safeName(name)) {
    unknown(record, "\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uC791\uC5C5 \uC774\uB984\uC774\uB098 \uB3D9\uC801 \uC774\uB984\uC740 \uAE30\uB85D\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
    return;
  }
  if (record.tasks.includes(name)) {
    unknown(record, "\uC911\uBCF5 \uC791\uC5C5 \uC120\uC5B8\uC758 \uC2E4\uC81C \uC120\uD0DD\uC740 \uD655\uC815\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
    return;
  }
  record.tasks.push(name);
  if (detail && Object.keys(detail).length) (record.taskDetails ??= []).push({ name, ...detail });
}
function mise(data, record) {
  const references = ["include", "includes", "task_config", "task_templates"].some((key2) => has(data, key2));
  if (!has(data, "tasks") && !references) return null;
  if (references) unknown(record, "mise \uC678\uBD80 \uD3EC\uD568\xB7\uD30C\uC77C \uC791\uC5C5\xB7\uC791\uC5C5 \uD15C\uD50C\uB9BF\uC740 \uB530\uB77C\uAC00\uAC70\uB098 \uD3C9\uAC00\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
  if (!has(data, "tasks")) return record;
  if (!object(data.tasks)) {
    unknown(record, "mise tasks\uC758 \uC815\uC801 \uD14C\uC774\uBE14\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    return record;
  }
  const inherited = context(data, record);
  inspectExpressions(data.tasks, record);
  for (const [name, task] of Object.entries(data.tasks)) {
    let detail;
    if (typeof task === "string") {
    } else if (object(task)) {
      detail = context(task, record, inherited);
      const dependencies = [];
      for (const field of ["depends", "depends_post", "wait_for"]) if (has(task, field)) dependencies.push(...names(task[field], record));
      if (dependencies.length) detail.dependencies = unique(dependencies);
      if (has(task, "alias")) unknown(record, "mise \uC791\uC5C5 \uBCC4\uCE6D\uC758 \uC120\uD0DD \uC758\uBBF8\uB294 \uD574\uC11D\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
      if (["file", "extends", "sources", "outputs", "usage", "tools", "platforms", "hide", "raw"].some((key2) => has(task, key2))) {
        unknown(record, "mise \uC791\uC5C5\uC758 \uD30C\uC77C\xB7\uC0C1\uC18D\xB7\uC870\uAC74\xB7\uC2E4\uD589 \uC635\uC158\uC740 \uC815\uC801 \uC774\uB984 \uBD84\uC11D \uBC94\uC704 \uBC16\uC785\uB2C8\uB2E4.");
      }
      if (has(task, "run")) {
        if (!(typeof task.run === "string" || Array.isArray(task.run) && task.run.every((entry) => typeof entry === "string"))) {
          unknown(record, "mise run\uC758 \uBB38\uC790\uC5F4 \uB610\uB294 \uBB38\uC790\uC5F4 \uBAA9\uB85D\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
        }
      } else if (!dependencies.length) unknown(record, "mise \uC791\uC5C5\uC758 \uBA85\uB839 \uB610\uB294 \uC815\uC801 \uC758\uC874\uC131 \uC120\uC5B8\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    } else unknown(record, "mise \uC791\uC5C5 \uC815\uC758\uC758 \uC815\uC801 \uD615\uC2DD\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    addTask(record, name, detail ?? inherited);
  }
  return record;
}
function taskfile(data, record) {
  if (!(typeof data.version === "number" && data.version === 3 || typeof data.version === "string" && /^3(?:\.\d+){0,2}$/.test(data.version))) {
    unknown(record, "Taskfile\uC758 \uC9C0\uC6D0\uD558\uB294 \uBC84\uC804 3 \uC120\uC5B8\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  }
  if (has(data, "includes")) unknown(record, "Taskfile\uC758 \uB85C\uCEEC\xB7\uC678\uBD80\xB7\uC6D0\uACA9 include\uB294 \uB530\uB77C\uAC00\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
  if (has(data, "dotenv")) unknown(record, "Taskfile\uC758 \uD658\uACBD \uD30C\uC77C\uC744 \uC77D\uAC70\uB098 \uD655\uC7A5\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
  inspectExpressions(data, record);
  const inspectVariables = (variables) => {
    if (variables !== void 0 && (!object(variables) || Object.values(variables).some((value) => object(value)))) {
      unknown(record, "Taskfile \uBCC0\uC218\uC758 \uC178 \uC870\uD68C\xB7\uCC38\uC870\xB7\uB3D9\uC801 \uACC4\uC0B0\uC740 \uD3C9\uAC00\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
    }
  };
  inspectVariables(data.vars);
  const inherited = context(data, record);
  if (!object(data.tasks)) {
    unknown(record, "Taskfile tasks\uC758 \uC815\uC801 \uB9E4\uD551\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    return record;
  }
  for (const [name, task] of Object.entries(data.tasks)) {
    let detail = inherited;
    if (typeof task === "string" || Array.isArray(task) && task.every((entry) => typeof entry === "string")) {
    } else if (object(task)) {
      detail = context(task, record, inherited);
      inspectVariables(task.vars);
      const dependencies = [];
      if (has(task, "deps")) {
        if (!Array.isArray(task.deps)) unknown(record, "Taskfile deps\uC758 \uC815\uC801 \uBAA9\uB85D\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
        else for (const dependency of task.deps) {
          if (typeof dependency === "string") dependencies.push(...names([dependency], record));
          else if (object(dependency) && safeName(dependency.task)) {
            dependencies.push(dependency.task);
            if (Object.keys(dependency).some((key2) => key2 !== "task")) unknown(record, "Taskfile \uC758\uC874 \uC791\uC5C5\uC758 \uBCC0\uC218\xB7\uC870\uAC74\xB7\uBC18\uBCF5\uC740 \uD574\uC11D\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
          } else unknown(record, "Taskfile \uC758\uC874 \uC791\uC5C5\uC758 \uB3D9\uC801 \uC774\uB984\uC774\uB098 \uBC18\uBCF5\uC740 \uD574\uC11D\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
        }
      }
      if (has(task, "cmds")) {
        if (!Array.isArray(task.cmds)) unknown(record, "Taskfile cmds\uC758 \uC815\uC801 \uBAA9\uB85D\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
        else for (const command2 of task.cmds) {
          if (typeof command2 === "string") continue;
          if (!object(command2)) {
            unknown(record, "Taskfile \uBA85\uB839 \uD56D\uBAA9\uC758 \uC815\uC801 \uD615\uC2DD\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
            continue;
          }
          if (has(command2, "task")) dependencies.push(...names([command2.task], record));
          if (has(command2, "cmd") && typeof command2.cmd !== "string") unknown(record, "Taskfile \uBA85\uB839 \uBB38\uC790\uC5F4\uC758 \uD615\uC2DD\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
          if (Object.keys(command2).some((key2) => !["task", "cmd", "silent", "ignore_error"].includes(key2))) {
            unknown(record, "Taskfile \uBA85\uB839\uC758 \uBCC0\uC218\xB7\uC870\uAC74\xB7\uBC18\uBCF5\xB7\uC9C0\uC5F0 \uC2E4\uD589\uC740 \uD574\uC11D\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
          }
        }
      } else if (!dependencies.length) unknown(record, "Taskfile \uC791\uC5C5\uC758 \uBA85\uB839 \uB610\uB294 \uC815\uC801 \uC758\uC874\uC131\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      if (dependencies.length) detail = { ...detail, dependencies: unique(dependencies) };
      if (["preconditions", "requires", "platforms", "if", "for", "aliases", "dotenv"].some((key2) => has(task, key2))) {
        unknown(record, "Taskfile \uC791\uC5C5\uC758 \uC870\uAC74\xB7\uBC18\uBCF5\xB7\uBCC4\uCE6D\xB7\uD658\uACBD \uD30C\uC77C\uC740 \uD574\uC11D\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
      }
    } else unknown(record, "Taskfile \uC791\uC5C5 \uC815\uC758\uC758 \uC815\uC801 \uD615\uC2DD\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    addTask(record, name, detail);
  }
  if (!record.tasks.length) unknown(record, "Taskfile\uC5D0\uC11C \uC815\uC801\uC73C\uB85C \uC2DD\uBCC4\uD55C \uC791\uC5C5 \uC774\uB984\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.");
  return record;
}
function npm(data, record) {
  if (!has(data, "scripts")) return null;
  if (!object(data.scripts)) {
    unknown(record, "package.json scripts\uC758 \uC815\uC801 \uAC1D\uCCB4\uB97C \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    return record;
  }
  for (const [name, command2] of Object.entries(data.scripts)) {
    if (typeof command2 !== "string") unknown(record, "npm script\uC758 \uBA85\uB839 \uBB38\uC790\uC5F4 \uD615\uC2DD\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    else inspectExpressions(command2, record);
    addTask(record, name);
  }
  return record;
}
function make(text2, record) {
  record.notes.push("Make\uB294 \uB2E8\uC21C\uD55C \uC815\uC801 \uB300\uC0C1 \uC774\uB984\uACFC \uC758\uC874 \uC774\uB984\uB9CC \uC2DD\uBCC4\uD558\uBA70 \uC804\uCCB4 \uBB38\uBC95\uC744 \uD574\uC11D\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
  let recipe = false, defineDepth = 0, conditionalDepth = 0, continued = false;
  for (const raw of text2.split(/\r?\n/)) {
    const wasContinued = continued;
    continued = /\\\s*$/.test(raw);
    if (wasContinued || continued) {
      unknown(record, "Make\uC758 \uC904 \uC5F0\uC18D\uC73C\uB85C \uACB0\uD569\uB418\uB294 \uAD6C\uBB38\uC740 \uC2DD\uBCC4\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
      continue;
    }
    if (raw.startsWith("	")) {
      if (!recipe && !defineDepth) unknown(record, "Make\uC758 \uB300\uC0C1 \uBC16 \uB808\uC2DC\uD53C \uB610\uB294 \uC0AC\uC6A9\uC790 \uC9C0\uC815 \uAD6C\uBB38\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      if (dynamic(raw)) unknown(record, "Make \uB808\uC2DC\uD53C\uC758 \uBCC0\uC218 \uD655\uC7A5\xB7\uB3D9\uC801 \uACC4\uC0B0\uC740 \uD3C9\uAC00\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
      continue;
    }
    const line = raw.replace(/\s*#.*$/, "").trim();
    if (!line) continue;
    recipe = false;
    if (/^(?:override\s+)?\.RECIPEPREFIX\s*[:?+!]?=/.test(line)) {
      unknown(record, "Make\uC758 \uC0AC\uC6A9\uC790 \uC9C0\uC815 \uB808\uC2DC\uD53C \uC811\uB450\uC0AC \uC774\uD6C4 \uAD6C\uBB38\uC740 \uC2DD\uBCC4\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
      break;
    }
    if (/^(?:(?:override|export)\s+)?define\b/.test(line)) {
      defineDepth += 1;
      unknown(record, "Make define\xB7eval\uB85C \uC0DD\uC131\uB418\uB294 \uC120\uC5B8\uC740 \uD574\uC11D\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
      continue;
    }
    if (line === "endef") {
      if (defineDepth) defineDepth -= 1;
      else unknown(record, "Make \uBE14\uB85D\uC758 \uC9DD\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      continue;
    }
    if (defineDepth) continue;
    if (/^(?:ifeq|ifneq|ifdef|ifndef)\b/.test(line)) {
      conditionalDepth += 1;
      unknown(record, "Make \uC870\uAC74\uC5D0 \uB530\uB978 \uB300\uC0C1 \uC120\uD0DD\uC740 \uD3C9\uAC00\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
      continue;
    }
    if (/^endif\b/.test(line)) {
      if (conditionalDepth) conditionalDepth -= 1;
      else unknown(record, "Make \uC870\uAC74 \uBE14\uB85D\uC758 \uC9DD\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      continue;
    }
    if (/^else\b/.test(line)) {
      unknown(record, "Make \uC870\uAC74\uC5D0 \uB530\uB978 \uB300\uC0C1 \uC120\uD0DD\uC740 \uD3C9\uAC00\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
      continue;
    }
    if (/^(?:-?include|sinclude|load)\b/.test(line)) {
      unknown(record, "Make include\xB7\uC678\uBD80 \uC120\uC5B8\uC740 \uC77D\uAC70\uB098 \uC2E4\uD589\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
      continue;
    }
    if (/^[^:]*?(?::=|::=|\?=|\+=|!=|=)/.test(line)) {
      unknown(record, "Make \uBCC0\uC218 \uC120\uC5B8\xB7\uB300\uC0C1 \uACC4\uC0B0\xB7\uC0AC\uC6A9\uC790 \uC9C0\uC815 \uB808\uC2DC\uD53C \uC124\uC815\uC740 \uD574\uC11D\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
      continue;
    }
    if (conditionalDepth) continue;
    const match = line.match(/^([^:]+):([^:]*)$/);
    if (!match || /[\\$%{}=]/.test(match[1])) {
      unknown(record, "Make \uD328\uD134\xB7\uACC4\uC0B0 \uB300\uC0C1\xB7\uBCF5\uD569 \uADDC\uCE59\uC740 \uC815\uC801\uC73C\uB85C \uC2DD\uBCC4\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
      continue;
    }
    const targets = match[1].trim().split(/\s+/), prerequisites = match[2].split(";", 1)[0].trim();
    recipe = true;
    if (targets.every((target) => /^\.[A-Z_]+$/.test(target))) {
      if (targets.some((target) => target !== ".PHONY")) unknown(record, "Make \uD2B9\uC218 \uB300\uC0C1\uC758 \uC2E4\uD589 \uC758\uBBF8\uB294 \uD574\uC11D\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
      continue;
    }
    if (!targets.every(safeName)) {
      unknown(record, "Make\uC758 \uB2E8\uC21C\uD55C \uC815\uC801 \uB300\uC0C1 \uC774\uB984\uB9CC \uAE30\uB85D\uD569\uB2C8\uB2E4.");
      continue;
    }
    let detail;
    if (prerequisites) {
      const dependencies = names(prerequisites.replace(/\|/g, " ").split(/\s+/), record);
      if (dependencies.length) detail = { dependencies };
    }
    for (const target of targets) addTask(record, target, detail);
    if (line.includes(";") && dynamic(line.slice(line.indexOf(";") + 1))) unknown(record, "Make \uB808\uC2DC\uD53C\uC758 \uBCC0\uC218 \uD655\uC7A5\xB7\uB3D9\uC801 \uACC4\uC0B0\uC740 \uD3C9\uAC00\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
  }
  if (defineDepth || conditionalDepth || !record.tasks.length) unknown(record, "Make\uC758 \uC815\uC801 \uB300\uC0C1\uC774 \uC5C6\uAC70\uB098 \uBE14\uB85D \uAD6C\uC870\uB97C \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  return record;
}
function openJustString(line, delimiter = null) {
  for (let index = 0; index < line.length; index += 1) {
    if (delimiter) {
      if (delimiter.includes('"') && line[index] === "\\") {
        index += 1;
        continue;
      }
      if (line.startsWith(delimiter, index)) {
        index += delimiter.length - 1;
        delimiter = null;
      }
    } else {
      if (line[index] === "#") break;
      const token = /^(?:'''|"""|```|`|'|")/.exec(line.slice(index))?.[0];
      if (token) {
        delimiter = token;
        index += token.length - 1;
      }
    }
  }
  return delimiter;
}
function just(text2, record) {
  record.notes.push("Just\uB294 \uC778\uC218 \uC5C6\uB294 \uB2E8\uC21C \uB808\uC2DC\uD53C \uC774\uB984\uACFC \uC758\uC874 \uC774\uB984\uB9CC \uC2DD\uBCC4\uD558\uBA70 \uC804\uCCB4 \uBB38\uBC95\uC744 \uD574\uC11D\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
  let recipe = false, block = null, windowsAttribute = false, defaultShell, windowsShell;
  for (const raw of text2.split(/\r?\n/)) {
    if (block) {
      block = openJustString(raw, block);
      continue;
    }
    if (/^\s/.test(raw)) {
      if (raw.trim() && !recipe) unknown(record, "Just\uC758 \uB808\uC2DC\uD53C \uBC16 \uB4E4\uC5EC\uC4F0\uAE30 \uAD6C\uBB38\uC740 \uD574\uC11D\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
      if (dynamic(raw)) unknown(record, "Just \uB808\uC2DC\uD53C\uC758 \uD15C\uD50C\uB9BF\xB7\uB3D9\uC801 \uACC4\uC0B0\uC740 \uD3C9\uAC00\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
      continue;
    }
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    recipe = false;
    if (line === "[windows]") {
      if (windowsAttribute) unknown(record, "\uC911\uBCF5 Just \uC18D\uC131\uC758 \uC801\uC6A9\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      if (!record.notes.includes("Just [windows] \uC18D\uC131\uC758 \uC2E4\uD589 \uC9C0\uC6D0\uC740 \uC124\uCE58 \uBC84\uC804\uC5D0\uC11C \uBCC4\uB3C4\uB85C \uD655\uC778\uD574\uC57C \uD569\uB2C8\uB2E4.")) {
        record.notes.push("Just [windows] \uC18D\uC131\uC758 \uC2E4\uD589 \uC9C0\uC6D0\uC740 \uC124\uCE58 \uBC84\uC804\uC5D0\uC11C \uBCC4\uB3C4\uB85C \uD655\uC778\uD574\uC57C \uD569\uB2C8\uB2E4.");
      }
      windowsAttribute = true;
      continue;
    }
    const shellSetting = line.match(/^set\s+(shell|windows-shell)\s*:=\s*(\[.*\])\s*(?:#.*)?$/);
    if (shellSetting) {
      let argv2;
      try {
        const value = JSON.parse(shellSetting[2]);
        if (Array.isArray(value)) argv2 = shell(value, record);
      } catch {
      }
      if (!argv2) unknown(record, "Just \uC178 \uC124\uC815\uC740 \uC54C\uB824\uC9C4 \uC178\uACFC \uC778\uC218\uC758 literal \uBB38\uC790\uC5F4 \uBC30\uC5F4\uB9CC \uC9C0\uC6D0\uD569\uB2C8\uB2E4.");
      else if (shellSetting[1] === "windows-shell" || windowsAttribute) {
        if (windowsShell) unknown(record, "\uC911\uBCF5 Windows Just \uC178 \uC124\uC815\uC758 \uC120\uD0DD\uC744 \uD655\uC815\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
        windowsShell = argv2;
      } else {
        if (defaultShell) unknown(record, "\uC911\uBCF5 Just \uC178 \uC124\uC815\uC758 \uC120\uD0DD\uC744 \uD655\uC815\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
        defaultShell = argv2;
      }
      windowsAttribute = false;
      continue;
    }
    const multiline = openJustString(line);
    if (multiline) {
      block = multiline;
      unknown(record, "Just\uC758 \uB2E4\uC911 \uD589 \uBB38\uC790\uC5F4\xB7\uD45C\uD604\uC2DD \uC120\uC5B8\uC740 \uD574\uC11D\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
      continue;
    }
    if (/^(?:import\??|mod\??|alias|set|export|unexport)\b/.test(line) || line.includes(":=") || line.startsWith("[")) {
      unknown(record, "Just import\xB7module\xB7\uBCC4\uCE6D\xB7\uC124\uC815\xB7\uC18D\uC131\xB7\uBCC0\uC218 \uD45C\uD604\uC2DD\uC740 \uD574\uC11D\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
      windowsAttribute = false;
      continue;
    }
    const match = line.match(/^@?([\p{L}\p{N}_][\p{L}\p{N}_.-]*):\s*([^#]*?)(?:\s+#.*)?$/u);
    if (!match) {
      unknown(record, "Just\uC758 \uB9E4\uAC1C\uBCC0\uC218\xB7\uB3D9\uC801 \uC120\uC5B8\xB7\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uAD6C\uBB38\uC740 \uC2DD\uBCC4\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
      continue;
    }
    recipe = true;
    windowsAttribute = false;
    const dependencies = match[2].trim() ? names(match[2].trim().split(/\s+/), record) : [];
    addTask(record, match[1], dependencies.length ? { dependencies } : void 0);
  }
  const argv = windowsShell ?? defaultShell;
  if (argv) {
    record.taskDetails ??= [];
    for (const name of record.tasks) {
      const detail = record.taskDetails.find((entry) => entry.name === name);
      if (detail) detail.shell = argv;
      else record.taskDetails.push({ name, shell: argv });
    }
  }
  if (block || windowsAttribute || !record.tasks.length) unknown(record, "Just\uC758 \uC815\uC801 \uB808\uC2DC\uD53C\uAC00 \uC5C6\uAC70\uB098 \uBB38\uC790\uC5F4\xB7\uC18D\uC131 \uAD6C\uC870\uB97C \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  return record;
}
function analyzeTaskRunner({ tool, source, text: text2, reason }) {
  const record = { tool, source, state: "declared", tasks: [], notes: [] };
  if (typeof text2 !== "string") {
    unknown(record, reason ?? "\uC791\uC5C5 \uC2E4\uD589\uAE30 \uC120\uC5B8\uC744 \uC548\uC804\uD558\uAC8C \uC77D\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    return record;
  }
  if (Buffer.byteLength(text2, "utf8") > MAX_BYTES2 || text2.includes("\0")) {
    unknown(record, "\uC791\uC5C5 \uC2E4\uD589\uAE30 \uC120\uC5B8\uC758 \uD06C\uAE30 \uB610\uB294 \uD14D\uC2A4\uD2B8 \uD55C\uB3C4\uB97C \uCD08\uACFC\uD588\uC2B5\uB2C8\uB2E4.");
    return record;
  }
  try {
    if (tool === "mise") return mise(boundedGraph(parse(text2, { maxDepth: MAX_DEPTH2, integersAsBigInt: "asNeeded", unsafeKeyBehaviour: "throw" })), record);
    if (tool === "task") return taskfile(yaml(text2), record);
    if (tool === "npm") return npm(json(text2), record);
    if (text2.split(/\r?\n/).length > MAX_ENTRIES2) throw new Error();
    if (tool === "make") return make(text2, record);
    if (tool === "just") return just(text2, record);
    throw new Error();
  } catch {
    unknown(record, "\uC791\uC5C5 \uC2E4\uD589\uAE30 \uC120\uC5B8\uC758 \uBB38\uBC95\xB7\uC911\uBCF5 \uD0A4\xB7\uD0DC\uADF8\xB7\uBCC4\uCE6D\xB7\uC911\uCCA9 \uD55C\uB3C4\uB97C \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    return record;
  }
}
var npmInstallFlags = /* @__PURE__ */ new Set(["--ignore-scripts", "--no-audit", "--no-fund"]);
var npmInstallCommands = /* @__PURE__ */ new Set(["ci", "install", "i"]);
function singleCommand(run, line) {
  return run.trim() === line && !/[\r\n]/.test(line) && !/[^\S \t\r\n]/.test(run);
}
function taskRunnerInvocation(run, { atProjectRoot = false } = {}) {
  if (typeof run !== "string") return null;
  const line = run.split(/\r?\n/).map((value) => value.trim()).find((value) => value && !value.startsWith("#"));
  if (!line) return null;
  const match = line.match(/^(mise(?:\.exe)?|task(?:\.exe)?|just(?:\.exe)?|make(?:\.exe)?|npm(?:\.cmd|\.exe)?)(?=\s|$)/i);
  if (!match) return null;
  const tool = match[1].toLowerCase().replace(/\.(?:exe|cmd)$/, "");
  const result3 = { tool, state: "declared" };
  const rest = line.slice(match[0].length).trim(), tokens = rest.split(/\s+/).filter(Boolean);
  const single = singleCommand(run, line);
  if (!tokens.length) return result3;
  if (single && rest === "--version") return { ...result3, kind: "tool_inspection" };
  if (single && tool === "mise" && rest === "install") return { ...result3, kind: "tool_setup" };
  if (tool === "npm" && npmInstallCommands.has(tokens[0])) {
    if (single && tokens.slice(1).every((token) => npmInstallFlags.has(token))) result3.kind = "dependency_install";
    else result3.state = "unknown";
    return result3;
  }
  let target;
  let taskArgumentCount = 1;
  if (tool === "mise") {
    if (["run", "r"].includes(tokens[0])) target = tokens[1];
    else {
      result3.state = "unknown";
      return result3;
    }
    taskArgumentCount = 2;
  } else if (tool === "npm") {
    const runsScript = ["run", "run-script"].includes(tokens[0]);
    if (runsScript) target = tokens[1];
    else if (["test", "start", "stop", "restart"].includes(tokens[0])) target = tokens[0];
    else {
      result3.state = "unknown";
      return result3;
    }
    if (runsScript) taskArgumentCount = 2;
  } else target = tokens[0];
  if (target !== void 0 && safeName(target)) result3.task = target;
  else result3.state = "unknown";
  if (dynamic(rest) || /[|&;<>\\]/.test(rest) || tokens[0].startsWith("-")) result3.state = "unknown";
  if (atProjectRoot && tokens.length === taskArgumentCount && result3.state === "declared" && single) result3.atProjectRoot = true;
  return result3;
}

// src/task-runner-ci.mjs
var setupActions = /* @__PURE__ */ new Map([["go-task/setup-task", "task"], ["extractions/setup-just", "just"]]);
var makeProvision = /^(?:choco(?:\.exe)?[ \t]+install[ \t]+make(?:[ \t]+(?:-y|--yes))?|scoop(?:\.cmd)?[ \t]+install[ \t]+make)$/i;
var literalLine = /^(?:[A-Za-z0-9_./:=+,-]+|"[A-Za-z0-9_./:=+, *?-]*"|'[A-Za-z0-9_./:=+, *?-]*')(?:[ \t]+(?:[A-Za-z0-9_./:=+,-]+|"[A-Za-z0-9_./:=+, *?-]*"|'[A-Za-z0-9_./:=+, *?-]*'))*$/;
var directOperations = /* @__PURE__ */ new Map([
  ["go build", ["go", "build"]],
  ["go test", ["go", "test"]],
  ["go vet", ["go", "check"]],
  ["cargo build", ["rust", "build"]],
  ["cargo test", ["rust", "test"]],
  ["cargo check", ["rust", "check"]],
  ["cargo clippy", ["rust", "check"]],
  ["zig build-exe", ["zig", "build"]],
  ["zig build-lib", ["zig", "build"]],
  ["zig build-obj", ["zig", "build"]],
  ["zig test", ["zig", "test"]],
  ["zig ast-check", ["zig", "check"]],
  ["dotnet build", ["dotnet", "build"]],
  ["dotnet test", ["dotnet", "test"]]
]);
var pythonModules = /* @__PURE__ */ new Map([
  ["unittest", "test"],
  ["pytest", "test"],
  ["build", "build"],
  ["compileall", "check"],
  ["ruff", "check"]
]);
var unquote = (argument) => /^["']/.test(argument) ? argument.slice(1, -1) : argument;
function nativePath(argument) {
  const value = argument.startsWith('"') ? argument.slice(1, -1) : argument;
  const relative2 = value.replace(/^\.\//, "");
  return relative2.split("/").every((part) => /^\.?[A-Za-z0-9_][A-Za-z0-9_. -]*$/.test(part) && !/[. ]$/.test(part)) ? relative2 : null;
}
function nativeOperation(args) {
  if (args.length < 3 || args.at(-2) !== "-o") return null;
  const output = nativePath(args.at(-1));
  if (!output) return null;
  if (args[0] === "-c" && args.length === 4 && /\.(?:o|obj)$/.test(output)) {
    const source = nativePath(args[1]);
    if (source && /\.c$/.test(source)) return { language: "native", operation: "compile", object: output };
  }
  const inputs = args.slice(0, -2).map(nativePath);
  if (inputs.every((input) => input && /\.(?:o|obj)$/.test(input) && input !== output)) {
    return { language: "native", operation: "link", inputs };
  }
  return null;
}
function directOperation(command2) {
  if (command2.length > MAX_ENTRIES || !literalLine.test(command2)) return null;
  const [executable, subcommand = "", ...args] = command2.match(/"[^"]*"|'[^']*'|[^ \t]+/g);
  const tool = executable.replace(/\.(?:exe|cmd)$/, "");
  if ([subcommand, ...args].some((argument) => ["--help", "--version", "-h"].includes(unquote(argument)))) return null;
  if (["cc", "gcc", "clang"].includes(tool)) return nativeOperation([subcommand, ...args]);
  let match = directOperations.get(tool + " " + subcommand);
  if (tool === "go" && args.some((argument) => /^-(?:exec|toolexec)(?:=|$)/.test(unquote(argument)))) return null;
  if (tool === "node") {
    if (args.some((argument) => /^(?:-[epr]|--(?:eval|print|run|require|import|(?:experimental-)?loader)(?:=|$))/.test(unquote(argument)))) return null;
    if (subcommand === "--test") match = ["node", "test"];
    if (["--check", "-c"].includes(subcommand)) match = ["node", "check"];
  }
  if (tool === "tsc") match = ["node", [subcommand, ...args].includes("--noEmit") ? "check" : "build"];
  if (tool === "pytest") match = ["python", "test"];
  if (["python", "python3", "py"].includes(tool) && subcommand === "-m" && pythonModules.has(args[0])) {
    if (args[0] !== "ruff" || args[1] === "check") match = ["python", pythonModules.get(args[0])];
  }
  if (tool === "ruff" && subcommand === "check") match = ["python", "check"];
  if (tool === "cargo" && subcommand === "fmt" && args.includes("--check")) match = ["rust", "check"];
  if (tool === "zig" && subcommand === "build") {
    const namedStep = ["test", "check"].includes(args[0]) ? args[0] : null;
    if (args.slice(namedStep ? 1 : 0).every((argument) => argument.startsWith("-"))) match = ["zig", namedStep ?? "build"];
  }
  if (tool === "zig" && subcommand === "fmt" && args.includes("--check")) match = ["zig", "check"];
  if (tool === "dotnet" && subcommand === "format" && args.includes("--verify-no-changes")) match = ["dotnet", "check"];
  return match ? { language: match[0], operation: match[1] } : null;
}
function taskRunnerWorkflowStep(step, { atProjectRoot, afterCheckout }) {
  if (Object.hasOwn(step, "if")) return null;
  if (Object.hasOwn(step, "uses")) {
    if (Object.hasOwn(step, "run") || typeof step.uses !== "string") return null;
    const action = /^([A-Za-z0-9-]+\/[A-Za-z0-9-]+)@[A-Za-z0-9_][A-Za-z0-9_./-]*$/.exec(step.uses)?.[1];
    const tool = setupActions.get(action?.toLowerCase());
    return tool ? { tool } : null;
  }
  if (!atProjectRoot || typeof step.run !== "string" || /[^\S \t\r\n]/.test(step.run)) return null;
  const command2 = step.run.trim();
  if (makeProvision.test(command2)) return { tool: "make" };
  if (!afterCheckout) return null;
  const operation = directOperation(command2);
  return operation && { ...operation, command: command2 };
}
function addMatch(groups, key2, occurrence) {
  const matches3 = groups.get(key2);
  if (matches3) matches3.push(occurrence);
  else groups.set(key2, [occurrence]);
}
function adjacentMatches(occurrences, offset) {
  const groups = /* @__PURE__ */ new Map();
  for (const occurrence of occurrences) {
    const command2 = occurrence.job.steps[occurrence.start + offset]?.command;
    if (command2) addMatch(groups, command2, occurrence);
  }
  return groups;
}
function fileDependency(steps) {
  const objects = /* @__PURE__ */ new Set();
  for (const step of steps) {
    if (step.inputs?.some((input) => objects.has(input))) return true;
    if (step.object) objects.add(step.object);
  }
  return false;
}
function taskRunnerWorkflowEvidence(jobs) {
  const starts = /* @__PURE__ */ new Map(), evidence2 = [];
  for (const entry of jobs) {
    const job = { ...entry, prepared: [] };
    for (const [start, step] of job.steps.entries()) {
      if (step?.tool) job.prepared.push({ tool: step.tool, step: start });
      const next = job.steps[start + 1];
      if (step?.command && next?.command) addMatch(starts, step.command, { job, start });
    }
  }
  let remainingEntries = MAX_ENTRIES;
  let remainingComparisons = MAX_ENTRIES * MAX_FILES;
  for (const start of starts.values()) {
    if (start[0].job === start.at(-1).job) continue;
    const pending = [...adjacentMatches(start, 1).values()].map((occurrences) => ({ length: 2, occurrences }));
    while (pending.length) {
      if (remainingEntries < 8) return evidence2;
      const { length, occurrences } = pending.pop();
      if (occurrences[0].job === occurrences.at(-1).job) continue;
      remainingComparisons -= occurrences.length;
      if (remainingComparisons < 0) return evidence2;
      const latestStart = new Map(occurrences.map(({ job, start: start2 }) => [job, start2]));
      const next = adjacentMatches(occurrences, length);
      for (const matches3 of next.values()) pending.push({ length: length + 1, occurrences: matches3 });
      const extendsAllJobs = (groups) => [...groups.values()].some((matches3) => new Set(matches3.map(({ job }) => job)).size === latestStart.size);
      if (extendsAllJobs(next) || extendsAllJobs(adjacentMatches(occurrences, -1))) continue;
      const size = length * (latestStart.size + 1) + latestStart.size;
      if (size > remainingEntries) continue;
      const prepared = [];
      for (const [job, start2] of latestStart) {
        for (const { tool, step } of job.prepared) {
          if (step >= start2 || size + prepared.length > remainingEntries) break;
          prepared.push({ tool, source: job.source, job: job.job, step });
        }
        if (size + prepared.length > remainingEntries) break;
      }
      if (size + prepared.length > remainingEntries) continue;
      remainingEntries -= size + prepared.length;
      const first = occurrences[0];
      const steps = first.job.steps.slice(first.start, first.start + length);
      const record = {
        jobs: [...latestStart].map(([{ source, job }, start2]) => ({
          source,
          job,
          steps: Array.from({ length }, (_, index) => start2 + index)
        })),
        operations: steps.map(({ language, operation }) => ({ language, operation })),
        prepared
      };
      if (fileDependency(steps)) record.fileDependency = true;
      evidence2.push(record);
    }
  }
  return evidence2;
}

// src/project.mjs
var LANGUAGES = ["node", "python", "go", "rust", "zig", "dotnet"];
var UNKNOWN = /* @__PURE__ */ Symbol("\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uC815\uC801 \uD45C\uD604");
var has2 = (object3, key2) => Object.hasOwn(object3, key2);
var object2 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
var unique2 = (values) => [...new Set(values)];
var NODE_LOCKS = {
  "package-lock.json": "npm",
  "npm-shrinkwrap.json": "npm",
  "pnpm-lock.yaml": "pnpm",
  "yarn.lock": "yarn",
  "bun.lock": "bun",
  "bun.lockb": "bun"
};
var PYTHON_LOCKS = { "uv.lock": "uv", "poetry.lock": "poetry", "Pipfile.lock": "pipenv" };
var ALIASES = Object.assign(/* @__PURE__ */ Object.create(null), { node: "node", nodejs: "node", python: "python", go: "go", golang: "go", rust: "rust", zig: "zig", dotnet: "dotnet" });
var RUNNER_PINS = /* @__PURE__ */ new Set(["task", "just", "make"]);
var MISE_RUNNER_PINS = /* @__PURE__ */ new Map([["aqua:go-task/task", "task"], ["aqua:casey/just", "just"]]);
var EXACT = /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?(?:\+[0-9A-Za-z.-]+)?$/;
var PARTIAL = /^v?\d+(?:\.\d+){0,2}$/;
var GO_VERSION = /^1\.\d+(?:\.\d+)?(?:(?:rc|beta)\d+)?$/;
var RUST_CHANNEL = /^(?:stable|beta|nightly)(?:-\d{4}-\d{2}-\d{2})?(?:-(?:x86_64|i686|aarch64)-(?:pc-windows-(?:msvc|gnu)|unknown-linux-(?:gnu|musl)|apple-darwin))?$/;
function classifyVersion(value, language, channels = false) {
  if (typeof value !== "string" || value.length > 160 || value.trim() !== value || !value) return null;
  if (EXACT.test(value)) return "exact";
  if (PARTIAL.test(value)) return "range";
  if (channels && (language === "rust" && RUST_CHANNEL.test(value) || value === "latest" || language === "node" && /^(?:stable|current|node|lts|lts\/\*|lts\/-\d+)$/.test(value) || language === "node" && /^lts\/(?:argon|boron|carbon|dubnium|erbium|fermium|gallium|hydrogen|iron|jod|krypton)$/.test(value))) return "channel";
  const atom = language === "python" ? "(?:\\d+(?:\\.(?:\\d+|\\*)){0,2}(?:(?:a|b|rc)\\d+)?|\\*)" : "(?:v?\\d+(?:\\.(?:\\d+|[xX*])){0,2}(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?|[xX*])";
  const operators = language === "python" ? "(?:~=|==|!=|>=|<=|>|<|\\^|~|=)?" : "(?:>=|<=|>|<|\\^|~|=)?";
  const term = new RegExp(`^${operators}\\s*${atom}$`);
  const alternatives = value.split("||");
  if (alternatives.every((alternative) => {
    if (new RegExp(`^\\s*${atom}\\s+-\\s+${atom}\\s*$`).test(alternative)) return language !== "python";
    const terms = alternative.trim().replace(/([><=~^!]+)\s+(?=[v\d*xX])/g, "$1").split(/[\s,]+/);
    return terms.length > 0 && terms.every((part) => term.test(part));
  })) return "range";
  return null;
}
function tomlDocument(text2) {
  const data = parse(text2, { maxDepth: MAX_DEPTH, integersAsBigInt: "asNeeded", unsafeKeyBehaviour: "throw" });
  const get = (...keys) => keys.reduce((value, key2) => object2(value) && has2(value, key2) ? value[key2] : void 0, data);
  return { get, contains: (...keys) => get(...keys) !== void 0 };
}
var staticPath = (value) => typeof value === "string" && value.length > 0 && value.length <= 240 && value.trim() === value && !/[\x00-\x1f\x7f@$%{}?`|&;<>"']|:\/\//.test(value) && !value.replace(/^[A-Za-z]:[\\/]/, "").includes(":");
var identifier = (value) => typeof value === "string" && /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,99}$/.test(value) && !["__proto__", "constructor", "prototype"].includes(value);
var devcontainerJson = (text2) => stripJsonComments(text2).replace(/"(?:\\.|[^"\\])*"|,(\s*[}\]])/g, (match, end) => end ?? match);
var workspaceRoot = (directory) => directory === void 0 || directory === "." || directory === "./";
var hostCIShells = /* @__PURE__ */ new Set([void 0, "bash", "sh", "cmd", "pwsh", "powershell"]);
var literalCheckout = /^actions\/checkout@[A-Za-z0-9_][A-Za-z0-9_./-]*$/i;
function ciRunSetting(key2, step, job, workflow) {
  if (has2(step, key2)) return step[key2];
  for (const { defaults } of [job, workflow]) {
    if (defaults === void 0) continue;
    if (!object2(defaults)) return UNKNOWN;
    if (defaults.run === void 0) continue;
    if (!object2(defaults.run)) return UNKNOWN;
    if (has2(defaults.run, key2)) return defaults.run[key2];
  }
}
function usesDefaultCheckout(step) {
  if (typeof step?.uses !== "string" || !/^actions\/checkout@/i.test(step.uses)) return true;
  const inputs = step.with;
  return inputs === void 0 || object2(inputs) && (inputs.repository === void 0 || inputs.repository === "") && (workspaceRoot(inputs.path) || inputs.path === "");
}
function recordRunnerPin(pins, tool, versions) {
  const exact = versions.length > 0 && versions.length <= 32 && versions.every((item) => {
    const version = object2(item) && Object.keys(item).length === 1 ? item.version : item;
    return typeof version === "string" && version.length <= 160 && version.trim() === version && EXACT.test(version);
  });
  pins.set(tool, !pins.has(tool) && exact);
}
function yamlDocument(text2) {
  const document = (0, import_yaml2.parseDocument)(text2, { merge: true, uniqueKeys: true, stringKeys: true, prettyErrors: false });
  if (document.errors.length || document.warnings.length) throw new Error();
  const data = document.toJS({ maxAliasCount: 64 });
  const ancestors2 = /* @__PURE__ */ new Set();
  let count = 0;
  function visit(value, depth) {
    if (++count > MAX_ENTRIES || depth > MAX_DEPTH) throw new Error();
    if (value === null || typeof value !== "object") return;
    if (ancestors2.has(value)) throw new Error();
    ancestors2.add(value);
    for (const item of Object.values(value)) visit(item, depth + 1);
    ancestors2.delete(value);
  }
  visit(data, 0);
  if (data === null) return {};
  if (!object2(data)) throw new Error();
  return data;
}
function description(name) {
  if (name === ".gitattributes" || name === ".editorconfig") return {};
  const runner = taskRunnerTool(name);
  if (runner && runner !== "npm" && runner !== "mise") return { parser: "taskRunner", taskRunner: runner };
  if (name === "mise-tasks") return { parser: "miseFileTasks", taskRunner: "mise" };
  if (name === "package.json") return { languages: ["node"], parser: "node", taskRunner: "npm" };
  if (has2(NODE_LOCKS, name)) return { languages: ["node"], manager: NODE_LOCKS[name], lock: true };
  if (name === ".nvmrc" || name === ".node-version") return { languages: ["node"], parser: "pin" };
  if (name === "pyproject.toml") return { languages: ["python"], parser: "python" };
  if (has2(PYTHON_LOCKS, name)) return { languages: ["python"], manager: PYTHON_LOCKS[name], lock: true };
  if (/^requirements[^/\\]*\.txt$/i.test(name) || name === "Pipfile") return { languages: ["python"], manager: name === "Pipfile" ? "pipenv" : "pip" };
  if (name === ".python-version") return { languages: ["python"], parser: "pin" };
  if (/^environment\.ya?ml$/.test(name)) return { languages: ["python"], manager: "conda", parser: "conda" };
  if (name === "go.mod" || name === "go.work") return { languages: ["go"], manager: "go", parser: "go" };
  if (name === ".go-version") return { languages: ["go"], parser: "pin" };
  if (name === "go.sum" || name === "go.work.sum") return { languages: ["go"], integrity: true };
  if (name === "Cargo.toml") return { languages: ["rust"], manager: "cargo", parser: "cargo" };
  if (name === "Cargo.lock") return { languages: ["rust"], manager: "cargo", lock: true };
  if (name === "rust-toolchain" || name === "rust-toolchain.toml") return { languages: ["rust"], parser: "rust" };
  if (name === ".zig-version") return { languages: ["zig"], parser: "pin" };
  if (name === "build.zig.zon") return { languages: ["zig"], parser: "zig" };
  if (name === "build.zig") return { languages: ["zig"] };
  if (name === "global.json") return { languages: ["dotnet"], parser: "dotnet" };
  if (/\.(?:csproj|sln|slnx)$/i.test(name)) return { languages: ["dotnet"], manager: "nuget" };
  if (name === "mise.toml" || name === ".mise.toml") return { languages: LANGUAGES, parser: "mise", shared: true, taskRunner: "mise" };
  if (name === ".tool-versions") return { languages: LANGUAGES, parser: "tools", shared: true };
  if (name === "pnpm-workspace.yaml" || name === "pnpm-workspace.yml") return { languages: ["node"], parser: "workspace" };
  if (name === "pyvenv.cfg" || name === ".venv/pyvenv.cfg") return { languages: ["python"], parser: "venv" };
  if (/^(?:\.devcontainer\.json|\.devcontainer\/devcontainer\.json)$/.test(name)) return { environment: "containers", parser: "devcontainer" };
  if (/^(?:docker-)?compose(?:\.[\w.-]+)?\.ya?ml$/.test(name)) return { environment: "containers", parser: "compose" };
  if (/^Dockerfile(?:\.[\w.-]+)?$/.test(name)) return { environment: "containers" };
  if (/^process-compose(?:\.[\w.-]+)?\.ya?ml$/.test(name)) return { environment: "processCompose", parser: "processCompose" };
  return null;
}
async function analyzeProject(projectPath) {
  const requirements = Object.fromEntries(LANGUAGES.map((language) => [language, {
    state: "not_required",
    versionRequests: [],
    packageManagers: [],
    lockFiles: [],
    metadata: {},
    notes: []
  }]));
  const metadata = {
    scope: { boundary: ".", boundaryKind: "project", ancestorDirectories: [], maxDepth: MAX_DEPTH, maxFiles: MAX_FILES, maxBytes: MAX_BYTES },
    declarations: [],
    workspaces: [],
    ci: [],
    taskRunners: [],
    taskRunnerCI: [],
    taskRunnerWorkflows: [],
    taskRunnerPreferences: [],
    taskRunnerLanguages: [],
    processCompose: { source: null, sources: [], services: [], configurations: [], dynamicEnvironment: false },
    compose: { sources: [], services: [], configurations: [], dynamicEnvironment: false },
    dockerfiles: [],
    execution: { location: "host", hostLanguages: {}, evidence: [] }
  };
  const result3 = { root: null, requirements, environment: { containers: "not_required", processCompose: "not_required" }, files: [], issues: [], metadata };
  const issue = (source, message) => {
    if (!result3.issues.some((entry) => entry.source === source && entry.message === message)) result3.issues.push({ source, message });
  };
  const collectTaskRunner = (tool, source, text2, reason) => {
    const record = analyzeTaskRunner({ tool, source, text: text2, reason });
    if (!record) return;
    const index = metadata.taskRunners.findIndex((entry) => entry.tool === tool && entry.source === source);
    if (index < 0) metadata.taskRunners.push(record);
    else metadata.taskRunners[index] = record;
  };
  const localLanguages = /* @__PURE__ */ new Set();
  const workflowJobs = [];
  const selectedMiseRunnerPins = /* @__PURE__ */ new Set();
  const mark = (language, local2 = true) => {
    if (local2) localLanguages.add(language);
    if (requirements[language].state !== "unknown") requirements[language].state = "required";
  };
  const unknown2 = (languages, source, message) => {
    for (const language of languages) requirements[language].state = "unknown";
    issue(source, message);
  };
  const note = (language, text2) => {
    requirements[language].notes.push(text2);
  };
  const manager = (language, name, source, version) => {
    requirements[language].packageManagers.push({ name, source, ...version ? { version } : {} });
  };
  const request = (language, source, field, value, options = {}) => {
    const kind = classifyVersion(value, language, options.channels);
    if (!kind || options.validate && !options.validate(value)) {
      unknown2([language], source, `${field} \uD544\uB4DC\uC758 \uBC84\uC804 \uD45C\uD604\uC744 \uC815\uC801\uC73C\uB85C \uD574\uC11D\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.`);
      return;
    }
    mark(language);
    requirements[language].versionRequests.push({ source, field, kind: options.kind ?? kind, value });
  };
  const packageVersion = (language, name, source, field, version) => {
    const kind = classifyVersion(version, language);
    if (!kind) {
      unknown2([language], source, `${field} \uD544\uB4DC\uC758 \uB3C4\uAD6C \uBC84\uC804 \uD45C\uD604\uC744 \uD574\uC11D\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.`);
      return;
    }
    const metadata2 = requirements[language].metadata;
    (metadata2.packageManagerRequests ??= []).push({ name, source, field, kind, value: version });
  };
  const asToml = (text2, languages, source) => {
    try {
      return tomlDocument(text2);
    } catch {
      unknown2(languages, source, "TOML \uC120\uC5B8\uC758 \uBB38\uBC95\uC774 \uC798\uBABB\uB418\uC5C8\uAC70\uB098 \uC9C0\uC6D0\uD558\uB294 \uC815\uC801 \uBD84\uC11D \uBC94\uC704\uB97C \uBC97\uC5B4\uB0AC\uC2B5\uB2C8\uB2E4.");
      return null;
    }
  };
  const asJson = (text2, languages, source) => {
    try {
      return parseJsonObject(text2);
    } catch {
      unknown2(languages, source, "JSON \uC120\uC5B8\uC744 \uAC1D\uCCB4\uB85C \uC77D\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      return null;
    }
  };
  const selections = /* @__PURE__ */ new Map();
  let declaration;
  const versionPriority = (family, source) => (declaration?.distance ?? 0) * 10 + (family === "mise" && path2.basename(source) !== ".mise.toml" ? 1 : 0);
  const canSelectVersion = (family, language, source) => !selections.has(`${family}:${language}`) || selections.get(`${family}:${language}`) >= versionPriority(family, source);
  const selectVersion = (family, language, source) => {
    if (!canSelectVersion(family, language, source)) return false;
    selections.set(`${family}:${language}`, versionPriority(family, source));
    if (declaration && !declaration.selectedLanguages.includes(language)) declaration.selectedLanguages.push(language);
    return true;
  };
  function nodeDeclaration(text2, source) {
    const data = asJson(text2, ["node"], source);
    if (!data) return;
    if (has2(data, "workspaces")) workspaceDeclaration(Array.isArray(data.workspaces) ? data.workspaces : data.workspaces?.packages, source, "npm");
    if (has2(data, "engines")) {
      if (!object2(data.engines)) unknown2(["node"], source, "engines \uD544\uB4DC\uC758 \uD615\uC2DD\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      else {
        if (has2(data.engines, "node")) request("node", source, "engines.node", data.engines.node);
        for (const name of ["npm", "pnpm", "yarn", "bun"]) {
          if (has2(data.engines, name)) {
            manager("node", name, source);
            packageVersion("node", name, source, `engines.${name}`, data.engines[name]);
          }
        }
      }
    }
    if (has2(data, "packageManager")) {
      const match = typeof data.packageManager === "string" && data.packageManager.match(/^(npm|pnpm|yarn|bun)@([^+]+)(?:\+sha(?:224|256|384|512)\.[a-fA-F0-9]+)?$/);
      if (!match || !EXACT.test(match[2])) unknown2(["node"], source, "packageManager \uD544\uB4DC\uC758 \uAD00\uB9AC\uC790 \uB610\uB294 \uACE0\uC815 \uBC84\uC804 \uD615\uC2DD\uC744 \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
      else {
        manager("node", match[1], source, classifyVersion(match[2], "node") ? match[2] : void 0);
        packageVersion("node", match[1], source, "packageManager", match[2]);
      }
    }
    if (!has2(data, "devEngines")) return;
    if (!object2(data.devEngines)) {
      unknown2(["node"], source, "devEngines \uD544\uB4DC\uC758 \uD615\uC2DD\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      return;
    }
    for (const field of ["runtime", "packageManager"]) {
      if (!has2(data.devEngines, field)) continue;
      const list2 = Array.isArray(data.devEngines[field]) ? data.devEngines[field] : [data.devEngines[field]];
      if (!list2.length || list2.length > 32) {
        unknown2(["node"], source, "devEngines \uC120\uC5B8 \uBAA9\uB85D\uC758 \uD615\uC2DD\uC744 \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
        continue;
      }
      for (let index = 0; index < list2.length; index += 1) {
        const entry = list2[index], key2 = `devEngines.${field}${Array.isArray(data.devEngines[field]) ? `[${index}]` : ""}`;
        const names3 = field === "runtime" ? ["node"] : ["npm", "pnpm", "yarn", "bun"];
        if (!object2(entry) || !names3.includes(entry.name)) {
          unknown2(["node"], source, `${key2} \uD544\uB4DC\uC758 \uB3C4\uAD6C \uC120\uC5B8\uC744 \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.`);
          continue;
        }
        const policy = entry.onFail ?? "error";
        if (!["warn", "error", "ignore"].includes(policy)) unknown2(["node"], source, `${key2}.onFail \uD544\uB4DC\uC758 \uC815\uCC45\uC744 \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.`);
        (requirements.node.metadata.devEngines ??= []).push({ field: key2, name: entry.name, onFail: ["warn", "error", "ignore"].includes(policy) ? policy : "unknown" });
        if (field === "packageManager") manager("node", entry.name, source, classifyVersion(entry.version, "node") ? entry.version : void 0);
        if (has2(entry, "version")) {
          if (field === "runtime") request("node", source, `${key2}.version`, entry.version);
          else packageVersion("node", entry.name, source, `${key2}.version`, entry.version);
        }
      }
    }
  }
  function pythonDeclaration(text2, source) {
    const data = asToml(text2, ["python"], source);
    if (!data) return;
    const version = data.get("project", "requires-python");
    if (version !== void 0) request("python", source, "project.requires-python", version);
    const project = data.get("project");
    if (project !== void 0 && !object2(project)) unknown2(["python"], source, "project \uD544\uB4DC\uC758 \uD14C\uC774\uBE14 \uD615\uC2DD\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    const dynamic3 = data.get("project", "dynamic");
    if (dynamic3 !== void 0 && (!Array.isArray(dynamic3) || !dynamic3.every((item) => typeof item === "string"))) unknown2(["python"], source, "project.dynamic \uD544\uB4DC\uC758 \uBB38\uC790\uC5F4 \uBAA9\uB85D\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    if (dynamic3 === UNKNOWN || Array.isArray(dynamic3) && dynamic3.includes("requires-python")) unknown2(["python"], source, "\uB3D9\uC801\uC73C\uB85C \uC815\uD558\uB294 requires-python \uC694\uAD6C\uB294 \uC2E4\uD589 \uC5C6\uC774 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    const poetry = data.get("tool", "poetry", "dependencies", "python");
    if (poetry !== void 0) request("python", source, "tool.poetry.dependencies.python", object2(poetry) ? poetry.version : poetry);
    const tools = ["uv", "poetry", "pdm", "hatch", "rye"].filter((name) => data.contains("tool", name));
    for (const name of tools) manager("python", name, source);
    if (tools.length) requirements.python.metadata.tools = tools;
    const uvVersion = data.get("tool", "uv", "required-version");
    if (uvVersion !== void 0) packageVersion("python", "uv", source, "tool.uv.required-version", uvVersion);
    const backend = data.get("build-system", "build-backend");
    if (typeof backend === "string") {
      const known = ["poetry.core.masonry.api", "pdm.backend", "hatchling.build", "setuptools.build_meta", "setuptools.build_meta:__legacy__", "uv_build"];
      if (known.includes(backend)) requirements.python.metadata.buildBackend = backend;
    }
  }
  function pin(text2, source, language) {
    const lines = text2.split(/\r?\n/).map((line) => line.replace(/\s*#.*$/, "").trim()).filter(Boolean);
    if (!lines.length || language !== "python" && lines.length !== 1 || lines.length > 32) {
      unknown2([language], source, "\uBC84\uC804 \uD30C\uC77C\uC758 \uB2E8\uC77C \uC120\uC5B8 \uB610\uB294 \uC9C0\uC6D0\uD558\uB294 \uBC84\uC804 \uBAA9\uB85D\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      return;
    }
    for (const value of lines) request(language, source, "version", value, { channels: true });
    if (lines.length > 1) note(language, "\uC5EC\uB7EC \uC778\uD130\uD504\uB9AC\uD130 \uC120\uC5B8\uC744 \uBCF4\uC874\uD588\uC73C\uBA70 \uC2E4\uC81C \uC120\uD0DD \uC21C\uC11C\uB294 \uD655\uC778\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.");
  }
  function goDeclaration(text2, source) {
    let stripped = "";
    for (let index = 0; index < text2.length; index += 1) {
      const char = text2[index], pair = text2.slice(index, index + 2);
      if (pair === "//") {
        while (index < text2.length && text2[index] !== "\n") index += 1;
        stripped += "\n";
      } else if (pair === "/*") {
        const end = text2.indexOf("*/", index + 2);
        if (end < 0) {
          unknown2(["go"], source, "Go \uC120\uC5B8\uC758 \uC8FC\uC11D\uC774 \uC644\uACB0\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.");
          return;
        }
        stripped += " " + text2.slice(index, end + 2).replace(/[^\n]/g, "");
        index = end + 1;
      } else if (char === '"' || char === "`") {
        const quote = char;
        let closed = false;
        for (index += 1; index < text2.length; index += 1) {
          if (text2[index] === "\\" && quote === '"') {
            index += 1;
            continue;
          }
          if (text2[index] === quote) {
            closed = true;
            break;
          }
          if (quote === '"' && /[\r\n]/.test(text2[index])) break;
        }
        if (!closed) {
          unknown2(["go"], source, "Go \uC120\uC5B8\uC758 \uBB38\uC790\uC5F4\uC774 \uC644\uACB0\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.");
          return;
        }
        stripped += '"\uC815\uC801\uBB38\uC790\uC5F4"';
      } else stripped += char;
    }
    let block = false;
    const seen = /* @__PURE__ */ new Set();
    for (const raw of stripped.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      if (block) {
        if (line === ")") block = false;
        continue;
      }
      if (/^(?:require|exclude|replace|retract|use|tool|godebug)\s*\($/.test(line)) {
        block = true;
        continue;
      }
      const match = line.match(/^(go|toolchain)(?:\s+(.*))?$/);
      if (!match) {
        if (/^module\s+\S+$/.test(line) && source === "go.mod") {
          if (seen.has("module")) unknown2(["go"], source, "module \uC9C0\uC2DC\uBB38\uC774 \uC911\uBCF5\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.");
          seen.add("module");
        } else if (!/^(?:require|exclude|replace|retract|use|tool|godebug)\s+\S/.test(line)) unknown2(["go"], source, "Go \uC120\uC5B8\uC5D0\uC11C \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uAC70\uB098 \uC798\uBABB\uB41C \uCD5C\uC0C1\uC704 \uC9C0\uC2DC\uBB38\uC744 \uBC1C\uACAC\uD588\uC2B5\uB2C8\uB2E4.");
        continue;
      }
      if (seen.has(match[1])) unknown2(["go"], source, "\uB3D9\uC77C\uD55C Go \uB3C4\uAD6C \uBAA8\uC74C \uC9C0\uC2DC\uBB38\uC774 \uC911\uBCF5\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.");
      seen.add(match[1]);
      const value = match[2] ?? "";
      if (match[1] === "go") request("go", source, "go", value, { kind: "minimum", validate: (item) => GO_VERSION.test(item) });
      else if (value === "default") requirements.go.metadata.toolchainDefault = true;
      else if (/^go/.test(value) && GO_VERSION.test(value.slice(2))) {
        requirements.go.versionRequests.push({ source, field: "toolchain", kind: "preferred", value });
      } else unknown2(["go"], source, "toolchain \uD544\uB4DC\uC758 \uC120\uD638 Go \uB3C4\uAD6C \uBAA8\uC74C \uD45C\uD604\uC744 \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
    }
    if (block) unknown2(["go"], source, "Go \uC120\uC5B8\uC758 \uBE14\uB85D\uC774 \uC644\uACB0\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.");
    if (source === "go.mod" && !seen.has("module") || source === "go.work" && !seen.has("go")) unknown2(["go"], source, "Go \uC120\uC5B8\uC758 \uD544\uC218 module \uB610\uB294 go \uC9C0\uC2DC\uBB38\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    note("go", "go \uC9C0\uC2DC\uBB38\uC740 \uCD5C\uC18C \uC694\uAD6C\uC774\uBA70 toolchain \uC9C0\uC2DC\uBB38\uC740 \uC120\uD638 \uB3C4\uAD6C \uBAA8\uC74C\uC785\uB2C8\uB2E4.");
  }
  function cargoDeclaration(text2, source) {
    const data = asToml(text2, ["rust"], source);
    if (!data) return;
    const minimum = (field, value2) => request("rust", source, field, value2, { kind: "minimum", validate: (item) => /^\d+\.\d+(?:\.\d+)?$/.test(item) });
    const workspace = data.get("workspace", "package", "rust-version");
    if (workspace !== void 0) minimum("workspace.package.rust-version", workspace);
    const value = data.get("package", "rust-version");
    const inherited2 = data.get("package", "rust-version", "workspace");
    if (inherited2 === true) {
      requirements.rust.metadata.workspaceRustVersion = true;
      if (workspace === void 0) unknown2(["rust"], source, "\uC0C1\uC704 \uC791\uC5C5 \uACF5\uAC04\uC758 rust-version \uC694\uAD6C\uB294 \uD604\uC7AC \uB8E8\uD2B8\uC5D0\uC11C \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    } else if (value !== void 0) minimum("package.rust-version", value);
    else if (inherited2 !== void 0) unknown2(["rust"], source, "rust-version \uC791\uC5C5 \uACF5\uAC04 \uC0C1\uC18D \uD45C\uD604\uC744 \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
  }
  function rustDeclaration(text2, source) {
    if (source === "rust-toolchain" && !text2.trimStart().startsWith("[")) {
      pin(text2, source, "rust");
      return;
    }
    const data = asToml(text2, ["rust"], source);
    if (!data) return;
    if (!data.contains("toolchain")) {
      unknown2(["rust"], source, "toolchain \uD14C\uC774\uBE14\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      return;
    }
    const channel = data.get("toolchain", "channel");
    const customPath = data.get("toolchain", "path");
    if (["channel", "path", "components", "targets", "profile"].every((field) => data.get("toolchain", field) === void 0)) unknown2(["rust"], source, "toolchain \uD14C\uC774\uBE14\uC5D0\uC11C \uC9C0\uC6D0\uD558\uB294 \uB3C4\uAD6C \uBAA8\uC74C \uC18D\uC131\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    if (channel !== void 0) request("rust", source, "toolchain.channel", channel, { channels: true });
    if (customPath !== void 0) unknown2(["rust"], source, "\uC0AC\uC6A9\uC790 \uC9C0\uC815 Rust \uACBD\uB85C\uC758 \uBC84\uC804\uC740 \uC815\uC801\uC73C\uB85C \uD655\uC778\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
    for (const field of ["components", "targets"]) {
      const value = data.get("toolchain", field);
      if (value === void 0) continue;
      if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && /^[\w-]{1,100}$/.test(item))) unknown2(["rust"], source, `toolchain.${field} \uD544\uB4DC\uC758 \uD615\uC2DD\uC744 \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.`);
      else requirements.rust.metadata[field] = value;
    }
    const profile = data.get("toolchain", "profile");
    if (profile !== void 0) {
      if (["minimal", "default", "complete"].includes(profile)) requirements.rust.metadata.profile = profile;
      else unknown2(["rust"], source, "toolchain.profile \uD544\uB4DC\uC758 \uD504\uB85C\uD544\uC744 \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
    }
    if (channel === void 0) note("rust", "\uB3C4\uAD6C \uBAA8\uC74C \uBC84\uC804 \uC120\uD0DD\uC5D0\uB294 \uAE30\uBCF8\uAC12 \uB610\uB294 \uC678\uBD80 \uC124\uC815\uC758 \uD655\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.");
  }
  function zigDeclaration(text2, source) {
    const tokens = text2.match(/\/\/[^\r\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|[A-Za-z_][\w]*|\s+|./gs) ?? [];
    const significant = tokens.filter((token) => !/^\s|^\/\//.test(token) && !token.startsWith("/*"));
    if (significant[0] !== "." || significant[1] !== "{" || significant.at(-1) !== "}") {
      unknown2(["zig"], source, "ZON \uC120\uC5B8\uC758 \uCD5C\uC0C1\uC704 \uAC1D\uCCB4\uB97C \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      return;
    }
    let depth = 0, count = 0;
    const brackets = [], pairs = { "}": "{", "]": "[", ")": "(" };
    for (let index = 0; index < significant.length; index += 1) {
      const token = significant[index];
      if (token === '"') {
        unknown2(["zig"], source, "ZON \uC120\uC5B8\uC758 \uBB38\uC790\uC5F4\uC774 \uC644\uACB0\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.");
        return;
      }
      if (token === "{" || token === "[" || token === "(") {
        depth += 1;
        brackets.push(token);
      }
      if (token === "}" || token === "]" || token === ")") {
        depth -= 1;
        if (brackets.pop() !== pairs[token]) {
          unknown2(["zig"], source, "ZON \uC120\uC5B8\uC758 \uAD04\uD638\uAC00 \uC77C\uCE58\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
          return;
        }
      }
      if (depth < 0) break;
      if (depth !== 1 || token !== "." || significant[index + 1] !== "minimum_zig_version") continue;
      count += 1;
      const valueToken = significant[index + 3], end = significant[index + 4];
      if (significant[index + 2] !== "=" || !valueToken?.startsWith('"') || ![",", "}"].includes(end)) {
        unknown2(["zig"], source, "minimum_zig_version \uD544\uB4DC\uC758 \uC815\uC801 \uBB38\uC790\uC5F4 \uD45C\uD604\uC744 \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
        continue;
      }
      let value;
      try {
        value = JSON.parse(valueToken);
      } catch {
        value = UNKNOWN;
      }
      request("zig", source, "minimum_zig_version", value, { kind: "minimum", validate: (item) => EXACT.test(item) });
    }
    if (depth || count > 1) unknown2(["zig"], source, "ZON \uC120\uC5B8\uC758 \uC911\uAD04\uD638 \uB610\uB294 \uC911\uBCF5 \uCD5C\uC18C \uBC84\uC804\uC744 \uD655\uC778\uD574\uC57C \uD569\uB2C8\uB2E4.");
  }
  function dotnetDeclaration(text2, source) {
    let options;
    try {
      options = parseGlobalJson(text2);
    } catch (error) {
      unknown2(["dotnet"], source, error.message);
      return;
    }
    note("dotnet", "SDK \uC120\uD0DD\uACFC \uB300\uC0C1 \uB7F0\uD0C0\uC784\uC740 \uBCC4\uAC1C\uC774\uBA70 \uBD84\uC11D \uACBD\uACC4 \uC548\uC758 \uAC00\uC7A5 \uAC00\uAE4C\uC6B4 global.json\uC744 \uC0AC\uC6A9\uD569\uB2C8\uB2E4.");
    if (!options) return;
    if (options.version) {
      requirements.dotnet.versionRequests.push({ source, field: "sdk.version", kind: "sdk", value: options.version });
    }
    requirements.dotnet.metadata.sdk = options;
  }
  function miseDeclaration(text2, source) {
    const languages = LANGUAGES.filter((language) => canSelectVersion("mise", language, source));
    const rootMise = source === ".mise.toml" || source === "mise.toml";
    if (!languages.length && !rootMise) return;
    const data = asToml(text2, languages, source);
    if (!data) {
      for (const language of languages) selectVersion("mise", language, source);
      return;
    }
    if (languages.length && data.contains("include")) {
      if (declaration) declaration.unresolvedFields = ["include"];
      unknown2(languages, source, "mise \uC678\uBD80 \uD3EC\uD568 \uC120\uC5B8\uC740 \uB530\uB77C\uAC00\uC9C0 \uC54A\uC73C\uBBC0\uB85C \uCD94\uAC00 \uC694\uAD6C\uB97C \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    }
    const inline = data.get("tools");
    if (inline === void 0) return;
    if (!object2(inline)) {
      unknown2(languages, source, "mise tools \uD544\uB4DC\uC758 \uC815\uC801 \uD14C\uC774\uBE14 \uD615\uC2DD\uC744 \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
      return;
    }
    if (rootMise) {
      const pins = /* @__PURE__ */ new Map();
      for (const [key2, value] of Object.entries(inline)) {
        const tool = MISE_RUNNER_PINS.get(key2) ?? key2;
        if (RUNNER_PINS.has(tool) && !selectedMiseRunnerPins.has(tool)) {
          recordRunnerPin(pins, tool, Array.isArray(value) ? value : [value]);
        }
      }
      for (const [tool, exact] of pins) {
        selectedMiseRunnerPins.add(tool);
        if (exact) metadata.taskRunnerPreferences.push({ tool, source });
      }
    }
    for (const [key2, value] of Object.entries(inline)) {
      const language = ALIASES[key2.split(":").at(-1)];
      if (!language || !selectVersion("mise", language, source)) continue;
      mark(language);
      (requirements[language].metadata.versionManagers ??= []).push("mise");
      if (key2.includes(":")) {
        unknown2([language], source, "\uBA85\uC2DC\uC801 mise \uBC31\uC5D4\uB4DC\uC758 \uBC84\uC804 \uD574\uC11D\uC740 \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
        continue;
      }
      const versions = Array.isArray(value) ? value : [value];
      if (!versions.length || versions.length > 32) {
        unknown2([language], source, "mise \uBC84\uC804 \uBAA9\uB85D\uC758 \uD615\uC2DD\uC744 \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
        continue;
      }
      for (const item of versions) {
        const version = object2(item) && Object.keys(item).every((field) => field === "version") ? item.version : item;
        request(language, source, `tools.${key2}`, version, { channels: true });
      }
    }
  }
  function toolVersions(text2, source) {
    const seen = /* @__PURE__ */ new Set();
    const pins = /* @__PURE__ */ new Map();
    for (const raw of text2.split(/\r?\n/)) {
      const line = raw.replace(/\s*#.*$/, "").trim();
      if (!line) continue;
      const [key2, ...versions] = line.split(/\s+/), language = ALIASES[key2];
      if (source === ".tool-versions" && RUNNER_PINS.has(key2)) recordRunnerPin(pins, key2, versions);
      if (!language || !selectVersion("asdf", language, source)) continue;
      mark(language);
      (requirements[language].metadata.versionManagers ??= []).push("asdf");
      if (seen.has(language)) unknown2([language], source, "\uAC19\uC740 \uC5B8\uC5B4\uC758 .tool-versions \uC120\uC5B8\uC774 \uC911\uBCF5\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.");
      seen.add(language);
      if (!versions.length || versions.length > 32) unknown2([language], source, ".tool-versions \uBC84\uC804 \uBAA9\uB85D\uC758 \uD615\uC2DD\uC744 \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
      for (const version of versions.slice(0, 32)) request(language, source, key2, version, { channels: true });
    }
    for (const [tool, exact] of pins) if (exact) metadata.taskRunnerPreferences.push({ tool, source });
  }
  function condaDeclaration(text2, source) {
    let data;
    try {
      data = yamlDocument(text2);
    } catch {
      unknown2(["python"], source, "Conda YAML\uC758 \uBB38\uBC95\xB7\uD0DC\uADF8\xB7\uBCC4\uCE6D \uD55C\uB3C4\uB97C \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      return;
    }
    if (!has2(data, "dependencies")) return;
    if (!Array.isArray(data.dependencies)) {
      unknown2(["python"], source, "Conda dependencies \uD544\uB4DC\uAC00 \uBAA9\uB85D\uC774 \uC544\uB2D9\uB2C8\uB2E4.");
      return;
    }
    for (const dependency of data.dependencies) {
      if (typeof dependency !== "string") continue;
      const match = dependency.match(/^python(?=$|[\s=<>!~])([\s\S]*)$/);
      if (match?.[1].trim()) request("python", source, "dependencies.python", match[1].trim().replace(/^=(?!=)/, ""));
    }
  }
  const pendingWorkspaces = [];
  function workspaceDeclaration(patterns, source, kind) {
    const entry = { source, kind, state: "required", patterns: [], members: [], notes: [] };
    metadata.workspaces.push(entry);
    if (!Array.isArray(patterns) || patterns.length > 64 || !patterns.every((value) => typeof value === "string")) {
      uncertain(entry, source, "\uC791\uC5C5 \uACF5\uAC04\uC758 packages \uC120\uC5B8\uC774 \uC815\uC801 \uBB38\uC790\uC5F4 \uBAA9\uB85D\uC774 \uC544\uB2D9\uB2C8\uB2E4.");
      return;
    }
    for (const pattern of patterns) {
      const value = pattern.replace(/^!/, "").replace(/^\.\//, "").replace(/\/$/, "");
      if (!value || value.length > 240 || /[\\@$%{}\[\]?`|&;<>:\x00-\x1f]/.test(value) || value.split("/").some((part) => part === ".." || /^(?:node_modules|\.git|\.venv)$/.test(part))) {
        uncertain(entry, source, "\uC791\uC5C5 \uACF5\uAC04 \uD328\uD134\uC758 \uC678\uBD80 \uACBD\uB85C\xB7\uB3D9\uC801 \uD45C\uD604\xB7\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 glob\uC740 \uD0D0\uC0C9\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
      } else entry.patterns.push((pattern.startsWith("!") ? "!" : "") + value);
    }
    pendingWorkspaces.push(entry);
  }
  function uncertain(record, source, message) {
    record.state = "unknown";
    (record.notes ??= []).push(message);
    issue(source, message);
  }
  function pathField(value, source, field) {
    if (value === void 0) return { state: "not_required" };
    if (staticPath(value)) return { state: "required", value };
    const record = { state: "unknown" };
    uncertain(record, source, `${field} \uACBD\uB85C\uC758 \uB3D9\uC801 \uD45C\uD604\uC774\uB098 \uBE44\uC815\uC801 \uAC12\uC744 \uD3C9\uAC00\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.`);
    return record;
  }
  function shellField(value, source) {
    if (value === void 0) return { state: "not_required" };
    const record = { state: "required" };
    const executable = object2(value) ? value.shell_command : void 0;
    const args = object2(value) ? value.shell_argument : void 0;
    if (!staticPath(executable) || !/^(?:pwsh|powershell|cmd|bash|sh|zsh|fish|nu)(?:\.exe)?$/i.test(executable.split(/[\\/]/).at(-1))) {
      uncertain(record, source, "shell.shell_command\uC758 \uC54C\uB824\uC9C4 \uC178 \uACBD\uB85C\uB97C \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    } else record.executable = executable;
    if (args !== void 0) {
      const options = /* @__PURE__ */ new Set(["-c", "-lc", "-ic", "-l", "-i", "--login", "--noprofile", "--norc", "--no-config", "--no-config-file", "-noprofile", "-noninteractive", "-nologo", "-command", "-noexit", "--commands", "/c", "/s", "/d"]);
      if (typeof args !== "string" || !options.has(args.toLowerCase())) {
        uncertain(record, source, "shell.shell_argument\uB294 \uB2E8\uC77C \uC778\uC218\uC785\uB2C8\uB2E4. \uC5EC\uB7EC \uC635\uC158 \uBB38\uC790\uC5F4\xB7\uBC30\uC5F4\xB7\uB3D9\uC801 \uD45C\uD604\uC740 \uBBF8\uD655\uC778\uC73C\uB85C \uB0A8\uAE41\uB2C8\uB2E4.");
      } else record.arguments = [args];
    }
    return record;
  }
  const portNumber = (value) => Number.isInteger(Number(value)) && /^(?:[1-9]\d{0,4})$/.test(String(value)) && Number(value) <= 65535;
  function portsField(values, source) {
    if (values === void 0) return [];
    if (!Array.isArray(values) || values.length > 128) {
      issue(source, "ports \uD544\uB4DC\uC758 \uC815\uC801 \uBAA9\uB85D\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      return [{ state: "unknown" }];
    }
    const range = (value) => {
      if (portNumber(value)) return Number(value);
      if (typeof value !== "string") return null;
      const parts = value.split("-");
      if (parts.length === 2 && parts.every(portNumber) && Number(parts[0]) <= Number(parts[1])) return value;
      return null;
    };
    return values.map((value) => {
      const entry = { state: "required" };
      if (object2(value)) {
        const target = range(value.target), published = value.published === void 0 ? void 0 : range(value.published);
        if (target !== null && published !== null && [void 0, "tcp", "udp", "sctp"].includes(value.protocol)) {
          return { ...entry, target, ...published === void 0 ? {} : { published }, protocol: value.protocol ?? "tcp" };
        }
      } else if (typeof value === "number" || typeof value === "string") {
        const match = String(value).match(/^(?:(?:\[[0-9a-fA-F:]+\]|\d{1,3}(?:\.\d{1,3}){3}):)?(?:(\d+(?:-\d+)?):)?(\d+(?:-\d+)?)(?:\/(tcp|udp|sctp))?$/);
        if (match && range(match[2]) !== null && (match[1] === void 0 || range(match[1]) !== null)) {
          return { ...entry, target: range(match[2]), ...match[1] === void 0 ? {} : { published: range(match[1]) }, protocol: match[3] ?? "tcp" };
        }
      }
      uncertain(entry, source, "\uD3EC\uD2B8 \uC120\uC5B8\uC758 \uB3D9\uC801 \uD45C\uD604 \uB610\uB294 \uD3EC\uD2B8 \uBC94\uC704\uB97C \uC815\uC801\uC73C\uB85C \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      return entry;
    });
  }
  function dependenciesField(value, source, process2 = false) {
    if (value === void 0) return [];
    const entries2 = Array.isArray(value) && !process2 ? value.map((name) => [name, {}]) : object2(value) ? Object.entries(value) : null;
    if (!entries2 || entries2.length > 128) {
      issue(source, "depends_on \uD544\uB4DC\uC758 \uC815\uC801 \uBAA9\uB85D\xB7\uB9E4\uD551\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      return [{ state: "unknown" }];
    }
    const conditions = process2 ? ["process_started", "process_healthy", "process_completed", "process_completed_successfully", "process_log_ready"] : ["service_started", "service_healthy", "service_completed_successfully"];
    return entries2.map(([name, settings]) => {
      const entry = { state: "required" };
      if (identifier(name)) entry.name = name;
      else uncertain(entry, source, "depends_on\uC758 \uC815\uC801 \uC11C\uBE44\uC2A4 \uC774\uB984\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      const condition = object2(settings) ? settings.condition : void 0;
      if (!object2(settings) || condition !== void 0 && !conditions.includes(condition)) uncertain(entry, source, "depends_on\uC758 \uC870\uAC74 \uD45C\uD604\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      else entry.condition = condition ?? (process2 ? "process_started" : "service_started");
      return entry;
    });
  }
  function probeField(value, source, docker = false) {
    if (value === void 0) return { state: "not_required" };
    const entry = { state: "required", kind: "unknown" };
    if (!object2(value)) {
      uncertain(entry, source, "\uAC74\uAC15 \uD655\uC778 \uC120\uC5B8\uC774 \uC815\uC801 \uB9E4\uD551\uC774 \uC544\uB2D9\uB2C8\uB2E4.");
      return entry;
    }
    if (docker) {
      if (value.disable === true) return { state: "not_required", disabled: true };
      if (has2(value, "test")) {
        entry.kind = "exec";
        entry.commandPresent = true;
      }
      for (const field of ["interval", "timeout", "start_period", "start_interval"]) {
        if (!has2(value, field)) continue;
        if (typeof value[field] === "string" && /^(?:\d+(?:\.\d+)?(?:ns|us|ms|s|m|h))+$/.test(value[field])) (entry.timing ??= {})[field] = value[field];
        else uncertain(entry, source, `healthcheck.${field}\uC758 \uC815\uC801 \uC2DC\uAC04 \uAC04\uACA9\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.`);
      }
      if (has2(value, "retries")) {
        if (Number.isInteger(value.retries) && value.retries >= 0 && value.retries <= 1e3) (entry.timing ??= {}).retries = value.retries;
        else uncertain(entry, source, "healthcheck.retries\uC758 \uC815\uC801 \uD69F\uC218\uB97C \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      }
    } else {
      const kinds = ["exec", "http_get"].filter((field) => has2(value, field));
      if (kinds.length === 1 && object2(value[kinds[0]])) {
        entry.kind = kinds[0] === "exec" ? "exec" : "http";
        if (entry.kind === "exec") entry.commandPresent = has2(value.exec, "command");
        else {
          if (portNumber(value.http_get.port)) entry.port = Number(value.http_get.port);
          else uncertain(entry, source, "HTTP \uAC74\uAC15 \uD655\uC778 \uD3EC\uD2B8\uC758 \uB3D9\uC801 \uD45C\uD604\uC774\uB098 \uBC94\uC704\uB97C \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
          if (["http", "https"].includes(value.http_get.scheme)) entry.scheme = value.http_get.scheme;
        }
      } else uncertain(entry, source, "\uAC74\uAC15 \uD655\uC778\uC758 exec \uB610\uB294 http_get \uD615\uC2DD\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      for (const field of ["initial_delay_seconds", "period_seconds", "timeout_seconds", "success_threshold", "failure_threshold"]) {
        if (!has2(value, field)) continue;
        if (typeof value[field] === "number" && Number.isFinite(value[field]) && value[field] >= 0) (entry.timing ??= {})[field] = value[field];
        else uncertain(entry, source, `\uAC74\uAC15 \uD655\uC778 ${field}\uC758 \uC815\uC801 \uC22B\uC790\uB97C \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.`);
      }
    }
    return entry;
  }
  function processDeclaration(text2, source) {
    const record = { source, state: "required", shell: { state: "not_required" }, workingDirectory: { state: "not_required" }, processes: [], notes: [] };
    metadata.processCompose.configurations.push(record);
    metadata.processCompose.sources.push(source);
    if (!metadata.processCompose.source || source === "process-compose.yaml" || source === "process-compose.yml" && metadata.processCompose.source !== "process-compose.yaml") metadata.processCompose.source = source;
    let data;
    try {
      data = yamlDocument(text2);
    } catch {
      uncertain(record, source, "Process Compose YAML\uC758 \uBB38\uBC95\xB7\uD0DC\uADF8\xB7\uBCC4\uCE6D \uD55C\uB3C4\uB97C \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      result3.environment.processCompose = "unknown";
      return;
    }
    if (has2(data, "environment") || has2(data, "env_file") || has2(data, "vars")) metadata.processCompose.dynamicEnvironment = true;
    record.shell = shellField(data.shell, source);
    if (record.shell.executable && metadata.processCompose.source === source) metadata.processCompose.shell = { command: record.shell.executable, ...record.shell.arguments ? { argument: record.shell.arguments.join(" ") } : {} };
    record.workingDirectory = pathField(data.working_dir, source, "working_dir");
    for (const field of ["include", "includes", "extends"]) if (has2(data, field)) uncertain(record, source, "Process Compose\uC758 \uC678\uBD80 \uD3EC\uD568\xB7\uC0C1\uC18D\uC740 \uB530\uB77C\uAC00\uC9C0 \uC54A\uC544 \uCD94\uAC00 \uD504\uB85C\uC138\uC2A4\uC640 \uBCD1\uD569 \uACB0\uACFC\uB294 \uBBF8\uD655\uC778\uC785\uB2C8\uB2E4.");
    if (data.processes === void 0) return;
    if (!object2(data.processes)) {
      uncertain(record, source, "Process Compose processes \uD544\uB4DC\uAC00 \uB9E4\uD551\uC774 \uC544\uB2D9\uB2C8\uB2E4.");
      result3.environment.processCompose = "unknown";
      return;
    }
    for (const [name, settings] of Object.entries(data.processes)) {
      if (!identifier(name) || !object2(settings)) {
        uncertain(record, source, "\uD504\uB85C\uC138\uC2A4 \uC774\uB984 \uB610\uB294 \uC124\uC815\uC758 \uC815\uC801 \uB9E4\uD551\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
        continue;
      }
      const entry = {
        name,
        state: "required",
        commandPresent: has2(settings, "command") || has2(settings, "entrypoint"),
        environmentPresent: has2(settings, "environment") || has2(data, "environment"),
        envFilePresent: has2(settings, "env_file") || has2(data, "env_file"),
        shell: settings.shell === void 0 ? record.shell : shellField(settings.shell, source),
        workingDirectory: settings.working_dir === void 0 ? record.workingDirectory : pathField(settings.working_dir, source, "working_dir"),
        dependencies: dependenciesField(settings.depends_on, source, true),
        health: { readiness: probeField(settings.readiness_probe, source), liveness: probeField(settings.liveness_probe, source) },
        ports: portsField(settings.ports, source)
      };
      if (object2(settings.availability)) {
        const policy = settings.availability;
        entry.availability = {};
        if (["always", "on_failure", "exit_on_failure", "no"].includes(policy.restart)) entry.availability.restart = policy.restart;
        for (const field of ["backoff_seconds", "max_restarts"]) if (Number.isInteger(policy[field]) && policy[field] >= 0) entry.availability[field] = policy[field];
        if (typeof policy.exit_on_end === "boolean") entry.availability.exitOnEnd = policy.exit_on_end;
      }
      if (has2(settings, "extends")) uncertain(entry, source, "\uD504\uB85C\uC138\uC2A4 extends \uC0C1\uC18D\uC740 \uBCD1\uD569\uD558\uC9C0 \uC54A\uC544 \uC0C1\uC18D \uD544\uB4DC\uB294 \uBBF8\uD655\uC778\uC785\uB2C8\uB2E4.");
      if (entry.shell.state === "unknown" || entry.workingDirectory.state === "unknown" || entry.dependencies.some((item) => item.state === "unknown") || Object.values(entry.health).some((item) => item.state === "unknown") || entry.ports.some((item) => item.state === "unknown")) entry.state = "unknown";
      record.processes.push(entry);
      const probe2 = entry.health.readiness.state !== "not_required" ? entry.health.readiness : entry.health.liveness;
      metadata.processCompose.services.push({
        name,
        source,
        ...entry.workingDirectory.value === void 0 ? {} : { workingDir: entry.workingDirectory.value },
        dependencies: entry.dependencies.flatMap((item) => item.name ? [item.name] : []),
        healthCheck: { defined: probe2.state !== "not_required", ...probe2.kind === void 0 ? {} : { type: probe2.kind }, ...probe2.port === void 0 ? {} : { port: probe2.port } }
      });
      if (entry.environmentPresent || entry.envFilePresent || has2(settings, "vars") || /\$|\{\{/.test(String(settings.working_dir ?? ""))) metadata.processCompose.dynamicEnvironment = true;
    }
    if (record.processes.some((entry) => entry.state === "unknown") || record.shell.state === "unknown" || record.workingDirectory.state === "unknown") record.state = "unknown";
  }
  function venvDeclaration(text2, source) {
    const entry = { source, directory: portable(path2.dirname(source)), state: "required", notes: [] };
    (requirements.python.metadata.virtualEnvironments ??= []).push(entry);
    metadata.pythonVenv ??= { environments: requirements.python.metadata.virtualEnvironments };
    const values = /* @__PURE__ */ new Map();
    for (const raw of text2.split(/\r?\n/)) {
      if (!raw.trim() || raw.trimStart().startsWith("#")) continue;
      const pair = raw.match(/^\s*([\w-]+)\s*=\s*(.*?)\s*$/);
      if (!pair) {
        uncertain(entry, source, "pyvenv.cfg\uC5D0 \uD0A4\uC640 \uAC12\uC73C\uB85C \uC77D\uC744 \uC218 \uC5C6\uB294 \uD589\uC774 \uC788\uC2B5\uB2C8\uB2E4.");
        continue;
      }
      const key2 = pair[1].toLowerCase();
      if (!["version", "version_info", "include-system-site-packages", "home", "executable", "implementation"].includes(key2)) continue;
      if (values.has(key2)) {
        uncertain(entry, source, "pyvenv.cfg\uC758 \uBA54\uD0C0\uB370\uC774\uD130 \uD544\uB4DC\uAC00 \uC911\uBCF5\uB418\uC5C8\uC2B5\uB2C8\uB2E4.");
        continue;
      }
      values.set(key2, pair[2]);
    }
    const version = values.get("version") ?? values.get("version_info");
    if (version !== void 0) {
      if (/^\d+\.\d+\.\d+(?:(?:a|b|rc)\d+)?$/.test(version)) entry.version = version;
      else uncertain(entry, source, "pyvenv.cfg\uC758 Python \uBC84\uC804 \uBA54\uD0C0\uB370\uC774\uD130\uB97C \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    }
    const system = values.get("include-system-site-packages");
    if (system !== void 0) {
      if (/^(true|false)$/i.test(system)) entry.includeSystemSitePackages = system.toLowerCase() === "true";
      else uncertain(entry, source, "pyvenv.cfg\uC758 \uC2DC\uC2A4\uD15C \uD328\uD0A4\uC9C0 \uD3EC\uD568 \uC124\uC815\uC774 \uBD88\uB9AC\uC5B8\uC774 \uC544\uB2D9\uB2C8\uB2E4.");
    }
    entry.homePresent = values.has("home");
    entry.executablePresent = values.has("executable");
    if (/^(cpython|pypy)$/i.test(values.get("implementation") ?? "")) entry.implementation = values.get("implementation").toLowerCase();
    note("python", "\uAC00\uC0C1\uD658\uACBD \uBA54\uD0C0\uB370\uC774\uD130\uB294 \uC124\uCE58\uB41C \uD658\uACBD\uC758 \uAD00\uCC30\uC774\uBA70 \uD504\uB85C\uC81D\uD2B8\uC758 \uBC84\uC804 \uC694\uAD6C\uB098 \uC778\uD130\uD504\uB9AC\uD130 \uC2E4\uD589 \uAC80\uC99D\uC774 \uC544\uB2D9\uB2C8\uB2E4.");
  }
  const composeReferences = [];
  function composeDeclaration(text2, source) {
    const record = { source, state: "required", services: [], notes: [] };
    metadata.compose.sources.push(source);
    metadata.compose.configurations.push(record);
    let data;
    try {
      data = yamlDocument(text2);
    } catch {
      uncertain(record, source, "Compose YAML\uC758 \uBB38\uBC95\xB7\uD0DC\uADF8\xB7\uBCC4\uCE6D \uD55C\uB3C4\uB97C \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      return;
    }
    for (const field of ["include", "extends"]) if (has2(data, field)) uncertain(record, source, "Compose \uC678\uBD80 \uD3EC\uD568\xB7\uC0C1\uC18D\uC740 \uB530\uB77C\uAC00\uC9C0 \uC54A\uC544 \uCD94\uAC00 \uC11C\uBE44\uC2A4\uC640 \uBCD1\uD569 \uACB0\uACFC\uB294 \uBBF8\uD655\uC778\uC785\uB2C8\uB2E4.");
    if (!object2(data.services)) {
      uncertain(record, source, "Compose services \uD544\uB4DC\uC758 \uC815\uC801 \uB9E4\uD551\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      return;
    }
    for (const [name, settings] of Object.entries(data.services)) {
      if (!identifier(name) || !object2(settings)) {
        uncertain(record, source, "Compose \uC11C\uBE44\uC2A4 \uC774\uB984 \uB610\uB294 \uC815\uC801 \uC124\uC815\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
        continue;
      }
      const entry = {
        name,
        state: "required",
        executionLocation: "container",
        imagePresent: has2(settings, "image"),
        commandPresent: has2(settings, "command") || has2(settings, "entrypoint"),
        environmentPresent: has2(settings, "environment") || has2(settings, "env_file"),
        workingDirectory: pathField(settings.working_dir, source, "working_dir"),
        dependencies: dependenciesField(settings.depends_on, source),
        ports: portsField(settings.ports, source),
        health: probeField(settings.healthcheck, source, true)
      };
      const summary = { name, source };
      if (has2(settings, "image")) {
        if (typeof settings.image === "string" && /^(?:[a-zA-Z0-9][a-zA-Z0-9._-]*(?::\d+)?\/)*[a-zA-Z0-9][a-zA-Z0-9._-]*(?::[\w.-]+|@sha256:[a-fA-F0-9]{64})?$/.test(settings.image) && settings.image.length <= 240) summary.image = settings.image;
        else uncertain(entry, source, "Compose image\uC758 \uB3D9\uC801 \uD45C\uD604\uC774\uB098 \uBE44\uC815\uC801 \uCC38\uC870\uB294 \uBC18\uD658\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
      }
      if (has2(settings, "build")) {
        summary.build = true;
        const build = object2(settings.build) ? settings.build : typeof settings.build === "string" ? { context: settings.build } : null;
        entry.build = build ? { context: pathField(build.context, source, "build.context"), dockerfile: pathField(build.dockerfile, source, "build.dockerfile") } : { state: "unknown" };
        if (!build) uncertain(entry, source, "Compose build\uC758 \uC815\uC801 \uACBD\uB85C\xB7\uB9E4\uD551\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      }
      if (has2(settings, "profiles")) {
        if (Array.isArray(settings.profiles) && settings.profiles.length <= 64 && settings.profiles.every(identifier)) summary.profiles = settings.profiles;
        else uncertain(entry, source, "Compose profiles\uC758 \uC815\uC801 \uC774\uB984 \uBAA9\uB85D\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      }
      if (has2(settings, "extends")) uncertain(entry, source, "Compose \uC11C\uBE44\uC2A4 extends\uB294 \uB530\uB77C\uAC00\uC9C0 \uC54A\uC544 \uC0C1\uC18D \uD544\uB4DC\uB9CC \uBBF8\uD655\uC778\uC785\uB2C8\uB2E4.");
      if (entry.environmentPresent || /\$|\{\{/.test(JSON.stringify([settings.image, settings.working_dir, settings.ports]))) metadata.compose.dynamicEnvironment = true;
      if (entry.workingDirectory.state === "unknown" || entry.dependencies.some((item) => item.state === "unknown") || entry.ports.some((item) => item.state === "unknown") || entry.health.state === "unknown") entry.state = "unknown";
      record.services.push(entry);
      metadata.compose.services.push(summary);
    }
    if (record.services.length) result3.environment.containers = "required";
    if (record.services.some((entry) => entry.state === "unknown")) record.state = "unknown";
    metadata.execution.evidence.push({ source, kind: "compose", location: "unknown", reason: "Compose\uB294 \uC120\uC5B8\uD55C \uC11C\uBE44\uC2A4\uC758 \uCEE8\uD14C\uC774\uB108 \uC2E4\uD589\uB9CC \uB098\uD0C0\uB0B4\uBA70 \uC571\xB7\uD638\uC2A4\uD2B8 \uC5B8\uC5B4 \uC2E4\uD589 \uC704\uCE58\uB97C \uD655\uC815\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." });
  }
  function devcontainerDeclaration(text2, source) {
    const previous = metadata.devcontainer;
    const record = { source, state: "required", mode: "unknown", runtimeLocation: "unknown", composeFiles: [], notes: [] };
    metadata.devcontainer ??= { source, runtimeLocation: "unknown", configurations: [] };
    metadata.devcontainer.configurations.push(record);
    if (previous && previous.source !== source) metadata.devcontainer.runtimeLocation = "unknown";
    let data;
    try {
      data = asJson(devcontainerJson(text2), [], source);
    } catch {
      issue(source, "devcontainer JSONC\uC758 \uC8FC\uC11D\xB7\uBB38\uC790\uC5F4\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    }
    if (!data) {
      uncertain(record, source, "devcontainer JSONC\uB97C \uC815\uC801 \uAC1D\uCCB4\uB85C \uC77D\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      return;
    }
    const modes = ["image", "build", "dockerFile", "dockerComposeFile"].filter((field) => has2(data, field));
    if (modes.length !== 1) uncertain(record, source, "devcontainer\uC758 \uB2E8\uC77C image\xB7build\xB7Compose \uC2E4\uD589 \uBAA8\uB4DC\uB97C \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    else if (modes[0] === "dockerComposeFile") {
      record.mode = "compose";
      const files = Array.isArray(data.dockerComposeFile) ? data.dockerComposeFile : [data.dockerComposeFile];
      if (!files.length || files.length > 32) uncertain(record, source, "devcontainer Compose \uD30C\uC77C \uBAA9\uB85D\uC758 \uD55C\uB3C4\uB97C \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      else for (const filename of files) {
        if (!staticPath(filename) || path2.isAbsolute(filename) || path2.win32.isAbsolute(filename)) {
          uncertain(record, source, "devcontainer\uC758 \uC678\uBD80\xB7\uB3D9\uC801 Compose \uCC38\uC870\uB294 \uB530\uB77C\uAC00\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
          continue;
        }
        const target = path2.resolve(root, path2.dirname(source), filename);
        if (!inside(root, target)) {
          uncertain(record, source, "devcontainer\uAC00 \uD504\uB85C\uC81D\uD2B8 \uBC16\uC758 Compose \uD30C\uC77C\uC744 \uCC38\uC870\uD558\uC5EC \uC77D\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.");
          continue;
        }
        const relative2 = portable(path2.relative(root, target));
        record.composeFiles.push(relative2);
        composeReferences.push({ source: relative2, owner: record });
      }
      if (!identifier(data.service)) uncertain(record, source, "devcontainer Compose \uC2E4\uD589 \uB300\uC0C1 service\uC758 \uC815\uC801 \uC774\uB984\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      else record.service = data.service;
      if (record.service && record.composeFiles.length === files.length) record.runtimeLocation = "container";
    } else if (modes[0] === "image") {
      record.mode = "image";
      if (typeof data.image === "string" && data.image.trim()) record.runtimeLocation = "container";
      else uncertain(record, source, "devcontainer image \uD544\uB4DC\uAC00 \uBE44\uC5B4 \uC788\uAC70\uB098 \uBB38\uC790\uC5F4\uC774 \uC544\uB2D9\uB2C8\uB2E4.");
      if (typeof data.image === "string" && /[$%{}@]|:\/\//.test(data.image)) uncertain(record, source, "devcontainer image\uC758 \uB3D9\uC801 \uD45C\uD604\uC774\uB098 \uC678\uBD80 \uC778\uC99D \uAC12\uC740 \uD3C9\uAC00\uD558\uAC70\uB098 \uBC18\uD658\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
    } else if (modes.length === 1) {
      record.mode = "build";
      const build = object2(data.build) ? data.build : has2(data, "dockerFile") ? { dockerfile: data.dockerFile, context: data.context } : null;
      if (build) {
        record.build = { dockerfile: pathField(build.dockerfile, source, "build.dockerfile"), context: pathField(build.context, source, "build.context") };
        if (typeof build.dockerfile === "string" && build.dockerfile.trim()) record.runtimeLocation = "container";
        if (Object.values(record.build).some((field) => field.state === "unknown")) record.state = "unknown";
      } else uncertain(record, source, "devcontainer build \uD544\uB4DC\uC758 \uC815\uC801 \uB9E4\uD551\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    }
    record.workspaceFolder = pathField(data.workspaceFolder, source, "workspaceFolder");
    record.forwardPorts = portsField(data.forwardPorts, source);
    record.lifecycleCommandsPresent = ["initializeCommand", "onCreateCommand", "updateContentCommand", "postCreateCommand", "postStartCommand", "postAttachCommand"].some((field) => has2(data, field));
    record.environmentPresent = has2(data, "containerEnv") || has2(data, "remoteEnv");
    if (record.workspaceFolder.state === "unknown" || record.forwardPorts.some((entry) => entry.state === "unknown")) record.state = "unknown";
    if (previous && previous.source !== source) {
      uncertain(record, source, "devcontainer \uC124\uC815 \uD30C\uC77C\uC774 \uC5EC\uB7EC \uAC1C\uC5EC\uC11C \uC0AC\uC6A9\uC790\uAC00 \uC120\uD0DD\uD560 \uC2E4\uD589 \uAD6C\uC131\uC744 \uD655\uC815\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.");
      metadata.devcontainer.runtimeLocation = "unknown";
    } else {
      metadata.devcontainer.runtimeLocation = record.runtimeLocation;
      if (record.composeFiles.length) metadata.devcontainer.composeFiles = record.composeFiles;
    }
    if (record.runtimeLocation === "container") result3.environment.containers = "required";
    metadata.execution.evidence.push({ source, kind: "devcontainer", location: record.runtimeLocation, reason: record.runtimeLocation === "container" ? "\uBA85\uC2DC\uD55C devcontainer \uC791\uC5C5 \uBB38\uB9E5\uC740 \uCEE8\uD14C\uC774\uB108\uC774\uBA70 Windows \uD638\uC2A4\uD2B8 \uC5B8\uC5B4 \uB3C4\uAD6C\uC758 \uD544\uC694\uC131\uC740 \uBCC4\uB3C4 \uC120\uD0DD\uC5D0 \uB2EC\uB824 \uC788\uC2B5\uB2C8\uB2E4." : "devcontainer \uC2E4\uD589 \uBAA8\uB4DC \uB610\uB294 \uCC38\uC870 \uBC94\uC704\uB97C \uD655\uC778\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4." });
  }
  function ciDeclaration(text2, source) {
    const record = { source, provider: "github-actions", state: "required", jobs: [], notes: [] };
    metadata.ci.push(record);
    let data;
    try {
      data = yamlDocument(text2);
    } catch {
      uncertain(record, source, "CI YAML\uC758 \uBB38\uBC95\xB7\uD0DC\uADF8\xB7\uBCC4\uCE6D \uD55C\uB3C4\uB97C \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      return;
    }
    if (!object2(data.jobs)) {
      uncertain(record, source, "CI jobs\uC758 \uC815\uC801 \uB9E4\uD551\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      return;
    }
    const workflowAtProjectRoot = source.startsWith(".github/workflows/") && (metadata.scope.boundaryKind !== "repository" || metadata.scope.boundary === ".");
    const repositoryWorkflow = workflowAtProjectRoot && metadata.scope.boundaryKind === "repository" && metadata.scope.boundary === ".";
    const setups = {
      "actions/setup-node": ["node", "node-version", "node-version-file"],
      "actions/setup-python": ["python", "python-version", "python-version-file"],
      "actions/setup-go": ["go", "go-version", "go-version-file"],
      "actions/setup-dotnet": ["dotnet", "dotnet-version", "global-json-file"],
      "dtolnay/rust-toolchain": ["rust", "toolchain"],
      "actions-rust-lang/setup-rust-toolchain": ["rust", "toolchain"],
      "mlugg/setup-zig": ["zig", "version"]
    };
    for (const [id, job] of Object.entries(data.jobs)) {
      if (!identifier(id) || !object2(job)) {
        uncertain(record, source, "CI \uC791\uC5C5 \uC774\uB984 \uB610\uB294 \uC815\uC801 \uB9E4\uD551\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
        continue;
      }
      const entry = { id, state: "required", executionLocation: has2(job, "container") ? typeof job.container === "string" || object2(job.container) ? "container" : "unknown" : "host", requirements: [], notes: [] };
      record.jobs.push(entry);
      if (has2(job, "uses")) uncertain(entry, source, "\uC7AC\uC0AC\uC6A9 CI \uC6CC\uD06C\uD50C\uB85C\uB294 \uC678\uBD80 \uB610\uB294 \uBCC4\uB3C4 \uD30C\uC77C\uC744 \uD3C9\uAC00\uD558\uC9C0 \uC54A\uC544 \uB0B4\uBD80 \uC694\uAD6C\uAC00 \uBBF8\uD655\uC778\uC785\uB2C8\uB2E4.");
      const runsOn = Array.isArray(job["runs-on"]) ? job["runs-on"] : [job["runs-on"]];
      if (runsOn.every(identifier)) entry.runsOn = runsOn;
      else if (job["runs-on"] !== void 0) uncertain(entry, source, "CI runs-on\uC758 \uB3D9\uC801 \uD45C\uD604\uC744 \uD3C9\uAC00\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
      if (job.defaults?.run?.["working-directory"] !== void 0) entry.workingDirectory = pathField(job.defaults.run["working-directory"], source, "defaults.run.working-directory");
      const matrix = job.strategy?.matrix;
      const matrixValues = (key2) => {
        if (!object2(matrix)) return null;
        if (matrix.exclude !== void 0) return null;
        const values = [];
        if (Array.isArray(matrix[key2])) values.push(...matrix[key2]);
        if (Array.isArray(matrix.include)) {
          for (const row of matrix.include) if (object2(row) && has2(row, key2)) values.push(row[key2]);
        }
        return values.length > 0 && values.length <= 64 ? unique2(values) : null;
      };
      if (job.steps !== void 0 && !Array.isArray(job.steps)) {
        uncertain(entry, source, "CI steps\uC758 \uC815\uC801 \uBAA9\uB85D\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
        continue;
      }
      const steps = job.steps ?? [];
      const hostWorkspaceAtProjectRoot = workflowAtProjectRoot && entry.executionLocation === "host" && !has2(job, "uses") && steps.every(usesDefaultCheckout);
      const workflowSteps = repositoryWorkflow && hostWorkspaceAtProjectRoot && entry.runsOn?.length && !has2(job, "if") ? [] : null;
      let afterCheckout = false;
      for (const [index, step] of steps.entries()) {
        if (object2(step)) {
          const atProjectRoot = hostWorkspaceAtProjectRoot && !has2(step, "uses") && workspaceRoot(ciRunSetting("working-directory", step, job, data)) && hostCIShells.has(ciRunSetting("shell", step, job, data));
          const invocation = taskRunnerInvocation(step.run, { atProjectRoot });
          if (invocation) metadata.taskRunnerCI.push({ source, job: id, step: index, ...invocation, executionLocation: entry.executionLocation });
          if (workflowSteps) {
            workflowSteps[index] = taskRunnerWorkflowStep(step, { atProjectRoot, afterCheckout });
            if (typeof step.uses === "string" && literalCheckout.test(step.uses) && !has2(step, "run") && !has2(step, "if")) afterCheckout = true;
          }
        }
        if (!object2(step) || typeof step.uses !== "string") continue;
        const action = step.uses.split("@")[0];
        if (!has2(setups, action)) continue;
        const [language, field, fileField] = setups[action];
        mark(language, false);
        const evidence2 = { source, job: id, step: index, language, field, state: "required", versionRequests: [], executionLocation: entry.executionLocation, notes: [] };
        entry.requirements.push(evidence2);
        (requirements[language].metadata.ciRequirements ??= []).push(evidence2);
        const inputs = object2(step.with) ? step.with : {};
        let raw = inputs[field];
        if (raw === void 0 && action === "dtolnay/rust-toolchain") raw = step.uses.split("@")[1];
        let versions = typeof raw === "number" ? [String(raw)] : typeof raw === "string" ? [raw] : null;
        if (typeof raw === "string") {
          const reference = raw.match(/^\s*\$\{\{\s*matrix\.([A-Za-z0-9_-]+)\s*\}\}\s*$/);
          if (reference) versions = matrixValues(reference[1])?.map((value) => typeof value === "number" ? String(value) : value) ?? null;
          else if (language === "dotnet" && raw.includes("\n")) versions = raw.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
        }
        if (versions) for (const version of versions) {
          const kind = classifyVersion(version, language, true);
          if (kind) evidence2.versionRequests.push({ source, field, kind, value: version });
          else uncertain(evidence2, source, "CI \uB3C4\uAD6C \uBC84\uC804\uC758 \uB3D9\uC801 \uD45C\uD604 \uB610\uB294 \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uBC84\uC804\uC740 \uD3C9\uAC00\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
        }
        if (fileField && has2(inputs, fileField)) {
          if (staticPath(inputs[fileField]) && !path2.isAbsolute(inputs[fileField]) && !path2.win32.isAbsolute(inputs[fileField]) && inside(root, path2.resolve(root, inputs[fileField]))) evidence2.versionFile = inputs[fileField];
          uncertain(evidence2, source, "CI \uBC84\uC804 \uD30C\uC77C\uC740 checkout \uACBD\uB85C\uC640 \uC791\uC5C5 \uB514\uB809\uD130\uB9AC\uC758 \uC2E4\uC81C \uC801\uC6A9\uC744 \uD655\uC778\uD558\uC9C0 \uC54A\uC544 \uCC38\uC870\uB9CC \uAE30\uB85D\uD569\uB2C8\uB2E4.");
        } else if (!versions) uncertain(evidence2, source, matrix?.exclude !== void 0 ? "CI matrix.exclude\uC758 \uC870\uD569 \uC120\uD0DD\uC740 \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uC544 \uD574\uB2F9 \uBC84\uC804 \uC694\uAD6C\uB9CC \uBBF8\uD655\uC778\uC785\uB2C8\uB2E4." : "CI \uB3C4\uAD6C \uBC84\uC804\uC774 \uC5C6\uAC70\uB098 \uC815\uC801 \uD589\uB82C \uCC38\uC870\uB85C \uD574\uC11D\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
        if (evidence2.state === "unknown") entry.state = "unknown";
      }
      if (workflowSteps && afterCheckout) workflowJobs.push({ source, job: id, steps: workflowSteps });
      if (entry.state === "unknown") record.state = "unknown";
    }
  }
  let root;
  try {
    if (typeof projectPath !== "string" || !projectPath) throw new Error();
    root = path2.resolve(projectPath);
    result3.root = root;
  } catch {
    unknown2(LANGUAGES, ".", "\uB300\uC0C1 \uD504\uB85C\uC81D\uD2B8 \uACBD\uB85C\uB97C \uD574\uC11D\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    result3.environment = { containers: "unknown", processCompose: "unknown" };
    metadata.execution.location = "unknown";
    metadata.execution.hostLanguages = Object.fromEntries(LANGUAGES.map((language) => [language, "unknown"]));
    return result3;
  }
  const candidates2 = /* @__PURE__ */ new Map(), processed = /* @__PURE__ */ new Set();
  const sourceOf = (filename) => portable(path2.relative(root, filename)) || ".";
  const add = (directory, name, spec = description(name), scope = "project", distance = 0) => {
    const filename = path2.join(directory, name), source = sourceOf(filename);
    if (!candidates2.has(source)) candidates2.set(source, { source, filename, anchor: inside(root, directory) ? root : directory, spec, scope, distance });
    return candidates2.get(source);
  };
  function fail(item, message) {
    const { spec, source } = item;
    if (spec.taskRunner) collectTaskRunner(spec.taskRunner, source, null, message);
    if (spec.parser === "devcontainer") {
      metadata.devcontainer ??= { source, runtimeLocation: "unknown", configurations: [] };
      metadata.devcontainer.runtimeLocation = "unknown";
    }
    if (spec.environment) {
      result3.environment[spec.environment] = "unknown";
      issue(source, message);
    } else if (spec.languages?.length) unknown2(spec.languages, source, message);
    else issue(source, message);
  }
  let fileAccess, rootEntries;
  try {
    fileAccess = projectFileAccess(root, await realpath2(root));
    rootEntries = await fileAccess.list(root);
  } catch {
    unknown2(LANGUAGES, ".", "\uD504\uB85C\uC81D\uD2B8 \uB8E8\uD2B8\uC758 \uC120\uC5B8 \uD30C\uC77C \uBAA9\uB85D\uC744 \uC77D\uC744 \uC218 \uC5C6\uAC70\uB098 \uD0D0\uC0C9 \uD55C\uB3C4\uB97C \uCD08\uACFC\uD588\uC2B5\uB2C8\uB2E4.");
    result3.environment = { containers: "unknown", processCompose: "unknown" };
    metadata.execution.location = "unknown";
    metadata.execution.hostLanguages = Object.fromEntries(LANGUAGES.map((language) => [language, "unknown"]));
    return result3;
  }
  const { list, safeDirectories: safeDirectories2 } = fileAccess;
  async function read2(item) {
    const { text: text2, error } = await fileAccess.read(item);
    if (error) fail(item, error);
    return text2;
  }
  for (const entry of rootEntries) if (description(entry.name)) add(root, entry.name);
  for (const [folder, filename, spec] of [
    [".devcontainer", "devcontainer.json", { environment: "containers", parser: "devcontainer" }],
    [".venv", "pyvenv.cfg", { languages: ["python"], parser: "venv" }]
  ]) {
    if (!rootEntries.some((entry) => entry.name === folder)) continue;
    try {
      if (!await safeDirectories2(root, path2.join(root, folder))) throw new Error();
      if (await existingEntry(path2.join(root, folder, filename))) add(root, `${folder}/${filename}`, spec);
      else if (folder === ".venv") {
        mark("python");
        const entry = { source: ".venv", directory: ".venv", state: "unknown", notes: [".venv \uD3F4\uB354\uB294 \uC788\uC73C\uB098 pyvenv.cfg \uBA54\uD0C0\uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4."] };
        (requirements.python.metadata.virtualEnvironments ??= []).push(entry);
        metadata.pythonVenv = { environments: requirements.python.metadata.virtualEnvironments };
        issue(".venv", entry.notes[0]);
      }
    } catch {
      fail({ source: folder, spec }, "\uC124\uC815 \uD3F4\uB354\uC758 \uB9C1\uD06C \uB610\uB294 \uBE44\uD45C\uC900 \uD56D\uBAA9\uC740 \uB530\uB77C\uAC00\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
    }
  }
  const inherited = ["global.json", ".node-version", ".python-version", ".tool-versions", ".mise.toml", "mise.toml"];
  let boundary = root;
  try {
    const rootInfo = await lstat2(root);
    for (let distance = 0, directory = root; distance <= MAX_DEPTH; distance += 1, directory = path2.dirname(directory)) {
      boundary = directory;
      metadata.scope.boundary = sourceOf(directory);
      const relative2 = sourceOf(directory);
      if (distance) {
        const info = await lstat2(directory);
        if (!info.isDirectory() || info.isSymbolicLink()) {
          metadata.scope.boundaryKind = "link";
          issue(relative2, "\uC0C1\uC704 \uB514\uB809\uD130\uB9AC\uC758 \uB9C1\uD06C \uACBD\uACC4 \uBC16\uC740 \uD0D0\uC0C9\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
          break;
        }
        if (path2.resolve(directory) === path2.resolve(homedir())) {
          metadata.scope.boundaryKind = "home";
          break;
        }
        metadata.scope.ancestorDirectories.push(relative2);
        for (const name of inherited) if (await existingEntry(path2.join(directory, name))) add(directory, name, description(name), "ancestor", distance);
      }
      const repository = Boolean(await existingEntry(path2.join(directory, ".git")));
      let workspace = false;
      for (const name of ["package.json", "pnpm-workspace.yaml", "pnpm-workspace.yml"]) {
        if (!await existingEntry(path2.join(directory, name))) continue;
        const item = { source: sourceOf(path2.join(directory, name)), filename: path2.join(directory, name), anchor: directory, spec: { parser: "scope" } };
        const text2 = await read2(item);
        if (text2 === null) continue;
        let data;
        try {
          data = name === "package.json" ? JSON.parse(text2) : yamlDocument(text2);
        } catch {
          continue;
        }
        const patterns = name === "package.json" ? Array.isArray(data.workspaces) ? data.workspaces : data.workspaces?.packages : data.packages;
        if (patterns === void 0 || distance && !memberOf(patterns, portable(path2.relative(directory, root)))) continue;
        workspace = true;
        if (distance) {
          add(directory, name, description(name), "workspace", distance);
          if (name !== "package.json" && await existingEntry(path2.join(directory, "package.json"))) add(directory, "package.json", description("package.json"), "workspace", distance);
          for (const lock of Object.keys(NODE_LOCKS)) if (await existingEntry(path2.join(directory, lock))) add(directory, lock, description(lock), "workspace", distance);
          for (const entry of await list(directory, directory)) if (TASK_RUNNER_FILES.includes(entry.name)) add(directory, entry.name, description(entry.name), "workspace", distance);
        }
      }
      if (repository || workspace) {
        metadata.scope.boundaryKind = repository ? "repository" : "workspace";
        break;
      }
      if (rootInfo.isSymbolicLink()) {
        metadata.scope.boundaryKind = "link";
        break;
      }
      if (path2.dirname(directory) === directory) {
        metadata.scope.boundaryKind = "filesystem";
        break;
      }
      if (distance === MAX_DEPTH) {
        metadata.scope.boundaryKind = "limit";
        unknown2(LANGUAGES, relative2, "\uC0C1\uC704 \uC120\uC5B8\uC758 \uD0D0\uC0C9 \uAE4A\uC774\uAC00 \uD55C\uB3C4\uB97C \uCD08\uACFC\uD558\uC5EC \uCD94\uAC00 \uC694\uAD6C\uB294 \uBBF8\uD655\uC778\uC785\uB2C8\uB2E4.");
      }
    }
  } catch {
    unknown2(LANGUAGES, sourceOf(boundary), "\uC0C1\uC704 \uC120\uC5B8\uC758 \uC801\uC6A9 \uACBD\uACC4\uB97C \uC548\uC804\uD558\uAC8C \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  }
  for (const directory of unique2([root, boundary])) {
    try {
      const workflows = path2.join(directory, ".github", "workflows");
      if (!await existingEntry(path2.join(directory, ".github"))) continue;
      if (!await safeDirectories2(directory, path2.join(directory, ".github"))) throw new Error();
      if (!await existingEntry(workflows)) continue;
      for (const entry of await list(workflows, directory)) if (/\.ya?ml$/i.test(entry.name)) add(directory, `.github/workflows/${entry.name}`, { parser: "ci" }, "ci");
    } catch {
      issue(sourceOf(path2.join(directory, ".github/workflows")), "CI \uD3F4\uB354\uC758 \uB9C1\uD06C\xB7\uBAA9\uB85D\xB7\uD0D0\uC0C9 \uD55C\uB3C4\uB97C \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    }
  }
  const parsers = {
    node: nodeDeclaration,
    python: pythonDeclaration,
    go: goDeclaration,
    cargo: cargoDeclaration,
    rust: rustDeclaration,
    zig: zigDeclaration,
    dotnet: dotnetDeclaration,
    mise: miseDeclaration,
    tools: toolVersions,
    conda: condaDeclaration,
    venv: venvDeclaration,
    compose: composeDeclaration,
    devcontainer: devcontainerDeclaration,
    processCompose: processDeclaration,
    ci: ciDeclaration,
    workspace: (text2, source) => {
      try {
        workspaceDeclaration(yamlDocument(text2).packages, source, "pnpm");
        manager("node", "pnpm", source);
      } catch {
        unknown2(["node"], source, "pnpm \uC791\uC5C5 \uACF5\uAC04 YAML\uC758 \uBB38\uBC95\xB7\uD0DC\uADF8\xB7\uBCC4\uCE6D \uD55C\uB3C4\uB97C \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      }
    }
  };
  async function processCandidates() {
    for (const item of [...candidates2.values()].sort((a, b) => a.distance - b.distance || (a.source < b.source ? -1 : a.source > b.source ? 1 : 0))) {
      if (processed.has(item.source)) continue;
      processed.add(item.source);
      const { source, spec } = item;
      declaration = { source, kind: spec.parser ?? "marker", scope: item.scope, distance: item.distance, selectedLanguages: [] };
      metadata.declarations.push(declaration);
      if (spec.parser === "miseFileTasks") {
        collectTaskRunner("mise", source, null, "mise-tasks \uD30C\uC77C \uC791\uC5C5\uC740 \uD3F4\uB354 \uC874\uC7AC\uB9CC \uAE30\uB85D\uD558\uBA70 \uB0B4\uBD80 \uD30C\uC77C\xB7\uB9C1\uD06C\xB7\uC2E4\uD589 \uC758\uBBF8\uB294 \uBD84\uC11D\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
        continue;
      }
      if (spec.shared) {
        const family = spec.parser === "mise" ? "mise" : "asdf";
        item.spec = { ...spec, languages: spec.languages.filter((language) => canSelectVersion(family, language, source)) };
        if (!item.spec.languages.length && !spec.taskRunner) continue;
      }
      if (item.scope === "ancestor" && !["mise", "tools"].includes(spec.parser)) {
        const language = spec.languages[0];
        if (!selectVersion(path2.basename(source), language, source)) continue;
      } else if (spec.parser === "pin" && [".node-version", ".python-version"].includes(path2.basename(source))) selectVersion(path2.basename(source), spec.languages[0], source);
      else if (spec.parser === "dotnet") selectVersion("global.json", "dotnet", source);
      if (!spec.shared) for (const language of spec.languages ?? []) mark(language);
      if (spec.environment === "containers" && result3.environment.containers === "not_required") result3.environment.containers = "unknown";
      const text2 = await read2(item);
      if (text2 === null) continue;
      if (spec.taskRunner) collectTaskRunner(spec.taskRunner, source, text2);
      if (spec.manager) for (const language of spec.languages) manager(language, spec.manager, source);
      if (spec.lock) requirements[spec.languages[0]].lockFiles.push(source);
      if (spec.integrity) {
        (requirements.go.metadata.integrityFiles ??= []).push(source);
        note("go", "go.sum \uACC4\uC5F4 \uD30C\uC77C\uC740 \uC758\uC874\uC131 \uBB34\uACB0\uC131 \uD574\uC2DC\uC774\uBA70 \uC7A0\uAE08 \uD30C\uC77C\uC774\uB098 Go \uBC84\uC804 \uC120\uC5B8\uC774 \uC544\uB2D9\uB2C8\uB2E4.");
      }
      if (spec.environment === "processCompose" && result3.environment.processCompose !== "unknown") result3.environment.processCompose = "required";
      if (!spec.parser) {
        if (spec.environment === "containers") metadata.dockerfiles.push({ source, runtimeLocation: "unknown" });
        continue;
      }
      try {
        if (spec.parser === "pin") pin(text2, source, spec.languages[0]);
        else if (spec.parser === "taskRunner") continue;
        else parsers[spec.parser](text2, source);
      } catch {
        fail(item, "\uC120\uC5B8 \uD30C\uC77C\uC758 \uC815\uC801 \uD544\uB4DC \uBD84\uC11D\uC744 \uC644\uB8CC\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      }
    }
    declaration = void 0;
  }
  await processCandidates();
  let workspaceEntries = 0;
  for (const workspace of pendingWorkspaces) {
    const base = path2.resolve(root, path2.dirname(workspace.source));
    workspace.root = sourceOf(base);
    if (!inside(root, base)) {
      workspace.members = ["."];
      continue;
    }
    const found = /* @__PURE__ */ new Set(), visited = /* @__PURE__ */ new Set();
    async function walk(directory, pieces, index, depth = 0) {
      const key2 = `${directory}\0${pieces.join("/")}\0${index}`;
      if (visited.has(key2)) return;
      visited.add(key2);
      if (depth > MAX_DEPTH || ++workspaceEntries > MAX_ENTRIES) throw new Error();
      if (!await safeDirectories2(base, directory)) throw new Error();
      if (index === pieces.length) {
        if (await existingEntry(path2.join(directory, "package.json"))) found.add(directory);
        return;
      }
      const piece = pieces[index];
      if (piece === "**") await walk(directory, pieces, index + 1, depth);
      const entries2 = await list(directory, base);
      for (const entry of entries2) {
        if (/^(?:node_modules|\.git|\.venv|vendor|target|dist)$/.test(entry.name)) continue;
        if (piece !== "**" && !matches(piece, entry.name)) continue;
        if (entry.isSymbolicLink()) {
          uncertain(workspace, workspace.source, "\uC791\uC5C5 \uACF5\uAC04 \uD328\uD134\uC5D0 \uB9DE\uB294 \uD3F4\uB354 \uB9C1\uD06C\uB294 \uB530\uB77C\uAC00\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
          continue;
        }
        if (entry.isDirectory()) await walk(path2.join(directory, entry.name), pieces, piece === "**" ? index : index + 1, depth + 1);
      }
    }
    try {
      for (const pattern of workspace.patterns.filter((value) => !value.startsWith("!"))) await walk(base, pattern.split("/"), 0);
      for (const directory of [...found].sort()) {
        const relative2 = portable(path2.relative(base, directory));
        if (!memberOf(workspace.patterns, relative2)) continue;
        workspace.members.push(sourceOf(directory));
        for (const entry of await list(directory, base)) if (TASK_RUNNER_FILES.includes(entry.name) || has2(NODE_LOCKS, entry.name)) add(directory, entry.name, description(entry.name), "workspace");
      }
    } catch {
      uncertain(workspace, workspace.source, "\uC791\uC5C5 \uACF5\uAC04\uC758 \uD3F4\uB354\xB7\uB9C1\uD06C\xB7\uAE4A\uC774\xB7\uD56D\uBAA9 \uD55C\uB3C4\uB97C \uD655\uC778\uD558\uC9C0 \uBABB\uD558\uC5EC \uC77C\uBD80 \uAD6C\uC131\uC6D0\uC740 \uBBF8\uD655\uC778\uC785\uB2C8\uB2E4.");
    }
  }
  await processCandidates();
  for (const { source, owner } of composeReferences) {
    const target = path2.resolve(root, source);
    const item = add(root, source, { environment: "containers", parser: "compose" });
    if (!inside(root, target)) {
      uncertain(owner, source, "\uD5C8\uC6A9\uD55C \uD504\uB85C\uC81D\uD2B8 \uBC16\uC758 Compose \uCC38\uC870\uB294 \uC77D\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
      continue;
    }
    await processCandidates();
    const compose = metadata.compose.configurations.find((entry) => entry.source === item.source);
    if (!compose || compose.state === "unknown") uncertain(owner, owner.source, "devcontainer\uC758 Compose \uCC38\uC870\uB97C \uC644\uC804\uD788 \uC77D\uAC70\uB098 \uBCD1\uD569\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
  }
  if (metadata.devcontainer) for (const config of metadata.devcontainer.configurations) {
    if (config.mode !== "compose" || !config.service) continue;
    const services = metadata.compose.configurations.filter((entry) => config.composeFiles.includes(entry.source)).flatMap((entry) => entry.services);
    if (!services.some((service) => service.name === config.service)) {
      config.runtimeLocation = "unknown";
      metadata.devcontainer.runtimeLocation = "unknown";
      uncertain(config, config.source, "devcontainer\uAC00 \uC120\uD0DD\uD55C Compose \uC11C\uBE44\uC2A4\uB97C \uD5C8\uC6A9\uD55C \uD30C\uC77C\uC5D0\uC11C \uD655\uC778\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
    }
  }
  result3.files = [...candidates2.keys()].sort();
  for (const language of LANGUAGES) {
    const requirement = requirements[language];
    requirement.packageManagers = [...new Map(requirement.packageManagers.map((item) => [`${item.name}\0${item.source}\0${item.version ?? ""}`, item])).values()];
    requirement.notes = unique2(requirement.notes);
    if (requirement.metadata.versionManagers) requirement.metadata.versionManagers = unique2(requirement.metadata.versionManagers);
    const pins = requirement.versionRequests.filter((entry) => entry.kind === "exact");
    const sources = unique2(pins.map((entry) => entry.source));
    if (sources.length > 1 && sources.every((source) => pins.filter((entry) => entry.source === source).length === 1) && unique2(pins.map((entry) => entry.value.replace(/^v/, ""))).length > 1) {
      unknown2([language], sources.join(", "), "\uC11C\uB85C \uB2E4\uB978 \uD30C\uC77C\uC758 \uACE0\uC815 \uBC84\uC804 \uC120\uC5B8\uC774 \uCDA9\uB3CC\uD558\uBBC0\uB85C \uC120\uD0DD\uB41C \uBC84\uC804\uC744 \uD655\uC815\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.");
    }
    if (language === "node" && unique2(requirement.packageManagers.map((item) => item.name)).length > 1) issue(unique2(requirement.packageManagers.map((item) => item.source)).join(", "), "\uC5EC\uB7EC Node.js \uD328\uD0A4\uC9C0 \uAD00\uB9AC\uC790 \uC120\uC5B8\uC774 \uBC1C\uACAC\uB418\uC5B4 \uC791\uC5C5\uC5D0 \uC801\uC6A9\uB418\uB294 \uAD00\uB9AC\uC790\uB97C \uD655\uC778\uD574\uC57C \uD569\uB2C8\uB2E4.");
    if (requirement.state === "required" && !requirement.versionRequests.length) note(language, "\uAD00\uB828 \uC120\uC5B8\uC740 \uC788\uC73C\uB098 \uC815\uC801\uC73C\uB85C \uD655\uC778\uD55C \uC5B8\uC5B4 \uBC84\uC804 \uC694\uAD6C\uB294 \uC5C6\uC2B5\uB2C8\uB2E4.");
  }
  if (result3.files.includes("rust-toolchain") && result3.files.includes("rust-toolchain.toml")) unknown2(["rust"], "rust-toolchain, rust-toolchain.toml", "Rust \uB3C4\uAD6C \uBAA8\uC74C \uD30C\uC77C\uC774 \uB458 \uB2E4 \uC874\uC7AC\uD558\uC5EC \uC120\uD0DD \uC6B0\uC120\uC21C\uC704\uB97C \uBCC4\uB3C4\uB85C \uD655\uC778\uD574\uC57C \uD569\uB2C8\uB2E4.");
  metadata.taskRunnerLanguages = [...localLanguages].filter((language) => requirements[language].state === "required");
  metadata.taskRunnerWorkflows = taskRunnerWorkflowEvidence(workflowJobs);
  const containerContext = metadata.devcontainer?.runtimeLocation;
  metadata.execution.location = containerContext ?? "host";
  for (const language of LANGUAGES) {
    metadata.execution.hostLanguages[language] = requirements[language].state === "not_required" || !localLanguages.has(language) && requirements[language].metadata.ciRequirements?.length ? "not_required" : containerContext === "container" ? "not_required" : containerContext === "unknown" ? "unknown" : requirements[language].state;
  }
  if (!metadata.devcontainer && localLanguages.size) metadata.execution.evidence.push({ source: ".", kind: "local-declarations", location: "host", reason: "\uB85C\uCEEC \uC5B8\uC5B4 \uC120\uC5B8\uC758 \uD638\uC2A4\uD2B8 \uC801\uC6A9\uC744 \uAE30\uBCF8\uAC12\uC73C\uB85C \uC720\uC9C0\uD558\uBA70 \uBCF4\uC870 Compose \uC11C\uBE44\uC2A4\uC758 \uC874\uC7AC\uB85C \uC81C\uC678\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." });
  return result3;
}

// src/windows.mjs
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import { win32 } from "node:path";
import { fileURLToPath } from "node:url";
var INVENTORY_NAMES = Object.freeze([
  "pwsh",
  "powershell",
  "git",
  "winget",
  "mise",
  "node",
  "npm",
  "pnpm",
  "yarn",
  "python",
  "py",
  "uv",
  "go",
  "rustup",
  "rustc",
  "cargo",
  "zig",
  "dotnet",
  "wsl",
  "docker",
  "lazydocker",
  "process-compose",
  "code",
  "gh",
  "rg",
  "nu",
  "fnm",
  "nvm",
  "pyenv",
  "conda",
  "choco",
  "scoop",
  "wt",
  "codex",
  "vswhere",
  "fsutil",
  "task",
  "just",
  "make"
]);
var COLLECTOR = fileURLToPath(new URL("../scripts/collect-host.ps1", import.meta.url));
var OUTPUT_LIMIT = 64 * 1024;
var PYTHON_QUERY = 'import json,sys; print(json.dumps({"version":".".join(map(str,sys.version_info[:3])),"executable":sys.executable,"prefix":sys.prefix,"basePrefix":sys.base_prefix}))';
var VERSION_TOKEN = String.raw`\d+(?:\.[0-9A-Za-z]+){1,5}(?:[-+][0-9A-Za-z.+-]+)?`;
var VERSION = new RegExp(`^v?${VERSION_TOKEN}$`);
var QUERIES = Object.freeze({
  git: [["--version"]],
  node: [["--version"]],
  python: [["-B", "-I", "-S", "-c", PYTHON_QUERY]],
  rustc: [["--version"]],
  cargo: [["--version"]],
  zig: [["version"]],
  // These are native host queries; managed SDK --version can run first-use setup.
  dotnet: [["--list-sdks"], ["--list-runtimes"]],
  wsl: [["--version"], ["--list", "--verbose"]],
  docker: [["--version"]],
  gh: [["--version"]],
  rg: [["--version"]],
  task: [["--version"]],
  just: [["--version"]],
  make: [["--version"]]
});
var METADATA_ONLY_REASONS = {
  go: "go version\uC758 telemetry \uD30C\uC77C \uC4F0\uAE30 \uC5EC\uBD80\uB97C \uAC80\uC99D\uD558\uC9C0 \uC54A\uC544 \uBA54\uD0C0\uB370\uC774\uD130\uB9CC \uC218\uC9D1\uD588\uC2B5\uB2C8\uB2E4.",
  py: "Python \uC2E4\uD589 \uAD00\uB9AC\uC790\uB294 \uC124\uCE58\uB098 \uC778\uD130\uD504\uB9AC\uD130 \uC120\uD0DD\uC744 \uC720\uBC1C\uD560 \uC218 \uC788\uC5B4 \uC2E4\uD589\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.",
  rustup: "rustup\uC758 \uB3C4\uAD6C \uBAA8\uC74C \uB3D9\uAE30\uD654 \uAC00\uB2A5\uC131 \uB54C\uBB38\uC5D0 \uC2E4\uD589\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.",
  mise: "mise\uC758 \uD65C\uC131\uD654\xB7\uC120\uD0DD\xB7\uC124\uCE58 \uBA85\uB839\uC740 \uC2E4\uD589 \uBC94\uC704\uC5D0 \uD3EC\uD568\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.",
  lazydocker: "TUI\uB098 \uC5D4\uC9C4 \uC5F0\uACB0\uC744 \uD53C\uD558\uAE30 \uC704\uD574 \uBA54\uD0C0\uB370\uC774\uD130\uB9CC \uC218\uC9D1\uD588\uC2B5\uB2C8\uB2E4.",
  "process-compose": "\uACF5\uD1B5 \uCD08\uAE30\uD654\uC758 \uB85C\uADF8\xB7\uC5C5\uB370\uC774\uD2B8 \uD655\uC778\uC744 \uAC80\uC99D\uD558\uC9C0 \uC54A\uC544 \uC2E4\uD589\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4."
};
function failure(code, message) {
  return Object.assign(new Error(message), { code });
}
function envValue(environment, name) {
  const key2 = Object.keys(environment).find((key3) => key3.toUpperCase() === name.toUpperCase());
  return key2 === void 0 ? void 0 : environment[key2];
}
function isEnvironmentInjection(name) {
  return /^(?:NODE_OPTIONS|NODE_PATH|PYTHONSTARTUP|PYTHONPATH|PYTHONHOME|DOTNET_STARTUP_HOOKS|DOTNET_ADDITIONAL_DEPS|DOTNET_SHARED_STORE|GIT_CONFIG(?:_.*)?|GIT_SSH(?:_COMMAND)?|GIT_EXEC_PATH|BASH_ENV|ENV|SHELLOPTS|BASHOPTS|ZDOTDIR|PROMPT_COMMAND|PSModulePath|RUSTC_WRAPPER|RUSTC_WORKSPACE_WRAPPER|RUSTDOC|GOFLAGS|MAKEFLAGS|GNUMAKEFLAGS|MFLAGS|MAKEFILES|LD_PRELOAD|LD_LIBRARY_PATH|DYLD_.*|RUBYOPT|PERL5OPT)$/i.test(name);
}
function selectCommandCandidate(name, candidates2 = []) {
  if (name === "mise" && candidates2[0]?.commandType === "Function") {
    return candidates2.find((candidate) => candidate.commandType === "Application") ?? candidates2[0];
  }
  return candidates2[0];
}
function createChildEnvironment(environment) {
  const child = {};
  for (const key2 of [
    "PATH",
    "PATHEXT",
    "SystemRoot",
    "WINDIR",
    "SystemDrive",
    "TEMP",
    "TMP",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "ProgramFiles",
    "ProgramFiles(x86)",
    "ProgramW6432",
    "HOMEDRIVE",
    "HOMEPATH"
  ]) {
    const value = envValue(environment, key2);
    if (typeof value === "string") child[key2] = value;
  }
  return Object.assign(child, {
    POWERSHELL_TELEMETRY_OPTOUT: "1",
    POWERSHELL_UPDATECHECK: "Off",
    PSModuleAnalysisCachePath: "NUL",
    GOTOOLCHAIN: "local",
    GOENV: "off",
    GOTELEMETRY: "off",
    GOPROXY: "off",
    RUSTUP_AUTO_INSTALL: "0",
    CARGO_NET_OFFLINE: "true",
    MISE_AUTO_INSTALL: "0",
    MISE_TASK_RUN_AUTO_INSTALL: "0",
    DOTNET_CLI_TELEMETRY_OPTOUT: "1",
    DOTNET_NOLOGO: "1",
    DOTNET_ADD_GLOBAL_TOOLS_TO_PATH: "0",
    DOTNET_GENERATE_ASPNET_CERTIFICATE: "0",
    DOTNET_CLI_WORKLOAD_UPDATE_NOTIFY_DISABLE: "true",
    DOTNET_SKIP_WORKLOAD_INTEGRITY_CHECK: "1",
    DOTNET_SDK_VULNERABILITY_CHECK_DISABLE: "true",
    DOTNET_CLI_UI_LANGUAGE: "en-US"
  });
}
function absoluteWindowsPath(value) {
  return typeof value === "string" && /^(?:[A-Za-z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+)/.test(value) && !/[\0\r\n]/.test(value) && !value.includes("://");
}
function localPath(value) {
  return absoluteWindowsPath(value) && /^[A-Za-z]:[\\/]/.test(value);
}
function pathKey(value) {
  return win32.normalize(value).replace(/[\\/]+$/, "").toLowerCase();
}
function insideProject(candidatePath, projectPath) {
  if (!absoluteWindowsPath(projectPath)) return false;
  const relative2 = win32.relative(pathKey(projectPath), pathKey(candidatePath));
  return relative2 === "" || relative2 !== ".." && !relative2.startsWith("..\\") && !win32.isAbsolute(relative2);
}
function pathEntries(value) {
  return String(value ?? "").split(";").map((entry) => entry.trim().replace(/^"(.*)"$/, "$1"));
}
function pathReason(name, candidatePath, projectPath) {
  if (!localPath(candidatePath)) return "\uB85C\uCEEC \uC808\uB300 \uACBD\uB85C\uB97C \uD655\uC778\uD558\uC9C0 \uBABB\uD574 \uC2E4\uD589\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.";
  const normalized = win32.normalize(candidatePath);
  if (win32.basename(normalized).toLowerCase() !== `${name}.exe`) {
    return "\uC774\uB984\uC774 \uC77C\uCE58\uD558\uB294 .exe\uAC00 \uC544\uB2C8\uAC70\uB098 \uC2A4\uD06C\uB9BD\uD2B8 \uB798\uD37C\uC5EC\uC11C \uC2E4\uD589\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.";
  }
  if (/\\(?:shims?|proxies|volta\\bin|chocolatey\\bin)(?:\\|$)/i.test(normalized) || /\\Microsoft\\WindowsApps(?:\\|$)/i.test(normalized) || /^(?:rustc|cargo)$/.test(name) && /\\\.cargo\\bin\\/i.test(normalized)) {
    return "shim\xB7proxy\xB7Windows \uC2E4\uD589 \uBCC4\uCE6D\uC758 \uC790\uB3D9 \uC124\uCE58 \uAC00\uB2A5\uC131 \uB54C\uBB38\uC5D0 \uC2E4\uD589\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.";
  }
  if (insideProject(candidatePath, projectPath)) return "\uB300\uC0C1 \uD504\uB85C\uC81D\uD2B8 \uB0B4\uBD80\uC758 \uC2E4\uD589 \uD30C\uC77C\uC740 \uC2E4\uD589\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.";
  return null;
}
function absolutePathEntryReason(candidatePath, environment, projectPath) {
  const directory = pathKey(win32.dirname(candidatePath));
  for (const entry of pathEntries(envValue(environment, "PATH"))) {
    const resolved = absoluteWindowsPath(entry) ? entry : win32.resolve(projectPath, entry || ".");
    if (pathKey(resolved) !== directory) continue;
    return localPath(entry) ? null : "\uC0C1\uB300 PATH \uD56D\uBAA9\uC5D0\uC11C \uBC1C\uACAC\uB41C \uBA85\uB839\uC740 \uC2E4\uD589\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.";
  }
  return "\uC808\uB300 PATH \uD56D\uBAA9\uC5D0\uC11C \uCD9C\uCC98\uB97C \uD655\uC778\uD558\uC9C0 \uBABB\uD574 \uC2E4\uD589\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.";
}
function assessExecutable(name, candidate, facts = {}, { projectPath, environment } = {}) {
  if (!candidate || candidate.commandType !== "Application") {
    return "\uB124\uC774\uD2F0\uBE0C \uC751\uC6A9 \uD504\uB85C\uADF8\uB7A8\uC774 \uC544\uB2CC \uBA85\uB839\uC740 \uC2E4\uD589\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.";
  }
  let reason = pathReason(name, candidate.path, projectPath);
  if (reason) return reason;
  if (environment) {
    reason = absolutePathEntryReason(candidate.path, environment, projectPath);
    if (reason) return reason;
  }
  if (facts.isSymbolicLink || !facts.isFile || !facts.isPE) {
    return "\uC77C\uBC18 PE \uC2E4\uD589 \uD30C\uC77C\uC744 \uD655\uC778\uD558\uC9C0 \uBABB\uD574 \uC2E4\uD589\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.";
  }
  reason = pathReason(name, facts.realPath, facts.realProjectPath ?? projectPath);
  if (reason) return reason;
  if (insideProject(facts.realPath, projectPath) || insideProject(candidate.path, facts.realProjectPath)) {
    return "\uB300\uC0C1 \uD504\uB85C\uC81D\uD2B8 \uB0B4\uBD80\uB85C \uC5F0\uACB0\uB418\uB294 \uC2E4\uD589 \uD30C\uC77C\uC740 \uC2E4\uD589\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.";
  }
  if (facts.hasShimSidecar || facts.isRustupProxy) {
    return "\uC2E4\uD589 \uD30C\uC77C\uC758 shim\xB7rustup proxy \uADFC\uAC70\uB97C \uBC1C\uACAC\uD574 \uC2E4\uD589\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.";
  }
  if (/^(?:rustc|cargo)$/.test(name) && !facts.rustToolchainVerified) {
    return "\uC2E4\uC81C Rust \uB3C4\uAD6C \uBAA8\uC74C \uD30C\uC77C\uC784\uC744 \uD655\uC778\uD558\uC9C0 \uBABB\uD574 \uC2E4\uD589\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.";
  }
  return null;
}
async function isPE(filePath, io) {
  const handle = await io.open(filePath, "r");
  try {
    const header = Buffer.alloc(64);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (bytesRead !== 64 || header.toString("ascii", 0, 2) !== "MZ") return false;
    const offset = header.readUInt32LE(60);
    if (offset < 64 || offset > 4 * 1024 * 1024) return false;
    const signature = Buffer.alloc(4);
    const result3 = await handle.read(signature, 0, 4, offset);
    return result3.bytesRead === 4 && signature.equals(Buffer.from("PE\0\0"));
  } finally {
    await handle.close();
  }
}
async function exists(filePath, io) {
  try {
    await io.lstat(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return false;
    throw error;
  }
}
async function rustFacts(name, realPath, info, commands, io) {
  if (!/^(?:rustc|cargo)$/.test(name)) return {};
  const bin = win32.dirname(realPath);
  const library = win32.join(bin, "..", "lib", "rustlib");
  let rustToolchainVerified = false;
  try {
    rustToolchainVerified = win32.basename(bin).toLowerCase() === "bin" && (await io.stat(library)).isDirectory() && await isPE(win32.join(bin, "rustc.exe"), io);
  } catch {
  }
  const references = /* @__PURE__ */ new Set([
    win32.join(bin, "rustup.exe"),
    ...(commands.rustup ?? []).map((candidate) => candidate.path).filter(localPath)
  ]);
  let candidateHash;
  for (const reference of references) {
    let referenceInfo;
    try {
      referenceInfo = await io.stat(reference);
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "ENOTDIR") continue;
      throw error;
    }
    if (!referenceInfo.isFile()) continue;
    if (info.ino && info.ino === referenceInfo.ino && info.dev === referenceInfo.dev) {
      return { rustToolchainVerified, isRustupProxy: true };
    }
    if (info.size !== referenceInfo.size) continue;
    if (info.size > 128 * 1024 * 1024) return { rustToolchainVerified: false };
    candidateHash ??= createHash("sha256").update(await io.readFile(realPath)).digest("hex");
    const referenceHash = createHash("sha256").update(await io.readFile(reference)).digest("hex");
    if (candidateHash === referenceHash) return { rustToolchainVerified, isRustupProxy: true };
  }
  return { rustToolchainVerified, isRustupProxy: false };
}
async function verifyExecutable(name, candidate, options = {}, io = fs) {
  if (!candidate || candidate.commandType !== "Application") {
    return { executable: null, reason: "\uC751\uC6A9 \uD504\uB85C\uADF8\uB7A8 \uACBD\uB85C\uB97C \uD655\uC778\uD558\uC9C0 \uBABB\uD574 \uC2E4\uD589\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4." };
  }
  const earlyReason = pathReason(name, candidate.path, options.projectPath) ?? (options.environment && absolutePathEntryReason(candidate.path, options.environment, options.projectPath));
  if (earlyReason) return { executable: null, reason: earlyReason };
  try {
    const info = await io.lstat(candidate.path);
    if (!info.isFile() || info.isSymbolicLink()) {
      return { executable: null, reason: "\uC77C\uBC18 \uD30C\uC77C\uC774 \uC544\uB2C8\uAC70\uB098 \uC2E4\uD589 \uBCC4\uCE6D\uC774\uC5B4\uC11C \uC2E4\uD589\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4." };
    }
    const realPath = await io.realpath(candidate.path);
    const realProjectPath = options.projectPath ? await io.realpath(options.projectPath) : void 0;
    const realReason = pathReason(name, realPath, realProjectPath);
    if (realReason) return { executable: null, reason: realReason };
    const facts = {
      isFile: true,
      isSymbolicLink: false,
      realPath,
      realProjectPath,
      isPE: await isPE(realPath, io),
      hasShimSidecar: await exists(candidate.path.replace(/\.exe$/i, ".shim"), io) || await exists(`${candidate.path}.shim`, io),
      ...await rustFacts(name, realPath, info, options.commands ?? {}, io)
    };
    const reason = assessExecutable(name, candidate, facts, options);
    return { executable: reason ? null : realPath, reason };
  } catch {
    return { executable: null, reason: "\uC2E4\uD589 \uD30C\uC77C\uC758 \uCD9C\uCC98\xB7\uBA54\uD0C0\uB370\uC774\uD130\uC5D0 \uC811\uADFC\uD558\uC9C0 \uBABB\uD574 \uC2E4\uD589\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4." };
  }
}
async function resolvePowerShell(environment, options = {}, verify = verifyExecutable) {
  for (const entry of pathEntries(envValue(environment, "PATH"))) {
    if (!localPath(entry)) continue;
    const candidate = { commandType: "Application", path: win32.join(entry, "pwsh.exe") };
    const checked = await verify("pwsh", candidate, { ...options, environment });
    if (checked.executable) return checked.executable;
  }
  throw failure("POWERSHELL_NOT_FOUND", "\uC808\uB300 PATH \uD56D\uBAA9\uC5D0\uC11C \uAC80\uC99D\uD560 \uC218 \uC788\uB294 pwsh.exe\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
}
function decodeOutput(value) {
  if (typeof value === "string") return value.replace(/^\uFEFF/, "").trim();
  const buffer = Buffer.from(value ?? []);
  if (buffer[0] === 254 && buffer[1] === 255) {
    return Buffer.from(buffer.subarray(2, buffer.length - buffer.length % 2)).swap16().toString("utf16le").trim();
  }
  const sample = buffer.subarray(0, 256);
  let oddZeros = 0;
  for (let index = 1; index < sample.length; index += 2) if (sample[index] === 0) oddZeros++;
  const utf16 = buffer[0] === 255 && buffer[1] === 254 || oddZeros > sample.length / 8;
  return buffer.toString(utf16 ? "utf16le" : "utf8").replace(/^\uFEFF/, "").trim();
}
function runBounded(executable, args, {
  cwd,
  env,
  timeoutMs = 5e3,
  maxOutputBytes = OUTPUT_LIMIT,
  spawnImpl = spawn,
  signal
} = {}) {
  return new Promise((resolve3) => {
    let child;
    let settled = false;
    let timer;
    let total = 0;
    const chunks = [];
    const finish = (state, exitCode, reason, stop = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (stop) {
        try {
          child?.kill();
        } catch {
        }
        child?.stdout?.destroy();
        child?.stderr?.destroy();
        child?.unref();
      }
      resolve3({ state, exitCode, stdout: stop ? Buffer.alloc(0) : Buffer.concat(chunks), reason });
    };
    const abort = () => finish("timed_out", null, "\uC870\uD68C\uAC00 \uCDE8\uC18C\uB418\uC5C8\uC2B5\uB2C8\uB2E4.", true);
    if (signal?.aborted) {
      abort();
      return;
    }
    try {
      child = spawnImpl(executable, args, {
        cwd,
        env,
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"]
      });
    } catch {
      finish("failed", null, "\uC870\uD68C\uC6A9 \uC790\uC2DD \uD504\uB85C\uC138\uC2A4\uB97C \uC2DC\uC791\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
      return;
    }
    const receive = (value, stdout) => {
      if (settled) return;
      const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
      total += buffer.length;
      if (total > maxOutputBytes) {
        finish("failed", null, "\uC870\uD68C \uCD9C\uB825\uC774 \uD5C8\uC6A9\uD55C \uD06C\uAE30\uB97C \uCD08\uACFC\uD588\uC2B5\uB2C8\uB2E4.", true);
      } else if (stdout) chunks.push(buffer);
    };
    child.stdout.on("data", (value) => receive(value, true));
    child.stderr.on("data", (value) => receive(value, false));
    child.on("error", () => finish("failed", null, "\uC870\uD68C\uC6A9 \uC790\uC2DD \uD504\uB85C\uC138\uC2A4\uB97C \uC2E4\uD589\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4."));
    child.on("close", (code) => finish(
      code === 0 ? "succeeded" : "failed",
      code,
      code === 0 ? null : "\uC870\uD68C \uBA85\uB839\uC774 \uC815\uC0C1 \uC885\uB8CC\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4."
    ));
    signal?.addEventListener("abort", abort, { once: true });
    timer = setTimeout(() => finish("timed_out", null, "\uC870\uD68C \uC81C\uD55C \uC2DC\uAC04\uC744 \uCD08\uACFC\uD588\uC2B5\uB2C8\uB2E4.", true), timeoutMs);
  });
}
function safePath(value) {
  return absoluteWindowsPath(value) && value.length <= 32767 ? value : null;
}
function safeLabel(value) {
  return typeof value === "string" && /^[\p{L}\p{N} ._()+-]{1,160}$/u.test(value) ? value : null;
}
function metadataVersion(value) {
  return typeof value === "string" && /^[0-9][0-9A-Za-z ._()+-]{0,160}$/.test(value) ? value : null;
}
function parseVersionOutput(name, args, output) {
  const text2 = decodeOutput(output);
  const firstLine = text2.split(/\r?\n/, 1)[0];
  if (name === "python") {
    try {
      const value = JSON.parse(text2);
      if (!/^\d+\.\d+\.\d+$/.test(value.version) || ![value.executable, value.prefix, value.basePrefix].every(safePath)) return null;
      return { version: value.version, data: {
        executable: value.executable,
        prefix: value.prefix,
        basePrefix: value.basePrefix
      } };
    } catch {
      return null;
    }
  }
  if (name === "dotnet") {
    const rows = text2 ? text2.split(/\r?\n/) : [];
    const entries2 = [];
    for (const row of rows) {
      const expression = args[0] === "--list-sdks" ? new RegExp(`^(${VERSION_TOKEN}) \\[(.+)\\]$`) : new RegExp(`^([A-Za-z0-9.]+) (${VERSION_TOKEN}) \\[(.+)\\]$`);
      const match2 = expression.exec(row.trim());
      if (!match2 || !safePath(match2.at(-1))) return null;
      entries2.push(args[0] === "--list-sdks" ? { version: match2[1], path: match2[2] } : { name: match2[1], version: match2[2], path: match2[3] });
    }
    return { version: null, data: { [args[0] === "--list-sdks" ? "sdks" : "runtimes"]: entries2 } };
  }
  if (name === "wsl" && args[0] === "--list") {
    const distributions = [];
    for (const row of text2.split(/\r?\n/)) {
      const match2 = /^\s*(\*)?\s*(.+?)\s{2,}(.+?)\s+([12])\s*$/.exec(row);
      if (!match2) continue;
      const label = safeLabel(match2[2]);
      const state = safeLabel(match2[3]);
      if (!label || !state) return null;
      distributions.push({ name: label, state, generation: Number(match2[4]), default: Boolean(match2[1]) });
    }
    return distributions.length ? { version: null, data: { distributions } } : null;
  }
  const patterns = {
    git: new RegExp(`^git version (${VERSION_TOKEN})(?:\\s|$)`),
    node: new RegExp(`^v(${VERSION_TOKEN})$`),
    rustc: new RegExp(`^rustc (${VERSION_TOKEN})(?:\\s|$)`),
    cargo: new RegExp(`^cargo (${VERSION_TOKEN})(?:\\s|$)`),
    zig: new RegExp(`^(${VERSION_TOKEN})$`),
    docker: new RegExp(`^Docker version (${VERSION_TOKEN})(?:,|\\s|$)`),
    gh: new RegExp(`^gh version (${VERSION_TOKEN})(?:\\s|$)`),
    rg: new RegExp(`^ripgrep (${VERSION_TOKEN})(?:\\s|$)`),
    task: new RegExp(`^(?:Task version:\\s+)?v?(${VERSION_TOKEN})(?:\\s|$)`, "i"),
    just: new RegExp(`^just (${VERSION_TOKEN})(?:\\s|$)`),
    make: new RegExp(`^GNU Make (${VERSION_TOKEN})(?:\\s|$)`),
    wsl: new RegExp(`^WSL[^:\\r\\n]*:\\s*(${VERSION_TOKEN})\\s*$`, "im")
  };
  const match = patterns[name]?.exec(name === "wsl" ? text2 : firstLine);
  if (!match || !VERSION.test(match[1])) return null;
  const data = name === "docker" ? {
    engine: "not_run",
    compose: { state: "not_run", version: null, reason: "\uAC80\uC99D\uB41C Compose \uD50C\uB7EC\uADF8\uC778 \uACBD\uB85C\uAC00 \uC5C6\uC5B4 \uC2E4\uD589\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4." }
  } : null;
  return { version: match[1], data };
}
function inventoryFrom(output) {
  try {
    const value = JSON.parse(decodeOutput(output));
    const context2 = value.context;
    if (context2.platform !== "win32" || !safePath(context2.cwd) || !safePath(context2.diagnosticShell.path) || context2.diagnosticShell.profileApplied !== false || !context2.os || !safeLabel(context2.processArchitecture)) throw new Error();
    const commands = {};
    for (const name of INVENTORY_NAMES) {
      const candidates2 = value.commands?.[name];
      if (!Array.isArray(candidates2)) throw new Error();
      commands[name] = candidates2.map((candidate) => ({
        name: safeLabel(candidate.name),
        commandType: safeLabel(candidate.commandType),
        path: safePath(candidate.path),
        fileVersion: metadataVersion(candidate.fileVersion),
        productVersion: metadataVersion(candidate.productVersion)
      }));
    }
    return {
      context: {
        platform: "win32",
        ...safeLabel(context2.metadataSource) ? { metadataSource: safeLabel(context2.metadataSource) } : {},
        os: {
          name: safeLabel(context2.os.name),
          version: metadataVersion(context2.os.version),
          build: metadataVersion(context2.os.build),
          architecture: safeLabel(context2.os.architecture)
        },
        processArchitecture: safeLabel(context2.processArchitecture),
        cwd: safePath(context2.cwd),
        diagnosticShell: {
          name: safeLabel(context2.diagnosticShell.name),
          path: safePath(context2.diagnosticShell.path),
          version: metadataVersion(context2.diagnosticShell.version),
          profileApplied: false
        }
      },
      commands
    };
  } catch {
    throw failure("INVALID_HOST_INVENTORY", "Windows \uC218\uC9D1\uAE30\uAC00 \uC62C\uBC14\uB978 JSON \uBA54\uD0C0\uB370\uC774\uD130\uB97C \uBC18\uD658\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.");
  }
}
function emptyProbe(state, reason, executable = null) {
  return { state, executable, arguments: [], exitCode: null, version: null, data: null, reason };
}
function createWindowsInspector({
  platform = process.platform,
  environment = process.env,
  run = runBounded,
  resolveShell = resolvePowerShell,
  verify = verifyExecutable
} = {}) {
  return async function({ projectPath, timeoutMs = 5e3, tools = [] } = {}) {
    if (platform !== "win32") throw failure("WINDOWS_ONLY", "Windows \uD638\uC2A4\uD2B8\uC5D0\uC11C\uB9CC \uC2E4\uD589\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
    if (!absoluteWindowsPath(projectPath)) throw new TypeError("\uD504\uB85C\uC81D\uD2B8\uC758 Windows \uC808\uB300 \uACBD\uB85C\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4.");
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2147483647) {
      throw new TypeError("\uC870\uD68C \uC81C\uD55C \uC2DC\uAC04\uC740 1 \uC774\uC0C1\uC778 \uC720\uD6A8\uD55C \uC815\uC218\uC5EC\uC57C \uD569\uB2C8\uB2E4.");
    }
    if (!Array.isArray(tools) || tools.some((name) => !INVENTORY_NAMES.includes(name))) {
      throw new TypeError("\uB3C4\uAD6C\uB294 \uACE0\uC815 \uC778\uBCA4\uD1A0\uB9AC\uC758 \uC774\uB984\uB9CC \uD3EC\uD568\uD558\uB294 \uBC30\uC5F4\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.");
    }
    const options = { projectPath, environment };
    const shell2 = await resolveShell(environment, options);
    const env = createChildEnvironment(environment);
    const host = await run(
      shell2,
      ["-NoProfile", "-NonInteractive", "-File", COLLECTOR, "-ProjectPath", projectPath],
      { cwd: projectPath, env, timeoutMs, maxOutputBytes: 1024 * 1024 }
    );
    if (host.state !== "succeeded") {
      throw failure(
        host.state === "timed_out" ? "HOST_COLLECTION_TIMED_OUT" : "HOST_COLLECTION_FAILED",
        host.state === "timed_out" ? "Windows \uBA54\uD0C0\uB370\uC774\uD130 \uC218\uC9D1 \uC81C\uD55C \uC2DC\uAC04\uC744 \uCD08\uACFC\uD588\uC2B5\uB2C8\uB2E4." : "Windows \uBA54\uD0C0\uB370\uC774\uD130\uB97C \uC218\uC9D1\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4."
      );
    }
    const inventory = inventoryFrom(host.stdout);
    const requested = new Set(tools);
    const probes = {};
    for (const name of INVENTORY_NAMES) {
      const candidates2 = inventory.commands[name];
      if (!requested.has(name)) {
        probes[name] = emptyProbe("not_run", "\uBC84\uC804 \uC870\uD68C\uB97C \uC694\uCCAD\uD558\uC9C0 \uC54A\uC544 \uC2E4\uD589\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.");
        continue;
      }
      if (!candidates2.length) {
        probes[name] = emptyProbe("not_found", "\uC9C4\uB2E8 \uC178\uC758 \uBA85\uB839 \uD0D0\uC0C9\uC5D0\uC11C \uD6C4\uBCF4\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
        continue;
      }
      if (!Object.hasOwn(QUERIES, name)) {
        probes[name] = emptyProbe("not_run", METADATA_ONLY_REASONS[name] ?? "\uBD80\uC791\uC6A9\uC744 \uAC80\uC99D\uD55C \uACE0\uC815 \uBC84\uC804 \uC870\uD68C\uAC00 \uC5C6\uC5B4 \uBA54\uD0C0\uB370\uC774\uD130\uB9CC \uC218\uC9D1\uD588\uC2B5\uB2C8\uB2E4.", candidates2[0].path);
        continue;
      }
      const candidate = selectCommandCandidate(name, candidates2);
      const checked = await verify(name, candidate, { ...options, commands: inventory.commands });
      if (!checked.executable) {
        probes[name] = emptyProbe("not_run", checked.reason, candidate.path);
        continue;
      }
      const queries = [];
      for (const fixedArgs of QUERIES[name]) {
        const args = [...fixedArgs];
        const result3 = await run(checked.executable, args, { cwd: projectPath, env: { ...env }, timeoutMs });
        const parsed = result3.state === "succeeded" ? parseVersionOutput(name, args, result3.stdout) : null;
        queries.push({
          state: result3.state === "succeeded" && !parsed ? "failed" : result3.state,
          executable: checked.executable,
          arguments: args,
          exitCode: result3.exitCode,
          version: parsed?.version ?? null,
          data: parsed?.data ?? null,
          reason: result3.state === "succeeded" ? parsed ? "\uD5C8\uC6A9\uD55C \uBC84\uC804\xB7\uC124\uCE58 \uBAA9\uB85D \uC870\uD68C\uB9CC \uD655\uC778\uD588\uC2B5\uB2C8\uB2E4." : "\uC870\uD68C \uCD9C\uB825\uC5D0\uC11C \uC608\uC0C1\uD55C \uBC84\uC804 \uD544\uB4DC\uB97C \uD655\uC778\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4." : result3.reason
        });
        if (result3.state === "timed_out") break;
      }
      const primary = { ...queries[0] };
      if (QUERIES[name].length > 1) {
        primary.data = Object.assign({}, ...queries.map((query) => query.data ?? {}), { queries });
        primary.reason = name === "dotnet" ? "\uC124\uCE58 \uBAA9\uB85D \uC870\uD68C \uACB0\uACFC\uC785\uB2C8\uB2E4. \uD504\uB85C\uC81D\uD2B8\uC5D0\uC11C \uC120\uD0DD\uD560 SDK\uB294 \uD655\uC778\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4." : "WSL \uD638\uC2A4\uD2B8 \uC870\uD68C \uACB0\uACFC\uC785\uB2C8\uB2E4. \uBC30\uD3EC\uD310 \uB0B4\uBD80\uB294 \uC2E4\uD589\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.";
      }
      probes[name] = primary;
    }
    return { ...inventory, probes };
  };
}
var inspect = createWindowsInspector();
async function inspectWindows(options) {
  return inspect(options);
}

// src/versions.mjs
var import_semver2 = __toESM(require_semver2(), 1);

// node_modules/@renovatebot/pep440/lib/version.js
var VERSION_PATTERN = [
  "v?",
  "(?:",
  /* */
  "(?:(?<epoch>[0-9]+)!)?",
  // epoch
  /* */
  "(?<release>[0-9]+(?:\\.[0-9]+)*)",
  // release segment
  /* */
  "(?<pre>",
  // pre-release
  /*    */
  "[-_\\.]?",
  /*    */
  "(?<pre_l>(a|b|c|rc|alpha|beta|pre|preview))",
  /*    */
  "[-_\\.]?",
  /*    */
  "(?<pre_n>[0-9]+)?",
  /* */
  ")?",
  /* */
  "(?<post>",
  // post release
  /*    */
  "(?:-(?<post_n1>[0-9]+))",
  /*    */
  "|",
  /*    */
  "(?:",
  /*        */
  "[-_\\.]?",
  /*        */
  "(?<post_l>post|rev|r)",
  /*        */
  "[-_\\.]?",
  /*        */
  "(?<post_n2>[0-9]+)?",
  /*    */
  ")",
  /* */
  ")?",
  /* */
  "(?<dev>",
  // dev release
  /*    */
  "[-_\\.]?",
  /*    */
  "(?<dev_l>dev)",
  /*    */
  "[-_\\.]?",
  /*    */
  "(?<dev_n>[0-9]+)?",
  /* */
  ")?",
  ")",
  "(?:\\+(?<local>[a-z0-9]+(?:[-_\\.][a-z0-9]+)*))?"
  // local version
].join("");
var validRegex = new RegExp("^" + VERSION_PATTERN + "$", "i");
function valid(version) {
  return validRegex.test(version) ? version : null;
}
var cleanRegex = new RegExp("^\\s*" + VERSION_PATTERN + "\\s*$", "i");
function parse2(version, regex) {
  const { groups } = (regex || validRegex).exec(version) || {};
  if (!groups) {
    return null;
  }
  const parsed = {
    epoch: Number(groups.epoch ? groups.epoch : 0),
    release: groups.release.split(".").map(Number),
    pre: normalize_letter_version(groups.pre_l, groups.pre_n),
    post: normalize_letter_version(
      groups.post_l,
      groups.post_n1 || groups.post_n2
    ),
    dev: normalize_letter_version(groups.dev_l, groups.dev_n),
    local: parse_local_version(groups.local)
  };
  return parsed;
}
function stringify2(parsed) {
  if (!parsed) {
    return null;
  }
  const { epoch, release, pre, post, dev, local: local2 } = parsed;
  const parts = [];
  if (epoch !== 0) {
    parts.push(`${epoch}!`);
  }
  parts.push(release.join("."));
  if (pre) {
    parts.push(pre.join(""));
  }
  if (post) {
    parts.push("." + post.join(""));
  }
  if (dev) {
    parts.push("." + dev.join(""));
  }
  if (local2) {
    parts.push(`+${local2}`);
  }
  return parts.join("");
}
function normalize_letter_version(letterIn, numberIn) {
  let letter = letterIn;
  let number = numberIn;
  if (letter) {
    if (!number) {
      number = 0;
    }
    letter = letter.toLowerCase();
    if (letter === "alpha") {
      letter = "a";
    } else if (letter === "beta") {
      letter = "b";
    } else if (["c", "pre", "preview"].includes(letter)) {
      letter = "rc";
    } else if (["rev", "r"].includes(letter)) {
      letter = "post";
    }
    return [letter, Number(number)];
  }
  if (!letter && number) {
    letter = "post";
    return [letter, Number(number)];
  }
  return null;
}
function parse_local_version(local2) {
  if (local2) {
    return local2.split(/[._-]/).map(
      (part) => Number.isNaN(Number(part)) ? part.toLowerCase() : Number(part)
    );
  }
  return null;
}
function explain(version) {
  const parsed = parse2(version);
  if (!parsed) {
    return parsed;
  }
  const { epoch, release, pre, post, dev, local: local2 } = parsed;
  let base_version = "";
  if (epoch !== 0) {
    base_version += epoch + "!";
  }
  base_version += release.join(".");
  const is_prerelease = Boolean(dev || pre);
  const is_devrelease = Boolean(dev);
  const is_postrelease = Boolean(post);
  return {
    epoch,
    release,
    pre,
    post: post ? post[1] : post,
    dev: dev ? dev[1] : dev,
    local: local2 ? local2.join(".") : local2,
    public: stringify2(parsed).split("+", 1)[0],
    base_version,
    is_prerelease,
    is_devrelease,
    is_postrelease
  };
}

// node_modules/@renovatebot/pep440/lib/operator.js
var operator_exports = {};
__export(operator_exports, {
  "!=": () => ne,
  "<": () => lt,
  "<=": () => le,
  "==": () => eq,
  "===": () => arbitrary,
  ">": () => gt,
  ">=": () => ge,
  compare: () => compare,
  eq: () => eq,
  ge: () => ge,
  gt: () => gt,
  le: () => le,
  lt: () => lt,
  ne: () => ne,
  rcompare: () => rcompare
});
function lt(version, other) {
  return compare(version, other) < 0;
}
function le(version, other) {
  return compare(version, other) <= 0;
}
function eq(version, other) {
  return compare(version, other) === 0;
}
function ne(version, other) {
  return compare(version, other) !== 0;
}
function ge(version, other) {
  return compare(version, other) >= 0;
}
function gt(version, other) {
  return compare(version, other) > 0;
}
function arbitrary(version, other) {
  return version.toLowerCase() === other.toLowerCase();
}
function compare(version, other) {
  const parsedVersion = parse2(version);
  const parsedOther = parse2(other);
  const keyVersion = calculateKey(parsedVersion);
  const keyOther = calculateKey(parsedOther);
  return pyCompare(keyVersion, keyOther);
}
function rcompare(version, other) {
  return -compare(version, other);
}
function pyCompare(elemIn, otherIn) {
  let elem = elemIn;
  let other = otherIn;
  if (elem === other) {
    return 0;
  }
  if (Array.isArray(elem) !== Array.isArray(other)) {
    elem = Array.isArray(elem) ? elem : [elem];
    other = Array.isArray(other) ? other : [other];
  }
  if (Array.isArray(elem)) {
    const len = Math.min(elem.length, other.length);
    for (let i = 0; i < len; i += 1) {
      const res = pyCompare(elem[i], other[i]);
      if (res !== 0) {
        return res;
      }
    }
    return elem.length - other.length;
  }
  if (elem === -Infinity || other === Infinity) {
    return -1;
  }
  if (elem === Infinity || other === -Infinity) {
    return 1;
  }
  return elem < other ? -1 : 1;
}
function calculateKey(input) {
  const { epoch } = input;
  let { release, pre, post, local: local2, dev } = input;
  release = release.concat();
  release.reverse();
  while (release.length && release[0] === 0) {
    release.shift();
  }
  release.reverse();
  if (!pre && !post && dev) pre = -Infinity;
  else if (!pre) pre = Infinity;
  if (!post) post = -Infinity;
  if (!dev) dev = Infinity;
  if (!local2) {
    local2 = -Infinity;
  } else {
    local2 = local2.map(
      (i) => Number.isNaN(Number(i)) ? [-Infinity, i] : [Number(i), ""]
    );
  }
  return [epoch, release, pre, post, dev, local2];
}

// node_modules/@renovatebot/pep440/lib/specifier.js
var RANGE_PATTERN = [
  "(?<operator>(===|~=|==|!=|<=|>=|<|>))",
  "\\s*",
  "(",
  /*  */
  "(?<version>(?:" + VERSION_PATTERN.replace(/\?<\w+>/g, "?:") + "))",
  /*  */
  "(?<prefix>\\.\\*)?",
  /*  */
  "|",
  /*  */
  "(?<legacy>[^,;\\s)]+)",
  ")"
].join("");
var isEqualityOperator = (op) => ["==", "!=", "==="].includes(op);
var rangeRegex = new RegExp("^" + RANGE_PATTERN + "$", "i");
function parse3(ranges) {
  if (!ranges.trim()) {
    return [];
  }
  const specifiers = ranges.split(",").map((range) => rangeRegex.exec(range.trim()) || {}).map(({ groups }) => {
    if (!groups) {
      return null;
    }
    let { ...spec } = groups;
    const { operator, version, prefix, legacy } = groups;
    if (version) {
      spec = { ...spec, ...explain(version) };
      if (operator === "~=") {
        if (spec.release.length < 2) {
          return null;
        }
      }
      if (!isEqualityOperator(operator) && spec.local) {
        return null;
      }
      if (prefix) {
        if (!isEqualityOperator(operator) || spec.dev || spec.local) {
          return null;
        }
      }
    }
    if (legacy && operator !== "===") {
      return null;
    }
    return spec;
  });
  if (specifiers.filter(Boolean).length !== specifiers.length) {
    return null;
  }
  return specifiers;
}
function pick(versions, specifier, options) {
  const parsed = parse3(specifier);
  if (!parsed) {
    return [];
  }
  return versions.filter((version) => {
    const explained = explain(version);
    if (!parsed.length) {
      return explained && !(explained.is_prerelease && !options.prereleases);
    }
    return parsed.reduce((pass, spec) => {
      if (!pass) {
        return false;
      }
      return contains({ ...spec, ...options }, { version, explained });
    }, true);
  });
}
function satisfies(version, specifier, options = {}) {
  const filtered = pick([version], specifier, options);
  return filtered.length === 1;
}
function arrayStartsWith(array, prefix) {
  if (prefix.length > array.length) {
    return false;
  }
  for (let i = 0; i < prefix.length; i += 1) {
    if (prefix[i] !== array[i]) {
      return false;
    }
  }
  return true;
}
function contains(specifier, input) {
  const { explained } = input;
  let { version } = input;
  const { ...spec } = specifier;
  if (spec.prereleases === void 0) {
    spec.prereleases = spec.is_prerelease;
  }
  if (explained && explained.is_prerelease && !spec.prereleases) {
    return false;
  }
  if (spec.operator === "~=") {
    let compatiblePrefix = spec.release.slice(0, -1).concat("*").join(".");
    if (spec.epoch) {
      compatiblePrefix = spec.epoch + "!" + compatiblePrefix;
    }
    return satisfies(version, `>=${spec.version}, ==${compatiblePrefix}`, {
      prereleases: spec.prereleases
    });
  }
  if (spec.prefix) {
    const isMatching = explained.epoch === spec.epoch && arrayStartsWith(explained.release, spec.release);
    const isEquality = spec.operator !== "!=";
    return isEquality ? isMatching : !isMatching;
  }
  if (explained && explained.local && spec.version) {
    if (spec.operator !== "===" && !spec.local) {
      version = explained.public;
      spec.version = explain(spec.version).public;
    }
  }
  if (spec.operator === "<" || spec.operator === ">") {
    if (eq(spec.release.join("."), explained.release.join("."))) {
      return false;
    }
  }
  const op = operator_exports[spec.operator];
  return op(version, spec.version || spec.legacy);
}
function validRange(specifier) {
  return Boolean(parse3(specifier));
}

// src/versions.mjs
function tuple(value) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(?:v|go)?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/);
  if (!match || match.slice(1).some((part) => part !== void 0 && (!Number.isSafeInteger(Number(part)) || /^0\d/.test(part)))) return null;
  return { values: match.slice(1).map((part) => Number(part ?? 0)), parts: match.slice(1).filter((part) => part !== void 0).length };
}
function compare2(left, right) {
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i] < right[i] ? -1 : 1;
  }
  return 0;
}
function rangeMatches(actual, expression, language, request) {
  if (typeof expression !== "string" || expression.length > 512 || !expression.trim()) return null;
  try {
    if (language === "python") {
      let specifier = expression.trim();
      if (request.kind === "exact" && /^\d+(?:\.\d+){0,2}$/.test(specifier)) {
        specifier = `==${specifier}${specifier.split(".").length < 3 ? ".*" : ""}`;
      }
      if (/poetry/i.test(request.field ?? "") && /^[~^]\d/.test(specifier)) {
        const target = tuple(specifier.slice(1));
        if (!target) return null;
        const upper = [...target.values];
        const position = specifier[0] === "~" ? target.parts > 1 ? 1 : 0 : upper[0] > 0 ? 0 : upper[1] > 0 ? 1 : 2;
        upper[position]++;
        for (let i = position + 1; i < 3; i++) upper[i] = 0;
        specifier = `>=${target.values.join(".")},<${upper.join(".")}`;
      }
      return valid(actual) && validRange(specifier) ? satisfies(actual, specifier) : null;
    }
    const range = import_semver2.default.validRange(expression);
    return import_semver2.default.valid(actual) && range !== null ? import_semver2.default.satisfies(actual, range) : null;
  } catch {
    return null;
  }
}
function sdkMatches(actual, requested, metadata) {
  const target = tuple(requested);
  if (!target || target.parts !== 3) return null;
  const options = metadata.sdk ?? metadata.globalJson?.sdk ?? metadata;
  if (options.paths?.length || metadata.paths?.length) return null;
  const policy = options.rollForward ?? "patch";
  const sameMajor = actual[0] === target.values[0];
  const sameMinor = sameMajor && actual[1] === target.values[1];
  const sameBand = sameMinor && Math.floor(actual[2] / 100) === Math.floor(target.values[2] / 100);
  const atLeast = compare2(actual, target.values) >= 0;
  switch (policy) {
    case "disable":
      return compare2(actual, target.values) === 0;
    case "patch":
    case "latestPatch":
      return sameBand && atLeast;
    case "feature":
    case "latestFeature":
      return sameMinor && atLeast;
    case "minor":
    case "latestMinor":
      return sameMajor && atLeast;
    case "major":
    case "latestMajor":
      return atLeast;
    default:
      return null;
  }
}
function evaluateVersion(observed, requests, metadata = {}) {
  const language = metadata.language ?? "node";
  const actualText = typeof observed === "string" ? observed.trim().replace(/^(?:go|v)(?=\d)/, "") : "";
  const actual = tuple(actualText);
  const valid2 = language === "python" ? valid(actualText) : import_semver2.default.valid(actualText);
  if (!valid2 && !actual) return { compatibility: "unknown", reason: "unsupported_observed_version" };
  if (!requests?.length) return { compatibility: "unknown", reason: "no_version_requirement" };
  const groups = /* @__PURE__ */ new Map();
  const keyOf = (request) => typeof request.source === "string" && typeof request.field === "string" ? `${request.source}\0${request.field}` : null;
  for (const request of requests) if (["exact", "channel"].includes(request.kind) && keyOf(request)) {
    const key2 = keyOf(request);
    if (!groups.has(key2)) groups.set(key2, /* @__PURE__ */ new Set());
    groups.get(key2).add(request.value);
  }
  const multiple = new Set([...groups].filter(([, values]) => values.size > 1).map(([key2]) => key2));
  const outcomes = requests.filter((request) => request.kind !== "preferred").map((request) => {
    if (multiple.has(keyOf(request))) return null;
    if (request.kind === "channel") return metadata.selectedChannel === request.value && metadata.channelVerified === true ? true : null;
    if (request.kind === "minimum") {
      const target = tuple(request.value);
      return target && import_semver2.default.valid(actualText) ? import_semver2.default.gte(actualText, target.values.join(".")) : null;
    }
    if (request.kind === "sdk") return actual ? sdkMatches(actual.values, request.value, metadata) : null;
    return rangeMatches(actualText, request.value, language, request);
  });
  if (outcomes.includes(false)) return { compatibility: "violated", reason: "version_mismatch" };
  if (!outcomes.length || outcomes.includes(null)) return { compatibility: "unknown", reason: multiple.size ? "multiple_version_selection_unverified" : "unsupported_requirement" };
  return { compatibility: "satisfied", reason: "version_satisfied" };
}

// src/query.mjs
import { mkdtemp, rm, readFile, realpath as realpath3, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, isAbsolute, relative } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";
var ROOT = fileURLToPath2(new URL("../", import.meta.url));
var SAFE_ROOT_VARIABLES = ["MISE_DATA_DIR", "MISE_CONFIG_DIR", "MISE_CACHE_DIR", "RUSTUP_HOME", "CARGO_HOME", "DOTNET_ROOT", "DOTNET_ROOT_X64", "DOTNET_ROOT_X86", "DOCKER_CONFIG", "VSCODE_PORTABLE"];
var QUERY_ENVIRONMENT = {
  MISE_OFFLINE: "1",
  MISE_AUTO_INSTALL: "0",
  MISE_TASK_RUN_AUTO_INSTALL: "0",
  MISE_NO_HOOKS: "1",
  MISE_NO_ENV: "1",
  COREPACK_ENABLE_NETWORK: "0",
  COREPACK_ENABLE_AUTO_PIN: "0"
};
function forceEnvironment(environment, values) {
  const names3 = new Set(Object.keys(values).map((name) => name.toUpperCase()));
  for (const name of Object.keys(environment)) if (names3.has(name.toUpperCase())) delete environment[name];
  return Object.assign(environment, values);
}
function envGet(environment, name) {
  return Object.entries(environment).find(([key2]) => key2.toUpperCase() === name)?.[1];
}
function queryEnvironment(environment) {
  const child = createChildEnvironment(environment);
  for (const name of SAFE_ROOT_VARIABLES) {
    const value = envGet(environment, name);
    if (typeof value === "string" && isAbsolute(value) && !/[\r\n\0]/.test(value)) child[name] = value;
  }
  return Object.assign(child, QUERY_ENVIRONMENT, {
    PNPM_PACKAGE_MANAGER_STRICT: "false",
    DOTNET_GENERATE_ASPNET_CERTIFICATE: "false",
    DOTNET_ADD_GLOBAL_TOOLS_TO_PATH: "false"
  });
}
function matches2(args, ...expected) {
  return args.length === expected.length && expected.every((value, index) => args[index] === value);
}
function isReadOnlyQuery(tool, args) {
  if (!Array.isArray(args) || args.length > 80 || args.some((arg) => typeof arg !== "string" || /[\0\r\n]/.test(arg))) return false;
  if (["node", "python", "rustc", "cargo", "rg", "gh", "winget", "code", "codex", "task", "just", "make"].includes(tool) && matches2(args, "--version")) return true;
  if (tool === "zig") return matches2(args, "version");
  if (tool === "git") {
    const words = args[0] === "-c" && args[1] === "core.fsmonitor=false" ? args.slice(2) : args;
    return matches2(words, "--version") || matches2(words, "rev-parse", "--show-toplevel") || matches2(words, "ls-files", "--eol", "-z") || matches2(words, "config", "--list") || words.length === 3 && words[0] === "config" && ["--get", "--get-all", "--get-regexp"].includes(words[1]) && typeof words[2] === "string" && words[2] !== "" && !words[2].startsWith("-");
  }
  if (tool === "mise") return matches2(args, "--version") || args.length === 3 && args[0] === "ls" && args.includes("--installed") && args.includes("--json") || args.length === 2 && args[0] === "which" && ["node", "python", "go", "rustc", "cargo", "zig", "dotnet", "uv", "lazydocker", "process-compose"].includes(args[1]);
  if (tool === "dotnet") return args.length === 1 && ["--list-sdks", "--list-runtimes", "--version", "--info"].includes(args[0]);
  if (tool === "docker") {
    return matches2(args, "--version") || matches2(args, "context", "show") || matches2(args, "context", "ls") || args.length === 3 && args[0] === "context" && args[1] === "inspect" && typeof args[2] === "string" && /^[\w.][\w.-]{0,119}$/.test(args[2]);
  }
  if (tool === "docker-compose") return matches2(args, "version") || matches2(args, "version", "--short") || matches2(args, "version", "--format", "json");
  if (tool === "wsl") return matches2(args, "--version") || matches2(args, "--status") || matches2(args, "--list", "--verbose") || matches2(args, "--list", "--quiet");
  if (tool === "vswhere") return args.includes("-format") && args.includes("json");
  if (tool === "fsutil") return args[0] === "devdrv" && args[1] === "query";
  if (tool === "codex") return matches2(args, "plugin", "list") || matches2(args, "plugin", "list", "--json") || matches2(args, "plugin", "list", "--marketplace", "windows-agent-devkit-local", "--json") || matches2(args, "plugin", "marketplace", "list") || matches2(args, "plugin", "marketplace", "list", "--json");
  if (tool === "gh") return matches2(args, "auth", "status", "--active", "--hostname", "github.com");
  if (tool === "pwsh" || tool === "powershell") {
    if (args[0] !== "-NoProfile" || args[1] !== "-NonInteractive" || args[2] !== "-File") return false;
    if (args[3] === resolve(ROOT, "scripts", "collect-host.ps1")) return args.length === 4 || args.length === 6 && args[4] === "-ProjectPath" && typeof args[5] === "string" && isAbsolute(args[5]);
    return args.length === 6 && args[3] === resolve(ROOT, "scripts", "collect-advanced.ps1") && args[4] === "-TargetPath" && typeof args[5] === "string" && isAbsolute(args[5]);
  }
  return false;
}
function denied(reason, executable = null, args = []) {
  return { state: "not_run", stdout: "", stderr: "", exitCode: null, executable, arguments: args, reason };
}
async function shimTarget(candidate) {
  if (!candidate?.path || !/[\\/]shims[\\/]/i.test(candidate.path)) return candidate;
  try {
    const data = await readFile(candidate.path.replace(/\.(?:exe|cmd|ps1)$/i, ".shim"), "utf8");
    if (data.length > 8192 || [...data.matchAll(/^args[ \t]*=[ \t]*(.*)$/gm)].some((match2) => match2[1].trim() !== "[]")) return candidate;
    const match = /^path\s*=\s*"([^"\r\n]+)"\s*$/m.exec(data);
    if (match && isAbsolute(match[1]) && !/[%$]/.test(match[1])) return { ...candidate, path: match[1], commandType: "Application", shimSource: candidate.path };
  } catch {
  }
  return candidate;
}
function createQuery({ projectPath, host, timeoutMs = 5e3, environment = process.env, run = runBounded } = {}) {
  return async function query(tool, args, options = {}) {
    if (options.execute === true) return denied("\uC77D\uAE30 \uC804\uC6A9 \uBA54\uD0C0\uB370\uC774\uD130 \uC870\uD68C\uB9CC \uC9C0\uC6D0\uD569\uB2C8\uB2E4.", null, args);
    if (options.signal?.aborted) return denied("\uCDE8\uC18C\uB41C \uC870\uD68C\uC785\uB2C8\uB2E4.", null, args);
    if (!Array.isArray(args) || args.length > 128 || args.some((arg) => typeof arg !== "string" || /[\0\r\n]/.test(arg))) return denied("\uBB38\uC790\uC5F4 \uC778\uC218 \uBC30\uC5F4\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.");
    if (!isReadOnlyQuery(tool, args)) return denied("\uD5C8\uC6A9\uD55C \uBA54\uD0C0\uB370\uC774\uD130 \uC870\uD68C\uAC00 \uC544\uB2D9\uB2C8\uB2E4.", null, args);
    let candidate = options.executable ? { name: `${tool}.exe`, commandType: "Application", path: options.executable } : selectCommandCandidate(tool, host?.commands?.[tool]);
    if (!candidate && ["vswhere", "fsutil"].includes(tool)) {
      const root = envGet(environment, tool === "vswhere" ? "PROGRAMFILES(X86)" : "SYSTEMROOT");
      if (root && isAbsolute(root)) candidate = { name: `${tool}.exe`, commandType: "Application", path: tool === "vswhere" ? join(root, "Microsoft Visual Studio", "Installer", "vswhere.exe") : join(root, "System32", "fsutil.exe") };
    }
    if (!candidate) {
      const extension = process.platform === "win32" ? ".exe" : "";
      for (const directory of String(envGet(environment, "PATH") ?? "").split(process.platform === "win32" ? ";" : ":")) {
        if (!isAbsolute(directory)) continue;
        try {
          const path5 = join(directory, `${tool}${extension}`);
          if ((await stat(path5)).isFile()) {
            candidate = { name: `${tool}${extension}`, commandType: "Application", path: path5 };
            break;
          }
        } catch {
        }
      }
    }
    candidate = await shimTarget(candidate);
    if (!candidate?.path) return { ...denied("\uD604\uC7AC \uBB38\uB9E5\uC5D0\uC11C \uBA85\uB839 \uD6C4\uBCF4\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.", null, args), state: "not_found" };
    const assessment = await verifyExecutable(tool, candidate, { projectPath, commands: host?.commands });
    if (!assessment.executable) return denied(assessment.reason, candidate.path, args);
    const cwd = options.cwd ?? projectPath;
    const env = forceEnvironment(queryEnvironment(environment), options.env ?? {});
    for (const name of Object.keys(env)) if (isEnvironmentInjection(name)) delete env[name];
    forceEnvironment(env, QUERY_ENVIRONMENT);
    let temporary;
    if (tool === "dotnet" && ["--version", "--info"].includes(args[0])) {
      temporary = await mkdtemp(join(tmpdir(), "windows-agent-devkit-dotnet-"));
      forceEnvironment(env, { DOTNET_CLI_HOME: temporary });
    }
    const actualArgs = tool === "git" ? ["-c", "core.fsmonitor=false", "-c", "core.hooksPath=NUL", ...args] : args;
    try {
      const response = await run(assessment.executable, actualArgs, {
        cwd,
        env,
        signal: options.signal,
        timeoutMs: options.timeoutMs ?? timeoutMs,
        maxOutputBytes: options.maxOutputBytes ?? 256 * 1024
      });
      return {
        ...response,
        stdout: decodeOutput(response.stdout),
        stderr: decodeOutput(response.stderr),
        executable: assessment.executable,
        arguments: actualArgs,
        resolutionMethod: candidate.shimSource ? "shim-target-metadata" : "direct-executable"
      };
    } finally {
      if (temporary) {
        const absolute2 = await realpath3(temporary);
        const parent = await realpath3(tmpdir());
        const child = relative(parent, absolute2);
        if (child && !child.startsWith("..") && !isAbsolute(child) && child.startsWith("windows-agent-devkit-dotnet-")) await rm(absolute2, { recursive: true, force: true });
      }
    }
  };
}

// src/advanced.mjs
import { lstat as lstat3, open as open2, readdir, realpath as realpath4 } from "node:fs/promises";
import path3 from "node:path";
import { fileURLToPath as fileURLToPath3 } from "node:url";
var import_semver3 = __toESM(require_semver2(), 1);
var COLLECTOR2 = fileURLToPath3(new URL("../scripts/collect-advanced.ps1", import.meta.url));
var LIMIT = 256 * 1024;
var LANGUAGES2 = { node: "node", python: "python", go: "go", rust: "rustc", zig: "zig", dotnet: "dotnet" };
var TOOL_NAMES = { node: "node", nodejs: "node", python: "python", go: "go", golang: "go", rust: "rust", rustc: "rust", zig: "zig", dotnet: "dotnet", task: "task", just: "just", make: "make" };
var VERSION2 = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
var ROOTS = ["PATH", "PATHEXT", "SystemRoot", "WINDIR", "SystemDrive", "TEMP", "TMP", "USERPROFILE", "HOME", "HOMEDRIVE", "HOMEPATH", "APPDATA", "LOCALAPPDATA", "ProgramFiles", "ProgramFiles(x86)", "ProgramW6432", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME", "XDG_STATE_HOME", "MISE_DATA_DIR", "MISE_CONFIG_DIR", "MISE_CACHE_DIR", "MISE_STATE_DIR", "MISE_TMP_DIR", "MISE_INSTALLS_DIR", "MISE_INSTALL_STORE_DIR", "MISE_PLUGINS_DIR", "MISE_SYSTEM_DATA_DIR", "MISE_SYSTEM_CONFIG_DIR", "MISE_SYSTEM_DIR", "MISE_SYSTEM_CONFIG_FILE", "MISE_GLOBAL_CONFIG_FILE", "MISE_CONFIG_FILE", "MISE_ENV", "MISE_NODE_VERSION", "MISE_PYTHON_VERSION", "MISE_GO_VERSION", "MISE_RUST_VERSION", "MISE_ZIG_VERSION", "MISE_DOTNET_VERSION", "DOTNET_ROOT", "DOTNET_ROOT_X64", "DOTNET_ROOT_X86", "DOTNET_ROOT_ARM64", "DOTNET_ROOT(x86)", "DOTNET_MULTILEVEL_LOOKUP", "RUSTUP_HOME", "CARGO_HOME", "GIT_CONFIG_GLOBAL", "GIT_CONFIG_SYSTEM", "GH_CONFIG_DIR", "VSCODE_PORTABLE"];
var DOTNET_ENV = { DOTNET_CLI_TELEMETRY_OPTOUT: "1", DOTNET_NOLOGO: "1", DOTNET_GENERATE_ASPNET_CERTIFICATE: "0", DOTNET_ADD_GLOBAL_TOOLS_TO_PATH: "0", DOTNET_CLI_WORKLOAD_UPDATE_NOTIFY_DISABLE: "true", DOTNET_SKIP_WORKLOAD_INTEGRITY_CHECK: "1", DOTNET_SDK_VULNERABILITY_CHECK_DISABLE: "true", DOTNET_CLI_UI_LANGUAGE: "en-US" };
var GIT_ENV = { GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never", GIT_NO_LAZY_FETCH: "1", GIT_LFS_SKIP_SMUDGE: "1", GIT_CONFIG_COUNT: "0" };
var MISE_ENV = { MISE_OFFLINE: "1", MISE_AUTO_INSTALL: "0", MISE_NO_HOOKS: "1", MISE_NO_ENV: "1", MISE_YES: "0" };
function text(value) {
  if (!Buffer.isBuffer(value)) return typeof value === "string" ? value.replace(/^\uFEFF/, "") : "";
  if (value[0] === 254 && value[1] === 255) return Buffer.from(value.subarray(2, value.length - value.length % 2)).swap16().toString("utf16le");
  const sample = value.subarray(0, 256);
  let oddZeros = 0;
  for (let i = 1; i < sample.length; i += 2) if (sample[i] === 0) oddZeros++;
  return value.toString(value[0] === 255 && value[1] === 254 || oddZeros > sample.length / 8 ? "utf16le" : "utf8").replace(/^\uFEFF/, "");
}
function absolute(value) {
  return typeof value === "string" && value.length <= 32767 && !/[\x00-\x1f]|:\/\//.test(value) && (/^[A-Za-z]:[\\/]|^\\\\[^\\/]+[\\/][^\\/]+/.test(value) || process.platform !== "win32" && path3.isAbsolute(value));
}
function local(value) {
  return absolute(value) && !/^(?:\\\\|\/\/)/.test(value);
}
function key(value) {
  return typeof value === "string" ? (/^[a-z]:|\\/i.test(value) ? path3.win32.normalize(value).toLowerCase() : path3.normalize(value)).replace(/[\\/]+$/, "") : null;
}
function pathsFor(value) {
  return /^[a-z]:|\\/i.test(value) ? path3.win32 : path3;
}
function envRoots(environment) {
  const env = {};
  for (const name of ROOTS) {
    const found = Object.keys(environment).find((item) => item.toLowerCase() === name.toLowerCase());
    if (found && typeof environment[found] === "string") env[name] = environment[found];
  }
  return env;
}
function command(host, name) {
  return host.commands?.[name]?.[0];
}
function probedPath(host, name) {
  const p = host.probes?.[name];
  return ["succeeded", "failed", "timed_out"].includes(p?.state) ? p.executable : null;
}
function actualPath(host, name) {
  return probedPath(host, name) ?? command(host, name)?.resolvedPath ?? command(host, name)?.path ?? null;
}
function unresolvedWrapper(host, name) {
  const candidate = command(host, name);
  return !probedPath(host, name) && !candidate?.resolvedPath && (/[\\/](?:shims?|WindowsApps)[\\/]|\.(?:cmd|bat|ps1)$/i.test(candidate?.path ?? "") || name === "rustc" && /[\\/]\.cargo[\\/]bin[\\/]/i.test(candidate?.path ?? ""));
}
function evidence(query) {
  return { state: query?.state ?? "not_run", executable: absolute(query?.executable) ? query.executable : null, exitCode: Number.isInteger(query?.exitCode) ? query.exitCode : null };
}
function result(checkId, status, reason, message, extra = {}) {
  return { checkId, status, reason, message, applicability: "required", resolution: "unknown", execution: "not_run", compatibility: status === "pass" ? "satisfied" : "unknown", support: { status: "unknown", source: null, checkedOn: null }, recommendation: { status: "unknown" }, observed: {}, nextAction: status === "pass" ? "\uC2E4\uC81C \uBE4C\uB4DC\xB7\uC6D0\uACA9 \uC778\uC99D\xB7\uACF5\uC2DD \uC9C0\uC6D0 \uC0C1\uD0DC\uB294 \uD574\uB2F9 \uC791\uC5C5\uC5D0\uC11C \uB530\uB85C \uD655\uC778\uD569\uB2C8\uB2E4." : "\uAE30\uB85D\uB41C \uADFC\uAC70\uC640 \uC870\uD68C \uC81C\uD55C\uC744 \uD574\uB2F9 \uC2E4\uD589 \uBB38\uB9E5\uC5D0\uC11C \uD655\uC778\uD569\uB2C8\uB2E4.", ...extra };
}
function skip(id, message) {
  return result(id, "skipped", "not_applicable", message, { applicability: "not_required", compatibility: "not_applicable" });
}
function failed(id, q, observed = {}, reason) {
  return result(id, "unknown", reason ?? (q?.state === "timed_out" ? "query_timed_out" : q?.state === "not_found" ? "query_tool_absent" : q?.state === "not_run" ? "query_unsupported" : "query_failed"), "\uC77D\uAE30 \uC804\uC6A9 \uC870\uD68C\uB97C \uC644\uB8CC\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.", { observed, execution: ["succeeded", "failed", "timed_out"].includes(q?.state) ? q.state : "not_run", resolution: q?.state === "not_found" ? "not_resolved" : absolute(q?.executable) ? "resolved" : "unknown" });
}
function successful(q) {
  return q?.state === "succeeded" && (q.exitCode === 0 || q.exitCode == null);
}
function json2(q) {
  try {
    return JSON.parse(text(q.stdout));
  } catch {
    return void 0;
  }
}
function dynamic2(value) {
  if (typeof value === "string") return /\{\{|\{%/.test(value);
  return value && typeof value === "object" && Object.values(value).some(dynamic2);
}
async function read(file) {
  let handle;
  try {
    const info = await lstat3(file);
    if (!info.isFile() || info.isSymbolicLink()) return { state: "unsupported_file" };
    if (info.size > LIMIT) return { state: "file_too_large" };
    handle = await open2(file, "r");
    const buffer = Buffer.alloc(LIMIT + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return bytesRead > LIMIT ? { state: "file_too_large" } : { state: "read", text: buffer.subarray(0, bytesRead).toString("utf8").replace(/^\uFEFF/, "") };
  } catch (error) {
    return { state: ["ENOENT", "ENOTDIR"].includes(error.code) ? "absent" : "unreadable" };
  } finally {
    await handle?.close();
  }
}
function ancestors(directory) {
  const api = pathsFor(directory), items = [];
  for (let cursor = directory; items.length < 128; cursor = api.dirname(cursor)) {
    items.push(cursor);
    if (api.dirname(cursor) === cursor) break;
  }
  return items;
}
async function entries(directory) {
  try {
    return { state: "read", names: await readdir(directory) };
  } catch (error) {
    return { state: ["ENOENT", "ENOTDIR"].includes(error.code) ? "absent" : "unreadable", names: [] };
  }
}
async function miseSafety(root, env, metadata = {}) {
  const files = /* @__PURE__ */ new Set(), directories = /* @__PURE__ */ new Set(), issues = [];
  if (metadata.unsafeDynamicConfig) issues.push("unsafe_dynamic_config");
  const add = (base, name) => {
    if (absolute(base)) files.add(pathsFor(base).join(base, name));
  };
  for (const directory of ancestors(root)) {
    for (const name of ["mise.toml", ".mise.toml", "mise.local.toml", ".mise.local.toml", ".tool-versions", ".miserc.toml"]) add(directory, name);
    for (const folder of [".mise", ".config/mise"]) {
      const nested = pathsFor(directory).join(directory, folder);
      directories.add(nested);
      const listing2 = await entries(nested);
      if (listing2.state === "unreadable") issues.push("config_directory_unreadable");
      for (const name of listing2.names) if (/\.toml$/i.test(name)) add(nested, name);
    }
    const listing = await entries(directory);
    if (listing.state === "unreadable") issues.push("config_directory_unreadable");
    for (const name of listing.names) if (/^\.?mise\..*\.toml$/i.test(name)) add(directory, name);
  }
  for (const base of [env.HOME, env.USERPROFILE]) {
    add(base, ".tool-versions");
    add(base, ".miserc.toml");
    add(base, ".config/mise/config.toml");
    if (absolute(base)) directories.add(pathsFor(base).join(base, ".config/mise"));
  }
  if (absolute(env.XDG_CONFIG_HOME)) directories.add(pathsFor(env.XDG_CONFIG_HOME).join(env.XDG_CONFIG_HOME, "mise"));
  for (const base of [env.MISE_CONFIG_DIR, env.MISE_SYSTEM_CONFIG_DIR, env.MISE_SYSTEM_DIR]) if (absolute(base)) directories.add(base);
  directories.add(pathsFor(root).join(pathsFor(root).parse(root).root, "etc", "mise"));
  for (const directory of directories) {
    add(directory, "config.toml");
    add(directory, "miserc.toml");
    const listing = await entries(directory);
    if (listing.state === "unreadable") issues.push("config_directory_unreadable");
    for (const name of listing.names) if (/\.toml$/i.test(name)) add(directory, name);
    const fragments = await entries(pathsFor(directory).join(directory, "conf.d"));
    if (fragments.state === "unreadable") issues.push("config_directory_unreadable");
    for (const name of fragments.names) if (/\.toml$/i.test(name)) add(directory, `conf.d/${name}`);
  }
  for (const file of [env.MISE_GLOBAL_CONFIG_FILE, env.MISE_CONFIG_FILE, env.MISE_SYSTEM_CONFIG_FILE, ...Array.isArray(metadata.configFiles) ? metadata.configFiles : []]) {
    if (file === void 0) continue;
    if (absolute(file)) files.add(file);
    else issues.push("config_path_unsupported");
  }
  if (env.MISE_ENV) issues.push("environment_specific_config");
  if (Object.entries(env).some(([name, value]) => /^MISE_(?:NODE|PYTHON|GO|RUST|ZIG|DOTNET)_VERSION$/.test(name) && !/^[\w.+ -]+$/.test(value))) issues.push("unsupported_version_override");
  const declarations = [], found = [];
  for (const file of files) {
    const content = await read(file);
    if (content.state === "absent") continue;
    found.push({ path: file, state: content.state });
    if (content.state !== "read") {
      issues.push(content.state);
      continue;
    }
    if (path3.basename(file) === ".tool-versions") {
      for (const line of content.text.split(/\r?\n/)) {
        const [name, ...versions] = line.replace(/#.*/, "").trim().split(/\s+/);
        if (!name) continue;
        if (!Object.hasOwn(TOOL_NAMES, name) || !versions.length || versions.some((v) => !/^[\w.+-]+$/.test(v))) issues.push("unsupported_backend_or_version");
        else declarations.push({ tool: TOOL_NAMES[name], source: file });
      }
      continue;
    }
    let data;
    try {
      data = parse(content.text);
    } catch {
      issues.push("invalid_toml");
      continue;
    }
    if (dynamic2(data)) {
      issues.push("unsafe_dynamic_config");
      continue;
    }
    if ([".miserc.toml", "miserc.toml"].includes(pathsFor(file).basename(file)) && Object.keys(data).length) {
      issues.push("config_discovery_override");
      continue;
    }
    if (Object.keys(data).some((name) => !["tools", "settings", "min_version", "tasks"].includes(name))) issues.push("unsafe_dynamic_config");
    if (data.settings && (typeof data.settings !== "object" || Object.keys(data.settings).some((name) => !["experimental", "offline", "auto_install", "legacy_version_file", "idiomatic_version_file_enable_tools", "not_found_auto_install"].includes(name)))) issues.push("unsupported_settings");
    if (data.tools !== void 0 && (!data.tools || typeof data.tools !== "object" || Array.isArray(data.tools))) {
      issues.push("unsupported_tool_table");
      continue;
    }
    for (const [name, values] of Object.entries(data.tools ?? {})) {
      if (!Object.hasOwn(TOOL_NAMES, name)) {
        issues.push("unsupported_backend");
        continue;
      }
      const versions = Array.isArray(values) ? values : [values];
      if (!versions.length || versions.some((v) => typeof v === "object" ? !v || Object.keys(v).some((k) => k !== "version") || !/^[\w.+-]+$/.test(v.version ?? "") : typeof v !== "string" || !/^[\w.+-]+$/.test(v))) issues.push("unsupported_tool_options");
      declarations.push({ tool: TOOL_NAMES[name], source: file });
    }
  }
  return { files: found, declarations, issues: [...new Set(issues)] };
}
async function toolsCheck(ctx) {
  const { project, host, env, ask, root } = ctx;
  const required = Object.entries(LANGUAGES2).filter(([name]) => project.requirements?.[name]?.state === "required");
  const uncertain = Object.values(project.requirements ?? {}).some((r) => r.state === "unknown");
  if (!required.length && !uncertain) return skip("TOOLS-01", "\uC5B8\uC5B4 \uB3C4\uAD6C \uAD00\uB9AC \uC694\uAD6C\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
  if (!required.length) return result("TOOLS-01", "unknown", "requirement_unknown", "\uB3C4\uAD6C \uAD00\uB9AC \uC694\uAD6C\uB97C \uD655\uC815\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", { applicability: "unknown" });
  if (required.length === 1 && required[0][0] === "dotnet" && !uncertain) return { ...skip("TOOLS-01", ".NET SDK\uB294 \uACF5\uC2DD \uC124\uCE58 \uACBD\uB85C\uC640 global.json\uC73C\uB85C \uBCC4\uB3C4 \uC810\uAC80\uD569\uB2C8\uB2E4."), reason: "official_sdk_installation_exception", observed: { dotnetPolicy: "official_sdk_installation_exception" }, recommendation: { status: "aligned", expected: "official .NET SDK installation" } };
  const safety = await miseSafety(root, env, project.metadata?.mise);
  const observed = { configuration: safety, installed: [], selections: [], dotnetPolicy: "official_sdk_installation_exception", activation: "not_evaluated" };
  if (safety.issues.length) return failed("TOOLS-01", null, observed, safety.issues.includes("unsafe_dynamic_config") ? "unsafe_dynamic_config" : "unsupported_mise_configuration");
  const version = await ask("mise", ["--version"], MISE_ENV);
  observed.versionQuery = evidence(version);
  if (!successful(version)) {
    if (version.state === "not_found") return result("TOOLS-01", "warn", "mise_not_resolved", "\uD604\uC7AC PATH\uC5D0\uC11C mise\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.", { resolution: "not_resolved", observed, recommendation: { status: "different", expected: "mise", exception: ".NET SDK\uB294 \uACF5\uC2DD \uC124\uCE58 \uACBD\uB85C\uB97C \uC720\uC9C0\uD569\uB2C8\uB2E4." } });
    return failed("TOOLS-01", version, observed);
  }
  observed.version = /^(?:mise )?(\d+\.\d+\.\d+)(?:\s|$)/.exec(text(version.stdout).trim())?.[1] ?? null;
  if (!observed.version) return failed("TOOLS-01", version, observed, "unsupported_version_output");
  const installed = await ask("mise", ["ls", "--installed", "--json"], MISE_ENV);
  observed.inventoryQuery = evidence(installed);
  if (!successful(installed)) return failed("TOOLS-01", installed, observed);
  const data = json2(installed);
  if (!data || typeof data !== "object" || Array.isArray(data)) return failed("TOOLS-01", installed, observed, "unsupported_inventory_output");
  for (const [name, versions] of Object.entries(data)) {
    if (!Object.hasOwn(TOOL_NAMES, name)) continue;
    if (!Array.isArray(versions)) return failed("TOOLS-01", installed, observed, "unsupported_inventory_output");
    for (const item of versions) {
      if (!VERSION2.test(item?.version ?? "") || !absolute(item.install_path ?? item.path)) return failed("TOOLS-01", installed, observed, "unsupported_inventory_output");
      observed.installed.push({ tool: TOOL_NAMES[name], version: item.version, path: item.install_path ?? item.path, active: item.active === true });
    }
  }
  let missing = false, different = false, unknown2 = uncertain;
  for (const [language, binary2] of required) {
    if (language === "dotnet") continue;
    const selected = await ask("mise", ["which", binary2], MISE_ENV);
    const selectedPath = text(selected.stdout).trim();
    const current = actualPath(host, binary2);
    const item = { tool: language, query: evidence(selected), selectedPath: successful(selected) && absolute(selectedPath) ? selectedPath : null, pathResolution: absolute(current) ? current : null, comparison: "unknown" };
    if (item.selectedPath && item.pathResolution) {
      const shim = unresolvedWrapper(host, binary2);
      if (!shim) {
        item.comparison = key(current) === key(selectedPath) ? "same" : "different";
        different ||= item.comparison === "different";
      } else unknown2 = true;
    } else if (!successful(selected) && !observed.installed.some((i) => i.tool === language) && safety.declarations.some((i) => i.tool === language) && selected.state === "failed" && /not installed|not found|no version/i.test(text(selected.stderr) + text(selected.stdout))) {
      item.comparison = "missing";
      missing = true;
    } else unknown2 = true;
    observed.selections.push(item);
  }
  return result("TOOLS-01", missing ? "fail" : different ? "warn" : unknown2 ? "unknown" : "pass", missing ? "managed_tool_missing" : different ? "path_selection_differs" : unknown2 ? "selection_not_verified" : "tool_selection_observed", "mise\uC758 \uC124\uCE58 \uBAA9\uB85D\uACFC \uD604\uC7AC PATH\uC758 \uC2E4\uC81C \uB3C4\uAD6C \uC120\uD0DD\uC744 \uB300\uC870\uD588\uC2B5\uB2C8\uB2E4.", { observed, resolution: "resolved", execution: "succeeded", compatibility: missing || different ? "violated" : unknown2 ? "unknown" : "satisfied", recommendation: { status: "aligned", expected: "mise", exception: ".NET SDK\uB294 \uACF5\uC2DD \uC124\uCE58 \uACBD\uB85C\uB97C \uC720\uC9C0\uD569\uB2C8\uB2E4." } });
}
async function globalJson(root, fallback) {
  const physicalRoot = await realpath4(root).catch(() => void 0);
  for (const directory of ancestors(root)) {
    const file = pathsFor(directory).join(directory, "global.json");
    const content = await readDeclarationFile(file, { anchor: directory, physicalAnchor: directory === root ? physicalRoot : void 0 });
    if (content.state === "absent") continue;
    const location = { path: file, ancestor: key(directory) !== key(root) };
    if (content.state !== "read") return { state: content.state, ...location };
    try {
      return { state: "read", ...location, sdk: parseGlobalJson(content.text) ?? {} };
    } catch {
      return { state: "unsupported_json_or_sdk_options", ...location };
    }
  }
  try {
    return { state: "absent", path: null, ancestor: false, sdk: validateSdkOptions(fallback) };
  } catch {
    return { state: "unsupported_json_or_sdk_options", path: null, ancestor: false };
  }
}
function sdkCandidate(sdks, options) {
  const requested = options.version ? import_semver3.default.parse(options.version) : null;
  const policy = options.rollForward ?? (requested ? "patch" : "latestMajor");
  let candidates2 = sdks.map((i) => i.version).filter((v) => import_semver3.default.valid(v) && (options.allowPrerelease !== false || !import_semver3.default.prerelease(v)));
  if (requested) candidates2 = candidates2.filter((v) => {
    const candidate = import_semver3.default.parse(v), band = Math.floor(candidate.patch / 100), requestedBand = Math.floor(requested.patch / 100);
    if (policy === "disable") return v === options.version;
    if (import_semver3.default.lt(v, options.version)) return false;
    if (["patch", "latestPatch"].includes(policy)) return candidate.major === requested.major && candidate.minor === requested.minor && band === requestedBand;
    if (["feature", "latestFeature"].includes(policy)) return candidate.major === requested.major && candidate.minor === requested.minor;
    if (["minor", "latestMinor"].includes(policy)) return candidate.major === requested.major;
    return true;
  });
  candidates2.sort(import_semver3.default.compare);
  if (policy === "patch" && candidates2.includes(options.version)) return options.version;
  if (["feature", "minor", "major"].includes(policy) && candidates2.length) {
    const first = import_semver3.default.parse(candidates2[0]);
    candidates2 = candidates2.filter((v) => {
      const s = import_semver3.default.parse(v);
      return s.major === first.major && s.minor === first.minor && Math.floor(s.patch / 100) === Math.floor(first.patch / 100);
    });
  }
  return candidates2.at(-1) ?? null;
}
function dotnetList(q, runtime) {
  if (!successful(q)) return null;
  const rows = text(q.stdout).trim();
  if (!rows) return [];
  const result3 = [];
  for (const line of rows.split(/\r?\n/)) {
    const match = (runtime ? /^([\w.]+) (\S+) \[(.+)\]$/ : /^(\S+) \[(.+)\]$/).exec(line.trim());
    if (!match || !VERSION2.test(match[runtime ? 2 : 1]) || !absolute(match.at(-1))) return null;
    result3.push(runtime ? { name: match[1], version: match[2], path: match[3] } : { version: match[1], path: match[2] });
  }
  return result3;
}
async function dotnetCheck({ root, project, host, env, ask }) {
  const requirement = project.requirements?.dotnet;
  if (!requirement || requirement.state === "not_required") return skip("DOTNET-01", "C# SDK \uC694\uAD6C\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
  const declaration = await globalJson(root, requirement.metadata?.sdk);
  const observed = { globalJson: declaration, architecture: host.context?.processArchitecture ?? null, roots: Object.fromEntries(Object.entries(env).filter(([name]) => /^DOTNET_ROOT/.test(name))), targetFrameworks: (requirement.metadata?.targetFrameworks ?? []).filter((v) => typeof v === "string" && /^net[\w.+-]+$/.test(v)), sdkSelection: { state: "not_run" }, selectedSdk: null };
  const sdkQuery = await ask("dotnet", ["--list-sdks"], DOTNET_ENV);
  const runtimeQuery = await ask("dotnet", ["--list-runtimes"], DOTNET_ENV);
  observed.sdkQuery = evidence(sdkQuery);
  observed.runtimeQuery = evidence(runtimeQuery);
  observed.sdks = dotnetList(sdkQuery, false);
  observed.runtimes = dotnetList(runtimeQuery, true);
  if (requirement.state === "unknown") return { ...failed("DOTNET-01", sdkQuery, observed, "requirement_unknown"), applicability: "unknown" };
  if (sdkQuery.state === "not_found") return result("DOTNET-01", "fail", "sdk_command_not_resolved", "C# SDK \uC694\uAD6C\uAC00 \uC788\uC73C\uB098 \uD604\uC7AC PATH\uC5D0\uC11C dotnet \uBA85\uB839\uC744 \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.", { observed, resolution: "not_resolved", compatibility: "violated" });
  if (observed.sdks === null) return failed("DOTNET-01", sdkQuery, observed, successful(sdkQuery) ? "unsupported_sdk_inventory" : void 0);
  if (!["read", "absent"].includes(declaration.state)) return failed("DOTNET-01", sdkQuery, observed, declaration.state);
  if (declaration.sdk.paths?.length === 0 || declaration.sdk.paths?.some((p) => p !== "$host$")) {
    return failed("DOTNET-01", sdkQuery, observed, "sdk_paths_require_verified_selection");
  }
  if (!observed.sdks.length) return result("DOTNET-01", "fail", "sdk_absent", "\uACF5\uC720 \uB7F0\uD0C0\uC784 \uBAA9\uB85D\uACFC \uBCC4\uB3C4\uB85C SDK \uC124\uCE58 \uBAA9\uB85D\uC774 \uBE44\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.", { observed, resolution: "resolved", execution: "succeeded", compatibility: "violated" });
  const expected = sdkCandidate(observed.sdks, declaration.sdk);
  observed.candidateSdk = expected ?? null;
  if (host.capabilities?.dotnetSdkSelection !== false) {
    const selected = await ask("dotnet", ["--version"], DOTNET_ENV);
    observed.sdkSelection = evidence(selected);
    const version = text(selected.stdout).trim();
    if (successful(selected) && VERSION2.test(version)) observed.selectedSdk = version;
    else if (successful(selected)) return failed("DOTNET-01", selected, observed, "unsupported_selected_sdk_output");
  }
  if (!expected || observed.selectedSdk && observed.selectedSdk !== expected) return result("DOTNET-01", "fail", !expected ? "sdk_requirement_unavailable" : "sdk_selection_mismatch", "SDK \uBAA9\uB85D \uB610\uB294 \uC2E4\uC81C SDK \uC120\uD0DD\uC774 global.json \uC815\uCC45\uACFC \uC77C\uCE58\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.", { observed, resolution: "resolved", execution: "succeeded", compatibility: "violated" });
  if (observed.runtimes === null || !observed.selectedSdk) return failed("DOTNET-01", { state: observed.sdkSelection.state, executable: sdkQuery.executable }, observed, observed.runtimes === null ? "runtime_inventory_unverified" : "sdk_selection_unverified");
  return result("DOTNET-01", "pass", "sdk_selection_satisfied", "\uD504\uB85C\uC81D\uD2B8 \uC791\uC5C5 \uACBD\uB85C\uC5D0\uC11C \uC2E4\uC81C \uC120\uD0DD\uB41C SDK\uAC00 global.json \uC815\uCC45\uC744 \uCDA9\uC871\uD569\uB2C8\uB2E4.", { observed, resolution: "resolved", execution: "succeeded", nextAction: "\uB300\uC0C1 \uD504\uB808\uC784\uC6CC\uD06C\uC758 \uCC38\uC870 \uD329\uACFC \uC2E4\uC81C \uBE4C\uB4DC\xB7\uB7F0\uD0C0\uC784 \uC2E4\uD589\uC740 \uBCC4\uB3C4\uB85C \uD655\uC778\uD569\uB2C8\uB2E4." });
}
function helpers(output) {
  const allowed = /* @__PURE__ */ new Set(["manager", "manager-core", "wincred", "cache", "store", "osxkeychain", "libsecret"]);
  const lines = text(output).split(/\r?\n|\0/), names3 = [];
  if (lines.at(-1) === "") lines.pop();
  for (const line of lines) {
    const value = line.trim();
    if (!value) {
      names3.length = 0;
      continue;
    }
    if (value.startsWith("!")) {
      names3.push("custom_redacted");
      continue;
    }
    const bare = value.split(/\s/, 1)[0];
    if (allowed.has(bare)) {
      names3.push(bare);
      continue;
    }
    const match = /^(?:"[^"]*[\\/]|[^\s]*[\\/])git-credential-(manager(?:-core)?|wincred|cache|store|osxkeychain|libsecret)(?:\.exe)?"?$/.exec(value);
    names3.push(match && allowed.has(match[1]) ? match[1] : "custom_redacted");
  }
  return [...new Set(names3)];
}
async function gitChecks({ root, project, ask }) {
  if (project.metadata?.git?.required === false) return [skip("GIT-01", "Git \uC791\uC5C5 \uC694\uAD6C\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4."), skip("GIT-02", "Git \uC800\uC7A5\uC18C \uC815\uCC45 \uAC80\uD1A0 \uC694\uAD6C\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.")];
  const version = await ask("git", ["--version"], GIT_ENV);
  const observed = { versionQuery: evidence(version), version: /^git version ([\w.+-]+)/.exec(text(version.stdout).trim())?.[1] ?? null, authentication: { state: "not_run" } };
  if (!successful(version)) return [failed("GIT-01", version, observed), failed("GIT-02", version, {}, "repository_unverified")];
  if (!observed.version || !/^\d+\.\d+/.test(observed.version)) return [failed("GIT-01", version, observed, "unsupported_version_output"), failed("GIT-02", version, {}, "repository_unverified")];
  const repository = await ask("git", ["rev-parse", "--show-toplevel"], GIT_ENV);
  observed.repositoryQuery = evidence(repository);
  const repositoryRoot = text(repository.stdout).trim();
  if (!successful(repository) || !absolute(repositoryRoot)) {
    const absent = /not a git repository/i.test(text(repository.stderr) + text(repository.stdout));
    return [absent ? result("GIT-01", "fail", "not_repository", "\uC9C0\uC815\uD55C \uC791\uC5C5 \uACBD\uB85C\uAC00 Git \uC800\uC7A5\uC18C\uC5D0 \uC18D\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.", { observed, resolution: "resolved", execution: "failed", compatibility: "violated" }) : failed("GIT-01", repository, observed), failed("GIT-02", repository, {}, "repository_unverified")];
  }
  observed.repositoryRoot = repositoryRoot;
  const helper = await ask("git", ["config", "--get-all", "credential.helper"], GIT_ENV);
  observed.helperQuery = evidence(helper);
  observed.credentialHelpers = successful(helper) ? helpers(helper.stdout) : [];
  observed.helperState = successful(helper) ? "read" : helper.exitCode === 1 && !text(helper.stdout).trim() && !text(helper.stderr).trim() ? "absent" : "unknown";
  const local2 = observed.helperState === "unknown" ? failed("GIT-01", helper, observed, "helper_metadata_unreadable") : result("GIT-01", "pass", "local_repository_accessible", "Git \uC2E4\uD589\uACFC \uB85C\uCEEC \uC800\uC7A5\uC18C \uC811\uADFC\uC744 \uD655\uC778\uD588\uC2B5\uB2C8\uB2E4.", { observed, resolution: "resolved", execution: "succeeded", nextAction: "push \uAC00\uB2A5 \uC5EC\uBD80\uC640 \uC6D0\uACA9 \uC778\uC99D\uC740 \uBA85\uC2DC\uD55C \uC6D0\uACA9 \uC791\uC5C5\uC5D0\uC11C \uB530\uB85C \uD655\uC778\uD569\uB2C8\uB2E4." });
  const eol = await ask("git", ["-c", "core.fsmonitor=false", "ls-files", "--eol", "-z"], GIT_ENV, repositoryRoot);
  return [local2, await gitPolicy(repositoryRoot, eol)];
}
function glob(pattern, filename) {
  if (pattern.length > 512 || /[\\!]/.test(pattern)) return null;
  let expression = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        i++;
        if (pattern[i + 1] === "/") {
          i++;
          expression += "(?:.*/)?";
        } else expression += ".*";
      } else expression += "[^/]*";
    } else if (c === "?") expression += "[^/]";
    else if (c === "{") {
      const end = pattern.indexOf("}", i), alternatives = pattern.slice(i + 1, end).split(",");
      if (end < 0 || !alternatives.every((v) => /^[\w.-]+$/.test(v))) return null;
      expression += `(?:${alternatives.map((v) => v.replace(/\./g, "\\.")).join("|")})`;
      i = end;
    } else if (c === "[") return null;
    else expression += c.replace(/[.+^$()|}]/g, "\\$&");
  }
  try {
    return new RegExp(`^${pattern.includes("/") ? "" : "(?:.*/)?"}${expression.replace(/^\//, "")}$`).test(filename);
  } catch {
    return null;
  }
}
function editorConfig(contents) {
  const result3 = { root: false, sections: [], unsupported: false }, knownCharsets = ["utf-8", "utf-8-bom", "latin1", "utf-16be", "utf-16le"];
  let current;
  for (const raw of contents.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^[#;]/.test(line)) continue;
    const section = /^\[(.+)\]$/.exec(line);
    if (section) {
      current = { pattern: section[1] };
      result3.sections.push(current);
      continue;
    }
    const property = /^([\w_]+)\s*[=:]\s*(.*?)\s*$/.exec(line);
    if (!property) {
      result3.unsupported = true;
      continue;
    }
    const name = property[1].toLowerCase(), value = property[2].toLowerCase();
    if (!current && name === "root") result3.root = value === "true";
    if (current && name === "end_of_line") {
      if (!["lf", "crlf", "cr", "unset"].includes(value)) result3.unsupported = true;
      else current.eol = value;
    }
    if (current && name === "charset") {
      if (!knownCharsets.includes(value) && value !== "unset") result3.unsupported = true;
      else current.charset = value;
    }
  }
  return result3;
}
async function gitPolicy(root, query) {
  const observed = { query: evidence(query), policies: [], trackedFiles: 0, violations: [], conflicts: [], mixedWithoutPolicy: 0, encodingVerification: "not_run" };
  if (!successful(query)) return failed("GIT-02", query, observed);
  const rows = text(query.stdout).split("\0").filter(Boolean), files = [];
  for (const row of rows) {
    const match = /^i\/(lf|crlf|mixed|none|-text|)\s+w\/(lf|crlf|mixed|none|-text|)\s+attr\/([^\t]*)\t([^\0]+)$/.exec(row);
    if (!match || /[\x00-\x1f]|\\/.test(match[4]) || path3.posix.isAbsolute(match[4]) || match[4].split("/").includes("..")) return failed("GIT-02", query, observed, "unsupported_eol_output");
    files.push({ index: match[1], worktree: match[2], attributes: match[3].trim(), file: match[4] });
  }
  observed.trackedFiles = files.length;
  const api = pathsFor(root), folders = /* @__PURE__ */ new Set([root]);
  for (const entry of files) {
    let directory = api.dirname(api.join(root, entry.file));
    while (key(directory) !== key(root) && directory !== api.dirname(directory)) {
      folders.add(directory);
      directory = api.dirname(directory);
    }
  }
  if (folders.size > 512) return failed("GIT-02", query, observed, "policy_scope_limit");
  const configs = /* @__PURE__ */ new Map();
  let unsupported = false;
  for (const directory of folders) {
    for (const name of [".gitattributes", ".editorconfig"]) {
      const file = api.join(directory, name), content = await read(file);
      if (content.state === "absent") continue;
      observed.policies.push({ path: file, state: content.state, kind: name });
      if (content.state !== "read") {
        unsupported = true;
        continue;
      }
      if (name === ".editorconfig") {
        const config = editorConfig(content.text);
        configs.set(key(directory), config);
        unsupported ||= config.unsupported;
        Object.assign(observed.policies.at(-1), { root: config.root, sections: config.sections.length, endOfLine: [...new Set(config.sections.map((s) => s.eol).filter(Boolean))], charsets: [...new Set(config.sections.map((s) => s.charset).filter(Boolean))] });
      }
    }
  }
  if (!configs.get(key(root))?.root) {
    for (const directory of ancestors(root).slice(1)) {
      const file = api.join(directory, ".editorconfig"), content = await read(file);
      if (content.state === "absent") continue;
      observed.policies.push({ path: file, state: content.state, kind: ".editorconfig" });
      if (content.state !== "read") {
        unsupported = true;
        break;
      }
      const config = editorConfig(content.text);
      configs.set(key(directory), config);
      unsupported ||= config.unsupported;
      Object.assign(observed.policies.at(-1), { root: config.root, sections: config.sections.length, endOfLine: [...new Set(config.sections.map((s) => s.eol).filter(Boolean))], charsets: [...new Set(config.sections.map((s) => s.charset).filter(Boolean))] });
      if (config.root) break;
    }
  }
  for (const entry of files) {
    if (entry.index === "-text" || entry.worktree === "-text" || /(?:^|\s)-text(?:\s|$)/.test(entry.attributes)) continue;
    const filename = api.join(root, entry.file), chain = [];
    for (const directory of ancestors(api.dirname(filename))) {
      const config = configs.get(key(directory));
      if (config) {
        chain.push({ directory, config });
        if (config.root) break;
      }
    }
    let editorEol;
    for (const { directory, config } of chain.reverse()) for (const section of config.sections) {
      const match = glob(section.pattern, api.relative(directory, filename).replace(/\\/g, "/"));
      if (match === null) {
        unsupported = true;
        continue;
      }
      if (match && section.eol) editorEol = section.eol === "unset" ? void 0 : section.eol;
    }
    const gitEol = /(?:^|\s)eol=(lf|crlf)(?:\s|$)/.exec(entry.attributes)?.[1];
    if (gitEol && editorEol && gitEol !== editorEol) observed.conflicts.push({ file: entry.file, git: gitEol, editorconfig: editorEol });
    const expected = gitEol ?? editorEol;
    if (expected && !["none", ""].includes(entry.worktree) && entry.worktree !== expected || /(?:^|\s)text(?:=auto)?(?:\s|$)/.test(entry.attributes) && ["crlf", "mixed"].includes(entry.index)) observed.violations.push({ file: entry.file, index: entry.index, worktree: entry.worktree, expected: expected ?? "normalized_index_lf" });
    else if (!expected && entry.worktree === "mixed") observed.mixedWithoutPolicy++;
  }
  return result("GIT-02", observed.violations.length ? "fail" : observed.conflicts.length || observed.mixedWithoutPolicy ? "warn" : unsupported ? "unknown" : "pass", observed.violations.length ? "line_ending_policy_violated" : observed.conflicts.length ? "conflicting_line_ending_policy" : observed.mixedWithoutPolicy ? "mixed_line_endings" : unsupported ? "policy_not_fully_supported" : "tracked_line_endings_observed", "\uC800\uC7A5\uC18C\uC758 \uC904\uBC14\uAFC8 \uC815\uCC45\uACFC \uCD94\uC801 \uD30C\uC77C\uC758 \uC778\uB371\uC2A4\xB7\uC791\uC5C5 \uD2B8\uB9AC \uC904\uBC14\uAFC8\uC744 \uB300\uC870\uD588\uC2B5\uB2C8\uB2E4.", { observed, resolution: "resolved", execution: "succeeded", compatibility: observed.violations.length ? "violated" : unsupported || observed.conflicts.length ? "unknown" : "satisfied", nextAction: "\uC800\uC7A5\uC18C \uC815\uCC45\uC744 \uAE30\uC900\uC73C\uB85C \uCC28\uC774\uB97C \uAC80\uD1A0\uD569\uB2C8\uB2E4. \uC804\uC5ED Git \uC124\uC815 \uBCC0\uACBD\uACFC \uC790\uB3D9 \uC815\uADDC\uD654\uB294 \uC218\uD589\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4." });
}
async function fileState(file) {
  try {
    const info = await lstat3(file);
    return info.isFile() && !info.isSymbolicLink() ? "present" : "unsupported";
  } catch (error) {
    return ["ENOENT", "ENOTDIR"].includes(error.code) ? "absent" : "unreadable";
  }
}
async function ideCheck({ root, project, host, env, ask }) {
  const native = project.metadata?.nativeBuild ?? {}, requested = project.metadata?.ide?.required === true;
  const observed = { vscode: [], onPath: absolute(actualPath(host, "code")) ? actualPath(host, "code") : null, msvc: [], windowsSdks: [], developerShellRequired: !command(host, "cl") };
  const roots = new Set((host.ide?.vscodeRoots ?? []).filter(local));
  for (const base of [env.ProgramFiles, env["ProgramFiles(x86)"]]) if (local(base)) for (const name of ["Microsoft VS Code", "Microsoft VS Code Insiders"]) roots.add(pathsFor(base).join(base, name));
  if (local(env.LOCALAPPDATA)) for (const name of ["Microsoft VS Code", "Microsoft VS Code Insiders"]) roots.add(pathsFor(env.LOCALAPPDATA).join(env.LOCALAPPDATA, "Programs", name));
  if (observed.onPath) {
    const api = pathsFor(observed.onPath);
    roots.add(api.basename(api.dirname(observed.onPath)).toLowerCase() === "bin" ? api.dirname(api.dirname(observed.onPath)) : api.dirname(observed.onPath));
  }
  for (const installation of roots) {
    const content = await read(pathsFor(installation).join(installation, "resources", "app", "package.json"));
    if (content.state !== "read") continue;
    try {
      const data = JSON.parse(content.text);
      if (VERSION2.test(data.version ?? "")) observed.vscode.push({ path: installation, version: data.version, source: "installation_metadata" });
    } catch {
    }
  }
  const code = command(host, "code");
  if (!observed.vscode.length && code && absolute(code.path) && /^\d+\.\d+/.test(code.productVersion ?? code.fileVersion ?? "")) observed.vscode.push({ path: code.path, version: /\d+\.\d+\.\d+/.exec(code.productVersion ?? code.fileVersion)?.[0] ?? null, source: "file_version_metadata" });
  if (!requested && !native.msvc && !native.windowsSdk && !observed.vscode.length && !observed.onPath) return skip("IDE-01", "\uD3B8\uC9D1\uAE30 \uB610\uB294 \uB124\uC774\uD2F0\uBE0C \uBE4C\uB4DC \uAC80\uD1A0 \uC694\uAD6C\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
  let discoveryUnknown = false, missingMsvc = false, missingSdk = false;
  if ((native.msvc || native.windowsSdk) && host.context?.processArchitecture && host.context.processArchitecture !== "x64") return failed("IDE-01", null, observed, "unsupported_native_architecture");
  if (native.msvc) {
    const found = await ask("vswhere", ["-products", "*", "-requires", "Microsoft.VisualStudio.Component.VC.Tools.x86.x64", "-format", "json", "-utf8"]);
    observed.vswhere = evidence(found);
    const instances = json2(found);
    let msvcUnknown = false;
    if (!successful(found) || !Array.isArray(instances)) msvcUnknown = true;
    else for (const instance of instances) {
      if (!local(instance.installationPath)) {
        msvcUnknown = true;
        continue;
      }
      if (instance.isComplete === false || instance.isLaunchable === false) continue;
      const api = pathsFor(instance.installationPath), directory = api.join(instance.installationPath, "VC", "Tools", "MSVC"), versions = await entries(directory);
      if (versions.state === "unreadable") msvcUnknown = true;
      for (const version of versions.names.filter((v) => /^\d+\.\d+\.\d+$/.test(v))) {
        const compiler = api.join(directory, version, "bin", "Hostx64", "x64", "cl.exe");
        const state = await fileState(compiler);
        if (state === "present") observed.msvc.push({ installationPath: instance.installationPath, version, compiler, architecture: "x64" });
        else if (state !== "absent") msvcUnknown = true;
      }
    }
    missingMsvc = !msvcUnknown && !observed.msvc.length;
    discoveryUnknown ||= msvcUnknown;
  }
  if (native.windowsSdk || native.msvc) {
    const sdkRoots = new Set((host.ide?.windowsSdkRoots ?? []).filter(local));
    for (const base of [env["ProgramFiles(x86)"], env.ProgramFiles]) if (local(base)) sdkRoots.add(pathsFor(base).join(base, "Windows Kits", "10"));
    let sdkUnknown = !sdkRoots.size;
    for (const sdkRoot of sdkRoots) {
      const api = pathsFor(sdkRoot), versions = await entries(api.join(sdkRoot, "Include"));
      if (versions.state === "unreadable") sdkUnknown = true;
      for (const version of versions.names.filter((v) => /^10\.0\.\d+\.\d+$/.test(v))) {
        const states = await Promise.all([fileState(api.join(sdkRoot, "Include", version, "um", "Windows.h")), fileState(api.join(sdkRoot, "Lib", version, "um", "x64", "kernel32.lib"))]);
        if (states.every((s) => s === "present")) observed.windowsSdks.push({ path: sdkRoot, version, architecture: "x64" });
        else if (states.some((s) => !["present", "absent"].includes(s))) sdkUnknown = true;
      }
    }
    missingSdk = !sdkUnknown && !observed.windowsSdks.length;
    discoveryUnknown ||= sdkUnknown;
  }
  const missingNative = missingMsvc || missingSdk;
  const missingEditor = requested && !observed.vscode.length, unverifiedEditor = observed.onPath && !observed.vscode.length;
  return result("IDE-01", missingNative ? "fail" : discoveryUnknown || unverifiedEditor ? "unknown" : missingEditor ? "warn" : "pass", missingNative ? "native_build_components_missing" : discoveryUnknown ? "native_metadata_unavailable" : missingEditor || unverifiedEditor ? "editor_installation_unverified" : "installation_metadata_observed", "\uD3B8\uC9D1\uAE30 \uC124\uCE58 \uC815\uBCF4\uC640 \uC694\uCCAD\uD55C MSVC\xB7Windows SDK\uC758 \uB85C\uCEEC \uD30C\uC77C\uC744 \uD655\uC778\uD588\uC2B5\uB2C8\uB2E4.", { observed, resolution: observed.onPath ? "resolved" : "not_resolved", execution: observed.vswhere?.state === "succeeded" ? "succeeded" : "not_run", compatibility: missingNative ? "violated" : discoveryUnknown || missingEditor || unverifiedEditor ? "unknown" : "satisfied", nextAction: "MSVC \uD658\uACBD \uCD08\uAE30\uD654\uC640 \uC2E4\uC81C \uCEF4\uD30C\uC77C\xB7\uB9C1\uD06C\uB294 \uD574\uB2F9 \uBE4C\uB4DC \uC791\uC5C5\uC5D0\uC11C \uD655\uC778\uD569\uB2C8\uB2E4." });
}
async function auxiliaryCheck({ project, host, ask }) {
  const requested = project.metadata?.auxiliary ?? {}, observed = { tools: {}, authentication: { state: "not_run" } };
  let unknown2 = false, missing = false, different = false;
  for (const name of ["rg", "gh"]) {
    const required = name === "rg" ? requested.search === true : requested.github === true || requested.authentication === true;
    if (!required && !command(host, name)) continue;
    const q = await ask(name, ["--version"]);
    const version = (name === "rg" ? /^ripgrep ([\d.]+)/ : /^gh version ([\d.]+)/).exec(text(q.stdout).trim())?.[1];
    observed.tools[name] = { ...evidence(q), version: successful(q) && VERSION2.test(version ?? "") ? version : null, pathResolution: absolute(actualPath(host, name)) ? actualPath(host, name) : null, required };
    if (successful(q) && absolute(q.executable) && observed.tools[name].pathResolution) {
      const unresolvedShim = unresolvedWrapper(host, name);
      observed.tools[name].comparison = unresolvedShim ? "shim_target_observed" : key(q.executable) === key(observed.tools[name].pathResolution) ? "same" : "different";
      different ||= observed.tools[name].comparison === "different";
    }
    if (required && q.state === "not_found") missing = true;
    else if (!successful(q) || !observed.tools[name].version || !absolute(q.executable)) unknown2 = true;
  }
  const metadata = host.authentication?.github;
  if (metadata && ["authenticated", "not_authenticated", "unknown"].includes(metadata.state)) observed.authentication = { state: metadata.state, source: "metadata", remoteVerification: "not_run" };
  if (requested.authentication === true && observed.tools.gh?.version) {
    const auth = await ask("gh", ["auth", "status", "--active", "--hostname", "github.com"]);
    observed.authentication = { ...evidence(auth), state: successful(auth) ? "authenticated" : "unknown", source: "explicit_query" };
    unknown2 ||= !successful(auth);
  }
  if (!Object.keys(observed.tools).length) return skip("AUX-01", "\uAC80\uC0C9\xB7GitHub \uB3C4\uAD6C \uAC80\uD1A0 \uC694\uAD6C\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
  return result("AUX-01", missing ? "fail" : unknown2 ? "unknown" : different ? "warn" : "pass", missing ? "required_auxiliary_not_resolved" : unknown2 ? "auxiliary_query_unverified" : different ? "auxiliary_path_differs" : "auxiliary_local_queries_succeeded", "\uD544\uC694\uD55C \uAC80\uC0C9\xB7GitHub CLI\uC758 \uB85C\uCEEC \uBC84\uC804\uACFC \uC2E4\uC81C \uC2E4\uD589 \uACBD\uB85C\uB97C \uD655\uC778\uD588\uC2B5\uB2C8\uB2E4.", { observed, resolution: missing ? "not_resolved" : unknown2 ? "unknown" : "resolved", execution: Object.values(observed.tools).some((v) => v.state === "succeeded") ? "succeeded" : "not_run", compatibility: missing ? "violated" : unknown2 || different ? "unknown" : "satisfied" });
}
async function storageCheck({ project, root, ask }) {
  const request = project.metadata?.storage;
  if (request?.requested !== true) return skip("STORE-01", "Dev Drive \uAC80\uD1A0\uB97C \uC694\uCCAD\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.");
  const target = request.path ?? root, observed = { requestedPath: local(target) ? target : null, volume: null, devDrive: null };
  if (!/^[A-Za-z]:[\\/]/.test(target ?? "") || !local(target)) return failed("STORE-01", null, observed, "storage_path_unsupported");
  const q = await ask("pwsh", ["-NoProfile", "-NonInteractive", "-File", COLLECTOR2, "-TargetPath", target]);
  observed.volumeQuery = evidence(q);
  if (!successful(q)) return failed("STORE-01", q, observed);
  const volume = json2(q);
  if (!volume || !["NTFS", "ReFS", "FAT", "FAT32", "exFAT"].includes(volume.fileSystem) || typeof volume.volumePath !== "string" || !/^(?:[A-Za-z]:\\?|\\\\\?\\Volume\{[0-9a-f-]+\}\\)$/i.test(volume.volumePath)) return failed("STORE-01", q, observed, "unsupported_volume_metadata");
  observed.volume = { fileSystem: volume.fileSystem, volumePath: volume.volumePath, size: Number.isFinite(volume.size) ? volume.size : null, sizeRemaining: Number.isFinite(volume.sizeRemaining) ? volume.sizeRemaining : null };
  const drive = await ask("fsutil", ["devdrv", "query", volume.volumePath]);
  observed.devDriveQuery = evidence(drive);
  const output = text(drive.stdout), negative = /\b(?:not a (?:developer volume|dev drive)|is not a dev drive)\b/i.test(output);
  const positive = /\bthis is (?:a |an )?(?:trusted |untrusted )?developer volume\b/i.test(output) && !negative;
  if (!successful(drive) && !negative || !positive && !negative) return failed("STORE-01", drive, observed, drive.state === "timed_out" ? "query_timed_out" : "dev_drive_query_unverified");
  if (positive && volume.fileSystem !== "ReFS") return failed("STORE-01", drive, observed, "inconsistent_dev_drive_metadata");
  observed.devDrive = positive;
  observed.trusted = positive ? /\bthis is a trusted developer volume\b/i.test(output) : null;
  return result("STORE-01", positive ? "pass" : "warn", positive ? "dev_drive_observed" : "target_not_dev_drive", "\uC694\uCCAD\uD55C \uACBD\uB85C\uC758 \uBCFC\uB968\uACFC Dev Drive \uC9C0\uC815 \uC5EC\uBD80\uB97C \uBCC4\uB3C4\uB85C \uC870\uD68C\uD588\uC2B5\uB2C8\uB2E4.", { observed, resolution: "resolved", execution: "succeeded", compatibility: "satisfied", recommendation: { status: positive ? "aligned" : "different", expected: "Dev Drive", performance: "not_measured" }, nextAction: "\uBCFC\uB968 \uC0DD\uC131\xB7\uD30C\uC77C \uC774\uB3D9\xB7\uBCF4\uC548 \uC815\uCC45 \uBCC0\uACBD\uC740 \uBCC4\uB3C4\uC758 \uC791\uC5C5\uC73C\uB85C \uAC80\uD1A0\uD569\uB2C8\uB2E4." });
}
async function collectAdvanced({ projectPath, project = {}, host = {}, timeoutMs = 5e3, query } = {}) {
  const root = projectPath ?? project.root;
  if (!absolute(root)) throw new TypeError("\uD504\uB85C\uC81D\uD2B8\uC758 \uC808\uB300 \uACBD\uB85C\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4.");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2147483647) throw new TypeError("\uC870\uD68C \uC81C\uD55C \uC2DC\uAC04\uC740 \uC591\uC758 \uC815\uC218\uC5EC\uC57C \uD569\uB2C8\uB2E4.");
  const env = envRoots(host.environment ?? process.env);
  async function ask(tool, args, overrides = {}, cwd = root) {
    if (typeof query !== "function") return { state: "not_run", exitCode: null, reason: "query_unsupported" };
    let timer;
    try {
      return await Promise.race([
        Promise.resolve().then(() => query(tool, [...args], { cwd, env: { ...env, ...overrides }, execute: false })).then((q) => q && typeof q.state === "string" ? q : { state: "failed", reason: "invalid_query_result" }),
        new Promise((resolve3) => {
          timer = setTimeout(() => resolve3({ state: "timed_out", exitCode: null }), timeoutMs);
        })
      ]);
    } catch {
      return { state: "failed", exitCode: null, reason: "query_exception" };
    } finally {
      clearTimeout(timer);
    }
  }
  const ctx = { root, project, host, env, ask };
  const groups = await Promise.all([toolsCheck(ctx), dotnetCheck(ctx), gitChecks(ctx), ideCheck(ctx), auxiliaryCheck(ctx), storageCheck(ctx)]);
  const checks = groups.flat();
  return { checks, observations: Object.fromEntries(checks.map((check2) => [check2.checkId, check2.observed])) };
}

// src/infrastructure.mjs
import { lstat as lstat4, readFile as readFile2 } from "node:fs/promises";
import { join as join2, dirname, posix, win32 as win322 } from "node:path";
var import_yaml3 = __toESM(require_dist(), 1);
var LIMIT2 = 256 * 1024;
function check(checkId, status, reason, message, observed = {}, extra = {}) {
  return { checkId, status, reason, message, applicability: "required", resolution: "unknown", execution: "not_run", compatibility: status === "pass" ? "satisfied" : status === "fail" ? "violated" : "unknown", support: { status: "unknown", source: null, checkedOn: null }, recommendation: { status: "unknown" }, observed, nextAction: "\uAD00\uCC30\uD55C \uACBD\uB85C\uC640 \uC120\uD0DD\uD55C \uC2E4\uD589 \uBB38\uB9E5\uC744 \uD655\uC778\uD569\uB2C8\uB2E4.", ...extra };
}
var skip2 = (id, message) => check(id, "skipped", "not_applicable", message, {}, { applicability: "not_required", compatibility: "not_applicable" });
var okay = (q) => q?.state === "succeeded" && q.exitCode === 0;
var binary = (host, tool) => host.commands?.[tool]?.[0];
async function metadataFile(file) {
  try {
    const info = await lstat4(file);
    if (info.isSymbolicLink() || !info.isFile() || info.size > LIMIT2) return { state: "unknown" };
    return { state: "read", text: await readFile2(file, "utf8") };
  } catch (error) {
    return { state: error.code === "ENOENT" ? "absent" : "unknown" };
  }
}
function endpointKind(value) {
  if (typeof value !== "string") return "unknown";
  return value.startsWith("npipe://") ? "windows-pipe" : value.startsWith("unix://") ? "unix-socket" : value.startsWith("ssh://") ? "remote-ssh" : /^tcp:\/\//.test(value) ? "tcp" : "unknown";
}
async function nodeManager(project, host) {
  const req = project.requirements.node;
  if (req.state === "not_required") return skip2("NODE-02", "Node.js \uC758\uC874\uC131 \uAD00\uB9AC \uC694\uAD6C\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
  const managers = req.packageManagers ?? [], names3 = [...new Set(managers.map((i) => i.name ?? i))];
  const observed = { declarations: managers, lockFiles: req.lockFiles, workspaces: req.metadata?.workspaces ?? project.metadata?.workspaces ?? [], selected: [] };
  if (req.state === "unknown") return check("NODE-02", "unknown", "requirement_unknown", "Node.js \uC758\uC874\uC131 \uC120\uC5B8\uC744 \uD655\uC815\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.", observed, { applicability: "unknown" });
  if (names3.length > 1) return check("NODE-02", "warn", "multiple_manager_declarations", "\uC5EC\uB7EC \uD328\uD0A4\uC9C0 \uAD00\uB9AC\uC790 \uC120\uC5B8\uC758 \uC801\uC6A9 \uBC94\uC704\uB97C \uD655\uC778\uD574\uC57C \uD569\uB2C8\uB2E4.", observed);
  if (!names3.length) return check("NODE-02", "unknown", "manager_not_declared", "Node.js \uD328\uD0A4\uC9C0 \uAD00\uB9AC\uC790\uAC00 \uBA85\uC2DC\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.", observed);
  const name = names3[0], candidate = binary(host, name);
  if (!candidate) return check("NODE-02", "fail", "manager_not_resolved", "\uD504\uB85C\uC81D\uD2B8\uC758 \uD328\uD0A4\uC9C0 \uAD00\uB9AC\uC790 \uBA85\uB839\uC744 \uD604\uC7AC PATH\uC5D0\uC11C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.", observed, { resolution: "not_resolved" });
  const paths = [join2(candidate.path, "..", "node_modules", name, "package.json"), join2(candidate.path, "..", "..", "node_modules", name, "package.json")];
  let version;
  for (const file of paths) {
    const data = await metadataFile(file);
    if (data.state !== "read") continue;
    try {
      const value = JSON.parse(data.text);
      if (value.name === name && /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(value.version)) {
        version = value.version;
        break;
      }
    } catch {
    }
  }
  observed.selected.push({ name, path: candidate.path, version: version ?? null, method: "installed_package_metadata" });
  const requested = (req.metadata?.packageManagerRequests ?? project.metadata?.packageManagerRequests ?? []).filter((r) => r.name === name);
  const assessment = version && requested.length ? evaluateVersion(version, requested, { language: "node" }) : null;
  const status = !version ? "unknown" : assessment?.compatibility === "violated" ? "fail" : assessment?.compatibility === "unknown" ? "unknown" : "pass";
  return check("NODE-02", status, !version ? "wrapper_target_not_verified" : assessment?.reason ?? "manager_metadata_observed", version ? "\uC124\uCE58\uB41C \uAD00\uB9AC\uC790 \uD328\uD0A4\uC9C0\uC758 \uBC84\uC804 \uBA54\uD0C0\uB370\uC774\uD130\uC640 \uC120\uC5B8\uC744 \uBE44\uAD50\uD588\uC2B5\uB2C8\uB2E4." : "\uBA85\uB839 \uB798\uD37C\uC758 \uC2E4\uC81C \uAD00\uB9AC\uC790 \uBC84\uC804\uC744 \uC815\uC801\uC73C\uB85C \uD655\uC778\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.", observed, { resolution: "resolved", resolvedPath: candidate.path, compatibility: status === "pass" ? "satisfied" : status === "fail" ? "violated" : "unknown", recommendation: { status: "aligned", expected: "\uD504\uB85C\uC81D\uD2B8\uC758 \uAE30\uC874 \uD328\uD0A4\uC9C0 \uAD00\uB9AC\uC790" } });
}
function environmentPath(value) {
  if (typeof value !== "string" || value.length > 32767 || /[\x00-\x1f\x7f]|:\/\//.test(value)) return null;
  if (/^(?:[A-Za-z]:[\\/]|[\\/]{2}[^\\/]+[\\/][^\\/]+)/.test(value)) {
    if (/[<>:"|?*]/.test(value.replace(/^[A-Za-z]:/, "")) || /^[\\/]{2}\.{1,2}[\\/]/.test(value)) return null;
    return { api: win322, key: win322.normalize(value).replace(/\\+$/, "").toLowerCase() };
  }
  if (process.platform !== "win32" && /^\/(?!\/)/.test(value)) {
    return { api: posix, key: posix.normalize(value).replace(/\/+$/, "") };
  }
  return null;
}
function localPythonEnvironment(entry) {
  return entry?.directory === ".venv" && [".venv/pyvenv.cfg", ".venv"].includes(entry.source) || entry?.directory === "." && entry.source === "pyvenv.cfg";
}
function pythonEnvironment(project, host) {
  const req = project.requirements.python;
  if (req.state === "not_required") return skip2("PY-02", "Python \uC758\uC874\uC131 \uAD00\uB9AC \uC694\uAD6C\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
  const declarations = req.metadata?.virtualEnvironments ?? [];
  const environments = Array.isArray(declarations) ? declarations.filter(localPythonEnvironment) : [];
  const probe2 = host.probes?.python;
  const runtime = probe2?.state === "succeeded" ? probe2.data : null;
  const prefix = environmentPath(runtime?.prefix), base = environmentPath(runtime?.basePrefix);
  const selected = prefix && prefix.api === base?.api ? { prefix: runtime.prefix, basePrefix: runtime.basePrefix, isolated: prefix.key !== base.key } : null;
  const uv = binary(host, "uv") ?? null;
  const observed = { managers: req.packageManagers, lockFiles: req.lockFiles, environments, selected, uv };
  const report = (status, reason, message, extra) => check("PY-02", status, reason, message, observed, {
    recommendation: { status: uv ? "aligned" : "different", expected: "uv\uC640 \uD504\uB85C\uC81D\uD2B8\uBCC4 \uAC00\uC0C1\uD658\uACBD" },
    ...extra
  });
  if (req.state === "unknown") return report("unknown", "requirement_unknown", "Python \uD658\uACBD \uC120\uC5B8\uC744 \uD655\uC815\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.", { applicability: "unknown" });
  if (!Array.isArray(declarations) || environments.length !== declarations.length || environments.some((entry) => entry.state !== "required")) {
    return report("unknown", "virtual_environment_metadata_unknown", "\uD604\uC7AC \uD504\uB85C\uC81D\uD2B8 \uBC94\uC704\uC5D0\uC11C \uAC00\uC0C1\uD658\uACBD\uC758 \uACBD\uB85C \uB610\uB294 pyvenv.cfg \uBA54\uD0C0\uB370\uC774\uD130\uB97C \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  }
  if (runtime?.prefix == null || runtime?.basePrefix == null) {
    return report("unknown", "interpreter_environment_unknown", "\uD604\uC7AC \uC778\uD130\uD504\uB9AC\uD130\uC758 \uB450 prefix\uB97C \uC870\uD68C\uD55C \uADFC\uAC70\uAC00 \uBD80\uC871\uD569\uB2C8\uB2E4.");
  }
  if (!selected) {
    return report("unknown", "interpreter_environment_path_invalid", "\uD604\uC7AC \uC778\uD130\uD504\uB9AC\uD130\uC758 \uB450 prefix\uB97C \uBE44\uAD50 \uAC00\uB2A5\uD55C \uC808\uB300 \uACBD\uB85C\uB85C \uD574\uC11D\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  }
  if (!environments.length) {
    return selected.isolated ? report("unknown", "external_virtual_environment_unverified", "\uD604\uC7AC \uAC00\uC0C1\uD658\uACBD\uC774 \uD504\uB85C\uC81D\uD2B8\uC5D0 \uC801\uC6A9\uB418\uB294\uC9C0 \uD655\uC778\uD560 \uACBD\uB85C \uADFC\uAC70\uAC00 \uBD80\uC871\uD569\uB2C8\uB2E4.") : report("unknown", "project_environment_not_observed", "\uD604\uC7AC Python\uC758 \uB450 prefix\uAC00 \uAC19\uC73C\uBA70 \uD504\uB85C\uC81D\uD2B8 \uD658\uACBD\uC758 \uC18C\uC18D\uC744 \uD655\uC778\uD560 \uBA54\uD0C0\uB370\uC774\uD130\uAC00 \uBD80\uC871\uD569\uB2C8\uB2E4.");
  }
  const root = environmentPath(project.root);
  if (!root || root.api !== prefix.api) {
    return report("unknown", "project_environment_path_unknown", "\uD504\uB85C\uC81D\uD2B8 \uACBD\uB85C\uB97C \uD604\uC7AC \uC778\uD130\uD504\uB9AC\uD130\uC758 prefix\uC640 \uBE44\uAD50\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  }
  const matches3 = environments.some((entry) => environmentPath(root.api.join(project.root, entry.directory))?.key === prefix.key);
  if (matches3) {
    return selected.isolated ? report("pass", "project_environment_selected", "\uD604\uC7AC \uC778\uD130\uD504\uB9AC\uD130\uC758 prefix\uAC00 \uD504\uB85C\uC81D\uD2B8\uC5D0\uC11C \uD655\uC778\uD55C \uAC00\uC0C1\uD658\uACBD \uACBD\uB85C\uC640 \uC77C\uCE58\uD569\uB2C8\uB2E4.") : report("unknown", "project_environment_prefix_conflict", "\uD504\uB85C\uC81D\uD2B8 \uAC00\uC0C1\uD658\uACBD \uACBD\uB85C\uC640 \uC77C\uCE58\uD558\uB294 \uB450 prefix\uAC00 \uC11C\uB85C \uAC19\uC544 \uAC00\uC0C1\uD658\uACBD \uC120\uD0DD \uC5EC\uBD80\uB97C \uD655\uC815\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  }
  return selected.isolated ? report("warn", "different_virtual_environment_selected", "\uD604\uC7AC \uC778\uD130\uD504\uB9AC\uD130\uB294 \uD504\uB85C\uC81D\uD2B8\uC5D0\uC11C \uD655\uC778\uD55C \uACBD\uB85C\uC640 \uB2E4\uB978 \uAC00\uC0C1\uD658\uACBD\uC744 \uC0AC\uC6A9\uD569\uB2C8\uB2E4.") : report("warn", "declared_environment_not_selected", "\uD604\uC7AC \uC778\uD130\uD504\uB9AC\uD130\uC758 \uB450 prefix\uAC00 \uAC19\uC740 \uACBD\uB85C\uB97C \uAC00\uB9AC\uD0A4\uBA70 \uD504\uB85C\uC81D\uD2B8 \uAC00\uC0C1\uD658\uACBD \uACBD\uB85C\uC640 \uCC28\uC774\uAC00 \uC788\uC2B5\uB2C8\uB2E4.");
}
async function collectInfrastructure({ project, host, options = {}, query }) {
  const checks = [await nodeManager(project, host), pythonEnvironment(project, host)];
  if (!options.wsl) checks.push(skip2("WSL-01", "WSL \uC810\uAC80 \uB300\uC0C1\uC774 \uC120\uD0DD\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4."));
  else {
    const q = host.probes?.wsl;
    const complete = q?.state === "succeeded" && Boolean(q.version) && Array.isArray(q.data?.distributions);
    const status = complete ? "pass" : q?.state === "not_found" ? "fail" : "unknown";
    const reason = complete ? "wsl_host_observed" : q?.data?.queries?.length ? "wsl_host_metadata_incomplete" : q?.state ?? "not_queried";
    const message = complete ? "WSL \uD638\uC2A4\uD2B8 \uBC84\uC804\uACFC \uC124\uCE58 \uBC30\uD3EC\uD310 \uBAA9\uB85D\uC744 \uD655\uC778\uD588\uC2B5\uB2C8\uB2E4." : "WSL \uD638\uC2A4\uD2B8 \uBC84\uC804\uACFC \uC124\uCE58 \uBC30\uD3EC\uD310 \uBAA9\uB85D\uC758 \uC870\uD68C \uADFC\uAC70\uAC00 \uBD80\uC871\uD569\uB2C8\uB2E4.";
    checks.push(check("WSL-01", status, reason, message, q?.data ?? {}, {
      resolution: binary(host, "wsl") ? "resolved" : "not_resolved",
      execution: ["succeeded", "failed", "timed_out"].includes(q?.state) ? q.state : "not_run",
      resolvedPath: q?.executable ?? null
    }));
  }
  const container = options.containers ? "required" : project.environment.containers;
  if (container === "not_required") checks.push(skip2("CTR-01", "\uCEE8\uD14C\uC774\uB108 \uC694\uAD6C\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4."), skip2("LD-01", "\uCEE8\uD14C\uC774\uB108 \uAD00\uB9AC \uC694\uAD6C\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4."));
  else {
    const observed = { declarations: project.metadata?.compose ?? {}, devcontainer: project.metadata?.devcontainer ?? null, context: null, compose: null, engine: "not_contacted" };
    const version = host.probes?.docker;
    if (binary(host, "docker")) {
      const selected = await query("docker", ["context", "show"]);
      const name = decodeOutput(selected.stdout);
      if (okay(selected) && /^[\w.-]{1,120}$/.test(name)) {
        const inspected = await query("docker", ["context", "inspect", name]);
        try {
          const data = JSON.parse(decodeOutput(inspected.stdout));
          const row = Array.isArray(data) ? data[0] : data;
          observed.context = { name, endpointKind: endpointKind(row.Endpoints?.docker?.Host), queryState: inspected.state };
        } catch {
          observed.context = { name, endpointKind: "unknown" };
        }
      }
      const dockerPath = version?.executable ?? binary(host, "docker")?.path;
      const composePaths = [dockerPath && join2(dirname(dockerPath), "..", "cli-plugins", "docker-compose.exe"), process.env.ProgramFiles && join2(process.env.ProgramFiles, "Docker", "Docker", "resources", "cli-plugins", "docker-compose.exe")].filter(Boolean);
      observed.compose = { state: "not_run", version: null, reason: "verified_plugin_not_found" };
      for (const executable of [...new Set(composePaths)]) {
        const compose = await query("docker-compose", ["version", "--format", "json"], { executable });
        try {
          const value = JSON.parse(decodeOutput(compose.stdout));
          if (okay(compose) && /^v?\d+\.\d+\.\d+$/.test(value.version)) {
            observed.compose = { state: compose.state, version: value.version.replace(/^v/, ""), executable, method: "verified_direct_plugin" };
            break;
          }
        } catch {
        }
      }
    }
    const status = container === "unknown" ? "unknown" : !binary(host, "docker") ? "fail" : version?.state === "succeeded" && observed.context?.queryState === "succeeded" && observed.context.endpointKind !== "unknown" && observed.compose?.version ? "pass" : "unknown";
    checks.push(check("CTR-01", status, status === "pass" ? "container_client_configuration_observed" : !binary(host, "docker") ? "docker_not_resolved" : "container_configuration_incomplete", "Docker \uD074\uB77C\uC774\uC5B8\uD2B8\xB7Compose \uBC84\uC804\xB7context \uBA54\uD0C0\uB370\uC774\uD130\uB97C \uC5D4\uC9C4 \uC5F0\uACB0\uACFC \uAD6C\uBD84\uD588\uC2B5\uB2C8\uB2E4.", observed, { applicability: container, resolution: binary(host, "docker") ? "resolved" : "not_resolved", execution: version?.state === "succeeded" ? "succeeded" : "not_run" }));
    const lazy = binary(host, "lazydocker");
    const configRoot = process.env.APPDATA ? join2(process.env.APPDATA, "lazydocker", "config.yml") : null;
    const config = configRoot ? await metadataFile(configRoot) : { state: "unknown" };
    const configObservation = { state: config.state, path: configRoot, customCommands: false, composeCommand: "default", commandValues: "not_collected" };
    if (config.state === "read") {
      try {
        const document = (0, import_yaml3.parseDocument)(config.text, { prettyErrors: false, uniqueKeys: true });
        if (document.errors.length) throw new Error();
        const settings = document.toJS({ maxAliasCount: 50 });
        configObservation.customCommands = Boolean(settings?.customCommands);
        const compose = settings?.commandTemplates?.dockerCompose;
        configObservation.composeCommand = compose === void 0 ? "default" : compose === "docker compose" ? "docker-compose-v2" : "custom";
      } catch {
        configObservation.state = "unknown";
      }
    }
    checks.push(check("LD-01", container === "unknown" || configObservation.state === "unknown" ? "unknown" : lazy ? "pass" : "warn", lazy ? "tui_metadata_observed" : "lazydocker_not_resolved", "Lazydocker\uC758 \uBA85\uB839 \uD6C4\uBCF4\xB7Compose \uBA85\uB839 \uC124\uC815\xB7Docker context\uB97C \uD655\uC778\uD588\uC2B5\uB2C8\uB2E4.", { command: lazy ?? null, configuration: configObservation, dockerContext: observed.context, tui: "not_started", engine: "not_contacted" }, { resolution: lazy ? "resolved" : "not_resolved", recommendation: { status: lazy ? "aligned" : "different", expected: "Lazydocker" } }));
  }
  const state = options.processCompose ? "required" : project.environment.processCompose;
  if (state === "not_required") checks.push(skip2("PC-01", "\uB85C\uCEEC \uB2E4\uC911 \uD504\uB85C\uC138\uC2A4 \uAD00\uB9AC \uC694\uAD6C\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4."));
  else {
    const meta = project.metadata?.processCompose ?? {}, cmd = binary(host, "process-compose");
    const declarations = meta.configurations ?? [], unknown2 = declarations.some((i) => i.state === "unknown");
    checks.push(check("PC-01", state === "unknown" || unknown2 ? "unknown" : !cmd ? "fail" : declarations.length ? "pass" : "unknown", unknown2 ? "service_configuration_unknown" : !cmd ? "process_compose_not_resolved" : "service_configuration_observed", "Process Compose\uC758 \uC178\xB7\uC791\uC5C5 \uACBD\uB85C\xB7\uC758\uC874\uC131\uACFC \uC900\uBE44 \uAC80\uC0AC \uC120\uC5B8\uC744 \uC815\uC801\uC73C\uB85C \uD655\uC778\uD588\uC2B5\uB2C8\uB2E4.", { command: cmd ?? null, configuration: meta, environmentValues: "not_collected", serviceExecution: "not_run" }, { applicability: state, resolution: cmd ? "resolved" : "not_resolved" }));
  }
  return { checks };
}

// src/runtime.mjs
import { lstat as lstat5, readFile as readFile3 } from "node:fs/promises";
import { dirname as dirname2, join as join3, isAbsolute as isAbsolute2 } from "node:path";

// src/go-buildinfo.mjs
import { open as open3, stat as stat2 } from "node:fs/promises";
var MAGIC = Buffer.from([255, 32, 71, 111, 32, 98, 117, 105, 108, 100, 105, 110, 102, 58]);
function parseGoBuildVersion(buffer) {
  for (let offset = buffer.indexOf(MAGIC); offset >= 0; offset = buffer.indexOf(MAGIC, offset + 1)) {
    if (offset % 16 !== 0 || offset + 34 > buffer.length || !(buffer[offset + 15] & 2)) continue;
    let position = offset + 32;
    let length = 0;
    let shift = 0;
    while (position < buffer.length && shift < 21) {
      const value = buffer[position++];
      length |= (value & 127) << shift;
      if (!(value & 128)) break;
      shift += 7;
    }
    if (length < 3 || length > 128 || position + length > buffer.length) continue;
    const version = buffer.toString("utf8", position, position + length);
    if (/^go\d+\.\d+(?:\.\d+)?(?:rc\d+|beta\d+)?$/.test(version)) return version;
  }
  return null;
}
async function readGoBuildVersion(path5) {
  const information = await stat2(path5);
  if (!information.isFile() || information.size > 128 * 1024 * 1024) return null;
  const file = await open3(path5, "r");
  try {
    const buffer = await file.readFile();
    return parseGoBuildVersion(buffer);
  } finally {
    await file.close();
  }
}

// src/runtime.mjs
async function boundedText(file) {
  try {
    const info = await lstat5(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 256 * 1024) return null;
    return await readFile3(file, "utf8");
  } catch {
    return null;
  }
}
async function enhanceRuntimes({ host, project, tools, query, environment = process.env }) {
  if (tools.includes("go")) {
    const candidate = host.commands?.go?.[0];
    const checked = await verifyExecutable("go", candidate, { projectPath: project.root });
    if (checked.executable) {
      const version = await readGoBuildVersion(checked.executable);
      if (version) host.probes.go = { state: "metadata_verified", executable: checked.executable, arguments: [], exitCode: null, version, versionVerified: true, method: "pe_go_buildinfo", reason: "Go \uC2E4\uD589 \uD30C\uC77C\uC758 \uB0B4\uC7A5 \uBC84\uC804\uB9CC \uC77D\uC5C8\uC2B5\uB2C8\uB2E4. Go \uD504\uB85C\uC138\uC2A4\uC640 telemetry\uB294 \uC2E4\uD589\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4." };
    }
  }
  if (tools.includes("rustc") && host.probes?.rustc?.state !== "succeeded") {
    const roots = [environment.RUSTUP_HOME, environment.USERPROFILE ? join3(environment.USERPROFILE, ".rustup") : null].filter((p) => typeof p === "string" && isAbsolute2(p));
    for (const root of roots) {
      let settings;
      try {
        settings = parse(await boundedText(join3(root, "settings.toml")) ?? "", { unsafeKeyBehaviour: "throw" });
      } catch {
        continue;
      }
      const requests = project.requirements.rust.versionRequests.filter((i) => ["channel", "exact"].includes(i.kind));
      const channel = environment.RUSTUP_TOOLCHAIN ?? requests[0]?.value ?? settings.default_toolchain;
      if (typeof channel !== "string" || !/^[\w.-]{1,160}$/.test(channel)) continue;
      const hostTarget = /-(?:x86_64|aarch64)-pc-windows-(?:msvc|gnu)$/.exec(settings.default_toolchain ?? "")?.[0] ?? "-x86_64-pc-windows-msvc";
      const directory = /-pc-windows-/.test(channel) ? channel : `${channel}${hostTarget}`;
      const executable = join3(root, "toolchains", directory, "bin", "rustc.exe");
      const result3 = await query("rustc", ["--version"], { executable });
      const version = /^rustc (\d+\.\d+\.\d+(?:-[\w.-]+)?)/.exec(result3.stdout ?? "")?.[1];
      if (result3.state !== "succeeded" || !version) continue;
      host.probes.rustc = { ...result3, version, method: "rustup_installed_toolchain", channel, versionVerified: true };
      project.requirements.rust.metadata.selectedChannel = channel;
      project.requirements.rust.metadata.channelVerified = true;
      break;
    }
  }
}

// src/support.mjs
var import_semver4 = __toESM(require_semver2(), 1);
var SUPPORT_SNAPSHOT = Object.freeze({ checkedOn: "2026-11-17", validUntil: "2026-12-17" });
var SOURCES = {
  node: "https://raw.githubusercontent.com/nodejs/Release/main/schedule.json",
  python: "https://devguide.python.org/versions/",
  go: "https://go.dev/doc/devel/release",
  dotnet: "https://dotnet.microsoft.com/en-us/platform/support/policy",
  powershell: "https://learn.microsoft.com/en-us/powershell/scripting/install/powershell-support-lifecycle",
  windows: "https://learn.microsoft.com/en-us/windows/release-health/windows11-release-information"
};
var RELEASES = {
  node: { 22: "2027-04-30", 24: "2028-04-30", 26: "2029-04-30" },
  python: { "3.11": "2027-10", "3.12": "2028-10", "3.13": "2029-10", "3.14": "2030-10", "3.15": "2031-10" },
  go: { "1.26": null, "1.27": null },
  dotnet: { 10: "2028-11-14", 11: "2028-11-14" },
  powershell: { "7.6": "2028-11-14" }
};
function assessSupport(tool, version, { now = /* @__PURE__ */ new Date(), os } = {}) {
  const today = new Date(now).toISOString().slice(0, 10);
  const base = { status: "unknown", source: SOURCES[tool] ?? null, ...SUPPORT_SNAPSHOT, scope: "release_line", patchCurrency: "not_checked", platformSupport: "not_checked" };
  if (today < SUPPORT_SNAPSHOT.checkedOn || today > SUPPORT_SNAPSHOT.validUntil) return { ...base, reason: "policy_snapshot_stale" };
  if (tool === "windows") {
    const build = Number(os?.build), name = os?.name ?? "";
    if (!/Windows 11/i.test(name) || /LTSC|Server/i.test(name)) return { ...base, reason: "edition_or_channel_unknown" };
    const enterprise = /Enterprise|Education/i.test(name), consumer = /Home|Pro/i.test(name);
    if (!enterprise && !consumer) return { ...base, reason: "edition_unknown" };
    const rows = { 26300: ["26H2", "2028-10-10", "2029-10-09"], 28e3: ["26H1", "2028-03-14", "2029-03-13"], 26200: ["25H2", "2027-10-12", "2028-10-10"], 26100: ["24H2", "ended", "2027-10-12"], 22631: ["23H2", "ended", "ended"] };
    const row = rows[build];
    if (!row) return { ...base, reason: "release_not_in_snapshot" };
    const end = row[enterprise ? 2 : 1];
    return { ...base, status: end === "ended" || today >= end ? "out_of_support" : "in_support", reason: "upstream_release_line_policy", release: row[0], endOfSupport: end };
  }
  const parsed = import_semver4.default.parse(String(version ?? "").replace(/^(?:go|v)(?=\d)/, ""));
  if (!parsed || parsed.prerelease.length) return { ...base, reason: "stable_version_not_verified" };
  if (!RELEASES[tool]) return { ...base, reason: "no_formal_policy_snapshot" };
  const key2 = ["python", "go", "powershell"].includes(tool) ? `${parsed.major}.${parsed.minor}` : String(parsed.major);
  const entries2 = RELEASES[tool];
  if (Object.hasOwn(entries2, key2)) return { ...base, status: "in_support", reason: "upstream_release_line_policy", release: key2, endOfSupport: entries2[key2] };
  const highest = Object.keys(entries2).at(-1);
  const order = import_semver4.default.compare(`${parsed.major}.${parsed.minor}.0`, `${highest}${highest.includes(".") ? "" : ".0"}.0`);
  return { ...base, status: order < 0 ? "out_of_support" : "unknown", reason: order < 0 ? "release_line_ended" : "release_not_in_snapshot", release: key2 };
}
function attachSupport(checks, host, now) {
  const tools = { "ENV-01": "windows", "SH-01": "powershell", "NODE-01": "node", "PY-01": "python", "GO-01": "go", "RUST-01": "rust", "ZIG-01": "zig", "DOTNET-01": "dotnet" };
  for (const check2 of checks) {
    const tool = tools[check2.checkId];
    if (!tool || check2.status === "skipped") continue;
    const version = tool === "powershell" ? host.context?.diagnosticShell?.version : typeof check2.observed === "string" ? check2.observed : typeof check2.observed?.selectedSdk === "string" ? check2.observed.selectedSdk : check2.observed?.selectedSdk?.version ?? check2.observed?.selectedVersion;
    check2.support = assessSupport(tool, version, { now, os: host.context?.os });
    if (check2.support.status === "out_of_support" && check2.status === "pass") {
      check2.status = "warn";
      check2.nextAction = "\uD504\uB85C\uC81D\uD2B8 \uD638\uD658\uC131 \uACB0\uACFC\uC640 \uBCC4\uB3C4\uB85C \uACF5\uC2DD \uC9C0\uC6D0 \uC885\uB8CC \uACC4\uC5F4\uC758 \uC804\uD658\uC744 \uAC80\uD1A0\uD569\uB2C8\uB2E4.";
    }
  }
}

// src/exceptions.mjs
import { createHash as createHash2 } from "node:crypto";
import { constants as constants2 } from "node:fs";
import { lstat as lstat6, open as open4, realpath as realpath5 } from "node:fs/promises";
import { tmpdir as tmpdir2 } from "node:os";
import path4 from "node:path";
var LIMIT3 = 8 * 1024 * 1024;
function failure2(code) {
  return Object.assign(new Error(code), { code });
}
async function statMaybe(filename) {
  try {
    return await lstat6(filename);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw failure2("PATH_UNREADABLE");
  }
}
async function checkParents(directory) {
  let current = path4.parse(directory).root;
  for (const part of path4.relative(current, directory).split(path4.sep).filter(Boolean)) {
    current = path4.join(current, part);
    const info = await statMaybe(current);
    if (info && (!info.isDirectory() || info.isSymbolicLink())) throw failure2("UNSAFE_PATH");
  }
}
async function physical(filename) {
  if (await statMaybe(filename)) return realpath5(filename);
  const parent = path4.dirname(filename);
  if (parent === filename) throw failure2("INVALID_PATH");
  return path4.join(await physical(parent), path4.basename(filename));
}
function inside2(parent, child) {
  const relative2 = path4.relative(parent, child);
  return relative2 === "" || !path4.isAbsolute(relative2) && relative2 !== ".." && !relative2.startsWith(`..${path4.sep}`);
}
async function readSavedExceptions(filename) {
  await checkParents(path4.dirname(filename));
  const before = await statMaybe(filename);
  if (!before) return null;
  if (!before.isFile() || before.isSymbolicLink() || before.nlink > 1 || before.size > LIMIT3) throw failure2("UNSAFE_FILE");
  const file = await open4(filename, constants2.O_RDONLY | (constants2.O_NOFOLLOW ?? 0));
  try {
    const info = await file.stat();
    if (info.ino !== before.ino || info.dev !== before.dev || info.size > LIMIT3) throw failure2("FILE_CHANGED");
    const bytes = Buffer.alloc(info.size + 1);
    let length = 0;
    while (length < bytes.length) {
      const { bytesRead } = await file.read(bytes, length, bytes.length - length, length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    const after = await file.stat();
    if (length !== info.size || after.size !== info.size || after.mtimeMs !== info.mtimeMs) throw failure2("FILE_CHANGED");
    try {
      return JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, length)));
    } catch {
      throw failure2("INVALID_STATE");
    }
  } finally {
    await file.close();
  }
}
async function loadExceptions(projectRoot, stateDir) {
  const candidate = stateDir ?? (process.env.LOCALAPPDATA && path4.join(process.env.LOCALAPPDATA, "WindowsAgentDevkit", "state"));
  if (!candidate) throw failure2("STATE_DIR_REQUIRED");
  if (!path4.isAbsolute(candidate)) throw failure2("ABSOLUTE_STATE_DIR_REQUIRED");
  await checkParents(path4.resolve(candidate));
  const state = await physical(path4.resolve(candidate));
  let repository = projectRoot;
  for (let folder = projectRoot; ; folder = path4.dirname(folder)) {
    if (await statMaybe(path4.join(folder, ".git"))) {
      repository = folder;
      break;
    }
    if (path4.dirname(folder) === folder) break;
  }
  if (inside2(repository, state) || inside2(state, projectRoot) || state === path4.parse(state).root || state === await physical(tmpdir2())) {
    throw failure2("STATE_DIR_MUST_BE_OUTSIDE_REPOSITORY");
  }
  const projectKey = process.platform === "win32" ? projectRoot.toLowerCase() : projectRoot;
  const key2 = createHash2("sha256").update(projectKey).digest("hex");
  const saved = await readSavedExceptions(path4.join(state, "exceptions", `${key2}.json`));
  if (saved === null) return [];
  if (saved.projectPath !== projectRoot || !Array.isArray(saved.exceptions) || saved.exceptions.some((entry) => typeof entry?.role !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(entry.role) || typeof entry.reason !== "string" || !entry.reason.trim() || typeof entry.scope !== "string")) {
    throw failure2("INVALID_EXCEPTIONS");
  }
  return saved.exceptions;
}

// src/app-check.mjs
async function checkApp({ query, enabled = false, executable }) {
  const base = { checkId: "CODEX-01", applicability: enabled ? "required" : "not_required", resolution: "unknown", execution: "not_run", compatibility: "unknown", support: { status: "unknown", source: null, checkedOn: null }, recommendation: { status: "unknown" }, nextAction: "\uC571\uC758 \uD50C\uB7EC\uADF8\uC778 \uD654\uBA74\uACFC \uC124\uCE58\uD55C Skill \uD638\uCD9C \uACB0\uACFC\uB97C \uD568\uAED8 \uD655\uC778\uD569\uB2C8\uB2E4." };
  if (!enabled) return { ...base, status: "skipped", reason: "app_check_not_selected", message: "\uC571 \uC124\uCE58 \uC810\uAC80\uC740 --app\uC73C\uB85C \uC120\uD0DD\uD569\uB2C8\uB2E4." };
  const result3 = await query("codex", ["plugin", "list", "--marketplace", "windows-agent-devkit-local", "--json"], { executable });
  let data;
  try {
    data = JSON.parse(result3.stdout);
  } catch {
  }
  const entries2 = Array.isArray(data) ? data : data?.installed ?? data?.plugins ?? data?.data?.plugins ?? [];
  const entry = entries2.find((item) => item.name === "windows-agent-devkit" || item.id === "windows-agent-devkit@windows-agent-devkit-local" || item.plugin?.name === "windows-agent-devkit");
  const installed = Boolean(entry) && (Array.isArray(data?.installed) || entry.installed === true || entry.isInstalled === true || entry.installation?.status === "installed" || entry.installationState === "installed");
  const absent = result3.state === "succeeded" && Array.isArray(data?.installed) && !entry;
  return { ...base, status: installed ? entry.enabled === false ? "warn" : "pass" : absent ? "fail" : "unknown", reason: installed ? "local_plugin_installation_observed" : absent ? "local_plugin_not_installed" : "plugin_installation_not_verified", message: installed ? "\uC571\uACFC \uACF5\uC720\uD558\uB294 \uD50C\uB7EC\uADF8\uC778 \uC124\uCE58 \uBAA9\uB85D\uC5D0\uC11C \uC774 \uD328\uD0A4\uC9C0\uB97C \uD655\uC778\uD588\uC2B5\uB2C8\uB2E4." : absent ? "\uC120\uD0DD\uD55C \uB85C\uCEEC \uB9C8\uCF13\uD50C\uB808\uC774\uC2A4\uC5D0 \uC774 \uD50C\uB7EC\uADF8\uC778\uC774 \uC124\uCE58\uB418\uC5B4 \uC788\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." : "\uC124\uCE58 \uBAA9\uB85D\uC5D0\uC11C \uC774 \uD328\uD0A4\uC9C0\uC758 \uC124\uCE58 \uC0C1\uD0DC\uB97C \uD655\uC815\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.", resolution: result3.executable ? "resolved" : "not_resolved", execution: ["succeeded", "failed", "timed_out"].includes(result3.state) ? result3.state : "not_run", compatibility: installed ? "satisfied" : absent ? "violated" : "unknown", observed: { queryState: result3.state, installed, enabled: entry?.enabled ?? null, plugin: installed ? { name: "windows-agent-devkit", marketplace: "windows-agent-devkit-local", version: entry.localVersion ?? entry.version ?? entry.plugin?.version ?? null } : null, skillInvocation: "separate_app_evidence_required" } };
}

// src/task-runner-policy.mjs
var names2 = {
  mise: "mise tasks",
  task: "Taskfile (Go Task)",
  just: "Justfile (just)",
  make: "Makefile (GNU Make)",
  npm: "npm scripts"
};
var explicitTools = /* @__PURE__ */ new Set(["task", "just", "make"]);
function decision(action, tools, reason, message, evidence2 = {}) {
  return {
    action,
    tools,
    reason,
    message,
    evidence: evidence2,
    status: { keep: "aligned", suggest: "different", defer: "unknown" }[action],
    expected: tools.length ? tools.map((tool) => names2[tool]).join(" \xB7 ") : null,
    application: action === "keep" ? "existing_project" : action === "suggest" ? "shared_ci_workflow" : "project_review"
  };
}
function existingRunnerDecision(declarations, calls) {
  const evidence2 = { declarations, ci: calls };
  if ([...declarations, ...calls].some((entry) => entry.state === "unknown")) {
    return decision("defer", [], "static_analysis_incomplete", "\uC124\uC815\uC774\uB098 CI\uC5D0 \uD574\uC11D\uD558\uC9C0 \uBABB\uD55C \uC2E4\uD589\uAE30 \uC120\uC5B8\uC774 \uC788\uC2B5\uB2C8\uB2E4.", evidence2);
  }
  if (calls.some((call) => call.atProjectRoot !== true || !call.task)) {
    return decision("defer", [], "ci_task_scope_unverified", "\uC77C\uBD80 CI \uD638\uCD9C\uC758 \uB8E8\uD2B8 \uC791\uC5C5 \uACBD\uB85C\uB098 \uC791\uC5C5 \uC774\uB984\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", evidence2);
  }
  const verifiedCalls = [];
  for (const call of calls) {
    const definitions = declarations.filter((entry) => entry.tool === call.tool && typeof entry.source === "string" && !entry.source.includes("/"));
    if (!definitions.length || !definitions.every((entry) => entry.tasks.includes(call.task))) {
      return decision("defer", [], "ci_task_not_declared", "CI\uC5D0\uC11C \uD638\uCD9C\uD55C \uC791\uC5C5\uC744 \uD574\uB2F9 \uC2E4\uD589\uAE30\uC758 \uB8E8\uD2B8 \uC120\uC5B8\uACFC \uC5F0\uACB0\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", evidence2);
    }
    verifiedCalls.push({ ...call, definitions: definitions.map((entry) => entry.source) });
  }
  const available = declarations.filter((entry) => entry.state === "declared" && entry.tasks.length > 0);
  if (!available.length) return null;
  const tools = [...new Set(available.map((entry) => entry.tool))];
  const keepEvidence = { declarations: available, ci: verifiedCalls };
  if (verifiedCalls.length && tools.length === 1 && tools[0] === "npm") {
    const matchedTasks = [...new Set(verifiedCalls.map((call) => call.task))];
    return {
      ...decision(
        "keep",
        tools,
        "ci_uses_root_npm_scripts",
        `CI\uC5D0\uC11C \uB8E8\uD2B8 package.json\uC758 ${matchedTasks.join(", ")} \uC2A4\uD06C\uB9BD\uD2B8\uB97C \uD638\uCD9C\uD569\uB2C8\uB2E4.`,
        keepEvidence
      ),
      matchedTasks
    };
  }
  return verifiedCalls.length ? decision("keep", tools, "existing_runner_matches_ci", "CI\uC758 \uC791\uC5C5 \uD638\uCD9C\uC774 \uB8E8\uD2B8\uC5D0 \uC120\uC5B8\uB41C \uC2E4\uD589\uAE30\uC640 \uC791\uC5C5 \uC774\uB984\uC5D0 \uC77C\uCE58\uD569\uB2C8\uB2E4.", keepEvidence) : decision("keep", tools, "existing_task_declarations", "\uD504\uB85C\uC81D\uD2B8\uC5D0 \uAE30\uC874 \uC791\uC5C5\uC774 \uC120\uC5B8\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4. CI \uD638\uCD9C\uACFC\uC758 \uC77C\uCE58\uB294 \uBBF8\uD655\uC778\uC785\uB2C8\uB2E4.", keepEvidence);
}
function preparedInAllJobs(workflow, tool) {
  return workflow.jobs.every((job) => workflow.prepared.some((entry) => entry.tool === tool && entry.source === job.source && entry.job === job.job));
}
function rootNpmSources(project) {
  if (!project.metadata?.taskRunnerLanguages?.includes("node") || !project.files?.includes("package.json")) return [];
  const managers = project.requirements?.node?.packageManagers ?? [];
  if (managers.some(({ name }) => name !== "npm")) return [];
  const fixedVersion = /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
  return [...new Set(managers.filter(({ source, version }) => ["package-lock.json", "npm-shrinkwrap.json"].includes(source) || source === "package.json" && typeof version === "string" && fixedVersion.test(version)).map(({ source }) => source))];
}
function newRunnerDecision(project) {
  const workflows = project.metadata?.taskRunnerWorkflows ?? [];
  if (!workflows.length) {
    return decision("defer", [], "shared_workflow_not_observed", "\uC0C8 \uACF5\uD1B5 \uC2E4\uD589\uAE30\uB97C \uC81C\uC548\uD560 \uB9CC\uD07C \uBC18\uBCF5 \uC120\uC5B8\uB41C CI \uBE4C\uB4DC\xB7\uAC80\uC0AC \uC808\uCC28\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
  }
  const pins = project.metadata?.taskRunnerPreferences ?? [];
  const preferences = [
    ...pins,
    ...workflows.flatMap((workflow) => workflow.prepared)
  ].filter((entry) => explicitTools.has(entry.tool));
  const tools = [...new Set(preferences.map((entry) => entry.tool))];
  if (tools.length > 1) {
    return decision("defer", [], "conflicting_runner_preferences", "\uD504\uB85C\uC81D\uD2B8 \uC124\uC815\uC774\uB098 \uAD00\uB828 CI \uC791\uC5C5\uC774 \uC11C\uB85C \uB2E4\uB978 \uC2E4\uD589\uAE30\uB97C \uC120\uD0DD\uD569\uB2C8\uB2E4.", { workflows, preferences });
  }
  const [preferred] = tools;
  if (preferred) {
    const applicable = preferred === "make" ? workflows.filter((entry) => entry.fileDependency === true) : workflows;
    if (!applicable.length) {
      return decision("defer", [], "make_file_dependency_unverified", "GNU Make \uC120\uD0DD\uC740 \uD655\uC778\uD588\uC2B5\uB2C8\uB2E4. \uBC18\uBCF5 \uC808\uCC28\uC5D0\uC11C \uCEF4\uD30C\uC77C \uC0B0\uCD9C\uBB3C\uACFC \uB9C1\uD06C \uC785\uB825\uC758 \uAD00\uACC4\uB97C \uD655\uC778\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.", { workflows, preferences });
    }
    const isPinned = pins.some((entry) => entry.tool === preferred);
    const supported = applicable.filter((entry) => isPinned || preparedInAllJobs(entry, preferred));
    if (!supported.length) {
      return decision("defer", [], "runner_preparation_unconfirmed", "\uBC18\uBCF5 \uC808\uCC28\uB97C \uD638\uCD9C\uD558\uB294 CI \uC791\uC5C5\uC758 \uACF5\uD1B5 \uC2E4\uD589\uAE30 \uC900\uBE44\uB97C \uD655\uC778\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.", { workflows, preferences });
    }
    const reason = preferred === "make" ? "make_file_dependency" : "prepared_task_runner";
    const message = preferred === "make" ? "GNU Make\uAC00 \uC120\uD0DD\uB418\uC5B4 \uC788\uACE0 \uBC18\uBCF5 \uC808\uCC28\uC5D0\uC11C \uCEF4\uD30C\uC77C \uC0B0\uCD9C\uBB3C\uC744 \uB9C1\uD06C\uC758 \uC785\uB825\uC73C\uB85C \uC0AC\uC6A9\uD558\uB294 \uAD00\uACC4\uB97C \uD655\uC778\uD588\uC2B5\uB2C8\uB2E4." : `\uD504\uB85C\uC81D\uD2B8 \uC124\uC815\uC774\uB098 \uAD00\uB828 CI\uAC00 ${names2[preferred]}\uB97C \uC120\uD0DD\uD574 \uBC18\uBCF5 \uC808\uCC28\uC758 \uACF5\uD1B5 \uC791\uC5C5 \uD6C4\uBCF4\uB85C \uC81C\uC548\uD569\uB2C8\uB2E4.`;
    return decision(
      "suggest",
      [preferred],
      reason,
      message,
      { workflows: supported, preferences }
    );
  }
  const languages = new Set(project.metadata?.taskRunnerLanguages ?? []);
  const npmSources = rootNpmSources(project);
  const npmWorkflows = npmSources.length ? workflows.filter((entry) => entry.operations.every(({ language }) => language === "node")) : [];
  const miseDeclarations = (project.metadata?.declarations ?? []).filter(({ source, kind }) => kind === "mise" && [".mise.toml", "mise.toml"].includes(source));
  const miseLanguages = new Set(miseDeclarations.flatMap(({ selectedLanguages }) => selectedLanguages));
  const polyglotWorkflows = [];
  const managedWorkflows = [];
  for (const entry of workflows) {
    if (npmWorkflows.includes(entry) || !entry.operations.every(({ language }) => languages.has(language))) continue;
    if (new Set(entry.operations.map(({ language }) => language)).size > 1) polyglotWorkflows.push(entry);
    else if (entry.operations.every(({ language }) => miseLanguages.has(language))) managedWorkflows.push(entry);
  }
  const miseWorkflows = [...polyglotWorkflows, ...managedWorkflows];
  if (npmWorkflows.length && miseWorkflows.length) {
    return decision("defer", [], "conflicting_workflow_needs", "Node.js \uC804\uC6A9 \uC808\uCC28\uC640 \uB2E4\uC911\uC5B8\uC5B4 \uC808\uCC28\uC5D0\uC11C \uC11C\uB85C \uB2E4\uB978 \uACF5\uD1B5 \uC791\uC5C5 \uD6C4\uBCF4\uAC00 \uD655\uC778\uB429\uB2C8\uB2E4.", { workflows });
  }
  if (npmWorkflows.length) {
    return decision(
      "suggest",
      ["npm"],
      "node_workflow_uses_npm",
      "\uB8E8\uD2B8 Node.js \uD328\uD0A4\uC9C0\uAC00 npm\uC744 \uC0AC\uC6A9\uD569\uB2C8\uB2E4. \uBC18\uBCF5\uB418\uB294 Node.js \uBE4C\uB4DC\xB7\uAC80\uC0AC\uB97C package.json \uC2A4\uD06C\uB9BD\uD2B8\uB85C \uBB36\uC744 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
      { workflows: npmWorkflows, preferences: npmSources.map((source) => ({ tool: "npm", source })) }
    );
  }
  if (polyglotWorkflows.length) {
    return decision(
      "suggest",
      ["mise"],
      "polyglot_shared_workflow",
      "\uD504\uB85C\uC81D\uD2B8\uC5D0 \uC120\uC5B8\uB41C \uB450 \uC5B8\uC5B4 \uC774\uC0C1\uC758 \uC791\uC5C5\uC774 CI\uC5D0\uC11C \uBC18\uBCF5\uB429\uB2C8\uB2E4. \uACF5\uD1B5 \uC791\uC5C5\uC758 \uAE30\uBCF8 \uD6C4\uBCF4\uB85C mise tasks\uB97C \uAD8C\uC7A5\uD569\uB2C8\uB2E4.",
      { workflows: polyglotWorkflows }
    );
  }
  if (managedWorkflows.length) {
    const relevantLanguages = new Set(managedWorkflows.flatMap(({ operations }) => operations.map(({ language }) => language)));
    const preferences2 = miseDeclarations.filter(({ selectedLanguages }) => selectedLanguages.some((language) => relevantLanguages.has(language))).map(({ source }) => ({ tool: "mise", source }));
    return decision(
      "suggest",
      ["mise"],
      "mise_manages_workflow_tools",
      "\uBC18\uBCF5\uB418\uB294 CI \uC791\uC5C5\uC758 \uC5B8\uC5B4 \uB3C4\uAD6C\uB97C \uB8E8\uD2B8 mise \uC124\uC815\uC5D0\uC11C \uAD00\uB9AC\uD569\uB2C8\uB2E4. \uAE30\uC874 mise \uAD6C\uC131\uC5D0 \uACF5\uD1B5 \uC791\uC5C5\uC744 \uCD94\uAC00\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
      { workflows: managedWorkflows, preferences: preferences2 }
    );
  }
  return decision("defer", [], "runner_choice_unverified", "CI\uC758 \uBC18\uBCF5 \uC808\uCC28\uB294 \uD655\uC778\uD588\uC73C\uBA70 \uC2E4\uD589\uAE30\uB97C \uD55C \uAC00\uC9C0\uB85C \uACE0\uB97C \uADFC\uAC70\uB294 \uBD80\uC871\uD569\uB2C8\uB2E4.", { workflows });
}
function decideTaskRunners(project, declarations, calls) {
  return existingRunnerDecision(declarations, calls) ?? newRunnerDecision(project);
}

// src/task-runner-checks.mjs
var EXECUTABLE_RUNNERS = /* @__PURE__ */ new Set(["mise", "task", "just", "make"]);
var VERSION_PATTERNS = {
  mise: /^(?:mise )?(\d+\.\d+\.\d+)(?:\s|$)/,
  task: /^(?:Task version: v?|v)?(\d+\.\d+\.\d+)(?:\s|$)/i,
  just: /^just (\d+\.\d+\.\d+)(?:\s|$)/,
  make: /^GNU Make (\d+\.\d+(?:\.\d+)?)(?:\s|$)/
};
function summarizeTaskRunners(project) {
  const declarations = project.metadata?.taskRunners ?? [];
  const ci = project.metadata?.taskRunnerCI ?? [];
  const ciTasks = ci.filter((item) => item.kind === void 0);
  const observed = [...new Set([...declarations, ...ciTasks].map((item) => item.tool))];
  const recommendation = decideTaskRunners(project, declarations, ciTasks);
  const recommended = recommendation.tools.length === 1 ? recommendation.tools[0] : null;
  return {
    recommended,
    declarations,
    ci,
    tools: [],
    recommendation: { ...recommendation, observed },
    proposal: {
      changes: recommendation.action === "suggest" ? [recommendation.message] : [],
      preserve: ["\uD504\uB85C\uC81D\uD2B8 \uC9C0\uC815 \uB7F0\uD0C0\uC784", "\uD328\uD0A4\uC9C0 \uAD00\uB9AC\uC790\uC640 \uC7A0\uAE08 \uD30C\uC77C", "\uAE30\uC874 \uC791\uC5C5 \uC815\uC758\uC640 \uBE4C\uB4DC\xB7\uD14C\uC2A4\uD2B8 \uBA85\uB839", "CI\uC640 \uBC30\uD3EC \uACBD\uB85C"],
      verify: ["Windows\xB7WSL \uC2E4\uD589 \uBB38\uB9E5\uACFC \uC791\uC5C5 \uB0B4\uBD80 \uC178 \uD655\uC778", "\uD504\uB85C\uC81D\uD2B8\uC5D0\uC11C \uC120\uC5B8\uD55C \uD655\uC778 \uBA85\uB839\uC744 \uD574\uB2F9 \uC791\uC5C5 \uACBD\uB85C\uC5D0\uC11C \uC0AC\uC6A9"],
      exception: "\uAE30\uC874 Task\xB7just\xB7Make\xB7npm scripts\uC758 \uC720\uC9C0 \uADFC\uAC70\uC640 \uC801\uC6A9 \uBC94\uC704\uB97C \uC548\uB0B4\uD569\uB2C8\uB2E4."
    },
    limitations: ["\uC791\uC5C5 \uC815\uC758\uC758 \uC815\uC801 \uD0D0\uC9C0\uB294 \uC2E4\uD589 \uC131\uACF5\uC744 \uB73B\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.", "\uC678\uBD80 \uD3EC\uD568\uACFC \uB3D9\uC801 \uC791\uC5C5 \uC815\uC758\uB294 \uC9C0\uC6D0 \uBC94\uC704\uC5D0 \uB530\uB77C \uBBF8\uD655\uC778\uC73C\uB85C \uB0A8\uAE41\uB2C8\uB2E4.", "\uBAA9\uB85D\xB7dry-run \uBA85\uB839\uB3C4 \uD504\uB85C\uC81D\uD2B8 \uC124\uC815\uC744 \uD3C9\uAC00\uD560 \uC218 \uC788\uC5B4 \uAE30\uBCF8 \uC9C4\uB2E8\uC5D0\uC11C \uC2E4\uD589\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4."]
  };
}
async function collectTaskRunnerTools({ summary, host, query }) {
  const tools = [.../* @__PURE__ */ new Set([
    ...summary.declarations.map((item) => item.tool),
    ...summary.ci.map((item) => item.tool)
  ])].filter((tool) => EXECUTABLE_RUNNERS.has(tool));
  return await Promise.all(tools.map(async (tool) => {
    let response;
    try {
      response = await query(tool, ["--version"]);
    } catch {
      response = { state: "failed", exitCode: null };
    }
    const succeeded = response?.state === "succeeded" && response.exitCode === 0;
    const version = succeeded ? VERSION_PATTERNS[tool].exec(String(response.stdout ?? "").trim())?.[1] ?? null : null;
    return {
      tool,
      candidates: (host.commands?.[tool] ?? []).map((item) => ({ path: item.path, commandType: item.commandType })),
      status: succeeded && version ? "pass" : response?.state === "not_found" ? "fail" : "unknown",
      resolution: response?.state === "not_found" ? "not_resolved" : response?.executable ? "resolved" : "unknown",
      execution: response?.state ?? "not_run",
      version,
      executable: response?.executable ?? null,
      exitCode: response?.exitCode ?? null,
      reason: succeeded && !version ? "unsupported_version_output" : response?.state ?? "not_run",
      projectTaskExecution: "not_run"
    };
  }));
}
function attachTaskRunnerChecks(report, summary) {
  report.taskRunners = summary;
  const map = new Map(report.checks.map((item) => [item.checkId, item]));
  const requirements = map.get("REQ-01");
  requirements.observed.taskRunners = summary.declarations;
  requirements.observed.taskRunnerCI = summary.ci;
  if (summary.declarations.some((item) => item.state === "unknown") || summary.ci.some((item) => item.state === "unknown")) {
    if (requirements.status === "pass") requirements.status = "unknown";
    requirements.compatibility = "unknown";
    requirements.reason = "task_runner_analysis_incomplete";
    requirements.message = "\uC77C\uBD80 \uC791\uC5C5 \uC2E4\uD589\uAE30 \uC120\uC5B8\uC740 \uB3D9\uC801\uC774\uAC70\uB098 \uC9C0\uC6D0 \uBC94\uC704 \uBC16\uC774\uBBC0\uB85C \uC815\uC801 \uBD84\uC11D\uC744 \uC644\uB8CC\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.";
  }
  const paths = map.get("PATH-01");
  paths.taskRunners = summary.tools;
  if (summary.tools.some((item) => item.status === "fail")) {
    paths.status = "warn";
    paths.compatibility = "unknown";
    paths.reason = "declared_task_runner_not_resolved";
    paths.message = "\uC120\uC5B8\uB41C \uC791\uC5C5 \uC2E4\uD589\uAE30 \uC77C\uBD80\uB97C \uD604\uC7AC Windows PATH\uC5D0\uC11C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uD30C\uC77C\uC758 \uC874\uC7AC\uB9CC\uC73C\uB85C Windows \uC2E4\uD589 \uD544\uC218\uB97C \uD655\uC815\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.";
  } else if (summary.tools.some((item) => item.status === "unknown") && paths.status === "pass") {
    paths.status = "unknown";
    paths.compatibility = "unknown";
    paths.reason = "task_runner_executable_not_verified";
  }
  map.get("TOOLS-01").taskRunners = summary.tools;
  map.get("ENV-02").taskRunners = { root: report.project.root, taskEnvironment: "not_evaluated" };
  map.get("SH-01").taskRunners = {
    defaults: { mise: "cmd /c on Windows", task: "embedded shell", just: "sh", make: "build-dependent shell" },
    taskDetails: summary.declarations.flatMap((item) => (item.taskDetails ?? []).map((task) => ({ tool: item.tool, source: item.source, ...task }))),
    execution: "not_run"
  };
  const recommendation = map.get("RCM-01");
  recommendation.observed = recommendation.observed.filter((item) => item.role !== "\uD504\uB85C\uC81D\uD2B8 \uC791\uC5C5 \uC2E4\uD589\uAE30");
  recommendation.observed.push({ role: "\uD504\uB85C\uC81D\uD2B8 \uC791\uC5C5 \uC2E4\uD589\uAE30", ...summary.recommendation });
  recommendation.taskRunnerProposal = summary.proposal;
  recommendation.recommendation.status = recommendation.observed.some((item) => item.status === "different") ? "different" : recommendation.observed.some((item) => item.status === "unknown") ? "unknown" : "aligned";
  recommendation.status = recommendation.recommendation.status === "different" ? "warn" : recommendation.recommendation.status === "unknown" ? "unknown" : "pass";
}

// src/doctor.mjs
var VERSION3 = "0.3.5";
var P0_IDS = ["ENV-01", "ENV-02", "SH-01", "PATH-01", "REQ-01", "PKG-01", "GIT-01", "GIT-02", "NODE-01", "NODE-02", "PY-01", "PY-02", "GO-01", "RUST-01", "ZIG-01", "DOTNET-01", "TOOLS-01", "WSL-01", "CTR-01", "LD-01", "PC-01", "RCM-01"];
var P1_IDS = ["RUST-02", "WSL-02", "CTR-02", "PC-02", "IDE-01", "CODEX-01", "AUX-01", "STORE-01"];
var LANGUAGE_TOOLS = { node: "node", python: "python", go: "go", rust: "rustc", zig: "zig", dotnet: "dotnet" };
var LANGUAGE_CHECKS = { node: "NODE-01", python: "PY-01", go: "GO-01", rust: "RUST-01", zig: "ZIG-01", dotnet: "DOTNET-01" };
var LABELS = { node: "Node.js", python: "Python", go: "Go", rust: "Rust", zig: "Zig", dotnet: ".NET SDK" };
var VERSION_ARGS = {
  node: ["--version"],
  python: ["--version"],
  go: ["version"],
  rust: ["--version"],
  zig: ["version"],
  dotnet: ["--list-sdks"]
};
var RUNNER_ARGS = /* @__PURE__ */ new Map([["npm", ["run"]], ["mise", ["run"]], ["task", []], ["just", []], ["make", []]]);
var MANUAL_CHECKS = {
  "RUST-02": "Rust \uB9C1\uD06C \uD655\uC778\uC5D0\uB294 \uD504\uB85C\uC81D\uD2B8\uC758 \uAE30\uC874 \uBE4C\uB4DC \uBA85\uB839\uC744 \uC0AC\uC6A9\uD569\uB2C8\uB2E4.",
  "WSL-02": "\uBC30\uD3EC\uD310 \uB0B4\uBD80\uC5D0\uC11C\uB294 \uADF8 \uBB38\uB9E5\uC758 \uB3C4\uAD6C \uBC84\uC804\uACFC \uD504\uB85C\uC81D\uD2B8 \uD655\uC778 \uBA85\uB839\uC744 \uC0AC\uC6A9\uD569\uB2C8\uB2E4.",
  "CTR-02": "Docker \uC5F0\uACB0\uACFC \uC11C\uBE44\uC2A4 \uC0C1\uD0DC\uB294 \uD574\uB2F9 \uD504\uB85C\uC81D\uD2B8\uC758 \uD655\uC778 \uBA85\uB839\uC73C\uB85C \uD655\uC778\uD569\uB2C8\uB2E4.",
  "PC-02": "\uC11C\uBE44\uC2A4 \uC0C1\uD0DC\uB294 \uD574\uB2F9 \uD504\uB85C\uC81D\uD2B8\uC758 Process Compose \uD655\uC778 \uBA85\uB839\uC73C\uB85C \uD655\uC778\uD569\uB2C8\uB2E4."
};
function commandGuidance(project, runners, { wsl, containers, processCompose }) {
  const commands = [];
  for (const [language, requirement] of Object.entries(project.requirements)) {
    if (requirement.state === "required") {
      commands.push({ tool: LANGUAGE_TOOLS[language], args: [...VERSION_ARGS[language]], description: `${LABELS[language]} \uC120\uD0DD \uBC84\uC804 \uD655\uC778` });
    }
  }
  if (wsl) commands.push({ tool: "wsl", args: ["--list", "--verbose"], description: "\uB4F1\uB85D\uB41C \uBC30\uD3EC\uD310\uACFC WSL \uBC84\uC804 \uD655\uC778" });
  if (containers || project.environment.containers !== "not_required") {
    commands.push({ tool: "docker", args: ["version"], description: "\uD604\uC7AC Docker \uBB38\uB9E5\uC758 \uD074\uB77C\uC774\uC5B8\uD2B8\uC640 \uC5D4\uC9C4 \uBC84\uC804 \uD655\uC778" });
    if (project.files.some((file) => /^(?:docker-)?compose\.ya?ml$/i.test(file))) {
      commands.push({ tool: "docker", args: ["compose", "ps"], description: "\uD504\uB85C\uC81D\uD2B8 \uB8E8\uD2B8\uC5D0\uC11C \uAE30\uC874 Compose \uC11C\uBE44\uC2A4 \uC0C1\uD0DC \uD655\uC778" });
    }
  }
  if (processCompose || project.environment.processCompose !== "not_required") {
    commands.push({ tool: "Get-Command", args: ["process-compose"], description: "PowerShell\uC5D0\uC11C Process Compose \uBA85\uB839\uC758 \uACBD\uB85C \uD655\uC778" });
  }
  const seen = /* @__PURE__ */ new Set();
  for (const { tool, task, definitions } of runners.recommendation.evidence.ci ?? []) {
    const prefix = RUNNER_ARGS.get(tool);
    const key2 = `${tool} ${task}`;
    const checkTask = typeof task === "string" && /^(?:build|check|lint|test|verify)(?:[._:-][a-z0-9._:-]{1,120})?$/i.test(task);
    if (!prefix || !definitions?.length || !checkTask || seen.has(key2)) continue;
    seen.add(key2);
    commands.push({ tool, args: [...prefix, task], description: "\uD504\uB85C\uC81D\uD2B8 \uB8E8\uD2B8 \uC120\uC5B8\uACFC CI\uC5D0\uC11C \uD655\uC778\uD55C \uAE30\uC874 \uC791\uC5C5" });
  }
  return commands;
}
function summarizeChecks(checks) {
  const summary = { pass: 0, fail: 0, warn: 0, unknown: 0, skipped: 0 };
  for (const check2 of checks) summary[check2.status] += 1;
  return summary;
}
function result2(checkId, status, reason, message, extra = {}) {
  return {
    checkId,
    status,
    reason,
    message,
    applicability: "required",
    resolution: "unknown",
    execution: "not_run",
    compatibility: "unknown",
    support: { status: "unknown", source: null, checkedOn: null },
    recommendation: { status: "unknown" },
    nextAction: "\uBBF8\uD655\uC778 \uC870\uAC74\uC740 \uD574\uB2F9 \uC2E4\uD589 \uBB38\uB9E5\uC5D0\uC11C \uBCC4\uB3C4\uB85C \uD655\uC778\uD569\uB2C8\uB2E4.",
    ...extra
  };
}
function candidates(host, name) {
  return host.commands?.[name] ?? [];
}
function probe(host, name) {
  return host.probes?.[name];
}
function discovered(host, name) {
  return candidates(host, name).length > 0;
}
function toolEvidence(host, name) {
  const query = probe(host, name);
  const entry = candidates(host, name)[0];
  return {
    resolution: entry ? "resolved" : "not_resolved",
    resolvedPath: query?.executable ?? entry?.path ?? null,
    candidates: candidates(host, name),
    execution: ["succeeded", "failed", "timed_out"].includes(query?.state) ? query.state : "not_run",
    command: query ? { executable: query.executable, arguments: query.arguments, exitCode: query.exitCode } : null,
    observed: query?.version ?? entry?.productVersion ?? entry?.fileVersion ?? null,
    method: query?.method ?? "verified_version_query"
  };
}
function skip3(id, message) {
  return result2(id, "skipped", "not_applicable", message, { applicability: "not_required", compatibility: "not_applicable" });
}
function languageCheck(language, requirement, host) {
  const id = LANGUAGE_CHECKS[language];
  if (requirement.state === "not_required") return skip3(id, `${LABELS[language]} \uAC1C\uBC1C \uC694\uAD6C\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.`);
  const name = LANGUAGE_TOOLS[language];
  const evidence2 = toolEvidence(host, name);
  const common = { ...evidence2, requirement: requirement.versionRequests, notes: requirement.notes ?? [] };
  if (requirement.state === "unknown") return result2(id, "unknown", "requirement_unknown", "\uD504\uB85C\uC81D\uD2B8 \uC120\uC5B8\uC744 \uD574\uC11D\uD558\uC9C0 \uBABB\uD574 \uC801\uC6A9 \uC694\uAD6C\uB97C \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", { ...common, applicability: "unknown" });
  if (evidence2.resolution === "not_resolved") return result2(id, "fail", "command_not_resolved", `${LABELS[language]} \uC694\uAD6C\uAC00 \uC788\uC73C\uB098 \uD604\uC7AC \uC9C4\uB2E8 \uBB38\uB9E5\uC5D0\uC11C \uBA85\uB839\uC744 \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.`, { ...common, compatibility: "violated", nextAction: "\uC124\uCE58 \uC0C1\uD0DC\uC640 PATH\uB97C \uAD6C\uBD84\uD574 \uD655\uC778\uD558\uACE0 \uD504\uB85C\uC81D\uD2B8 \uC9C0\uC815 \uB3C4\uAD6C\uC758 \uC2E4\uD589 \uACBD\uB85C\uB97C \uC900\uBE44\uD569\uB2C8\uB2E4." });
  const query = probe(host, name);
  if (query?.state !== "succeeded" && !query?.versionVerified || !query.version) return result2(id, "unknown", query?.state ?? "version_not_queried", query?.reason ?? "\uD604\uC7AC \uACBD\uB85C\uC758 \uC2E4\uD589 \uBC84\uC804\uC744 \uBCC0\uACBD \uC5C6\uC774 \uD655\uC778\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.", common);
  const assessment = evaluateVersion(query.version, requirement.versionRequests, { ...requirement.metadata, language });
  if (assessment.reason === "no_version_requirement") return result2(id, "pass", query.method === "pe_go_buildinfo" ? "runtime_metadata_observed" : "runtime_queried", `${LABELS[language]} \uBC84\uC804\uC744 \uD655\uC778\uD588\uC2B5\uB2C8\uB2E4. \uD604\uC7AC \uC815\uC801 \uBD84\uC11D \uBC94\uC704\uC5D0\uC11C \uBA85\uC2DC\uC801\uC778 \uBC84\uC804 \uBC94\uC704\uB294 \uD655\uC778\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.`, { ...common, compatibility: "satisfied" });
  const status = assessment.compatibility === "satisfied" ? "pass" : assessment.compatibility === "violated" ? "fail" : "unknown";
  const message = status === "pass" ? "\uD655\uC778\uD55C \uB3C4\uAD6C \uBC84\uC804\uC774 \uD504\uB85C\uC81D\uD2B8\uC758 \uC120\uC5B8 \uBC94\uC704\uB97C \uCDA9\uC871\uD569\uB2C8\uB2E4." : status === "fail" ? "\uD655\uC778\uD55C \uB3C4\uAD6C \uBC84\uC804\uC774 \uD504\uB85C\uC81D\uD2B8\uC758 \uC120\uC5B8 \uBC94\uC704\uB97C \uBC97\uC5B4\uB0A9\uB2C8\uB2E4." : "\uBC84\uC804 \uD45C\uD604\uC774\uB098 \uC120\uD0DD \uADFC\uAC70\uB97C \uCDA9\uBD84\uD788 \uD655\uC778\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.";
  return result2(id, status, assessment.reason, message, { ...common, compatibility: assessment.compatibility, nextAction: status === "fail" ? "\uAE30\uC874 \uAD00\uB9AC\uC790\uC5D0\uC11C \uD504\uB85C\uC81D\uD2B8 \uC9C0\uC815 \uBC84\uC804\uC744 \uC120\uD0DD\uD55C \uB4A4 \uB2E4\uC2DC \uD655\uC778\uD569\uB2C8\uB2E4." : "\uACF5\uC2DD \uC9C0\uC6D0 \uC0C1\uD0DC\uC640 \uC2E4\uC81C \uBE4C\uB4DC\xB7\uD14C\uC2A4\uD2B8\uB294 \uBCC4\uB3C4\uB85C \uD655\uC778\uD569\uB2C8\uB2E4." });
}
function managerCheck(id, requirement, label) {
  if (requirement.state === "not_required") return skip3(id, `${label} \uC758\uC874\uC131 \uC791\uC5C5 \uC694\uAD6C\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.`);
  if (requirement.state === "unknown") return result2(id, "unknown", "requirement_unknown", `${label} \uD658\uACBD \uC120\uC5B8\uC744 \uC77D\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.`, { applicability: "unknown" });
  const names3 = [...new Set((requirement.packageManagers ?? []).map((manager) => typeof manager === "string" ? manager : manager.name).filter(Boolean))];
  const locks = requirement.lockFiles ?? [];
  const ambiguous = names3.length > 1 || locks.filter((file) => !["npm-shrinkwrap.json", "requirements.txt"].includes(file)).length > 1;
  return result2(id, ambiguous ? "warn" : "unknown", ambiguous ? "multiple_manager_declarations" : "static_dependency_metadata", ambiguous ? "\uC11C\uB85C \uB2E4\uB978 \uC758\uC874\uC131 \uAD00\uB9AC \uC120\uC5B8\uC744 \uBC1C\uACAC\uD588\uC2B5\uB2C8\uB2E4. \uC801\uC6A9 \uBC94\uC704\uB97C \uD655\uC778\uD574\uC57C \uD569\uB2C8\uB2E4." : "\uC758\uC874\uC131 \uC120\uC5B8\uACFC \uC7A0\uAE08 \uD30C\uC77C\uC744 \uC815\uC801\uC73C\uB85C \uD655\uC778\uD588\uC2B5\uB2C8\uB2E4. \uAD00\uB9AC\uC790 \uC2E4\uD589\uACFC \uD658\uACBD \uB3D9\uAE30\uD654\uB294 \uC218\uD589\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.", {
    observed: { packageManagers: requirement.packageManagers ?? [], lockFiles: locks, metadata: requirement.metadata },
    nextAction: "\uD504\uB85C\uC81D\uD2B8\uC758 \uAE30\uC874 \uD328\uD0A4\uC9C0 \uAD00\uB9AC\uC790\uC640 \uC7A0\uAE08 \uBC29\uC2DD\uC744 \uBCF4\uC874\uD558\uACE0 \uD574\uB2F9 \uBC84\uC804\uC758 \uC2E4\uD589 \uACBD\uB85C\uB97C \uD655\uC778\uD569\uB2C8\uB2E4."
  });
}
function effectiveRequirements(project, options) {
  const requirements = structuredClone(project.requirements);
  for (const language of options.languages ?? []) {
    if (requirements[language].state === "not_required") requirements[language].state = "required";
  }
  if (project.metadata?.execution?.hostLanguages) {
    for (const [language, requirement] of Object.entries(requirements)) {
      if (options.native || options.languages?.includes(language)) continue;
      const state = project.metadata.execution.hostLanguages[language];
      if (state === "not_required" || state === "unknown") requirement.state = state;
    }
    return requirements;
  }
  if (!options.native && project.environment.containers !== "not_required") {
    for (const [language, requirement] of Object.entries(requirements)) {
      if (requirement.state === "required" && !options.languages?.includes(language)) {
        requirement.state = "unknown";
        requirement.notes.push("\uCEE8\uD14C\uC774\uB108 \uC120\uC5B8\uC774 \uC788\uC5B4 \uD638\uC2A4\uD2B8\uC758 \uC5B8\uC5B4 \uB3C4\uAD6C \uD544\uC694\uC131\uC774 \uBBF8\uD655\uC778\uC785\uB2C8\uB2E4. --native \uB610\uB294 --languages\uB85C \uD638\uC2A4\uD2B8 \uC870\uD68C\uB97C \uBA85\uC2DC\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
      }
    }
  }
  return requirements;
}
function buildReport(project, host, options = {}) {
  const requirements = effectiveRequirements(project, options);
  const runtimeRequired = Object.values(requirements).some((requirement) => requirement.state !== "not_required");
  const containerState = options.containers ? "required" : project.environment.containers;
  const processState = options.processCompose ? "required" : project.environment.processCompose;
  const containers = containerState === "required";
  const processCompose = processState === "required";
  const checks = [];
  const os = host.context.os ?? {};
  const windows11 = /Windows 11/i.test(os.name ?? "") || Number(os.build) >= 22e3 && /Windows/i.test(os.name ?? "") && !/Server/i.test(os.name ?? "");
  checks.push(result2("ENV-01", windows11 && host.context.processArchitecture === "x64" ? "pass" : "unknown", windows11 ? "windows_observed" : "platform_not_verified", "\uD604\uC7AC OS\uC640 \uD504\uB85C\uC138\uC2A4 \uC544\uD0A4\uD14D\uCC98\uB97C \uD655\uC778\uD588\uC2B5\uB2C8\uB2E4. \uB9B4\uB9AC\uC2A4\uBCC4 \uACF5\uC2DD \uC9C0\uC6D0 \uC0C1\uD0DC\uB294 \uBBF8\uD655\uC778\uC785\uB2C8\uB2E4.", { observed: { os, processArchitecture: host.context.processArchitecture }, compatibility: windows11 && host.context.processArchitecture === "x64" ? "satisfied" : "unknown" }));
  checks.push(result2("ENV-02", "pass", "project_context_observed", "\uC9C0\uC815\uD55C Windows \uD504\uB85C\uC81D\uD2B8\uC758 \uC791\uC5C5 \uACBD\uB85C\uB97C \uD655\uC778\uD588\uC2B5\uB2C8\uB2E4.", { observed: { environment: "windows-native", cwd: project.root }, compatibility: "satisfied" }));
  const shell2 = host.context.diagnosticShell;
  const shellAssessment = evaluateVersion(shell2?.version, [{ kind: "range", value: ">=7.6 <7.7" }]);
  const shellAlignment = shellAssessment.compatibility === "satisfied" ? "aligned" : shellAssessment.compatibility === "violated" ? "different" : "unknown";
  checks.push(result2("SH-01", shellAlignment === "aligned" ? "pass" : shellAlignment === "different" ? "warn" : "unknown", "diagnostic_shell_observed", "\uC124\uC815 \uD30C\uC77C\uC744 \uC77D\uC9C0 \uC54A\uC740 \uC9C4\uB2E8\uC6A9 PowerShell\uC744 \uD655\uC778\uD588\uC2B5\uB2C8\uB2E4. \uC0AC\uC6A9\uC790\xB7\uC571\uC758 \uB300\uD654\uD615 \uC178 \uC124\uC815\uC740 \uBCC4\uB3C4\uC785\uB2C8\uB2E4.", { observed: shell2, compatibility: shellAssessment.compatibility, recommendation: { status: shellAlignment, expected: "PowerShell 7.6 LTS", role: "Windows \uC9C4\uB2E8 \uC178" } }));
  const activeNames = ["git", "winget", ...runtimeRequired ? ["mise"] : [], ...Object.entries(requirements).filter(([, item]) => item.state === "required").map(([name]) => LANGUAGE_TOOLS[name]), ...options.wsl ? ["wsl"] : [], ...containers ? ["docker", "lazydocker"] : [], ...processCompose ? ["process-compose"] : []];
  checks.push(result2("PATH-01", "pass", "command_candidates_observed", "\uACE0\uC815\uD55C \uBA85\uB839 \uC774\uB984\uC758 \uD6C4\uBCF4\uB97C \uC9C4\uB2E8 \uC178\uC5D0\uC11C \uC870\uD68C\uD588\uC2B5\uB2C8\uB2E4. \uBCF5\uC218 \uD6C4\uBCF4 \uC790\uCCB4\uB97C \uCDA9\uB3CC\uB85C \uD310\uC815\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.", { observed: Object.fromEntries([...new Set(activeNames)].map((name) => [name, candidates(host, name)])), compatibility: "satisfied" }));
  checks.push(result2("REQ-01", project.issues.length ? "unknown" : "pass", project.issues.length ? "declaration_issue" : "static_requirements_read", project.issues.length ? "\uC77C\uBD80 \uC120\uC5B8\uC744 \uC77D\uAC70\uB098 \uD574\uC11D\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4." : "\uC9C0\uC6D0\uD558\uB294 \uD504\uB85C\uC81D\uD2B8 \uC120\uC5B8\uC744 \uC815\uC801\uC73C\uB85C \uC77D\uC5C8\uC2B5\uB2C8\uB2E4. CI\uC640 \uC2A4\uD06C\uB9BD\uD2B8\uB294 \uC2E4\uD589\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.", { observed: { files: project.files, issues: project.issues, scope: "\uC9C0\uC815\uD55C \uB8E8\uD2B8\uC758 \uC778\uC2DD \uAC00\uB2A5\uD55C \uC120\uC5B8 \uD30C\uC77C; \uC0C1\uC704 \uC120\uC5B8\xB7\uD558\uC704 \uBAA8\uB178\uB808\uD3EC\xB7CI\uC758 \uC758\uBBF8 \uBD84\uC11D\uC740 \uC81C\uC678" }, compatibility: project.issues.length ? "unknown" : "satisfied" }));
  checks.push(result2("PKG-01", discovered(host, "winget") ? "unknown" : "warn", "package_manager_metadata", "\uC124\uCE58 \uAD00\uB9AC\uC790 \uACBD\uB85C\uB97C \uC870\uD68C\uD588\uC2B5\uB2C8\uB2E4. \uAE30\uC874 \uB3C4\uAD6C\uC758 \uC5C5\uB370\uC774\uD2B8 \uCC45\uC784\uACFC \uC2E4\uC81C \uC124\uCE58 \uC774\uB825\uC740 \uBBF8\uD655\uC778\uC785\uB2C8\uB2E4.", { ...toolEvidence(host, "winget"), recommendation: { status: discovered(host, "winget") ? "unknown" : "different", expected: "WinGet" } }));
  const git = probe(host, "git");
  checks.push(result2("GIT-01", git?.state === "succeeded" ? "pass" : "unknown", git?.state === "succeeded" ? "git_version_queried" : "git_not_verified", "Git \uC2E4\uD589 \uBC84\uC804\uC758 \uC870\uD68C\uC640 \uC800\uC7A5\uC18C\xB7\uC6D0\uACA9 \uC778\uC99D \uAC80\uC99D\uC744 \uAD6C\uBD84\uD569\uB2C8\uB2E4. \uC778\uC99D \uC870\uD68C\uB294 \uC218\uD589\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.", { ...toolEvidence(host, "git"), compatibility: git?.state === "succeeded" ? "satisfied" : "unknown" }));
  const attributes = project.files.filter((name) => /(?:^|\/)(?:\.gitattributes|\.editorconfig)$/.test(name));
  checks.push(result2("GIT-02", "unknown", "repository_policy_metadata", "\uC904\uBC14\uAFC8\xB7\uC778\uCF54\uB529 \uC815\uCC45 \uD30C\uC77C\uC758 \uC874\uC7AC\uB97C \uD655\uC778\uD588\uC2B5\uB2C8\uB2E4. \uC804\uCCB4 \uCD94\uC801 \uD30C\uC77C\uC758 \uC815\uADDC\uD654 \uAC80\uC0AC\uB294 \uD6C4\uC18D \uBC94\uC704\uC785\uB2C8\uB2E4.", { observed: { files: attributes } }));
  for (const language of ["node", "python", "go", "rust", "zig", "dotnet"]) {
    checks.push(languageCheck(language, requirements[language], host));
    if (language === "node") checks.push(managerCheck("NODE-02", requirements.node, "Node.js"));
    if (language === "python") checks.push(managerCheck("PY-02", requirements.python, "Python"));
  }
  checks.push(runtimeRequired ? result2("TOOLS-01", "unknown", "tool_manager_metadata", "mise \uACBD\uB85C\uC640 \uD504\uB85C\uC81D\uD2B8\uC758 \uB3C4\uAD6C \uC120\uC5B8\uC744 \uAE30\uB85D\uD588\uC2B5\uB2C8\uB2E4. \uD65C\uC131\uD654\xB7\uBC31\uC5D4\uB4DC\xB7\uC2E4\uC81C \uB3C4\uAD6C \uBAA8\uC74C \uC120\uD0DD\uC740 \uBCC4\uB3C4 \uAC80\uC99D\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.", { ...toolEvidence(host, "mise"), observed: { command: candidates(host, "mise"), declarations: project.files.filter((file) => /(?:mise\.toml|\.tool-versions)$/.test(file)) }, notes: ["C#\uC758 \uACF5\uC2DD .NET SDK \uC124\uCE58\uB294 mise \uAD8C\uC7A5\uC548\uC758 \uC608\uC678\uC785\uB2C8\uB2E4."] }) : skip3("TOOLS-01", "\uC5B8\uC5B4 \uB3C4\uAD6C \uAD00\uB9AC \uC694\uAD6C\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4."));
  checks.push(options.wsl ? result2("WSL-01", "unknown", "wsl_host_only", "WSL \uC2E4\uD589 \uD30C\uC77C\uACFC \uD5C8\uC6A9\uD55C \uD638\uC2A4\uD2B8 \uC870\uD68C\uB9CC \uAE30\uB85D\uD569\uB2C8\uB2E4. \uBC30\uD3EC\uD310 \uB0B4\uBD80 \uC2E4\uD589\uC740 \uC218\uD589\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.", { ...toolEvidence(host, "wsl"), observed: probe(host, "wsl")?.data ?? null }) : skip3("WSL-01", "WSL \uD638\uC2A4\uD2B8 \uC810\uAC80\uC740 --wsl\uB85C \uBA85\uC2DC\uD588\uC744 \uB54C \uC218\uD589\uD569\uB2C8\uB2E4."));
  checks.push(containerState === "unknown" ? result2("CTR-01", "unknown", "requirement_unknown", "\uCEE8\uD14C\uC774\uB108 \uC120\uC5B8\uC744 \uC77D\uC9C0 \uBABB\uD588\uAC70\uB098 \uD638\uC2A4\uD2B8 \uB3C4\uAD6C\uC758 \uC801\uC6A9 \uC694\uAD6C\uAC00 \uBBF8\uD655\uC778\uC785\uB2C8\uB2E4.", { applicability: "unknown" }) : containers ? result2("CTR-01", "unknown", "docker_client_only", "Docker \uD074\uB77C\uC774\uC5B8\uD2B8 \uACBD\uB85C\uC640 \uBC84\uC804\uB9CC \uD655\uC778\uD569\uB2C8\uB2E4. Compose\xB7context\xB7\uC5D4\uC9C4 \uC5F0\uACB0\uC740 \uAC80\uC99D\uB418\uC9C0 \uC54A\uC740 \uBD80\uBD84\uC744 \uBBF8\uD655\uC778\uC73C\uB85C \uC720\uC9C0\uD569\uB2C8\uB2E4.", toolEvidence(host, "docker")) : skip3("CTR-01", "\uCEE8\uD14C\uC774\uB108 \uC694\uAD6C\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4."));
  checks.push(containerState === "unknown" ? result2("LD-01", "unknown", "requirement_unknown", "\uCEE8\uD14C\uC774\uB108 \uAD00\uB9AC \uC694\uAD6C\uB97C \uD655\uC778\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.", { applicability: "unknown" }) : containers ? result2("LD-01", "unknown", "lazydocker_metadata_only", "Lazydocker\uC758 \uC2E4\uD589 \uD30C\uC77C \uBA54\uD0C0\uB370\uC774\uD130\uB9CC \uD655\uC778\uD588\uC2B5\uB2C8\uB2E4. TUI\uC640 \uC5D4\uC9C4 \uC5F0\uACB0\uC744 \uC2E4\uD589\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.", toolEvidence(host, "lazydocker")) : skip3("LD-01", "\uCEE8\uD14C\uC774\uB108 \uAD00\uB9AC \uC694\uAD6C\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4."));
  checks.push(processState === "unknown" ? result2("PC-01", "unknown", "requirement_unknown", "\uB85C\uCEEC \uB2E4\uC911 \uD504\uB85C\uC138\uC2A4 \uAD00\uB9AC \uC120\uC5B8\uC744 \uC77D\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.", { applicability: "unknown" }) : processCompose ? result2("PC-01", "unknown", "process_compose_static_only", "\uC124\uC815 \uD30C\uC77C\uC758 \uC874\uC7AC\uC640 \uC2E4\uD589 \uD30C\uC77C \uBA54\uD0C0\uB370\uC774\uD130\uB97C \uD655\uC778\uD588\uC2B5\uB2C8\uB2E4. \uC124\uC815\uC758 \uBA85\uB839\xB7\uD658\uACBD\uBCC0\uC218 \uD3C9\uAC00\uC640 \uC11C\uBE44\uC2A4 \uAE30\uB3D9\uC740 \uC218\uD589\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.", { ...toolEvidence(host, "process-compose"), observed: { files: project.files.filter((file) => /process-compose/.test(file)), command: candidates(host, "process-compose") } }) : skip3("PC-01", "\uB85C\uCEEC \uB2E4\uC911 \uD504\uB85C\uC138\uC2A4 \uAD00\uB9AC \uC694\uAD6C\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4."));
  const comparisons = [{ role: "Windows \uC9C4\uB2E8 \uC178", expected: "PowerShell 7.6 LTS", observed: shell2?.version ?? null, status: shellAlignment }];
  if (runtimeRequired) comparisons.push({ role: "\uAC1C\uBC1C \uB3C4\uAD6C \uAD00\uB9AC", expected: "mise; .NET SDK \uACF5\uC2DD \uC124\uCE58 \uC608\uC678", observed: candidates(host, "mise"), status: discovered(host, "mise") ? "unknown" : "different" });
  const different = comparisons.some((item) => item.status === "different");
  checks.push(result2("RCM-01", different ? "warn" : comparisons.some((item) => item.status === "unknown") ? "unknown" : "pass", "recommendation_compared", "\uD504\uB85C\uC81D\uD2B8 \uC694\uAD6C\uC640 \uAD8C\uC7A5 \uAD6C\uC131\uC744 \uBE44\uAD50\uD558\uACE0 \uAE30\uC874 \uB3C4\uAD6C\uB97C \uC720\uC9C0\uD560 \uADFC\uAC70\uB97C \uC548\uB0B4\uD569\uB2C8\uB2E4.", {
    observed: comparisons,
    recommendation: { status: different ? "different" : comparisons.some((item) => item.status === "unknown") ? "unknown" : "aligned" },
    proposal: { changes: ["\uCC28\uC774\uAC00 \uD655\uC778\uB41C \uC5ED\uD560\uC740 \uAD8C\uC7A5 \uB3C4\uAD6C\uC758 \uACBD\uB85C\xB7\uBC84\uC804 \uC120\uD0DD\uACFC \uC5C5\uB370\uC774\uD2B8 \uCC45\uC784\uC744 \uAC80\uD1A0\uD569\uB2C8\uB2E4."], preserve: ["\uD504\uB85C\uC81D\uD2B8 \uC9C0\uC815 \uB7F0\uD0C0\uC784", "\uD328\uD0A4\uC9C0 \uAD00\uB9AC\uC790\uC640 \uC7A0\uAE08 \uD30C\uC77C", "\uBE4C\uB4DC\xB7\uD14C\uC2A4\uD2B8 \uBA85\uB839\uACFC CI"], verify: ["\uD604\uC7AC \uC2E4\uD589 \uD30C\uC77C\uC758 \uACBD\uB85C\uC640 \uBC84\uC804\uC744 \uD655\uC778\uD569\uB2C8\uB2E4.", "\uD504\uB85C\uC81D\uD2B8\uC758 \uD655\uC778 \uBA85\uB839\uC740 \uC548\uB0B4\uB41C \uBB38\uB9E5\uC5D0\uC11C \uC0AC\uC6A9\uD569\uB2C8\uB2E4."] },
    nextAction: "\uBBF8\uD655\uC778\uD55C \uC124\uCE58 \uC774\uB825\uACFC \uD65C\uC131\uD654 \uC0C1\uD0DC\uB97C \uD655\uC778\uD558\uACE0 \uD544\uC694\uD55C \uC5ED\uD560\uC758 \uC120\uD0DD \uADFC\uAC70\uB97C \uAC80\uD1A0\uD569\uB2C8\uB2E4."
  }));
  checks.sort((left, right) => P0_IDS.indexOf(left.checkId) - P0_IDS.indexOf(right.checkId));
  const summary = summarizeChecks(checks);
  return { schemaVersion: 1, pluginVersion: VERSION3, policyVersion: "2026-11-17", generatedAt: (/* @__PURE__ */ new Date()).toISOString(), context: host.context, project: { root: project.root, files: project.files }, summary, checks, deferredChecks: P1_IDS, limitations: ["\uACF5\uC2DD \uC9C0\uC6D0 \uC0C1\uD0DC\uB294 \uC790\uB3D9 \uC870\uD68C\uD558\uC9C0 \uC54A\uC544 unknown\uC73C\uB85C \uAE30\uB85D\uD569\uB2C8\uB2E4.", "\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uC120\uC5B8\uACFC \uBC84\uC804 \uD45C\uD604\uC740 unknown\uC73C\uB85C \uAE30\uB85D\uD569\uB2C8\uB2E4.", "\uC9C4\uB2E8 \uC178\uC758 \uAD00\uCC30\uC744 \uC0AC\uC6A9\uC790 \uD504\uB85C\uD544\uC774\uB098 \uC571 \uD130\uBBF8\uB110\uC758 \uAD00\uCC30\uB85C \uC77C\uBC18\uD654\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.", "\uC774 \uBCF4\uACE0\uC11C\uB294 \uC804\uCCB4 \uBE4C\uB4DC\xB7\uD14C\uC2A4\uD2B8\uC640 \uC571\uC5D0\uC11C\uC758 \uD50C\uB7EC\uADF8\uC778 \uB85C\uB529 \uAC80\uC99D\uC744 \uB300\uC2E0\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4."] };
}
async function diagnose({
  projectPath,
  timeoutMs = 5e3,
  languages = [],
  wsl = false,
  containers = false,
  processCompose = false,
  native = false,
  ide,
  storage,
  githubAuth,
  app,
  codexExecutable,
  stateDir,
  now,
  inspect: inspect2 = inspectWindows,
  query: suppliedQuery
} = {}) {
  const root = await realpath6(projectPath ?? process.cwd());
  if (!(await stat3(root)).isDirectory()) throw new Error("\uC810\uAC80\uD560 \uD504\uB85C\uC81D\uD2B8 \uACBD\uB85C\uB294 \uB514\uB809\uD130\uB9AC\uC5EC\uC57C \uD569\uB2C8\uB2E4.");
  const project = await analyzeProject(root);
  const active = Object.entries(effectiveRequirements(project, { languages, native })).filter(([, item]) => item.state === "required").map(([name]) => LANGUAGE_TOOLS[name]);
  const host = await inspect2({ projectPath: root, timeoutMs, tools: ["git", ...active, ...wsl ? ["wsl"] : [], ...containers || project.environment.containers === "required" ? ["docker"] : []] });
  const query = suppliedQuery ?? createQuery({ projectPath: root, host, timeoutMs });
  await enhanceRuntimes({ project, host, tools: active, query });
  const report = buildReport(project, host, { languages, wsl, containers, processCompose, native });
  const taskRunners = summarizeTaskRunners(project);
  const effective = { ...project, requirements: effectiveRequirements(project, { languages, native }), metadata: structuredClone(project.metadata ?? {}) };
  if (ide) (effective.metadata.ide ??= {}).required = true;
  if (storage) effective.metadata.storage = { requested: true, path: typeof storage === "string" ? storage : root };
  if (githubAuth) effective.metadata.auxiliary = { github: true, authentication: true };
  const [advanced, infrastructure, appCheck, runnerTools] = await Promise.all([
    collectAdvanced({ projectPath: root, project: effective, host, timeoutMs, query }),
    collectInfrastructure({ project: effective, host, options: { wsl, containers, processCompose }, query }),
    checkApp({ query, enabled: app, executable: codexExecutable }),
    collectTaskRunnerTools({ summary: taskRunners, host, query })
  ]);
  const map = new Map(report.checks.map((item) => [item.checkId, item]));
  for (const item of [...advanced.checks, ...infrastructure.checks, appCheck]) map.set(item.checkId, item);
  for (const [id, nextAction] of Object.entries(MANUAL_CHECKS)) {
    map.set(id, { ...skip3(id, "\uC2E4\uD589 \uACB0\uACFC\uB294 \uD655\uC778 \uBA85\uB839 \uC548\uB0B4\uC5D0 \uB530\uB77C \uBCC4\uB3C4\uB85C \uD655\uC778\uD569\uB2C8\uB2E4."), reason: "manual_confirmation", nextAction });
  }
  const ids = [...P0_IDS, ...P1_IDS];
  report.checks = ids.map((id) => map.get(id));
  attachSupport(report.checks, host, now);
  report.deferredChecks = [];
  report.project.scope = project.metadata?.scope;
  report.project.execution = project.metadata?.execution;
  const reqCheck = map.get("REQ-01");
  reqCheck.observed.scope = project.metadata?.scope ?? "bounded static declarations";
  reqCheck.observed.execution = project.metadata?.execution;
  report.commandGuidance = commandGuidance(effective, taskRunners, { wsl, containers, processCompose });
  try {
    report.exceptions = await loadExceptions(root, stateDir);
  } catch (error) {
    report.exceptions = { state: "unknown", reason: error.code ?? "exception_state_unreadable" };
  }
  const recommendation = map.get("RCM-01");
  recommendation.observed = recommendation.observed.filter((i) => i.role !== "\uAC1C\uBC1C \uB3C4\uAD6C \uAD00\uB9AC");
  if (map.get("TOOLS-01").status !== "skipped") recommendation.observed.push({ role: "\uAC1C\uBC1C \uB3C4\uAD6C \uAD00\uB9AC", expected: "mise", observed: map.get("TOOLS-01").observed?.version ?? null, status: map.get("TOOLS-01").recommendation.status });
  recommendation.observed.push({ role: "\uD130\uBBF8\uB110", expected: "Windows Terminal", observed: candidates(host, "wt"), status: discovered(host, "wt") ? "aligned" : "unknown" });
  recommendation.exceptions = report.exceptions;
  taskRunners.tools = runnerTools;
  attachTaskRunnerChecks(report, taskRunners);
  report.summary = summarizeChecks(report.checks);
  report.limitations = ["\uC9C0\uC6D0 \uC815\uCC45\uC740 2026-11-17\uC758 \uC624\uD504\uB77C\uC778 \uC2A4\uB0C5\uC0F7\uC774\uBA70 30\uC77C \uD6C4\uC5D0\uB294 \uBBF8\uD655\uC778\uC73C\uB85C \uCC98\uB9AC\uD569\uB2C8\uB2E4.", "\uC9C0\uC6D0 \uACC4\uC5F4 \uD310\uC815\uC740 \uCD5C\uC2E0 \uD328\uCE58\xB7\uCDE8\uC57D\uC810\xB7\uBAA8\uB4E0 OS \uC9C0\uC6D0 \uC870\uD569\uC758 \uD655\uC778\uC744 \uD3EC\uD568\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.", "\uD655\uC778 \uBA85\uB839\uC740 \uC548\uB0B4\uC6A9\uC785\uB2C8\uB2E4. \uD504\uB85C\uC81D\uD2B8 \uBA85\uB839\uACFC \uC11C\uBE44\uC2A4\uB294 \uC0AC\uC6A9\uC790\uAC00 \uD574\uB2F9 \uBB38\uB9E5\uC5D0\uC11C \uD655\uC778\uD569\uB2C8\uB2E4.", "\uC571 \uC124\uCE58 \uBAA9\uB85D\uACFC \uC2E4\uC81C Skill \uD638\uCD9C\uC758 \uAD00\uCC30\uC740 \uAD6C\uBD84\uD569\uB2C8\uB2E4."];
  return report;
}

// src/cli.mjs
var LANGUAGES3 = ["node", "python", "go", "rust", "zig", "dotnet"];
var STATUS_LABELS = { pass: "\uD1B5\uACFC", fail: "\uC694\uAD6C \uC704\uBC18", warn: "\uAC80\uD1A0", unknown: "\uBBF8\uD655\uC778", skipped: "\uC0DD\uB7B5" };
var OPTIONS = {
  project: { type: "string" },
  format: { type: "string", default: "text" },
  languages: { type: "string" },
  native: { type: "boolean", default: false },
  wsl: { type: "boolean", default: false },
  containers: { type: "boolean", default: false },
  "process-compose": { type: "boolean", default: false },
  app: { type: "boolean", default: false },
  "codex-executable": { type: "string" },
  ide: { type: "boolean", default: false },
  storage: { type: "string" },
  "github-auth": { type: "boolean", default: false },
  "state-dir": { type: "string" },
  "timeout-ms": { type: "string" },
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", default: false }
};
var HELP = `Windows Agent Devkit ${VERSION3}

node dist/cli.mjs [doctor] [\uC635\uC158]

\uD658\uACBD\uC744 \uC77D\uAE30 \uC804\uC6A9\uC73C\uB85C \uC9C4\uB2E8\uD558\uACE0 \uC9C1\uC811 \uC2E4\uD589\uD560 \uBA85\uB839\uC744 \uC548\uB0B4\uD569\uB2C8\uB2E4.

  --project <\uACBD\uB85C>          \uD504\uB85C\uC81D\uD2B8 \uB514\uB809\uD130\uB9AC, \uAE30\uBCF8\uAC12 \uD604\uC7AC \uACBD\uB85C
  --format <text|json>      \uCD9C\uB825 \uD615\uC2DD, \uAE30\uBCF8\uAC12 text
  --languages <\uBAA9\uB85D>       auto \uB610\uB294 node,python,go,rust,zig,dotnet \uC27C\uD45C \uBAA9\uB85D
  --native                 \uD638\uC2A4\uD2B8\uC758 \uC5B8\uC5B4 \uB3C4\uAD6C \uC694\uAD6C\uB97C \uBA85\uC2DC
  --wsl / --containers / --process-compose   \uD638\uC2A4\uD2B8 \uB3C4\uAD6C\uC640 \uC124\uC815 \uC815\uBCF4 \uC810\uAC80 \uC120\uD0DD
  --app                    \uC571\uACFC \uACF5\uC720\uD558\uB294 \uD50C\uB7EC\uADF8\uC778 \uC124\uCE58 \uBAA9\uB85D \uC870\uD68C
  --codex-executable <\uACBD\uB85C> \uAC80\uC99D\uD560 Codex \uB124\uC774\uD2F0\uBE0C \uC2E4\uD589 \uD30C\uC77C
  --ide                    VS Code\uC640 \uB124\uC774\uD2F0\uBE0C \uBE4C\uB4DC \uB3C4\uAD6C \uC810\uAC80 \uC120\uD0DD
  --storage <\uACBD\uB85C>          \uB300\uC0C1 \uBCFC\uB968\xB7Dev Drive \uBA54\uD0C0\uB370\uC774\uD130 \uC870\uD68C
  --github-auth            GitHub CLI \uC6D0\uACA9 \uC778\uC99D \uC870\uD68C \uC120\uD0DD
  --state-dir <\uACBD\uB85C>       \uAE30\uC874 \uB3C4\uAD6C \uC720\uC9C0 \uC0AC\uC720\uB97C \uC870\uD68C\uD560 \uC0C1\uD0DC \uB514\uB809\uD130\uB9AC
  --timeout-ms <\uC815\uC218>      \uC870\uD68C\uBCC4 \uC81C\uD55C \uC2DC\uAC04, \uAE30\uBCF8\uAC12 5000, \uBC94\uC704 100..30000
  --help / -h              \uB3C4\uC6C0\uB9D0
  --version                CLI \uBC84\uC804

\uC885\uB8CC \uCF54\uB4DC  0 \uC644\uB8CC \xB7 1 \uC694\uAD6C \uC704\uBC18 \xB7 2 \uC785\uB825 \uB610\uB294 \uC9C4\uB2E8 \uC624\uB958
`;
function parseOptions(args) {
  const tokens = [...args];
  const action = tokens[0] && !tokens[0].startsWith("-") ? tokens.shift() : "doctor";
  if (action !== "doctor") throw new Error("\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uBA85\uB839\uC785\uB2C8\uB2E4. doctor\uB97C \uC0AC\uC6A9\uD558\uC138\uC694.");
  let values;
  try {
    ({ values } = parseArgs({ args: tokens, allowPositionals: false, strict: true, options: OPTIONS }));
  } catch (error) {
    if (error.code === "ERR_PARSE_ARGS_UNKNOWN_OPTION") throw new Error("\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uC635\uC158\uC785\uB2C8\uB2E4. --help\uC5D0\uC11C \uC9C4\uB2E8 \uC635\uC158\uC744 \uD655\uC778\uD558\uC138\uC694.");
    if (error.code === "ERR_PARSE_ARGS_INVALID_OPTION_VALUE") throw new Error("\uC635\uC158 \uAC12\uC774 \uB204\uB77D\uB418\uC5C8\uAC70\uB098 \uD615\uC2DD\uC774 \uC798\uBABB\uB418\uC5C8\uC2B5\uB2C8\uB2E4. --help\uC5D0\uC11C \uC9C4\uB2E8 \uC635\uC158\uC744 \uD655\uC778\uD558\uC138\uC694.");
    if (error.code === "ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL") throw new Error("\uBA85\uB839\uC774\uB098 \uC635\uC158\uC5D0 \uC18D\uD558\uC9C0 \uC54A\uB294 \uC778\uC218\uAC00 \uC788\uC2B5\uB2C8\uB2E4.");
    throw error;
  }
  if (!["text", "json"].includes(values.format)) throw new Error("--format\uC740 text \uB610\uB294 json\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.");
  const languages = !values.languages || values.languages === "auto" ? [] : [...new Set(values.languages.split(",").map((language) => language.trim()))];
  if (languages.some((language) => !LANGUAGES3.includes(language))) throw new Error("--languages\uC5D0 \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uACC4\uC5F4\uC774 \uC788\uC2B5\uB2C8\uB2E4.");
  const timeout = values["timeout-ms"] ?? "5000";
  if (!/^\d+$/.test(timeout) || Number(timeout) < 100 || Number(timeout) > 3e4) throw new Error("--timeout-ms\uB294 100..30000 \uBC94\uC704\uC758 \uC815\uC218\uC5EC\uC57C \uD569\uB2C8\uB2E4.");
  const pathOption = (name) => values[name] === void 0 ? void 0 : resolve2(values[name]);
  return {
    action,
    projectPath: resolve2(values.project ?? process.cwd()),
    format: values.format,
    help: values.help,
    version: values.version,
    languages,
    native: values.native,
    wsl: values.wsl,
    containers: values.containers,
    processCompose: values["process-compose"],
    app: values.app,
    codexExecutable: pathOption("codex-executable"),
    ide: values.ide,
    storage: pathOption("storage"),
    githubAuth: values["github-auth"],
    stateDir: pathOption("state-dir"),
    timeoutMs: Number(timeout)
  };
}
function formatReport(report) {
  const lines = [`Windows Agent Devkit ${report.pluginVersion}`, `\uD504\uB85C\uC81D\uD2B8: ${report.project.root}`, `\uC2E4\uD589 \uD658\uACBD: ${report.context.platform}, ${report.context.diagnosticShell?.name ?? "\uBBF8\uD655\uC778"} ${report.context.diagnosticShell?.version ?? ""}`, ""];
  for (const check2 of report.checks) {
    lines.push(`[${STATUS_LABELS[check2.status]}] ${check2.checkId}: ${check2.message}`);
    if (check2.resolvedPath) lines.push(`  \uACBD\uB85C: ${check2.resolvedPath}`);
    if (typeof check2.observed === "string") lines.push(`  \uAD00\uCC30: ${check2.observed}`);
    if (check2.support?.status && check2.support.status !== "unknown") lines.push(`  \uACF5\uC2DD \uC9C0\uC6D0 \uACC4\uC5F4: ${check2.support.status} (${check2.support.checkedOn})`);
    if (check2.status === "fail" || check2.status === "warn") {
      for (const requirement of Array.isArray(check2.requirement) ? check2.requirement : []) {
        if (typeof requirement.value !== "string") continue;
        const declaration = [requirement.source, requirement.field].filter(Boolean).join(" / ");
        lines.push(`  \uC694\uAD6C: ${requirement.value}${declaration ? ` (${declaration})` : ""}`);
      }
      if (check2.nextAction) lines.push(`  \uB2E4\uC74C \uC870\uCE58: ${check2.nextAction}`);
    }
  }
  if (report.taskRunners) {
    const { recommendation } = report.taskRunners;
    const decision2 = recommendation.action === "keep" ? `\uAE30\uC874 ${recommendation.expected} \uC720\uC9C0` : recommendation.action === "suggest" ? `${recommendation.expected} \uB3C4\uC785 \uC81C\uC548` : "\uD310\uB2E8 \uBCF4\uB958";
    lines.push("", `\uC791\uC5C5 \uC2E4\uD589\uAE30 \uAD8C\uC7A5: ${decision2}`, `  ${recommendation.message}`);
    for (const call of recommendation.evidence.ci ?? []) {
      const location = `${call.source} / ${call.job} / \uB2E8\uACC4 ${call.step + 1}`;
      if (call.definitions) lines.push(`  ${location} \u2192 ${call.definitions.join(", ")}\uC758 ${call.task}`);
      else lines.push(`  ${location}\uC758 ${[call.tool, call.task].filter(Boolean).join(" ")} \uD638\uCD9C\uACFC \uC791\uC5C5 \uC120\uC5B8\uC758 \uC5F0\uACB0\uC740 \uBBF8\uD655\uC778\uC785\uB2C8\uB2E4.`);
    }
    for (const workflow of recommendation.evidence.workflows ?? []) {
      for (const job of workflow.jobs) {
        lines.push(`  ${job.source} / ${job.job} / \uB2E8\uACC4 ${job.steps.map((index) => index + 1).join(", ")}\uC5D0 \uACF5\uD1B5 \uC808\uCC28\uAC00 \uC120\uC5B8\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.`);
      }
    }
    for (const entry of recommendation.evidence.preferences ?? []) {
      lines.push(`  ${entry.source}${entry.job ? ` / ${entry.job} / \uB2E8\uACC4 ${entry.step + 1}` : ""}\uC5D0\uC11C ${entry.tool} \uC120\uD0DD\uC744 \uD655\uC778\uD588\uC2B5\uB2C8\uB2E4.`);
    }
    for (const item of report.taskRunners.declarations) lines.push(`  ${item.tool}: ${item.source} (${item.state}), \uC791\uC5C5: ${item.tasks.join(", ") || "\uBBF8\uD655\uC778"}`);
    for (const item of report.taskRunners.tools) lines.push(`  \uC2E4\uD589 \uD30C\uC77C ${item.tool}: ${item.version ?? "\uBC84\uC804 \uBBF8\uD655\uC778"} (${item.execution})${item.executable ? `, ${item.executable}` : ""}`);
  }
  if (report.commandGuidance?.length) {
    lines.push("", "\uC9C1\uC811 \uC2E4\uD589\uD560 \uBA85\uB839");
    for (const { tool, args, description: description2 } of report.commandGuidance) {
      lines.push(`  ${[tool, ...args].join(" ")}`, `    ${description2}`);
    }
  }
  lines.push("", `\uACB0\uACFC: \uD1B5\uACFC ${report.summary.pass}, \uC694\uAD6C \uC704\uBC18 ${report.summary.fail}, \uAC80\uD1A0 ${report.summary.warn}, \uBBF8\uD655\uC778 ${report.summary.unknown}, \uC0DD\uB7B5 ${report.summary.skipped}`);
  return lines.join("\n");
}
async function main(args, { inspect: inspect2, query } = {}) {
  const options = parseOptions(args);
  if (options.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (options.version) {
    process.stdout.write(`${VERSION3}
`);
    return 0;
  }
  const report = await diagnose({ ...options, inspect: inspect2, query });
  const output = options.format === "json" ? JSON.stringify(report, null, 2) : formatReport(report);
  process.stdout.write(`${output}
`);
  return report.summary.fail > 0 ? 1 : 0;
}
if (process.argv[1] && pathToFileURL(resolve2(process.argv[1])).href === import.meta.url) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`\uC9C4\uB2E8\uC744 \uC644\uB8CC\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4: ${error.message}
`);
    process.exitCode = 2;
  }
}
export {
  HELP,
  formatReport,
  main,
  parseOptions
};
/*! Bundled license information:

smol-toml/dist/error.js:
smol-toml/dist/primitive.js:
smol-toml/dist/date.js:
smol-toml/dist/extract.js:
smol-toml/dist/util.js:
smol-toml/dist/struct.js:
smol-toml/dist/parse.js:
smol-toml/dist/stringify.js:
smol-toml/dist/index.js:
  (*!
   * Copyright (c) Squirrel Chat et al., All rights reserved.
   * SPDX-License-Identifier: BSD-3-Clause
   *
   * Redistribution and use in source and binary forms, with or without
   * modification, are permitted provided that the following conditions are met:
   *
   * 1. Redistributions of source code must retain the above copyright notice, this
   *    list of conditions and the following disclaimer.
   * 2. Redistributions in binary form must reproduce the above copyright notice,
   *    this list of conditions and the following disclaimer in the
   *    documentation and/or other materials provided with the distribution.
   * 3. Neither the name of the copyright holder nor the names of its contributors
   *    may be used to endorse or promote products derived from this software without
   *    specific prior written permission.
   *
   * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
   * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
   * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
   * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
   * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
   * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
   * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
   * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
   * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
   * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
   *)
*/
