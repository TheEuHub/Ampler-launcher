# Ampler Launcher

Ampler is a browser launcher for a collection of Eaglercraft builds, with edition catalogues, installations, skins, settings, server listings and download tools. The interface incorporates work from the community projects credited in the launcher.

## Repository layout

```
index.html          "Blockhop" - a standalone cover site for static hosting; its
                    Settings popup hides a "continue to site" link into app/
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
  verify-offline.mjs   full offline verification (178 checks; needs node, jsdom optional)
  browser-test.mjs     optional headless live-browser pass (needs puppeteer-core)
```

Nothing outside `app/` is served to players, with one deliberate exception: the
launcher fetches `./tools/upstream-files.json` for its Downloads screen, and
`tools/serve.py` exposes exactly that one file. When the repository root itself
is hosted statically, visitors land on the root `index.html` cover page
instead of the launcher; opening its Settings and scrolling to the bottom
corner reveals the way into `app/`.

## Run locally

```sh
python3 tools/serve.py --port 8000 --no-browser
```

Open <http://localhost:8000/>. The server supplies cross-origin isolation
headers for the WASM builds; `--host` and `--port` change the address. The same
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

npm i jsdom                              # enables the live-DOM group
node tests/verify-offline.mjs            # 178 checks, all offline

npm i puppeteer-core                     # or set $BROWSER_PATH
node tests/browser-test.mjs              # optional live-browser pass
```

The checks cover the shell's local resources, the catalogue↔disk↔manifest
relationship, skins, theming and layout rules, the jsdom drive-through of the
launcher, and an end-to-end URL sweep through the real server.

## Fidelity notes

The recovered upstream files are documented sources, not proof of byte-for-byte
identity with the missing original unified build. Client artwork was recovered
from each corresponding upstream client favicon where available, so icons are
not necessarily byte-identical to the original artwork. Everything in the
catalogue is complete and playable offline.
