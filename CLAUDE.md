# Radicchio

A time-tracking and invoicing app for phone and desktop. Plain HTML, CSS and JavaScript: no build step, no npm. Open `index.html` through any static web server to run it, for example `python3 -m http.server 8000`, then go to http://localhost:8000.

Read `ARCHITECTURE.md` before changing core, data or sync code. If you are helping someone set up their own fork, read `FORK-GUIDE.md` first.

## Layout

```
index.html     the page markup; loads config.js and core/
config.js      name and which modules are on            ← each version edits this
core/          shared by every version                  ← maintained upstream
  app.css        all styles
  util.js        helpers (dates, money, toasts)
  registry.js    how modules plug in; modData(); renderAll()
  store.js       the data object S in localStorage; numbering, rounding
  files.js       folder writes, share sheet, CSV
  lineitems.js   line items and their editor
  sheets.js      bottom sheets, checklist, calendar
  invoices.js    invoices tab, invoice documents, document viewer
  setup.js       setup tab, clients, settings
  backup.js      backup import (merge / replace)
  merge.js       three-way merge used by sync (base / this device / Drive)
  drive.js       Google sign-in, Drive sync, saving documents to Drive
  load.js        loads the modules listed in config.js, then boot.js
  boot.js        start-up; runs last
modules/       features that can be switched on or off  ← add your own here
  time.js        clock, time blocks, invoices from hours
  quotes.js      quotes and templates
sw.js          offline cache (reads the module list from config.js)
```

## Rules

- **Customise in `config.js` and `modules/` only.** In a fork, don't edit `core/`, `index.html` or `sw.js`. Fixes to those come from the main repo (`sawn-red-oak/radicchio`) through GitHub's "Sync fork", and local edits make those syncs conflict. If core needs a change, open an issue on the main repo.
- **A new feature is a new module**, in `modules/<id>.js`, with `<id>` added to `modules` in `config.js`. That's all the wiring: `core/load.js` loads it, and the service worker caches it.
- **The shape of a module:** see `modules/quotes.js`. Wrap the file in `(function(){ "use strict"; ... })()`, start with `if(!moduleOn("<id>")) return;`, and end with `registerModule({...})`. The comment at the top of `core/registry.js` lists everything a module can provide: `render`, `sheets`, `onShow`, `tab` (core makes the tab and an empty panel `#p-<key>`), `css` and hooks.
- **A module's data** goes in `modData("<id>")`, never in new top-level keys of `S`. Keep each collection as an object keyed by id (use `uid()`), with an `updatedAt` (`now()`) on every record. Backups, imports and (soon) Drive sync merge record by record, and the newer `updatedAt` wins. Call `save()` after a change.
- Scripts are classic scripts sharing one global scope, not ES modules. Core's functions (`$`, `el`, `money`, `toast`, `openSheet`, `head`, `fieldOf`, `inp`, `keepList`, `calendar`, `itemEditor` …) and `S` are global. Inside a module, keep everything private and expose it only through `registerModule`.
- Never remove or rename an existing key in `S`: other devices and old backups still carry it.
- In the main repo, bump `VERSION` in `core/store.js` with each change so phones pick up the new files.
- **Add a `CHANGELOG.md` entry** with every change in the main repo: what changed, and what a fork must do about it (if anything). Forks read it to catch up.
- **Keep `FORK-GUIDE.md` current.** In the main repo, any change that affects what someone can do, set up or customise (a new feature, a new setting, a new setup step, something moving from "coming" to "ready") updates `FORK-GUIDE.md` in the same pull request. Its link is shared with people as the description of the latest version.
- The built-in tabs (track, blocks, quotes) are in `index.html` and carry `data-module="<id>"`, so they hide when their module is off.
