# DSH plugin-bundle contract (Host + Client halves)

Researched against the installed build on 2026-11-20:
`/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh` (`@deepseek-ai/*` version `0.2.2-rc.5`),
profile `desktop` at `~/.dsh/profiles/desktop`, GUI `http://127.0.0.1:50891`.

Every claim below is tagged with how it was established:

| Tag | Meaning |
|---|---|
| **[live]** | Verified against the running installation (process, HTTP probe, `cordis_inspect_query`). |
| **[source]** | Read from the installed package source/types inside `app.asar`. |
| **[plugin]** | Copied from a working locally installed plugin (`键盘热力图`, `lecture-notes-plugin`). |
| **[doc]** | From the installed `dsh-doc` skill references. |
| **[inferred]** | Reasonable but not directly verified — treat as a risk, confirm before relying on it. |

---

## 0. Verification status of this research (read this first)

* **Live Client `Slots.listSubTree` could not be queried.** `cordis_inspect_query` with
  `platform=client` timed out after 10 s on three attempts (`Slots.listSubTree` with no root and
  with `root: conversation.composer.dock`). The Host-side probes work; the browser page did not
  answer the Client inspect round-trip. Therefore section 7's slot catalog is
  **[source]** — read from the installed packages' own contract files
  (`@deepseek-ai/dsh-client-ui-*/src/client/contract/slots.ts`), which is what those declarations
  are generated from. When a page is connected, re-run:
  `cordis_inspect_query {platform:"client", provider:"Slots", method:"listSubTree"}`, then
  `{..., input:{root:"<exact slot key>"}}` to confirm the props it actually receives.
* **No `ctx.userActions`, no `ctx.api`, no `ctx.broadcast`, and no `ctx.rpc` service exist in the
  live Host Service catalog [live].** The guess in the task is wrong. Client↔Host is done with
  **same-origin HTTP routes** (section 6) — the pattern both real plugins use.
* **Live HTTP fact:** a plugin's `webServer` prefix route answered `HTTP 200` **with no cookie**,
  while `/index.html` answered `401` on the same server [live]. Plugin routes are therefore *not*
  behind the page's auth; they are plain loopback HTTP and must defend themselves (section 8.2).
* **A linked local bundle cannot natively resolve bare `@deepseek-ai/*` imports** — tested from
  `键盘热力图/`: `ERR_MODULE_NOT_FOUND` for both `@deepseek-ai/cordis` and
  `@deepseek-ai/schemastery` [live]. Both real plugins import only `node:` builtins. Write the
  Host half with zero bare imports (section 8.1).

---

## 1. Bundle anatomy

A bundle is a package whose `package.json` declares `dsh.bundle.patch`; that patch inserts Loader
rows. A client half is the same package declaring `dsh.client` plus a `./client` export [doc][source].

```
ps5-recorder/
  package.json            # dsh.bundle + dsh.client + exports
  cordis.patch.yml        # inserts the Host row (and any extra rows)
  index.js                # Host half (ESM, Node)
  client.js               # Client half (single classic script, ModuleLoader format)
  lib/*.mjs               # optional Host-only helpers (imported by index.js)
  locale/en.json          # meta.title / meta.description / meta.detail
  locale/zh.json          # Chinese locale (file is named zh, not zh-CN) [plugin]
  docs/DETAIL.md          # optional: exactly one image line
  docs/DETAIL.zh.md
  docs/preview.svg        # optional single feature image
  icon.svg                # exported as "./icon"
  README.md               # fallback detail page if meta.detail is omitted
```

Installation of a **local directory** links it (`link:<abs path>`) into the profile
`node_modules` and appends the package name to `dsh.profile.bundles` [live — observed in
`~/.dsh/profiles/desktop/package.json`]. Consequences:

* no build step is required for a plain-JS bundle; the directory you edit is the code that runs;
* `files` does not filter a linked directory (check the files directly) [doc];
* replacing the package requires a DSH restart to load a fresh JS module generation; a new bundle
  can activate through HMR [doc].

The exact profile state after install looks like this [live]:

```json
{
  "dependencies": { "@local/dsh-ps5-recorder": "link:/abs/path/to/ps5-recorder" },
  "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "@local/dsh-ps5-recorder"] } }
}
```

---

## 2. `package.json` — exact shape

```json
{
  "name": "@local/dsh-ps5-recorder",
  "version": "0.1.0",
  "private": true,
  "description": "一键控制 OBS 录制 PS5 画面并把成片自动上传到 YouTube。",
  "type": "module",
  "exports": {
    ".": "./index.js",
    "./client": "./client.js",
    "./locale/*.json": "./locale/*.json",
    "./icon": "./icon.svg"
  },
  "files": [
    "index.js",
    "client.js",
    "lib",
    "cordis.patch.yml",
    "locale/*.json",
    "docs",
    "icon.svg",
    "README.md"
  ],
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "platform": "web",
      "immediately": true,
      "inject": ["@deepseek-ai/dsh-client-ui-sidebar"]
    }
  }
}
```

Rules that matter [doc][source][plugin]:

| Field | Requirement |
|---|---|
| `type` | Must be `"module"`; `index.js` is ESM (`export function apply`), `client.js` is not ESM (see §6). |
| `exports["."]` | The Host entry (`./index.js`). Required. |
| `exports["./client"]` | The browser artifact. Required only when `dsh.client` is declared. The loader serves it as the package's client half. |
| `exports["./locale/*.json"]` | Required for Plugin Manager / Settings to read `meta.*` without activating the plugin. |
| `exports["./icon"]` | Icon export; `icon.svg` is the template default. A top-level `icon` field in `package.json` also works for package-root plugins and takes priority [doc]. |
| `dsh.bundle.patch` | Path to this bundle's patch file. |
| `dsh.bundle.platforms` | Optional; gates installation on `process.platform` values. Omit for a macOS-only tool unless you want install refused elsewhere. |
| `dsh.bundle.listedByDefault` | Optional boolean listing hint. Omit. |
| `dsh.client.platform` | `"web"`. |
| `dsh.client.immediately` | `true` = stage-one prefetch of the bundle at boot [source]. Both real plugins set `true`. |
| `dsh.client.inject` | Package names whose activation must precede this one. Use the package that **declares** the slot you target. For `main`/`sidebar.panellist` → `@deepseek-ai/dsh-client-ui-sidebar`; for `conversation.composer.dock` → `@deepseek-ai/dsh-client-ui-conversation`; for `settings.section` → `@deepseek-ai/dsh-client-ui-settings` [plugin][source]. Entries only order activation; importing those packages as modules is forbidden. |
| `dsh.client.external` | Exact non-baseline module requests (`require('x')` in `client.js`). React needs **no** entry — it is in the shell's frozen module table [doc]. Keep empty unless you must `require` something else. |
| `engines` / `peerDependencies` | **Omit both.** Unmet `engines.dsh` (else DSH peer dependencies) blocks installation and activation; declaring them buys nothing for a linked local bundle [doc]. |
| `dependencies` | Keep empty. The bundle's own `node_modules` would be needed for any real runtime dependency (a `link:` install does not install the target's deps). Write Host code against `node:` builtins only (§8.1). |
| `files` | Keep complete anyway (runtime files, patch, locale, docs, icon); a packed/published copy depends on it. |
| `description` | Used as fallback display text; still write real locale files. |

The name is arbitrary but must be stable: **`dsh.client`'s factory id and every slot `id`/`key`
derive from it** (§6), and the profile dependency key is this exact package name.

---

## 3. `cordis.patch.yml` — inserts, override, `disabled`, `config`

Top-level YAML array of Loader patch entries. Each `- insert:` item becomes a Loader row.

```yaml
# PS5 录制 + 自动上传：Host 半提供 /ps5-recorder-api/* 同源接口。
- insert:
    - id: ps5-recorder
      name: '@local/dsh-ps5-recorder'
      config:
        obsWebSocket: 'ws://127.0.0.1:4455'
        recordingFolder: '~/Movies/PS5'
        autoUpload: true
```

* `id` — the Loader row id, unique in the composed tree; referenced by user patch overrides.
* `name` — the package name (resolved like an import: `@local/…` resolves through the profile link).
* `config` — passed to `apply(ctx, config)` after validation (§4.2). Omit for `{}`.
* A row may also be written **without** `insert` to override an existing row by `id`; a matching
  override **replaces the complete `config`**, it does not deep-merge [doc].
* `disabled: false` re-enables a row a shipped bundle left disabled [doc]:
  ```yaml
  - id: some-shipped-row
    disabled: false
  ```
* `config` values may use the Loader's `!!js` expressions [plugin — `lecture-notes-plugin`]:
  ```yaml
  - insert:
      - id: ps5-store
        name: '@local/dsh-ps5-recorder'
        config:
          dataRoot: !!js dshHomePath('ps5-recorder')
  ```
* **Never write the profile's own `cordis.patch.yml` from plugin code, and never locate it by
  walking up directories.** To change your own config after `apply`, use the config editor (§8.3).

---

## 4. Host half — `index.js`

### 4.1 Export forms (do not mix) [doc]

Either:

```js
export function apply(ctx, config) {}
export const inject = ['webServer']      // optional: hard service deps
export const Config = { /* schema */ }   // optional: validated row config
```

or a Cordis `Service` class as the **default** export (§4.4).

`apply` may register resources and **return a disposer** (cordis treats the return value as
cleanup); in practice register everything with `ctx.effect`/`ctx.on` [doc][plugin].

### 4.2 Declaring a `Config` schema

Two options, with different confidence:

**(a) No schema; normalize in `apply` — [plugin], fully verified.** Both real plugins do exactly this:

```js
const DEFAULTS = { obsWebSocket: 'ws://127.0.0.1:4455', autoUpload: true }

function normalizeConfig(raw) {
  const config = { ...DEFAULTS }
  if (raw === null || typeof raw !== 'object') return config
  if (typeof raw.obsWebSocket === 'string') config.obsWebSocket = raw.obsWebSocket
  if (typeof raw.autoUpload === 'boolean') config.autoUpload = raw.autoUpload
  return config
}

export function apply(ctx, rawConfig = {}) {
  const config = normalizeConfig(rawConfig)
  /* … */
}
```

Verified: `cordis_inspect_query {platform:"host", provider:"Config", method:"listConfigs",
input:{name:"@local/dsh-input-heatmap"}}` returns `status: "absent"` for a plugin with no `Config`.

**(b) Declare `Config` as a Standard Schema — [source], not yet exercised end-to-end.**
Cordis validates `Config` with `runtime.Config['~standard'].validate(config)` and throws on
`result.issues`; async validation is rejected (`TypeError`). So a hand-written object works with
**no imports** — which matters because bare `@deepseek-ai/*` imports do not resolve from a linked
bundle:

```js
export const Config = {
  '~standard': {
    version: 1,
    vendor: 'ps5-recorder',
    validate(value) {
      const raw = value && typeof value === 'object' ? value : {}
      return {
        value: {
          obsWebSocket: typeof raw.obsWebSocket === 'string' ? raw.obsWebSocket : 'ws://127.0.0.1:4455',
          autoUpload: typeof raw.autoUpload === 'boolean' ? raw.autoUpload : true,
        },
      }
    },
  },
}
```

`@deepseek-ai/schemastery` (`z.object({...})`) is what shipped packages use, but it is not
importable from a linked bundle (§8.1). If you ever package dependencies into the bundle's own
`node_modules`, `import z from '@deepseek-ai/schemastery'` + `export const Config = z.object({...})`
is the canonical form [source].

### 4.3 Service dependencies

```js
export const inject = ['webServer']        // hard: plugin stays inactive without it
// const webServer = ctx.get('webServer')  // soft: optional, check for undefined
```

`ctx.effect(() => ctx.webServer.register({...}))` is the registration pattern; it hard-depends on
`webServer` [plugin]. Other verified Host services used by real plugins:
`ctx.get('llm')`, `ctx.get('agentDefaultModel')`, `ctx.get('speechToText')`,
`ctx.get('workspaceRegistry')`, `ctx.get('workingDirectory')` [plugin]. The live catalog also
exposes `credentials`, `configEditor`, `settings`, `storage`, `storageDomain`, `subprocess`,
`web`, `commands`, `tools`, `attachments`, `authorization`, … [live] — call them through
`ctx.get(name)` unless you inject them.

### 4.4 Defining a Service (only when *other Host plugins* must call you)

A Cordis service is `super(ctx, 'key')` in a `Service` subclass [source — `dsh-experimental-speech-to-text`]:

```ts
import { Context, Service } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context { ps5Recorder: Ps5Recorder }
}

export default class Ps5Recorder extends Service {
  static Config = z.object({ obsWebSocket: z.string().default('ws://127.0.0.1:4455').volatile() })
  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'ps5Recorder')
  }
}
```

Requires importing `@deepseek-ai/cordis` → **do not do this in a linked bundle** unless you install
those packages into the bundle directory. For this project a Service is unnecessary: nothing else
in DSH needs to call the recorder, and **the browser cannot call a Host Service directly** either
(§6). Use a plain module-scope object inside `apply` and expose it over HTTP.

### 4.5 Client-callable operations = HTTP routes (`ctx.webServer`)

No RPC/USERACTION API exists for third-party bundles [live]. The supported pattern, used by both
working plugins, is a same-origin route:

```js
const ROUTE = '/ps5-recorder-api'

export const inject = ['webServer']

export function apply(ctx, rawConfig = {}) {
  /* …state, helpers… */

  async function handle(req, res) {
    const url = new URL(req.url ?? ROUTE, 'http://127.0.0.1')
    const path = url.pathname.slice(ROUTE.length) || '/'
    try {
      const origin = req.headers.origin
      if (typeof origin === 'string' && origin.length > 0) {
        let sameHost = false
        try { sameHost = new URL(origin).host === req.headers.host } catch { sameHost = false }
        if (!sameHost) { respondJson(res, 403, { ok: false, error: '拒绝跨站请求' }); return }
      }
      if (req.method === 'GET' && path === '/state') {
        respondJson(res, 200, publicState())
        return
      }
      if (req.method === 'POST' && path === '/record/start') {
        await startRecording()
        respondJson(res, 200, { ok: true, state: publicState() })
        return
      }
      respondJson(res, 404, { ok: false, error: `未知接口 ${req.method} ${path}` })
    } catch (error) {
      respondJson(res, 500, { ok: false, error: messageOf(error) })
    }
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: ROUTE,
    handler: (req, res) => { void handle(req, res) },
  }))
}
```

Exact `webServer.register` contract [live — `Service.listService{service:"webServer"}`]:

```ts
type WebRouteKind = 'exact' | 'prefix'
interface WebRoute { kind: WebRouteKind; path: string; handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void> }
interface WebResourceRoute { kind: WebRouteKind; path: string; resource: (request: Request, peer?: PeerScope) => Promise<Response> }
register(route: WebRoute | WebResourceRoute): () => void
```

* Duplicate `(kind, path)` throws — pick a unique prefix.
* `register()` returns a disposer; always run it inside `ctx.effect` so unload removes the route.
* `kind: 'prefix'` matches `/ps5-recorder-api/...`; `kind: 'exact'` matches one path.
* Also available: `registerUpgrade({path, handler})` (raw WebSocket upgrade), `registerFallback`
  (single owner, do not use), `getOrigin()`.
* Response helpers are yours — write `content-type: application/json; charset=utf-8`,
  `cache-control: no-store`, and `content-length` (copy the `respondJson` in §4.7).

### 4.6 Host → Client "push" / events

There is no documented Host→Client broadcast for bundles; `ctx.broadcast` does not exist [live].
Both working plugins **poll** from the client (5 s in `键盘热力图`, 2 s in the ps5 scaffold). Do that,
and return a cheap `rev`/`updatedAt` field so the client can skip re-renders:

```js
const rev = `${statsMtime}|${statusUpdatedAt}|${mode}`
```

If you truly need push, register a WebSocket upgrade on your own path
(`ctx.webServer.registerUpgrade`) — **not verified in any local plugin; treat as untested**.

Host-side events (`ctx.on(...)`) are for DSH internals (`'agent/created'`, `'session/event'`,
`'tools/result'`, `'theme/change'`, `'locale/change'`, …) — see the live Event catalog via
`cordis_inspect_query {platform:"host", provider:"Event", method:"listEvents"}` [live]. Do not append
session events with a new `type` [doc].

### 4.7 Boilerplate utilities

```js
function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

function respondJson(res, code, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

async function readJsonBody(req, limit = 64 * 1024) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new Error('请求体过大')
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new Error('请求体不是 JSON') }
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)) }
```

### 4.8 Cleanup for long-lived resources

```js
ctx.effect(() => () => clearInterval(timer))          // timers
ctx.effect(() => () => { runtime.disposed = true; runtime.uploadAbort?.abort() })
```

`ctx.effect` bodies may return a disposer, an async disposer, or an iterable of disposers;
disposers run in reverse order on unload [source, cordis `fiber.ts`].

---

## 5. Host constraints

### 5.1 Allowed imports — verified

* **`node:` builtins are available and used in production plugins** [plugin]: `键盘热力图/index.js`
  imports `node:child_process`, `node:fs`, `node:fs/promises`, `node:os`, `node:path`,
  `node:url`, and spawns `clang`, `swiftc`, `codesign`, `launchctl`, `open` via
  `spawn`. So `node:child_process` (spawn/execFile), `node:fs`, `node:path`, `node:os` are proven.
* `node:https`/`node:http` are the same Node runtime and are **not directly exercised** by the two
  local plugins [inferred] — `lecture-notes` uses `fetch`-less in-process services; `键盘热力图`
  uses HTTP only as a server. Prefer `fetch` (global, Node ≥18) for outbound HTTPS, or bundle a
  tiny client. `fetch` is not exercised by a local plugin either [inferred].
* Relative `import './lib/x.mjs'` works (the ps5 scaffold already does it) — same-package ESM.
* **Bare `@deepseek-ai/*` imports fail from a linked bundle** [live] (tested `ERR_MODULE_NOT_FOUND`).
* `import.meta.url` + `fileURLToPath` work (used to locate package assets) [plugin].

### 5.2 Module format

`index.js` is ESM (`"type": "module"`, `export function apply`). It is loaded by
`cordis-plugin-loader` through `import()`, resolved from the profile scope. No CommonJS `require`,
no bundler, no transpile step. Syntax-check with `node --check index.js` [doc].

### 5.3 Long-running work

The Host runs inside the DSH Node process: `spawn`/`execFile` child processes are fine, but
(a) never block the event loop with sync loops over large data, (b) always bound subprocess time
and clean up on unload, (c) keep polling intervals modest (2–5 s) — the two working plugins do.

---

## 6. Client half — `client.js`

`client.js` is **not** an ES module and is not imported. It is a single classic script evaluated by
the shell's module loader and must register a lazy factory whose **id equals the package name**:

```js
window.__ModuleLoader__.load({
  id: '@local/dsh-ps5-recorder',
  factory(require) {
    const React = require('react');
    const { createElement: h, useCallback, useEffect, useRef, useState } = React;

    const NS = 'ps5-recorder';
    const PANEL_KEY = 'ps5-recorder';          // sidebar list id === main key
    const API = '/ps5-recorder-api';

    /* components… */

    function apply(ctx) {
      /* registrations */
    }

    return { inject: ['slots', 'locale'], apply };
  },
});
```

Facts [doc][source][plugin]:

* `require('react')` comes from the browser's frozen module table. **Do not install/duplicate
  React**, do not load a CDN/UMD React, do not `require` `@deepseek-ai/dsh-client-ui-primitives`
  or any other Harness Client package (a throwing component blanks your slot entry; console shows
  `slot entry crashed in '<slot>'`). Write your own controls with `--dsw-alias-*` tokens.
* The factory must be **side-effect free**; module bodies run lazily at materialization. Put
  `apply`, stores, and event subscriptions inside `apply`, and register them through `ctx.effect`.
* Returned plugin object: `{ inject: ['slots', 'locale'], apply }`. `inject` lists Client services
  the plugin requires; `'layout'` is needed only if you call `ctx.layout` (`键盘热力图` uses
  `['slots','locale']`, `lecture-notes` adds `'layout'`).
* `ctx.effect` is the cleanup primitive: return a disposer (or an array/iterable of them).

### 6.1 Slot registration

```js
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, MESSAGES));
  const t = ctx.locale.bind(NS);

  // full central panel (keyed slot: identity = key); `locale: NS` injects a reactive `t` prop
  ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main', key: PANEL_KEY, locale: NS,
  }, Page)));

  // sidebar icon + label (list slot: identity = id, must equal the main key)
  ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: PANEL_KEY, order: 24,
    label: () => t('panel.label'),
  }, PanelGlyph)));

  // optional floating status pill
  ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'ps5-recorder-mini', order: 80,
  }, MiniBar)));
}
```

Signatures [source — `SlotRegistry`]:

```ts
register(options: SlotEntryOptions, Component: React.ComponentType): () => void
inject(key: SlotMapKey, callback: () => (() => void) | Iterable<() => void>): () => void
entries(key), entriesOfSlot(key), subscribe(key, fn): () => void, getVersion(key)
```

* `register` returns a disposer and is **already tied to the calling fiber** (`ctx.effect`
  internally) — the outer `ctx.effect` is belt-and-braces and is what both real plugins do.
* `inject(ownerKey, cb)` runs `cb` when the slot's declaration exists and re-runs it after a
  collapse/re-declare; return the registration disposer from `cb`. This is why panel slots survive
  layout changes. Use it for every registration into a slot you do not declare.
* Registration into an **undeclared** slot key throws at load-time validation [source].
* Options used by real plugins [plugin]:
  * `name` (required) — target slot key;
  * `id` — identity for `kind: 'list'` slots (also the sidebar row id);
  * `key` — identity for `kind: 'keyed'` slots (`main`);
  * `order` — ascending order among entries;
  * `label: () => string` — localized row/tab label (sidebar, settings nav);
  * `inject: () => object` — extra props for the component;
  * `locale: NS` — binds a **reactive** `t` prop (see §6.2);
  * `children` / `store` / `hooks` — only when you *declare* a slot or want a per-entry store.
* Do not declare (or replace) host slots; register into them.

### 6.2 Locale

Two forms [source — `LocaleRuntime.register/bind`]:

```js
// many locales at once (throws if the namespace already has that locale)
ctx.locale.register('ps5-recorder', { zh: {...}, en: {...} })

// one locale at a time
ctx.locale.register('ps5-recorder', 'zh', { ... })

const t = ctx.locale.bind('ps5-recorder')   // t(key, params) — reads active locale at call time
```

* `t('a.b', { n: 3 })` interpolates `{n}`; a missing key falls back to the `common` namespace, then
  to the key itself.
* **For text that must update when the user switches language**, pass `locale: NS` to
  `ctx.slots.register(...)`: the framework injects a reactive `t` prop and re-renders the entry on
  locale revision changes. Passing a non-reactive `t` through `inject` (as the two real plugins do)
  does not re-render on language switch — acceptable for a panel, but prefer the `locale` option.
* `locale/*.json` (the package-level files that Plugin Manager reads) use the **`zh`** filename for
  Chinese, not `zh-CN` [plugin]; the templates ship `en`, `de`, `es`, `fr`, `ja`, `pt`, `ru` only.

### 6.3 Theme

* Style with `--dsw-alias-*` tokens only [doc]. The 14 inspection tokens [source —
  `dsh-client-ui-theme`: `BUILTIN_INSPECT_TOKENS`]:

  `--dsw-alias-bg-base`, `--dsw-alias-bg-layer-1`, `--dsw-alias-bg-layer-2`,
  `--dsw-alias-bg-overlay`, `--dsw-alias-border-l1`, `--dsw-alias-border-l2`,
  `--dsw-alias-brand-primary`, `--dsw-alias-label-primary`, `--dsw-alias-label-secondary`,
  `--dsw-alias-state-error-primary`, `--dsw-alias-state-idle-primary`,
  `--dsw-alias-state-success-primary`, `--dsw-alias-state-warn-primary`,
  `--dsw-specific-sidebar-fill`

  Additional tokens exist in the stylesheets (`--dsw-alias-border-l3/l4`, `--dsw-alias-label-tertiary`,
  `--dsw-alias-interactive-bg-hover`, `--dsw-alias-bg-module-platform`, …) [source], and the layout
  frame publishes `--dsh-frame-top-clearance` / `--dsh-frame-leading-clearance` for top padding
  [plugin][source]. Live list when a page is connected:
  `cordis_inspect_query {platform:"client", provider:"Theme", method:"listTokens"}`.
* Render the stylesheet as a React element inside your component so unmount removes it:
  `h('style', null, CSS)` [plugin].
* React to theme changes with `ctx.on('theme/change', () => {...})`; it is emitted on the client
  context with a theme snapshot [plugin][source].

### 6.4 Calling the Host and showing results

```js
async function request(path, options = {}) {
  let response
  try {
    response = await fetch(`${API}${path}`, {
      method: options.body === undefined ? 'GET' : 'POST',
      headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: 'same-origin',
      cache: 'no-store',
    })
  } catch { throw new Error('network') }
  const data = await response.json().catch(() => null)
  if (!response.ok || data === null || data.ok === false) {
    throw new Error((data && data.error) || `HTTP ${response.status}`)
  }
  return data
}
```

* Call page-level operations with `POST /ps5-recorder-api/record/start` + `{}` bodies, and read
  status with `GET /ps5-recorder-api/state`.
* Show the returned `error` text in the UI; never assume success.
* **Poll** with a timer created inside `useEffect` and cleared on unmount; skip while hidden
  (`document.visibilityState === 'hidden'`) and guard against out-of-order responses with a
  sequence ref [plugin].

### 6.5 Cleanup requirements

* Every registration goes through `ctx.effect` / `ctx.on`; return disposers.
* Component-local timers/listeners: create in `useEffect`, clear in its cleanup; guard state
  updates with a `mounted`/sequence ref [plugin].
* Do not write DOM outside your component, do not append to `document.body`, do not replace the
  app root, do not read another plugin's DOM/stylesheet [doc].
* After a plugin unload/collapse the slot entry disappears; a crash is reported as
  `slot entry crashed in '<slot>'` and blanks the entry.

---

## 7. Slot catalog (source-verified)

SlotMap declarations from the installed Client packages
(`@deepseek-ai/dsh-client-ui-{layout,sidebar,conversation,settings}/src/client/contract/slots.ts`).
`kind` + `scope` + owner props are exactly as declared there. **Live `listSubTree` confirmation is
pending** (§0).

### 7.1 For a control panel with buttons + status — recommended pair

| Slot | kind / scope | Owner props (from the slot owner) | How to register |
|---|---|---|---|
| `main` | `keyed` / `root` | none (reserved `conversation` key hosts the chat) | `{ name:'main', key: PANEL_KEY }` — full central page, shown when the sidebar row is clicked |
| `sidebar.panellist` | `list` / `root` | `{ size: number, active: boolean }` | `{ name:'sidebar.panellist', id: PANEL_KEY, order, label: () => string }` — sidebar icon row; **its `id` addresses the matching `main` key** |

This is exactly what both working plugins do (`键盘热力图` orders 24, `lecture-notes` 20). Clicking
the sidebar row selects your `main` panel; `ctx.layout.selectPanel(PANEL_KEY)` opens it
programmatically (`lecture-notes` does this from its mini bar).

### 7.2 Other usable seats

| Slot | kind / scope | Owner props | Use for |
|---|---|---|---|
| `shell.overlay` | `list` / `root` | none | Frame-wide floating layer above all columns, click-through by default; a status pill / toast. `lecture-notes` uses it for its mini bar. |
| `conversation.composer.dock` | `list` / `session` | none (standard props only) | Ambient full-width entries **below the composer card**; good for a compact status strip + buttons next to the input. Declared by `dsh-client-ui-conversation`. |
| `conversation.input.dock` | `list` / `session` | none | Full-width entries **above** the composer card. |
| `conversation.input.left` / `.right` | `list` / `session` | none | Compact controls in the composer tool row (left / before submit). |
| `conversation.input.overlay` | `list` / `session` | none | Entries floating inside the composer card. |
| `settings.section` | `list` / `root` | `{ close: () => void }` | A full Settings page (nav row appears in Settings). Register with `id` (section key), `order`, `label: () => string`; add `settings.section.icon` with the same id for a nav icon. |
| `settings.plugins.tab` | `list` / `root` | none | Extra tab inside Settings → Plugins. |
| `sidebar.footer.action` | `list` / `root` | `{ wide: boolean }` | One action button beside Settings at the sidebar foot. |
| `settings.general.item` | `list` / `root` | none | One preference row inside Settings → General (row draws its own label/value/writes). |
| `sidebar` | `single` / `root` | `{ collapsed, width, drawer }` | **Occupied by the sidebar shell — do not register here**, it replaces the navigation column. |

Standard props injected into every entry of that scope [source]:

* `root` scope: `useSessions`, `useSessionStatus`, `useSessionRetainInfo`, `useSessionAccess`
  (session package), `useWorkspaces` (workspace package), `usePanelInfo` (layout).
* `session` scope: `sessionId`, `useSession`, `useProjection`, `useAccess`, plus Conversation's
  `useConversation`, `useInput`, `inputActions`.
* `session-maybe` scope: the same, potentially `undefined`.
* plus your `inject()` props; plus reactive `t` when `locale` is declared; plus
  `renderSlot`/`useStore`/`actions` when you declare children/a store.

For a PS5 control panel, `main` + `sidebar.panellist` is the right choice; optionally add a
`conversation.composer.dock` status strip if the user should see recording state while chatting.

---

## 8. Constraints: data, secrets, security

### 8.1 Dependencies / bundling rules

* Host: `node:` builtins + relative ESM imports only. **No bare `@deepseek-ai/*` import** in a
  linked bundle [live]. If you must ship a real dependency, install it into the bundle directory
  (`node_modules/` inside the linked dir) — a `link:` profile install does not install it for you
  [inferred, consistent with pnpm `link:` semantics].
* Client: one self-contained `client.js`; `require('react')` only from the baseline table; list
  genuinely non-baseline `require()` targets in `dsh.client.external` [doc]. No bundler output
  format other than the `window.__ModuleLoader__.load({id, factory})` shape.
* Never install a second React or import Harness Client packages [doc].

### 8.2 Security of plugin HTTP routes — verified live

A plugin prefix route is served **without** the page's auth cookie (`200` vs `401` for
`/index.html` on the same server) [live]. Therefore:

* treat every request as untrusted local input: validate methods/paths, cap body size, never
  interpolate request data into shell commands;
* reject cross-site `Origin` (copy the snippet in §4.5 — both real plugins do);
* never expose secrets: return `googleClientSecretSet: Boolean(secrets.clientSecret)` rather than
  the value (the ps5 scaffold already does this);
* the route lives only on the loopback Web server; do not add your own listener unless the user
  asks, and never bind `0.0.0.0`.

### 8.3 Persistent data and configuration

* **Non-session data** (recording queue, settings, tokens) belongs in a plugin-owned directory, not
  in `cordis.patch.yml`. Verified patterns:
  * `$DSH_HOME/<plugin>/…` with the `DSH_HOME || ~/.dsh` fallback —
    `键盘热力图` (`LEGACY_STATS`) and the ps5 scaffold (`lib/store.mjs`) both do this;
  * the workspace directory via `ctx.get('workspaceRegistry').list()` /
    `ctx.get('workingDirectory').defaultDirectory` — `lecture-notes` writes output there;
  * `ctx.storageDomain.open(spec)` is a live Host service for typed non-session records [live],
    but `DomainSpec` typing is internal; treat as advanced/optional.
* Write atomically: write a temp file then `rename`; use `{ mode: 0o600 }` for secret files
  [plugin — `键盘热力图` does both].
* **Configuration** the user tunes belongs in `Config` / the row's `config` in `cordis.patch.yml`
  [doc]. To change your own config after `apply` [doc]:
  ```js
  const entry = ctx.fiber.entry
  const editor = ctx.get('configEditor')
  if (entry === undefined || editor === undefined) throw new Error('Configuration cannot be saved in this profile')
  await editor.edit(entry, current => ({ ...current, autoUpload: value }))
  ```
  A normal field restarts the plugin so `apply` rebuilds state; a `.volatile()` field updates in
  place and is read with `config.field.get()`.
* **Secrets** (OAuth client secret, refresh token) must not be configuration. The Harness-native
  store is `ctx.credentials` [doc][live]:
  ```js
  const credentials = ctx.get('credentials')          // or declare 'credentials' in inject
  await credentials.modifyRecord('@local/dsh-ps5-recorder/youtube', async current => ({ ...current, token }))
  const record = await credentials.readRecord('@local/dsh-ps5-recorder/youtube')
  ```
  records are keyed `<scope>/<id>` where `<scope>` is your plugin's registered name; `modifyRecord`
  is the only write path; values never appear in config or UI.
  A `0600` JSON file under `$DSH_HOME/ps5-recorder/` is an acceptable fallback if you do not want
  the dependency, but then *never* mirror the secret into `state.json`, the HTTP response, or logs
  (the scaffold's `youtube-tokens.json` at 0600 is fine; `settings.googleClientSecret` in
  `state.json` is not — move it to the token file or `ctx.credentials`).

### 8.4 UI-consistency rules [doc]

* Inherit host theme tokens and control patterns; literal colors are for artwork only.
* All visible text through the locale service; no hard-coded Chinese/English in components.
* Copy markup/spacing patterns from host pages (Plugin Manager is the reference for management
  lists). Keep `role`/`aria-*` (e.g. `role="switch"` + `aria-checked`) if you copy a control.
* One image per bundle for the detail page; no mock pages, no screenshots of fake UI.

---

## 9. Display resources: locale, icon, detail

### 9.1 Locale files

`locale/en.json` (required) and `locale/zh.json` (user's language):

```json
{
  "meta": {
    "title": "PS5 recorder",
    "description": "Start, pause, and stop OBS recording from a sidebar panel, then finalize the file and upload it to YouTube automatically. Requires OBS with obs-websocket enabled; add a game to the queue to get “Game | EP 01” names and a description.",
    "detail": "docs/DETAIL.md"
  }
}
```

```json
{
  "meta": {
    "title": "PS5 录制上传",
    "description": "在侧边栏面板里一键开始 / 暂停 / 停止 OBS 录制，结束后自动转封装、改名并上传到 YouTube；每个游戏可设合集名与简介，失败的会上传任务可重试。需要在 OBS 中开启 obs-websocket，令牌只保存在本机。",
    "detail": "docs/DETAIL.zh.md"
  }
}
```

* Keys: `meta.title`, `meta.description`, `meta.detail` (optional). English titles/labels in
  sentence case [doc].
* `meta.description` must state functionality, usage, and essential limitations (network/token use,
  what happens when disabled) [doc]. Do not leave template copy.
* Only the `meta.*` keys are read by Plugin Manager/Settings without activation; runtime UI strings
  live in the client's `MESSAGES` object.

### 9.2 Icon

* `icon.svg` (or PNG/JPEG/WebP), **≤ 256 KiB**, must stay inside the package; absolute paths, URLs,
  and symlinks out of the package are rejected [doc].
* Export it as `"./icon": "./icon.svg"`; a top-level `"icon"` path in `package.json` also works and
  wins for a package-root plugin [doc].
* Original artwork or license that permits redistribution; keep attribution if required [doc].
* Verify it is a valid image of the declared format — the filename alone proves nothing [doc].

### 9.3 Detail document

* `meta.detail` points at a `.md` relative to the package root with `/`, inside the package,
  ≤ 1 MiB (`pluginManager.detailMaxBytes`) [doc].
* `docs/DETAIL.md` must be **exactly one image line** with meaningful alt text [doc]:
  ```markdown
  ![PS5 recording panel with queue and upload status](preview.svg)
  ```
* `docs/preview.svg`: self-contained SVG, `width="640" height="300" viewBox="0 0 640 300"`, one main
  example, key content ~32 units from edges, readable in light and dark; no scripts/`text`/
  `foreignObject`/remote resources; ≤ ~1 MiB total; enforced per image at 5 MiB
  (`pluginManager.detailImageMaxBytes`) [doc].
* Localized variant: `docs/DETAIL.zh.md` + `locale/zh.json`'s `meta.detail`; a text-free preview may
  be shared across locales. If you skip the preview, omit `meta.detail` everywhere and delete the
  detail files (the README becomes the detail page) [doc].
* No `./detail` export is needed; `"docs"` must be in `files` [doc].

---

## 10. Install and verify

### 10.1 Install a local directory

```js
plugin_manager({ action: 'install_bundle', target: '<仓库绝对路径>/ps5-recorder' })
```

* `target` is the **absolute package directory** (the installation spec form), not the npm name
  [doc].
* Pass `approvedBuilds: [...]` only after the user explicitly approves running the reported install
  scripts; a bundle with no `scripts` should report none [tool].
* `registry` is only for npm installs — omit for a local dir [tool].
* Do not pre-create the profile entries or run pnpm in the profile yourself; `install_bundle` does
  both [doc].
* Read the result: `application` and `warnings` decide whether the change is live. `applied` →
  live; `failed` needs diagnosis; `overridden` means a higher-priority layer wins; `restart-required`
  means not live yet. A new bundle can activate via HMR; replacing an installed package needs a
  restart [doc].
* This action modifies the shared profile; in this session approval prompts are disabled, so a
  permission denial means the parent must run it, not retry.

### 10.2 Verify success

1. **Config schema / row is live** [live]:
   ```js
   cordis_inspect_query({ platform: 'host', provider: 'Config', method: 'listConfigs',
     input: { name: '@local/dsh-ps5-recorder' } })
   ```
   Expect one entry with `status: "schema"` if you declared `Config` (or `"absent"` if you chose
   the manual-normalize route — both are valid), and `patchId: "ps5-recorder"`.
2. **Host HTTP route is live** [live — proven by the same probe against `键盘热力图`]:
   ```bash
   curl -s http://127.0.0.1:50891/ps5-recorder-api/state
   ```
   Expect your JSON, not 404. (The port is `$DSH_WEB_URL`; it is `50891` here.)
3. **Client registration** — with a page connected:
   ```js
   cordis_inspect_query({ platform: 'client', provider: 'Slots', method: 'listSubTree', input: { root: 'main' } })
   ```
   Expect your entry under the `main` occupants, and `Ps5`-keyed entry in `sidebar.panellist`.
   If the Client inspect still times out, reload the GUI page and retry; report the verification
   limit rather than claiming visual success [doc].
4. **Browser console**: no `slot entry crashed in '<slot>'`; no React duplication warnings.
5. **Plugins page**: row shows your localized title/description, your icon, and the detail image;
   check English and Chinese, light and dark.
6. Exercise the capability end-to-end (start recording → stop → upload) and compare the UI state
   with the Host state; restore any user state you changed while testing [doc].

### 10.3 If the client half does not appear

* `id` in `window.__ModuleLoader__.load` ≠ package name → the boot graph never matches the row.
* `dsh.client.inject` names a package that is not active in the profile → activation ordering never
  resolves.
* Registering into a slot that is not declared → load-time validation throws; check the Host log.
* An exception at factory evaluation → the row reports a transport/registration failure in the boot
  audit; check the console and the Plugins page's retry.

---

## 11. Open questions / do not guess

1. **Live Client slot tree was not obtained** (3 timeouts). Props in §7 come from the installed
   `contract/slots.ts` files; re-run `Slots.listSubTree` with a connected page before finalizing a
   layout-heavy design.
2. **No third-party RPC/broadcast API exists** as far as the live Host catalog shows. If a future
   build adds one (`ctx.remote.*` namespaces are generated by `typert` for shipped packages only),
   it is not documented in `dsh-doc` and should not be targeted.
3. **Hand-written Standard Schema `Config`** is derived from cordis `resolveConfig`, not exercised
   in a local plugin. If `Config` validation misbehaves, fall back to the verified manual-normalize
   pattern (§4.2a).
4. **`node:https` / global `fetch`** in the Host half are not exercised by the two local plugins;
   they should work in the DSH Node process, but verify with one call before building the YouTube
   client on top.
5. **`dsh.client.immediately: true` + a large `client.js`**: behavior is verified only for
   ~30–50 KB bundles. Keep the artifact small; no evidence about large bundles.
6. **`ctx.storageDomain`/`ctx.credentials` shapes** are from the live service catalog and package
   READMEs; record-key typing (`CredentialKey` brand) is not checked at runtime, so wrong keys fail
   at use time, not at load.
7. **Hot update of a linked bundle's `client.js`**: `dsh-client-modules` derives revisions from
   mtime/ctime/size and serves/reloads changed bundles, but this was not tested here. Reload the
   page after editing client code; a Host-side change of an installed package needs a DSH restart.
