# Radicchio architecture

The technical reference for anyone changing the code. `CLAUDE.md` has the short rules; `FORK-GUIDE.md` is for people making their own version. This file explains how the pieces fit together.

## In one paragraph

Radicchio is a static web app: plain HTML, CSS and JavaScript, with no build step, no framework and no server. It is local-first. Everything lives in one JSON object, `S`, saved to the browser's `localStorage` on every change, so the app works offline. Optionally, Google Drive sync keeps several devices in step by merging `S` with a copy in the person's own Drive. Features are **modules** that plug into a shared **core**, so each person's fork changes only `config.js` and `modules/`.

## Where things are

| What | Where |
|---|---|
| Main repo | https://github.com/sawn-red-oak/radicchio (named `daybook` until 2026-11-25; GitHub redirects the old links) |
| Live app | https://radicchio-time.pages.dev (Cloudflare Pages project `radicchio-time`, deployed from `main` on every push) |
| Changes | `CHANGELOG.md`: what changed per version, and what forks need to do |
| Google Cloud project | `radicchio-515819`, org eamon.llc. OAuth client "Radicchio web", ID in `config.js` |
| Synced data | `Radicchio/radicchio-data.json` in each person's own Google Drive |
| Plan and status | `Radicchio Plan.md` in Eamon's Drive, `Time Tracker` folder |

## Files and load order

`index.html` holds the markup and loads classic scripts, in this order, into one shared global scope:

```
config.js         CONFIG: name, modules, googleClientId, driveFolder
core/util.js      $, el, dates (ymd, dlong, t12, monthKey…), money, esc, toast, safeName
core/registry.js  MODULES, registerModule, moduleOn, hook, modData, sheetBuilder, renderAll
core/store.js     VERSION, S, UI, defaults, save, load, migrate; records, hours, numbering
core/files.js     connected folder (File System Access + IndexedDB), deliver(), CSV
core/lineitems.js itemAmount, itemEditor
core/sheets.js    openSheet / closeSheet / paintSheet; head, fieldOf, inp, keepList, calendar
core/invoices.js  invoices tab; docBody, docFile, docCss; showViewer / hideViewer
core/setup.js     setup tab, client sheet, setup wiring
core/backup.js    planMerge, applyBackup (merge | replace), mergeMods, import sheet
core/merge.js     merge3, syncUnits, sameData: the three-way merge for sync
core/drive.js     Google sign-in, Drive REST, driveSync, driveSaveFile, Drive setup UI
core/load.js      appends modules/<id>.js for each CONFIG.modules id, then core/boot.js
modules/time.js   (via load.js) track and blocks tabs, clock, entries, log parser, invoices from hours
modules/quotes.js (via load.js) quotes tab, quote sheet, templates, quote documents
modules/prints.js (via load.js) prints tab: 3D print jobs, rates (materials, client overrides), billing
core/boot.js      module tabs/CSS, nav, load(), first render, sheet restore, sync start, offline worker
```

`core/load.js` adds the module scripts with `async=false`, so they run in order, after core and before boot. A module file that is missing is skipped. `sw.js` (the offline cache) precaches core and reads `config.js` with `importScripts` to precache the modules too.

## Modules

A module is one file, `modules/<id>.js`, wrapped in `(function(){ "use strict"; if(!moduleOn("<id>")) return; … registerModule({...}); })();`. Core never calls into a module directly; it asks the registry:

| Registration key | Used by |
|---|---|
| `render()` | `renderAll()`, in registration order, before invoices and setup |
| `sheets: {kind: builder}` | `paintSheet()`, via `sheetBuilder(kind)` |
| `onShow()` | the app returning to the foreground |
| `tab: {key, label}` | `boot.js` adds a nav button before "invoices" and an empty `<section id="p-<key>">` |
| `css` | `boot.js` injects a `<style>` |
| `quoteBody`, `viewerButtons` | hooks the document viewer asks for with `hook(name)` |
| `billables(clientId)` | the invoice sheets list what's waiting to be billed (`billablePicker`); ticked entries become line items, and their `bill(invoiceId)` marks them |
| `onVoid(invoice)` | voiding an invoice; release whatever it billed |

The built-in tabs (track, blocks, quotes) are static markup in `index.html` with `data-module="<id>"`, and boot hides them when their module is off.

## Data model: `S`

```
S = {
  clients:    { <id>: {id, name, rate:"60", email, address, prefix:"SK", next:7, pad:3,
                       qprefix, qnext, qpad, updatedAt, deleted?} },
  business:   {name, email, phone, address, terms},                 // printed on documents
  settings:   {round (minutes per rounding step: 0, 0.6, 6, 15, 30), roundMode:"nearest"|"up",
               net (days), currency, place:"onsite"|"remote", invoiceDir, dataDir, quoteDir, quoteValid,
               filePrefix:"EM"},                                      // saved files: "EM Invoice SK007"
  active:     null | {clientId, start, place, tasks:[{t, at}]},     // the running clock
  months:     { "YYYY-MM": { <blockId>: {id, clientId, start, end (ms), place, tasks:[{t, at}],
                                         updatedAt, invoiceId?, invoiced?} } },
  invoices:   { <id>: {id, number, clientId, issued, due ("YYYY-MM-DD"), memo, mode:"block"|"day"|"total",
                       desc, blockIds:[…], items:[{desc, qty, unit, rate, source:"manual"|"print"|<a module's id>,
                       date?, category?, file?}], total (hours + items), hours,
                       snap:{rate, name, address, email}, createdAt, updatedAt} },
  quotes:     { <id>: {id, quote:true, clientId, number, title, mode:"items"|"lump", items:[{desc, qty, unit, rate}],
                       scope:[{t}], lump, issued, valid, depType:"pct"|"fixed", depValue, lead,
                       exclusions:[{t}], notes, status:"draft"|"sent"|"accepted"|"declined",
                       fromTpl, createdAt, updatedAt} },
  qtemplates: { <id>: {...a quote without client, number or dates, plus name} },
  mods:       { <moduleId>: { ... } }                                 // modData(id)
}
```

- Ids come from `uid()`: 16 hex characters.
- Blocks are bucketed by `monthKey(start)`. `putEntry()` re-buckets when a block's date moves.
- Numbers such as `rate`, `qty` and `lump` are stored as **strings**, because they come straight from inputs. Parse them when doing arithmetic.
- A block is billed if it has `invoiceId`, or has `invoiced:true` (marked by hand, or billed outside the app).
- Invoice numbering is per client: `prefix + zero-padded next`. `advanceNumber()` learns the prefix and padding from whatever number was actually used.
- Clients are never deleted, only marked `deleted:true`, so past entries keep their names.
- An invoice freezes the client's rate, name, address and email in `snap` when it is recorded (`recordInvoice`). Documents use `snap`, so a later change to the client doesn't rewrite invoices already sent. `migrate()` backfilled `snap` on invoices from before line items.
- An invoice can be hours only (from the blocks tab), items only (**+ new invoice**), or both. `itemsTotal`, `cleanItems`, `recordInvoice`, `docName` and `saveDocFile` live in `core/invoices.js`.
- File and folder names pass through `safeName`, which also drops trailing dots and spaces, as Windows and Drive for Desktop do.
- **Never remove or rename a key.** Other devices and old backups still carry it. Add new keys to `defaults()`; `load()` fills in missing ones.

### Browser storage keys

| Key | Holds |
|---|---|
| `radicchio.v1` | `S` |
| `radicchio.ui` | `UI`: current tab, plus the open sheet and its draft, so a half-typed form survives leaving the app |
| `radicchio.drive` | sync state: email, folder and file ids, last Drive `version`, last sync time |
| `radicchio.token` | the Google access token and its expiry (about an hour) |
| `radicchio.base` | `S` as it was at this device's last sync: the merge base |
| `daybook.v1`, `daybook.ui` | the pre-rename keys, adopted on first run and then left as a safety net |
| `radicchio.daybook-seen` | the last `daybook.v1` merged in, so writes from a stale Daybook copy are merged exactly once |
| IndexedDB `daybook` / `kv` / `folder` | the desktop "connected folder" handle |

## Sync (`core/merge.js`, `core/drive.js`)

**Three-way merge.** `syncUnits(s)` flattens `S` into units:

- each client, block, invoice, quote and template;
- each field of `business` and `settings`;
- `active`;
- for module data: each record of a collection (an object whose values are all objects), each other key, and a marker that the collection exists;
- any unknown top-level key, as one unit.

`merge3(base, local, remote)` compares each unit across the three copies:

| Situation | Result |
|---|---|
| Same on both sides | Keep it |
| Changed on one side only | Take that side |
| Changed on both sides | The newer `updatedAt` (or `createdAt`) wins; a tie keeps local |
| Deleted on one side, edited on the other | Keep the edit |

`fromUnits` rebuilds `S`, re-bucketing blocks by month. Deletions need no tombstones: the base shows that a record existed.

**One sync round** (`driveSync`):

1. Get a token. Without one, stop with status `tap`.
2. Find or create `<driveFolder>/` and `radicchio-data.json`.
3. Read the file's `version`. If it hasn't changed and local equals the base, there's nothing to do.
4. Otherwise download it and merge with `merge3(base, local, remote)`.
   - With no base (this device's first sync), it combines with `applyBackup(remote,"merge")` instead, which dedupes blocks by start and end and clients by name.
   - Local data that is empty simply takes the remote copy.
5. Upload if the result differs from Drive's copy.
6. If anything was typed while the round ran, merge it on top: `merge3(snapshot, now, merged)`, and sync again.
7. Store the result as the new base.

`adopt()` swaps in the merged `S` without calling `save()`, which would trigger another sync.

**When sync runs:**

- on boot;
- 3 seconds after `save()` (`syncSoon`);
- when the app returns to the foreground or comes back online;
- when the app goes to the background with a change pending;
- on "sync now" and on a tap on the header status.

**Sign-in.** Only the `drive.file` scope is requested, so the app sees just the files it created. There are two modes:

- **With the server** (Cloudflare Pages, where `./api/google/ping` returns `{ok:true}`): Google's *code* flow. `functions/api/google/[action].js`:
  - exchanges the code using `GOOGLE_CLIENT_SECRET` (a Cloudflare secret, set for Production and Preview);
  - keeps the refresh token in an AES-GCM-encrypted, HttpOnly, SameSite=Strict cookie on `/api/google`;
  - answers `POST /api/google/refresh` with fresh hourly tokens, so background syncs never need a tap.

  `DRV.state.remembered` marks a device signed in this way. Requests must carry `X-Radicchio: 1`. Disconnecting calls `/api/google/signout`, which revokes the token.
- **Without it** (GitHub Pages, localhost): the browser's token flow. Tokens last an hour and can only be renewed from a tap, so the header shows "tap to sync".

The Google app must be **In production**: in Testing, refresh tokens expire after 7 days.

**Documents.** `deliver(parts, text, mime, driveParts)` saves to `<driveFolder>/<driveParts…>` when Drive is connected, replacing a file of the same name. Otherwise it uses the connected folder (desktop) or the share sheet (phone). With Drive connected, the connected folder steps aside entirely, so Drive is the one copy every device mirrors.

**Drive layout** (per Google account):

```
Radicchio/
  radicchio-data.json          S, synced
  Invoices/<client>/…          invoices and work reports (.html, print to PDF)
  Quotes/<client>/…
```

Files the app didn't create, such as a README added through Drive for Desktop, are invisible to it and harmless.

## Backups and import

`setup → backup json` saves `S` as a file. `setup → import json` offers:

- **Merge:** `planMerge`. Clients match by name, and blocks match by start and end, whatever their ids. Only strictly newer records replace existing ones. An import may add an invoice link but never removes one. Module data merges with `mergeMods`.
- **Replace:** `S` becomes exactly the file.

On a synced device, a replace propagates like any other edit, so deletions included.

## Releasing

1. Work on a branch, then open a pull request to `main` and merge it. Cloudflare Pages deploys `main` to radicchio-time.pages.dev within a minute or two. Add a `CHANGELOG.md` entry with each change.
2. Bump `VERSION` in `core/store.js` with each change. The service worker is network-first, and phones pick up a new version after opening the app once with signal and then reopening it.
3. Any change to what people can do or set up also updates `FORK-GUIDE.md` in the same pull request.

## Operating the live app (Eamon's setup)

**The Drive folder holds only data and documents:** `radicchio-data.json`, `Invoices/` and `Quotes/`. Everything about the app (code, docs, notes) lives in this repo. Personal planning lives outside both: `My Drive/Time Tracker/Radicchio Plan.md` (plan, decisions, status) and `Hannah - start here.md` beside it.

**Rules for the live data:**

1. **Don't hand-edit `radicchio-data.json`.** Devices merge it against the copy each one saw last. To change data, use the app. For a scripted fix, run code in the app on a connected device and call `save()`, so it syncs like any edit. The November 2026 clean-up (Kolb Machine Inc., SK001–006, MP/MPQ) was done this way.
2. **Back up before any bulk change:** copy `radicchio-data.json` to `My Drive/Time Tracker/Daybook Data/` with a dated name.
3. **Never test in the live folder.** Use `driveFolder: "Radicchio TEST"` and a copy of a backup (see Testing).
4. **Backups and data never go into this repo.** It's public, and `.gitignore` excludes the usual filenames.

**Working on the code:**

- Use a local Claude Code session in `C:\Users\Kiki\code\radicchio` on Eamon's PC. The working copy is kept outside Google Drive on purpose.
- The GitHub CLI (`gh`) is installed and signed in as `sawn-red-oak`. Commits are authored as `Eamon <hello@eamon.llc>`.
- Branch, then pull request. Merge only when Eamon says so.
- Eamon prefers to be asked choices interactively, one decision at a time, and to see results (screenshots, the live app).

**Google Cloud** (`radicchio-515819`, Google Auth Platform):

- **In production** (published 2026-11-25), audience External, `drive.file` scope only. There's no logo, so Google's review isn't needed, and anyone with a Google account can connect; no tester list is needed.
- Branding: homepage https://radicchio-time.pages.dev, privacy policy https://radicchio-time.pages.dev/privacy.
- Allowed JavaScript origins:
  - `https://radicchio-time.pages.dev`
  - `https://radicchio-sign-in.radicchio-time.pages.dev` (the preview used to test sign-in)
  - `https://sawn-red-oak.github.io` (the old address, and forks sharing the client)
  - `http://localhost:8765`
- A fork that shares the client needs its own origin added, e.g. `https://<username>.github.io`.
- **Client secrets:** the newer one is in Cloudflare as `GOOGLE_CLIENT_SECRET` (Production and Preview). The original, ending `CMEY`, isn't used anywhere and can be disabled.

## Testing (how it has been done)

- **Behaviour-preserving changes:** load a copy of a real backup into `main` and into the branch, served from the same origin, and compare every tab, every block range and every document's HTML.
- **Merge logic:** a Node script runs `core/util.js` and `core/merge.js` in a `vm` context against synthetic cases and a real backup. Keep it passing whenever `merge.js` changes.
- **Drive:** temporarily set `driveFolder: "Radicchio TEST"` in `config.js`, serve locally at `http://localhost:8765` (an allowed origin), connect, and exercise the cases with the app's own functions. Afterwards, trash the test folder and set `driveFolder` back.
- **Never test with someone's live data in the real folder.** Use a copy of a backup, and delete copies afterwards. Backups hold client names, rates and addresses.
