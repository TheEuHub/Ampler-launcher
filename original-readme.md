<!-- Historical document: the layout it describes (index.html and assets/ at the
     repository root, tooling in assets/website/tools/) predates the
     restructure; see the top-level README for the current layout. -->
<p align="center">
  <img src="./assets/images/logo.png" width="120" alt="Ampler Launcher" />
</p>

<h1 align="center">Ampler Launcher — Unified Edition (v1.5.06)</h1>

<p align="center">
  A single web launcher for Minecraft and Eaglercraft builds, assembled from six
  community projects into one interface.
</p>

---

## What this project is

Ampler Launcher is a browser application — one `index.html` plus CSS, JavaScript
and JSON — that collects Eaglercraft clients into one library and launches them.
The clients themselves are bundled next to it under `mc/`, so the launcher needs
no external service to start a game.

It was assembled by merging six community launchers (credited in
[Project lineage](#project-lineage)), keeping each project's strongest feature
and filling the gaps between them. Everything visible in the interface — icons,
artwork, catalogues, clients — is taken from those projects or from the clients
themselves; nothing is drawn or generated for the repository.

Beyond launching games, the launcher carries a mod marketplace, a skins library,
a live server browser, an offline download packager, patch notes, credits and a
settings screen.

The current release is **v1.5.06**, described in the launcher's own Patch Notes
screen.

## How it is meant to be served

The launcher assumes it is loaded over HTTP or HTTPS. It is not designed for
`file://`, and no feature is degraded to support it: the skins listing, the
download packager, the launch modes and the fonts all rely on ordinary web
requests.

Two consequences follow from that:

- **SharedArrayBuffer.** The WASM builds run at full speed when the response
  carries `Cross-Origin-Opener-Policy: same-origin` and
  `Cross-Origin-Embedder-Policy: credentialless`. The bundled server
  (`assets/website/tools/serve.py`) sends both.
- **Remote allowlist.** Only two remote origins are referenced — Google Fonts
  and the cdnjs JSZip build — and both are HTTPS. Each has a local fallback
  (`assets/fonts/`, `assets/js/jszip-local.js`), so the launcher keeps working
  when those origins are blocked.

## The interface at a glance

The window is a fixed side rail plus a main area. The rail holds the library
sections; the strip across the top of the main area holds the screens that belong
to a section.

### Side rail

| Entry | Opens |
| --- | --- |
| **What's New** | the newest patch note; the first block in the rail, level with the header |
| **EAGLERCRAFT: Web Edition** | the browser builds, 1.12.2 back to Classic |
| **EAGLERCRAFT: Mobile/Controller** | 1.8.8 builds with touch and gamepad userscripts |
| **EAGLERCRAFT: Modded Editions** | third-party clients, each with its real icon |
| **EAGLERCRAFT: Alpha Releases** | the alpha builds, marked with a monster spawner |
| **EAGLERCRAFT: Beta Releases** | the beta builds, marked with TNT |
| **CUSTOM: Installations** | the Play screen, limited to the installations you created |
| **Credits** | every source, creator and contribution |
| **Settings** | launch mode, default screen, appearance, text size, layout, username |

Block icons follow the same idea throughout: the newest release uses a grass
block, the previous one dirt, older ones coarse dirt, alpha a monster spawner and
beta TNT. WASM variants of those builds use the matching `-wasm` block, so a WASM
build is distinguishable from its JavaScript twin at a glance.

### Header strip

Eight tabs — **Play, Mods, FAQ, Installations, Skins, Patch Notes, Servers,
Downloads** — appear inside every section. Credits and Settings are the two
exceptions: they are rail destinations with no tabs of their own.

The strip never scrolls sideways. When the window is too narrow for every label,
they shrink and clip with an ellipsis instead of pushing the row wider.

### Launch bar

Screens that can start something carry a launch bar along the bottom: the build
selector on the left, the Play button in the centre, the username on the right.
The Play screen, the Installations manager and Custom Installations show it; the
browsing screens do not.

The selector opens a menu that is flush with the button — same left edge, same
width, sitting directly on the bar, never floating. Inside the button the block
icon is pinned left and the arrow pinned right, and a long name is clipped to
`…` rather than moving either of them.

### Screens

| Screen | Contents |
| --- | --- |
| **Play** | edition artwork, the launch bar, and the Quick Stats widget (playtime, sessions, an FPS-Boost toggle) |
| **Mods** | Modketplace: 22 EaglerForge mods, each box with a *Download .js* button |
| **FAQ** | five questions and answers |
| **Installations** | the manager: create or upload a build, and see every preset and personal build in one list |
| **Custom Installations** | the Play screen, scoped to personal builds |
| **Skins** | the skins library with canvas previews and one-click equip |
| **Patch Notes** | a release directory on the left, the selected note opened in place |
| **Servers** | live Eaglercraft server browser plus custom servers |
| **Downloads** | per-client `.html` and `.zip` packaging |
| **Credits** | one card per source; select a name for the full contribution list |
| **Settings** | launch mode, default screen, appearance, text size, layout, username |

Patch notes never open an overlay: the note replaces the release list in the main
area, and *Back to all versions* restores it.

## Installations, in two separate places

The two screens answer different questions on purpose.

**Installations** is the manager. It lists the presets of the Web, Modded and
Mobile/Controller editions together with every installation you have created, and
each row can be ticked to show or hide it in the version list. *New installation*
accepts three sources: a bundled build, a local `.html` file, or pasted HTML /
URL. Rename, Edit and Delete act on personal builds.

**Custom Installations** is a play area. It opens the same Play screen as the Web
Edition, but its selector lists only the installations you made — no presets, no
other sections. Selecting one points the launch bar at it. When nothing has been
created yet, the selector says so and Play is disabled rather than launching
something else.

Personal builds survive a reload: the HTML is kept in IndexedDB, with
localStorage as the fallback, and turned back into a blob URL on load. A pasted
URL is stored as a URL.

## Builds and catalogues

| Catalogue | Rows | What it holds |
| --- | --- | --- |
| `base.json` | 55 | releases, 1.12.2 back to the Classic and pre-Classic builds |
| `modded.json` | 35 | third-party clients, including Resent 4.0 and Resent 3.8 |
| `alpha.json` | 6 | alpha builds |
| `beta.json` | 14 | beta builds |
| `assisted.json` | 3 | 1.8.8 touch and gamepad editions |

That is 113 launchable entries. Alongside them: `mods.json` (22 mods), `faqs.json`
(5), `patchnotes.json` (15), `credits.json` (11), `icons.json` (18 launch
icons), `launchers.json` (3).

Every catalogue entry carries a title, a version, an on-disk icon and a link, and
a build is only listed when its folder actually contains an `index.html`. A menu
entry therefore cannot launch into a missing page.

### Where the clients live

```
mc/                  one folder per client, each with its own index.html
mc/ir/               24 builds from the official eaglercraft.ir offline pack
                     (PixelClient in four variants, Astra and Astra WASM, Resent
                     4.0 and 3.8, Starlike, Tuff WASM, Winston Horror, Z-Client
                     1.11 and the IR release ladder from Classic 0.30 to 1.12.2)
mc/Eaglerforge/      the EaglerForge client and the mods/ folder Modketplace serves
.cache/mc/           very large builds, kept out of Git and served transparently
```

The game tree is a single `mc/` directory. Anything that is too large to keep in
Git is resolved by the bundled server from `.cache/mc/`, so a catalogue entry
still resolves when its build is not committed.

## Modketplace

The Mods screen lists 22 EaglerForge mods. Each box is a toggle: click it to
enable or disable the mod, which writes both `modslauncher` and the
`ml::Mods` list that EaglerForge and Mineforge read on the next launch.

Every box also ends in a **Download .js** button. Pressing it saves that mod's own
file from `mc/Eaglerforge/mods/` to your machine, ready to drop into any
EaglerForge client's mods folder. The button is a separate control: pressing it
never changes whether the mod is enabled.

## Skins, servers and downloads

- **Skins** — a grid of the installed skins, one folder per skin under
  `assets/skins/`, with a 2D canvas preview for 64×64, 64×32 and 128×128 images.
  A skin can be equipped into the Eaglercraft profile, and the choice is mirrored
  into the profile keys the clients read.
- **Servers** — the screen polls each known relay with `Accept: MOTD` and shows
  the MOTD, player count, ping and the 64×64 server icon. Custom servers can be
  added, copied and joined.
- **Downloads** — any client can be packaged as a standalone `.html` file or a
  `.zip`, produced in the browser with the JSZip CDN build and a zero-dependency
  local writer as the fallback.

## Appearance and settings

Eight themes share the same layout: **Default (Emerald)**, Redstone, Lapis,
Amethyst, Gold, Midnight, Neon and Light. A theme restates the full colour-token
set rather than tinting the default, so surfaces, borders, text and the selected
state all change together and keep readable contrast.

Settings covers launch mode (`same`, `tab`, `blank`, `popup`, `blob`,
`data-uri`), the screen shown on startup, appearance, text size, interface layout
(Standard, Classic, Compact), username, master volume, performance mode,
auto-save, Minecraft branding and a clear-storage action. Volume, theme,
performance mode and auto-save sit inline in the Settings screen; the header
carries no extra buttons.

Every control keeps a visible accent-coloured selected state, and the labels are
real controls: tabs are `role="tab"` with `tabindex`, settings cards are
`role="button"` with `aria-pressed`, version rows are `role="option"`.

## Layout and sizing

The shell is driven by six measurements, so no screen can drift away from its
neighbours:

| Token | Meaning |
| --- | --- |
| `--sidebar-w` | the rail width; the main area is the window minus this |
| `--header-h` | the header's title row, the same height as the rail's What's New block |
| `--tabstrip-h` | the tab strip, including its bottom edge |
| `--chrome-h` | `--header-h` + `--tabstrip-h`; what every screen subtracts from the window |
| `--bar-h` | the launch bar, and the offset its menu drops out of |
| `--gutter` | the left and right content margin used by all nine screens |

`assets/css/screensize.css` changes only `--sidebar-w` and `--bar-h` below
1100px, and restates the same sizes in pixels for phones (54 / 56 / 35 / 91 / 64
/ 14). Everything else — panels, the selector, the dropdown, the phone launch bar
— follows from those tokens, so the layout stays in proportion at any window
size.

## Verification

```bash
npm i jsdom            # optional, enables the live DOM checks
node assets/website/tools/verify-offline.mjs
```

The suite runs 178 assertions in eight groups:

1. **Transport** — no plain-`http://` reference, every remote host on the
   allowlist, and the scanner proven live with a canary.
2. **No 404s** — every local `href`, `src` and `url()` resolves; every catalogue
   entry has a title, version, on-disk icon and a link to a build folder that
   exists under `mc/`.
3. **Geometry and CSS** — no `vw`/`px` mixes inside `max()`/`min()`, the phone
   rules form one px-only query at the end of `screensize.css`, every stylesheet
   exists exactly once under `assets/css/`, and the six measurements above are
   checked against each other: rail plus page fills the window, header plus tab
   strip equals `--chrome-h`, chrome plus launch bar equals the Play screen, all
   nine screens share one width, one height formula and one gutter, the version
   menu is flush with its selector, and the phone block resolves to whole pixels
   that still add up. All eight themes are checked for full token coverage and
   readable contrast (≥ 4.5:1 for body text, ≥ 3:1 for the selected state).
4. **Catalogues** — every list parses and matches the files on disk, including
   the *Download .js* button on each mod box.
5. **Skins** — the manifest matches the folders present.
6. **The launcher itself** — jsdom boots `index.html` with `index.js` and
   `skinsview.js` and a fetch stub reading from disk, then drives the rail order,
   editions, version picker, Modketplace toggles and downloads, FAQ, patch notes,
   the Installations manager, the Custom Installations play area, servers,
   downloads, skins, username, themes, text size, launch modes, default screen,
   layout, the stats widget, FPS Boost and branding.
7. **Served correctly** — the bundled server answers 200 for every local URL,
   sends the isolation headers, serves a live skins listing consistent with
   `bake-skins.py`, and resolves directory URLs with and without a trailing slash.
8. **Global rules** — no Discord wording, no proxy or WISP settings, no
   `file://` gates, white settings copy, every header tab present in every
   section, and no leftover GX-Launcher interface.

## Project lineage

Each of these projects supplied a part of the final launcher.

| Upstream | What it contributes |
| --- | --- |
| [Dev-subha-stack/minecraft-launcher](https://github.com/Dev-subha-stack/minecraft-launcher) | inline quick settings (theme, volume, performance mode, auto-save, branding), the Quick Stats widget, the EaglerForge mod auto-loader, the skin-profile mirror, Minecraft branding artwork |
| [gtrdhf/AmplerLauncher](https://github.com/gtrdhf/AmplerLauncher) | the live Eaglercraft server browser, and the 1.8.8 mobile/controller userscript builds |
| [theveil-media/AmplerLauncher](https://github.com/theveil-media/AmplerLauncher) | the catalogue structure, installation icons, themes, text scaling, the six launch modes, custom installations, credits, patch notes, FAQ, clear-storage |
| [yummyfiles/Minecraft-Launcher](https://github.com/yummyfiles/Minecraft-Launcher) | the installations manager, Modketplace UI, FAQ and patch-notes layouts, startup artwork |
| [proton-arcade/proton-arcade.github.io](https://github.com/proton-arcade/proton-arcade.github.io/tree/main/website/games/Ealgercraft/Ampler-Launcher) and [proton-arcade/AmplerLauncher](https://github.com/proton-arcade/AmplerLauncher) | the offline-first structure, the bundled single-file builds, the skins manager, responsive styles, keyboard and ARIA support, the self-hosted Roboto files, the bundled server and verification tooling |

Client builds come from the clients' own releases and from the official
eaglercraft.ir offline pack under `mc/ir/`. Every contributor is listed inside the
launcher, on the Credits screen.

## Repository map

```
index.html                                the shell: rail, header, tab strip, every view
assets/css/style.css                      all styling
assets/css/screensize.css                 compact layouts and the single phone breakpoint
assets/css/fonts.css                      @font-face rules for the bundled Roboto files
assets/fonts/                             Roboto 400/700 woff2, the offline font fallback
assets/js/index.js                        the controller: editions, views, mods, servers,
                                          downloads, settings, launch modes, installations
assets/js/skins.js                        the skins manifest
assets/js/skinsview.js                    skins grid, canvas previews, import, equip
assets/js/jszip-local.js                  zero-dependency ZIP writer used by Downloads
assets/js/wispcraft.js                    vendored WebSocket client, no UI, unused by default
assets/json/                              catalogues and lists (base, modded, assisted, alpha,
                                          beta, mods, faqs, patchnotes, credits, icons, launchers)
assets/images/                            every icon, title and background the interface paints
assets/skins/                             one folder per skin, plus the generated list.js
assets/server/                            EaglerXServer source archive and helper scripts
assets/website/tools/serve.py             the bundled server
assets/website/tools/verify-offline.mjs   the verification suite
assets/website/tools/bake-skins.py        regenerates assets/skins/list.js
assets/website/tools/browser-test.mjs     optional live-browser smoke test
mc/                                       the bundled clients, one folder each
mc/ir/                                    the eaglercraft.ir offline pack
```
