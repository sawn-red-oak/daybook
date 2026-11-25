# Changelog

What changed in each version of Radicchio, and **what a fork needs to do** about it. Newest first.

A fork catches up by running **Sync fork** (or `gh repo sync <username>/<repo-name> && git pull`), then reading this file down to the version it last synced. The app's version is shown at the bottom of the **setup** tab, and set by `VERSION` in `core/store.js`.

---

## 2026-11-25: moved to Cloudflare, repo renamed `radicchio`

- The main app now lives at **https://radicchio-time.pages.dev** (Cloudflare Pages). It deploys from `main` automatically.
- The repo is now **`sawn-red-oak/radicchio`** (it was `sawn-red-oak/daybook`). GitHub redirects the old links, so existing forks keep syncing.
- The old address, `sawn-red-oak.github.io/daybook`, is switched off. Anyone using the shared app moves to the new address and connects Google Drive there; their data comes back from Drive.

**Forks:** nothing is required. Optionally update the remote with `git remote set-url upstream https://github.com/sawn-red-oak/radicchio.git` if one was set. A fork's own name and its GitHub Pages address are unaffected.

## 1.19.0: 3D print pricing (`prints` module)

- New module **`prints`**: price 3D print jobs as (grams × material $/g + print hours × machine $/h) × (1 + markup %). It has default rates, a materials list, and per-client overrides. Jobs wait per client and get ticked onto invoices.
- New **core billing hook**: a module can provide `billables(clientId)` and `onVoid(invoice)`. Both invoice sheets list what's waiting for the client with tick boxes; ticked entries become line items, and voiding releases them. `modules/prints.js` is the example. A budget or receipts module can use the same hook.

**Forks:**
- `config.js` upstream now has `"prints"` on its `modules` line. If your fork edited that line, Sync fork reports a conflict. **Keep your own `modules` line.** Leave `"prints"` out unless you want it.
- To bill things from your own module, implement `billables` / `onVoid` (see `ARCHITECTURE.md` → Modules).

## 1.18.0: line items on invoices

- Invoices can be **hours, line items, or both**. **+ new invoice** on the invoices tab creates an items-only invoice (flat fees, expenses), and **generate invoice** on the blocks tab gains **extra items**.
- Items are `{desc, qty, unit, rate, source:"manual"|"print"|"receipt", date?, category?, file?}`.
- Recording an invoice **freezes** the client's rate, name, address and email on it (`snap`). Existing invoices were backfilled on first load.
- New setting: **file name prefix** (setup → invoicing). Saved files are named like "EM Invoice SK007".
- `safeName` drops trailing dots and spaces, as Windows does.
- Helpers in `core/invoices.js`: `recordInvoice`, `saveDocFile`, `itemsTotal`, `cleanItems`, `docName`.

**Forks:** nothing is required. Set your own file name prefix in the app. To create invoices from a module, use `recordInvoice(doc, client, [])` and `saveDocFile(...)`.

## 1.17.0: Google Drive sync

- Optional **Google Drive sync** between devices, through a `Radicchio/` folder in each person's own Drive. It uses a three-way merge, so deletions sync and edits on two devices both survive. Invoices and quotes are saved to Drive too.
- It's off unless `config.js` has `googleClientId`. Two new settings sit at the **top** of `config.js`: `googleClientId` and `driveFolder`.
- When Drive is connected, the desktop "connected folder" steps aside.
- Module data in `modData(id)` syncs record by record. Records need `updatedAt`.

**Forks:**
- Sync fork merges the new `config.js` lines cleanly, because they sit above `name` and `modules`.
- To turn sync on, either share Eamon's Google client (send him your GitHub username and Google email, so he can allow `https://<username>.github.io` and add you as a tester) or make your own Google Cloud project. See `FORK-GUIDE.md` → "Google Drive sync".

## 1.16.0: renamed to Radicchio; forks work in `modules/` only

- The app is called **Radicchio**, with a new icon. Local data moved from `daybook.v1` to `radicchio.v1` automatically.
- **`modData(id)`** gives a module saved data that's backed up and imported with everything else.
- A module can ask for its own **tab** and **css** in `registerModule`.
- **`core/load.js`** loads the modules named in `config.js`, so adding a module means a file in `modules/` plus its id in `config.js`. No edits to `index.html` or `sw.js`.
- `FORK-GUIDE.md` and `CLAUDE.md` explain the rules.

**Forks:** colours go in a small theme module (see `FORK-GUIDE.md` → Part 5). Don't edit `core/app.css`.

## 1.15.0: split into `core/`, `modules/`, `config.js`

- The one-file app became shared `core/`, switchable `modules/` (time, quotes) and a per-version `config.js`. Behaviour didn't change.
