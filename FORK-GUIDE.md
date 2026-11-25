# Make your own Radicchio

Radicchio is a small app for tracking the hours you work and turning them into invoices. It runs on your phone or computer, keeps your data on your own device, and works offline. This guide is for anyone who wants to use it: to track their own time, or to shape it into their own version.

There are two ways in.

**1. Just use it, with no setup.** Open https://radicchio-time.pages.dev on your phone, then add it to your home screen:

- **Android:** Chrome → **⋮** → **Add to Home screen**.
- **iPhone:** Safari → **Share** → **Add to Home Screen**.

Fill in your details and clients on the **setup** tab, and you're tracking. Your entries stay on your phone and aren't sent anywhere. Use **setup → backup json** now and then to keep a copy. The app's features and look are Eamon's, and they change when he updates it.

Google Drive sync, which keeps your phone and computer in step, works on this shared app only once Eamon adds your Google email as a tester. Your data then goes to a Radicchio folder in *your* Drive, never his. Your own version (path 2) can have its own sync.

**2. Make your own version.** Choose this if you want your own name and icon, only the features you need, or new features of your own. You get a copy of the project on GitHub, and you shape it with Claude's help, without needing to know how to program. Read on.

---

## Starting with Claude

You'll need the **Claude desktop app** on a Mac or Windows computer. Start a new session in its **Code** tab and say:

> Read https://github.com/sawn-red-oak/radicchio/blob/main/FORK-GUIDE.md and walk me through making my own version, one part at a time.

If someone gave you a personal note to go with this guide, attach it to that first message too.

---

## For Claude: how to run this guide

- **Go one part at a time.** Say what the part is for in a sentence or two, do it, check it worked, and ask before moving on. Don't paste the guide back at the person.
- **Don't assume a coding background.** Explain git, GitHub, commits and forks in plain words the first time they come up, and keep it short.
- **They handle every sign-in, password and approval.** Tell them exactly what they'll see and what to click. Never type a password or a one-time code yourself.
- **Keep a notes file**, `my-notes.md`, in their repo. Record what's been done, the decisions they made, and anything left open. Read it at the start of every later session.
- **Follow `CLAUDE.md`** in the repo, above all: change only `config.js` and `modules/`.
- **Check the OS** (Mac or Windows) and the phone (Android or iPhone), and use the matching commands below.
- **Never commit their data.** Backups (`*backup*.json`, `*-data.json`) hold client names, rates and addresses, and the repo is public. `.gitignore` already excludes these filenames, but check before every commit anyway.

---

## What Radicchio is

The code has two layers:

- **`core/`** is shared by every version, and Eamon maintains it: storage, clients, invoices, settings, backups, and soon Google Drive sync.
- **`modules/`** holds the features, each in one file that can be switched on or off in `config.js`. Two come with it:
  - **time:** clock in and out, log time blocks with notes, and turn selected blocks into an invoice (with extra line items if needed) or a work report.
  - **quotes:** quotes with line items or a lump sum, deposits, and reusable templates.
  - **prints:** price 3D print jobs (grams × material $/g + print hours × machine $/h, plus markup; defaults with per-client overrides), and bill them onto invoices.

A personal version is a **fork**: your own copy of the project on GitHub. You change it freely in `config.js` and `modules/`, and pull in Eamon's core improvements with one button, **Sync fork**. As long as you don't edit `core/`, those updates arrive without clashing with your changes.

### What's ready and what's coming (as of November 2026)

| Ready now | Coming later |
|---|---|
| Time tracking, invoices, work reports, quotes | |
| Staying signed in to Google, when hosted on Cloudflare Pages (no hourly "tap to sync") | |
| Line items on invoices: flat fees and expenses, with or without hours | |
| 3D print pricing and billing (the `prints` module) | |
| Google Drive sync between devices; invoices and quotes saved to Drive | |
| Your own modules, with their own tab, saved data and colours | |
| Backups, and import with a safe merge | |
| Hosting your version free on GitHub Pages | |

`CHANGELOG.md` lists every change by version, and what a fork needs to do about each. Read it at the start of each session in an existing fork. To see the latest commits:

```sh
gh api repos/sawn-red-oak/radicchio/commits --jq '.[0:10][] | .commit.message | split("\n")[0]'
```

---

## Part 0: What do you want it for?

Before touching anything, ask them:

- What do they want to track: client work, hours for an employer, a side project? Do they bill by the hour, by the project, or not at all?
- Do they need invoices, quotes, both, or just a log of hours?
- Is there anything the app doesn't do that they wish it did? Note these for Part 7.
- Which computer (Mac or Windows) and phone (Android or iPhone) do they use? Do they have a GitHub account?

If all they need is time tracking as it is, offer path 1 above, with no fork. Otherwise carry on.

## Part 1: Tools on the computer

**Mac**

1. **Git and Python:** run `git --version`. If macOS offers to install the "command line developer tools", click **Install**.
2. **Homebrew**, from https://brew.sh, if `brew --version` fails. It asks for the Mac password in the terminal, which they type themselves.
3. **GitHub CLI:** `brew install gh`.

**Windows** (in PowerShell)

```powershell
winget install --id Git.Git
winget install --id GitHub.cli
winget install --id Python.Python.3.12
```

Then close and reopen PowerShell so the new commands are found.

Check with `git --version`, `gh --version`, and `python3 --version` (Mac) or `python --version` (Windows).

## Part 2: A GitHub account

1. If they don't have one, they create a free account at https://github.com/signup themselves. A short, plain username works best, since it becomes part of their app's web address.
2. Sign the terminal in: `gh auth login --web`. Pick **GitHub.com**, then **HTTPS**, and answer **Yes** to authenticating Git. A browser window opens with a code; they enter it and approve.
3. Set the name and email their changes are recorded under, using their GitHub email:
   ```sh
   git config --global user.name "…"
   git config --global user.email "…"
   ```

## Part 3: Make the fork

1. Ask what to call their version. That becomes the repo name, e.g. `radicchio` or something of their own.
2. Fork and download it into a folder that **isn't synced** by iCloud Drive, OneDrive, Google Drive or Dropbox, because syncing can damage git's files. On Windows, the Documents and Desktop folders are often synced by OneDrive, so use something like `C:\Users\<name>\code`.
   ```sh
   mkdir -p ~/code && cd ~/code
   gh repo fork sawn-red-oak/radicchio --clone --fork-name <repo-name>
   ```
   (On Windows: `mkdir $HOME\code; cd $HOME\code`, then the same `gh repo fork` line.)
3. Move this Claude session into the new folder. From then on, Claude reads `CLAUDE.md` there automatically.
4. Create `my-notes.md` with a first entry, then commit and push it. This is a good moment to explain commit and push.

## Part 4: Run it on the computer

```sh
python3 -m http.server 8000      # Windows: python -m http.server 8000
```

Open http://localhost:8000 in Claude's built-in browser or their own, and click through the tabs together.

## Part 5: Make it theirs

In the code, edit `config.js`:

- `name`: what the app is called in the header and on the browser tab.
- `modules`: which features to keep, e.g. `["time"]` for time tracking only. With none switched on, the app has just **invoices** and **setup**.

They can also change the home-screen name (`name` and `short_name` in `manifest.webmanifest`) and the icon (`icon-192.png`, `icon-512.png`, `icon-maskable-512.png`). Those files rarely change upstream, so editing them is fine.

**Colours:** don't edit `core/app.css`. Make a tiny module, `modules/theme.js`, whose `css` overrides the colour variables, and add `"theme"` to `modules`:

```js
(function(){
"use strict";
if(!moduleOn("theme")) return;
registerModule({id:"theme", css:":root{--bg:#1a0610;--fg:#f6e9ee;--dim:#c98aa4;--faint:#7d4a5e;--line:#3a1424;--line-2:#5c2238;--online:#e0457b}"});
})();
```

`--bg` is the background, `--fg` the text, `--dim` and `--faint` the quieter text, `--line` and `--line-2` the rules and borders, and `--online` the one accent colour. Invoices and quotes keep their plain printable look. Also set `theme_color` and `background_color` in `manifest.webmanifest` to match.

In the app itself, on the **setup** tab, set:

- their business details, which print on invoices;
- clients, with rates and invoice number prefixes;
- rounding and payment terms;
- the **file name prefix**, e.g. their initials, so saved files are named like "EM Invoice SK007".

These settings live on the device, not in the code.

Reload to check, then commit and push.

## Part 6: Put it on their phone

1. Turn on GitHub Pages for the fork. On GitHub: repo → **Settings** → **Pages** → **Deploy from a branch** → `main`, folder `/ (root)`. Or:
   ```sh
   gh api -X POST repos/<username>/<repo-name>/pages -f "source[branch]=main" -f "source[path]=/"
   ```
2. After a minute or two it's live at `https://<username>.github.io/<repo-name>/`.
3. Add it to the home screen:
   - **Android:** Chrome → **⋮** → **Add to Home screen**.
   - **iPhone:** Safari → **Share** → **Add to Home Screen**.
4. Every push to `main` updates the live app. Phones pick it up after the app is opened once with signal and then reopened.

Data is per device and per address. If they used path 1 before, their entries are under Eamon's address: export them there (**setup → backup json**) and import them into their own version (**setup → import json → merge**).

## Part 6½: Google Drive sync (optional)

With sync on, every device signed in to the same Google account shares the same data, and invoices and quotes are saved into their Drive. Data goes to a folder in *their own* Drive, and the app can see only the files it creates.

It needs a Google Cloud **OAuth client ID** in `config.js` (`googleClientId`), and that client must allow their app's address. There are two ways:

- **Share Eamon's** (friends and family): they send Eamon their GitHub username, and he adds `https://<username>.github.io` as an allowed origin in his "Radicchio" Google Cloud project. They keep the `googleClientId` already in `config.js`.
- **Their own Google Cloud project**, done once in a browser, signed in as them:
  1. https://console.cloud.google.com/projectcreate: create a project.
  2. https://console.cloud.google.com/apis/library/drive.googleapis.com: **Enable**.
  3. https://console.cloud.google.com/auth/overview → **Get started**: app name, support email, Audience **External**, contact email, and agree to the User Data Policy (they decide this).
  4. **Audience → Test users:** add their own Google email.
  5. **Data Access → Add or remove scopes:** tick `…/auth/drive.file`, then **Update** and **Save**.
  6. **Clients → Create client:** Web application, with Authorized JavaScript origins `https://<username>.github.io` and `http://localhost:8000`. Copy the **Client ID** into `googleClientId` in `config.js`. The client secret isn't needed: don't copy it anywhere.

Then, in the app: **setup → connect google drive**, and approve. Google may warn that the app "hasn't verified" it; that's expected for a small personal app, so click **Continue**. The header then shows *synced*.

On GitHub Pages, Google's sign-in lasts an hour, and after that the header says *tap to sync*; changes wait safely on the device until then. A version hosted on **Cloudflare Pages** can stay signed in instead: the server function in `functions/api/google/` runs there, given a `GOOGLE_CLIENT_SECRET` secret for the Google client (see `ARCHITECTURE.md` → Sync).

`driveFolder` in `config.js` names the Drive folder (default "Radicchio").

## Part 7: Their own features

Each new feature is a module. Interview first: what should it do, what does it record, and what do they want to see at a glance? Then build `modules/<id>.js`, following `CLAUDE.md`:

- Give it its own tab with `tab: {key: "<id>", label: "…"}`, or add sheets to existing flows.
- Keep its data in `modData("<id>")`: an object keyed by `uid()`, with an `updatedAt: now()` on every record. That's what lets Drive sync merge it correctly between devices.
- Reuse core pieces: `openSheet` with a sheet builder, `fieldOf`, `inp`, `calendar`, `keepList`, `itemEditor`, `money()`, `toast()`. `modules/quotes.js` shows them in use.
- To bill something, record an invoice whose `items` are line items `{desc, qty, unit, rate, source, date?, category?, file?}`, using `recordInvoice(doc, client, [])` and `saveDocFile(...)` from `core/invoices.js`. The invoices tab's **+ new invoice** sheet (`sheetNewInvoice`) shows how.
- Add the id to `modules` in `config.js`. Nothing else needs wiring.
- If the feature produces things to bill later (like `prints`), give the module `billables(clientId)` and `onVoid(invoice)`. The invoice sheets then offer them with tick boxes. `modules/prints.js` is the example.

Try it on the computer, adjust it together, then push it and try it on the phone. Expect a few rounds.

Some things live in core and can't be changed from a module, such as how invoices look. For those, see Part 9.

## Part 8: Getting Eamon's updates

On GitHub: their repo → **Sync fork** → **Update branch**. Or:

```sh
gh repo sync <username>/<repo-name> && git pull
```

If a sync reports a conflict in **`config.js`**, it's usually the `modules` line, which upstream also changes now and then (e.g. adding `"prints"`). Keep *their own* `name` and `modules` lines, and accept any new settings upstream added above them.

A conflict in any other file means something outside `config.js`, `modules/`, the icons, the manifest or `my-notes.md` was edited. Undo that edit, and ask for the change upstream instead.

## Part 9: Asking for a core change

Don't edit `core/`. Open an issue on the main repo saying what's needed and why:

```sh
gh issue create --repo sawn-red-oak/radicchio --title "…" --body "…"
```

---

## Rules, in short

1. Change only `config.js`, `modules/`, `my-notes.md`, the icons and the manifest name.
2. Module data goes in `modData("<id>")`: records keyed by id, each with `updatedAt`.
3. Never commit backups or data files. The repo is public, and the data stays on devices.
4. Keep the repo folder outside any cloud-synced folder.
5. The person does every sign-in, password and approval themselves.
6. Commit and push small changes often, with a plain-English message saying what changed and why.
