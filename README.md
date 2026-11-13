# Ampler Launcher

Ampler is a browser launcher for a collection of Eaglercraft builds, with edition catalogs, installations, skins, settings, server listings and download tools. The interface incorporates work from the community projects credited in the launcher.

## Repository layout

```
index.html      forwards the bare repo URL to app/index.html (static hosting)
app/            the launcher itself - this directory is the document root
  index.html    the shell
  assets/       css, fonts, images, js, json catalogs, skins, server bundle
  mc/           recovered Eaglercraft clients (generated, git-ignored)
archive/        15-part client archive, all-1.zip ... all-15.zip (git-ignored)
source/         original checkout material, kept for reference only
docs/           reference notes and the original upstream README
tools/          server, recovery, verification and start scripts
tests/          integrity tests
```

Nothing outside `app/` is served. The root `index.html` exists only so a static
host rooted at the repository opens the launcher instead of a file listing; the
bundled server (`tools/serve.py`) already serves `app/` directly. `tools/` and `tests/` are developer scripts, `source/` holds the flat files the original upload shipped at the repository root, and `archive/` holds the split archive the recovery tool reassembles.

## Restore and run locally

The repository contains a 15-part archive with 23 standalone builds. Additional catalog versions, EaglerForge and controller files are recovered from the community projects documented in `docs/eaglercraft-reference.md`. The second recovery requires the GitHub CLI (`gh`) with access to public repositories, network access, and approximately 3 GB of additional disk space. Python 3 is required; no npm install is needed.

The archive parts are not tracked by Git. Put `all-1.zip` ... `all-15.zip` in `archive/` before the first recovery step, then:

```sh
python3 tools/recover_clients.py
python3 tools/recover_upstream.py
python3 tools/serve.py --port 8000 --no-browser
```

Open <http://localhost:8000/>. The server supplies cross-origin isolation headers for WASM. `--host` and `--port` change the server address. On a desktop the same thing can be started by double-clicking `tools/start-offline.sh`, `tools/start-offline.command` (macOS) or `tools/start-offline.bat` (Windows).

Recovered clients land in `app/mc/`, which is git-ignored and must be recovered again after a fresh checkout. The upstream recovery downloads 353 files from the exact Git blobs listed in `tools/upstream-files.json`, verifies their Git object hashes, and can be rerun to resume an interrupted download. Sources are theveil-media/AmplerLauncher (`3b503b5d90860e9242fb72b7aa54f2574e6d9c40`), gtrdhf/AmplerLauncher (`9e1e19779f859e601c5a6ce2f09ebd17b4ad3bff`), yummyfiles/Minecraft-Launcher (`b3785c581d6adc6fb27b81acc148e88aacb77db0`), and Eaglercraft-Archive/Resent-3.8_Patch-0-offline (`d439d4cd7498e49d9ffcf1783aa42dc083cfb4c5`). The tool creates an availability manifest only for complete, verified directories; the UI keeps missing or incomplete clients disabled.

## Remaining gaps

The recovered upstream files are documented sources, not proof of byte-for-byte identity with the missing original unified build. The uploaded files restored the two bundled skins, original fonts, local server source archive and website tooling. Client artwork was recovered from each corresponding upstream client favicon where available; these are not necessarily byte-identical to the original artwork. The original PixelClient PNG and the exact original unified `mc/` tree are still needed for a byte-for-byte restoration.

`source/` keeps the pre-restructure originals that differ from what the launcher now serves (see `source/README.md`); identical copies were dropped, because `app/assets/` is the canonical copy. Multi-file builds should be downloaded as ZIPs, not standalone HTML. The Downloads screen uses the recovery manifest to include their files.

## Verification

Run `python3 -m unittest discover -s tests` after both recovery steps. This checks archive-to-catalog relationships, recovered file checksums and essential assets; it does not certify gameplay or external multiplayer services.

Optional deeper checks:

```sh
npm i jsdom        # for the DOM pass
node tools/verify-offline.mjs

npm i puppeteer-core   # for the live-browser pass (or set $BROWSER_PATH)
node tools/browser-test.mjs
```

The restored offline starter scripts are in `tools/`. The included `app/assets/server/eaglerxserver-1.1.1-src.zip` is source code, not a runnable server jar.
