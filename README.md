# Ampler Launcher

Ampler is a browser launcher for a collection of Eaglercraft builds, with edition catalogues, installations, skins, settings, server listings and download tools. The interface incorporates work from the community projects credited in the launcher.

## Repository layout

```
index.html          HTML cover page with a direct link to the launcher in app/
README.md           this file

app/                the launcher itself - serve this directory (tools/serve.py roots here)
  index.html        launcher shell
  mc/               the game clients: 110 folders, every catalogue entry (≈3 GB, committed)
  assets/           css · fonts · images · js · json catalogues · skins · offline server bundle

docs/               eaglercraft-reference.md (complete build reference)
                    original-readme.md (the pre-restructure README, kept for history)

tools/              things that run or rebuild the launcher
  serve.py          local dev server (cross-origin-isolated, serves app/ + the manifest)
  recover_upstream.py  re-downloads app/mc/ hash-pinned from the community mirrors
  recover_clients.py   legacy 15-zip reassembly flow (only needed for the old archive)
  bake-skins.py     bakes assets/skins/ into list.js like serve.py does live
  upstream-files.json  recovery manifest: 311 files with repo, blob sha and size
  start-offline.*   double-clickable starters (sh / macOS command / bat)

tests/              things that check the launcher
  test_integrity.py    fast structural unittest (python3 -m unittest discover -s tests)
  verify-offline.mjs   offline verification (needs node, jsdom optional)
  browser-test.mjs     optional headless live-browser pass (needs puppeteer-core)
```

The local server serves `app/`; the Downloads screen reads the copy of the
recovery manifest in `app/assets/json/upstream-files.json`. Keep that copy in
sync with `tools/upstream-files.json` when updating the recovery manifest.
When the repository root is hosted statically, `index.html` is the cover page
and links directly to `app/`.

## Run locally

```sh
python3 tools/serve.py --port 8000 --no-browser
```

Open <http://localhost:8000/>. The server supplies cross-origin isolation
headers for the WASM builds; `--host` and `--port` change the address. The server binds to localhost by default; use `--lan` only on a trusted network to expose it to other devices. The same
thing can be started by double-clicking `tools/start-offline.sh`,
`tools/start-offline.command` (macOS) or `tools/start-offline.bat` (Windows).
To host your own offline multiplayer server, see `app/assets/server/README.md`.

## Restoring app/mc/

The clients are committed to this branch, so a normal clone already contains
them (≈1.8 GB pack). If `app/mc/` is ever missing — an older snapshot, or a
partial checkout — one command re-downloads everything, verifying each file
against its pinned Git blob hash:

```sh
python3 tools/recover_upstream.py
```

The recovery reads `tools/upstream-files.json`: 311 files from ten community
mirrors (theveil-media/AmplerLauncher `3b503b5`, gtrdhf/AmplerLauncher
`9e1e197`, yummyfiles/Minecraft-Launcher `b3785c5`, EaglerForge/EaglerForge-builds,
AstraClientOrg, Tucky143/Archive, nx13chillguy/TuffClient-Archive,
eaglercrafthub, Inca2026 and Eaglercraft-Archive/Resent-3.8_Patch-0-offline).
It needs the GitHub CLI (`gh`), network access and ≈3 GB of disk, it can resume
an interrupted run, and it writes `app/mc/upstream-availability.json` listing
only complete, verified folders so the UI keeps missing clients disabled.

## Verification

```sh
python3 -m unittest discover -s tests   # fast structural checks

npm install --no-save --no-package-lock jsdom@22 # enables the live-DOM group
node tests/verify-offline.mjs            # offline suite including DOM tests
node tests/security.test.cjs            # URL and sandbox regression tests

npm i puppeteer-core                     # or set $BROWSER_PATH
node tests/browser-test.mjs              # optional live-browser pass
node tests/mobile-test.mjs               # touch layouts; set BROWSER_PATH if needed
```

The checks cover the shell's local resources, the catalogue↔disk↔manifest
relationship, skins, theming and layout rules, the jsdom drive-through of the
launcher, and an end-to-end URL sweep through the real server.

## Fidelity notes

The recovered upstream files are documented sources, not proof of byte-for-byte
identity with the missing original unified build. Client artwork was recovered
from each corresponding upstream client favicon where available, so icons are
not necessarily byte-identical to the original artwork. The catalogued files are present locally; individual client functionality depends on browser compatibility.

## Security and compatibility

Bundled clients are third-party code and run with the permissions of their host origin.
Only use clients you trust, and do not host sensitive applications on the same origin.
Imported HTML is placed in an opaque-origin sandbox; its Storage shim preserves basic
localStorage values, but IndexedDB is unavailable, so world persistence may not work.
The sandbox is not a substitute for trusting downloads or remote URLs. The launcher CSP
still permits inline scripts and eval for compatibility with blob-based clients; it is
not a complete defense against script injection. Review bundled upstream licenses
individually before redistribution: no repository-wide license has been established.

Resent Client 5.1 Patch 1 WASM is sourced from
[its upstream release](https://github.com/Elite4r/Resent-Client/releases/tag/v5.1-patch-1).

## Mobile use

The launcher supports touch-sized controls and scrollable navigation on phones and
tablets, including landscape. Choose the Mobile/Controller edition in the left
rail for clients intended for touch input. Individual third-party clients may
still require a keyboard, controller, a supported browser, or landscape mode;
the launcher cannot add touch controls to clients that do not provide them.
