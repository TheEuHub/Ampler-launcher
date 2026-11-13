# source/ — original checkout material

The flat files the original upload shipped at the repository root now live in
their canonical places:

- `app/assets/css/` — `style.css`, `screensize.css`, `fonts.css`
- `app/assets/js/` — `index.js`, `skins.js`, `skinsview.js`, `jszip-local.js`,
  `wispcraft.js`
- `tools/` — `serve.py`, `bake-skins.py`, `browser-test.mjs`,
  `verify-offline.mjs`, `recover_clients.py`, `recover_upstream.py`,
  `start-offline.*`, `upstream-files.json`
- `tests/` — `test_integrity.py`
- `docs/` — `eaglercraft-reference.md`, `original-readme.md`

Identical copies were dropped, because `app/assets/` is the canonical copy.
This folder is kept only so the pre-restructure originals remain documented.
