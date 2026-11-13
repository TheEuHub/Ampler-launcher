# Eaglercraft — complete reference

Everything gathered while building the Ampler Launcher: sources, links, data,
architecture, conventions, verification and pitfalls.

> Layout note: this reference predates the repository restructure. The launcher
> now lives in `app/` (document root, with recovered clients in `app/mc/`), the
> scripts in `tools/`, the split archive in `archive/` and the retained
> originals in `source/`.

- Repository: https://github.com/Math-halper/Ampler-launcher
- Branch: `arena/ddf097d1-ampler-launcher` (from `06e5fc90`), open PR → `main`
- HEAD at time of writing: `c86ce8e` · verifier: **186 checks, 0 failures**
- Archive: `mc/` — 89 folders, 2.9 GB, 112 `index.html`, 113 catalogue rows

---

# 1 · LINKS

## 1.1 This project and the six source launchers

| Link | What came from it |
| --- | --- |
| https://github.com/Math-halper/Ampler-launcher | this repository |
| https://github.com/theveil-media/AmplerLauncher | catalogue structure, installation icons, themes, text scaling, launch modes, custom installations, credits, patch notes, FAQ, clear-storage; source of the EaglerForge payload |
| https://github.com/yummyfiles/Minecraft-Launcher | layout pass, mod selector, mod marketplace cards, per-version folders |
| https://github.com/Dev-subha-stack/minecraft-launcher | Mineforge/EaglerForge mod selector behaviour |
| https://github.com/gtrdhf/AmplerLauncher | fallback build materialisation list in `serve.py` |
| https://github.com/iEmaz/eagler-hacked-clients | modded client catalogue |
| https://github.com/irv77 (eaglercraft.ir pack, mirrored in-repo under `mc/ir/`) | 24 offline builds |

## 1.2 Client repositories consulted

| Link | Note |
| --- | --- |
| https://github.com/Eaglercraft-Archive/Resent-3.8_Patch-0-offline | Resent 3.8 offline source |
| https://github.com/krunchiekrunch/Resent4-Patch4 | Resent 4.0 |
| https://github.com/AspectFX/Resent-Client-Offline-Downloads | Resent downloads |
| https://github.com/resent5/resent5 | checked for audio — none |
| https://github.com/eaglerforge/EaglerForge-builds | EaglerForge v1.3.2 (`web/v1.3.2/`) — authoritative payload |
| https://github.com/eaglerforge/EaglerForgeInjector | mod-API injector for vanilla builds |
| https://github.com/eaglerforge/EaglerForge-old | older custom client |
| https://github.com/eaglerforge/eaglerforge.github.io | EaglerForge site |
| https://github.com/eaglerforge/EaglerForgeBuilderNew | visual mod builder |
| https://github.com/EaglerReborn/EaglerForge | original EaglerReborn plugin API (superseded) |
| https://github.com/JustLachin/eaglerforge | continuation of the PluginAPI |
| https://github.com/PeytonPlayz595/Shadow-4.0 | Shadow client (OptiFine, u34) |
| https://github.com/rusello25/EaglerForge-u48-1.8.8 | empty repo |

## 1.3 Colbster937

Profile https://github.com/colbster937 · site https://colbster937.dev ·
63 followers · orgs: [EaglerPorts](https://github.com/EaglerPorts),
[WebMCDevelopment](https://github.com/WebMCDevelopment),
[ZYPHERStudios](https://github.com/ZYPHERStudios),
[klashdevelopment](https://github.com/klashdevelopment).
Links on profile: https://webmc.xyz · https://tortillagames.org ·
https://zypher.club · https://dsc.webmc.fun

**EaglerPorts** — 10 repos, TeaVM ports of old versions, AGPL-3.0, credit
required. Site https://eaglerports.github.io/ — playable at
`eaglerports.github.io/<version>/`.

| Repository | Version | Play |
| --- | --- | --- |
| https://github.com/EaglerPorts/a1.0.16_02 | Alpha 1.0.16_02 | https://eaglerports.github.io/a1.0.16_02/ |
| https://github.com/EaglerPorts/a1.2.6 | Alpha 1.2.6 (27 tags, 42 commits) | https://eaglerports.github.io/a1.2.6/ |
| https://github.com/EaglerPorts/b1.3_01 | Beta 1.3_01 | https://eaglerports.github.io/b1.3_01/ |
| https://github.com/EaglerPorts/b1.6-tb3 | Beta 1.6 Test Build 3 | https://eaglerports.github.io/b1.6-tb3/ |
| https://github.com/EaglerPorts/b1.8.1 | Beta 1.8.1 | https://eaglerports.github.io/b1.8.1/ |
| https://github.com/EaglerPorts/in-20100223 | Indev 20100223 | https://eaglerports.github.io/in-20100223/ |
| https://github.com/EaglerPorts/1.2.5 | 1.2.5 | https://eaglerports.github.io/1.2.5/ |
| https://github.com/EaglerPorts/1.13.2 | 1.13.2 | https://eaglerports.github.io/1.13.2/ |
| https://github.com/EaglerPorts/betaProxy | WebSocket↔TCP bridge for TeaVM ports | — |
| https://github.com/EaglerPorts/eaglerports.github.io | the index site | https://eaglerports.github.io/ |

Pipeline: MCP workspace (`mcp/`, `resources/`, `scripts/`, `img/`) + Gradle with
two targets `target_teavm_javascript` / `target_teavm_wasm_gc`, built by
`CompileClient.sh|.bat` and a custom "eagler build plugin"; GitHub Actions
releases on every push, **tagged by commit SHA**, five assets each:
`dist_<sha>.zip`, `Eaglercraft_Offline_JS.html`, `Eaglercraft_Offline_WASM.html`
(plus two smaller). Latest a1.2.6 release `8742312` (10 Dec 2025):
zip 65,386,734 B / 97 downloads, JS html 23,130,688 B / 139,
WASM html 21,852,218 B / 159.
Example: https://github.com/EaglerPorts/a1.2.6/releases/latest

**His own repos** (63 total). Relevant:
https://github.com/colbster937/incari-client (fork; fully open-source modular
Eaglercraft client, v0.1.x, 39 commits, last 31 Oct 2026, WISP + custom skies,
module layout `client` `framework` `mesher` `net` `online` `patches`
`platform-api` `app-web` `app-desktop`) ·
https://github.com/incari-client/incari-client (upstream) ·
https://github.com/colbster937/c0.0.23a_01 (static Classic 0.0.23a_01 wrapper →
https://c23a.pages.dev/) ·
https://github.com/colbster937/eaglercraft-1.14-workspace ·
https://github.com/colbster937/eaglerxserver ·
https://github.com/colbster937/EaglerXPaper ·
https://github.com/colbster937/TuffServerList ·
https://github.com/colbster937/mcpe ·
https://github.com/colbster937/teavm-javac ·
https://github.com/colbster937/ayunViaProxyEagUtils ·
https://github.com/colbster937/EagsRelay ·
https://github.com/colbster937/eagler-server-velocity.
Non-Eaglercraft forks (for completeness): Multiverse-1.21.11-BACKPORT,
Better-Friends, java-mirror, vitrail-shaders, metallum, meteor-client,
CreativeCrafting, maven-nms-core-ext, squaremap, sdsh, java-util, noone-wlib,
klash-mvn, hekate-cb, Floodgate, scdmm, relauncher, devins-badges,
UI-Utils-Reborn-Continued, EssentialsX-Target-Selectors, Auto-GUI-Scale,
Spotlight-NET, nomotd, LimboAuth, NSMB-MarioVsLuigi, testescape-js, fastplace,
starscript, M1, crystaelix-loom, qMonstatek, qFlipper, ViaBackwards,
k-id-age-verifier, hytale-dev-gradle-plugin, uberbukkit, PAPI-SmallCaps-Expansion,
btnposfix, DABRCS, CanvasMC-Docs, BungeeProxy.

**WebMCDevelopment** — 23 repos: https://github.com/WebMCDevelopment/mcraft ·
/wispcraft · /EaglerRelayJS · /wlib · /WPicoLobby · /Project-Poseidon ·
/WebMCUberBukkit · /eaglerxserver · /originblacklist · /TuffX-Plugin ·
/GriefPreventionWebMC · /asl-eagler-hook · /maintenance-eagler-hook ·
/ayunViaProxyEagUtils · /continuous-music · /hibernate-fabric · /Caramel ·
/LegacyTweaks · /prismarinejs-net-browserify · /GPExpansionWebMC · /EAGS ·
/yeeloader-releases · /WebMCDesktop

## 1.4 Upstream ecosystem

| Link | What |
| --- | --- |
| https://github.com/lax1dude/eaglercraftx | EaglercraftX source |
| https://github.com/lax1dude/eaglerxserver | reference WebSocket server |
| https://github.com/PlanetDogeCodes/EaglerXPaper | Paper compatibility |
| https://github.com/Cirsius/eagler-server-velocity | Velocity template |
| https://github.com/ayunami2000/ayunViaProxyEagUtils | ViaProxy support |
| https://github.com/WebMCDevelopment/EaglerRelayJS | TS relay |
| https://github.com/konsoletyper/teavm-javac | Java compiler in browser |
| https://github.com/Eagler-Versions/eaglercraft-1.14-workspace | 1.14 workspace |
| https://eaglercraft.ir/downloads/ | original version table (unreachable from here) |
| https://api.webmc.xyz/script/b.js | remote script inside `mc/1.17.1-wasm` |
| https://mc17.pages.dev/6687912f-3432-4ac2-a90a-b654e0fe2124 | remote script inside `mc/1.17.1-wasm` |
| https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer | why COOP/COEP matter |

---

# 2 · WHAT EAGLERCRAFT IS

Minecraft: Java Edition compiled to JavaScript/WASM, running in a tab with no
install. Java sources + Eaglercraft patches (WebGL rendering, Web Audio,
IndexedDB worlds, WebSocket networking), translated by **TeaVM**.

## 2.1 Two compiler targets

| Target | Artefacts | Character |
| --- | --- | --- |
| TeaVM JavaScript | one `classes.js`, 2–85 MB | universal, parseable, no special headers |
| TeaVM WebAssembly-GC | `classes.wasm` + `eagruntime.js`, or embedded | smaller/faster, **needs cross-origin isolation** |

Archive split: **62 JS · 48 WASM**. A WASM build without
`Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: credentialless` shows a blank canvas — the most
common "white screen" in the ecosystem, and why `serve.py` sends both headers.

## 2.2 Four packaging shapes

| Shape | Count | Description |
| --- | --- | --- |
| single-file HTML | 102 / 110 | page *is* the game, payload inlined, 1–86 MB |
| split files | 6 | small page + `classes.js` + `assets.epk` (`c0.30`, `beta-1.0`, `beta-1.2`, `beta-1.4`, `infdev`, `Modern Client`) |
| split parts | 1 | `mc/1.17.1-wasm`: `*.part0…N` + `{"split":true,"parts":N}`, reassembled in a worker |
| modular | 1 | `mc/Eaglerforge`: loose runtime + `mods/` |

## 2.3 Runtime contract

`window.eaglercraftXOpts` before the engine loads: `container`, `worldsDB`,
`assetsURI`, `localesURI`, `servers`, `relays`, `demoMode`, `allowBootMenu`,
`enableMinceraft`, `allowFNAWSkins`, `allowServerRedirects`, `logInvalidCerts`,
`Mods`. No copy in the archive ships `lang/`; none needs it.
Classic relay trio: `relay.deev.is`, `relay.lax1dude.net`, community relay.

**Userscripts**: `?userscript=<file>` → injects `js/userscript/<file>` after a
warning; `mc/1.8.8/js/loader.js` whitelists exactly
`flameddogo99-eaglermobile.js`, `irv77-eaglercraft-mobile.js`,
`irv77-eaglerconsole.js` (the third backs "Red's Controller Support").

---

# 3 · MODS (Eaglercraft's modding layer)

## 3.1 How moddability exists at all

No plugin system in the engine. **EaglerForge** is injected at *build* time:

```
index.html → ModAPI.js → ModLoader.js → ModGUI.js → classes.js
ModAPI.js     window.ModAPI: event bus + globals bag, version string
ModLoader.js  sources: eaglercraftXOpts.Mods, ?Mod= params, localStorage["ml::Mods"]
ModGUI.js     in-game mod list, toggles, per-mod settings
mods/*.js     plain scripts: ModAPI.addEventListener('event', cb)
```

- A mod is **plain JavaScript** — no jar, no manifest, no dependency resolution.
- State lives in `ModAPI.globals`; a mod absent from the menu threw in `initAPI`.
- Load order = array order in `ml::Mods`; conflicting patches resolve last-wins,
  silently.
- Injection is a build step ⇒ **a single-file build can never become moddable**.
  Hence `mc/Eaglerforge` stays loose and is the only Modketplace target.

## 3.2 The launcher's mod path

Catalogue: `assets/json/mods.json` — 22 entries:

```json
{ "title": "Auto Clicker", "author": "Radmanplays",
  "description": "Automatically clicks for you",
  "icon": "./assets/images/mod-icons/cursor.png",
  "link": "auto-clicker.js", "active": false }
```

- `link` is a **filename inside `mc/Eaglerforge/mods/`**, never a URL.
- **Toggle** writes the filename to `localStorage["modslauncher"]`. On boot
  `ModAPI.js` (patched for this project) normalises each to `mods/<file>`,
  dedupes the `./`/`mods/` prefix, and rewrites `localStorage["ml::Mods"]`,
  then logs `MOD(S) ADDED!`. `ModLoader.js` loads from `ml::Mods`. The launcher
  never edits client files.
- **Download** saves the raw `.js` without touching the toggle.
- Known mod files: `auto-clicker.js`, `auto-login.js`, `auto-respawn.js`,
  `stats.js` (1,136,666 B in the yummyfiles tree), plus 18 more in `mods.json`.
- Verifier enforces: every catalogued file exists in `mods/`, every card has a
  Download button, each button resolves to a shipped file.

## 3.3 Modded clients in the archive (35 rows)

| Base | Clients |
| --- | --- |
| 1.8.8 | Aero v1.4 · Astra v1.6.0 (+WASM) · Astra Client 2 · EB Client (u53) · EB Client 1.8.8 · Eclipse v2.0 · EFI Client · Eaglerforge v1.3.2 · Mineforge v1.3.2 · Huzzium v1.2 · Modern Client v1.1 (WASM-GC) · Myven v1.6 · PixelClient v2.1.4 (+WASM) · Precision v1.3 · Reflex v1.0 · Resent v4.0 · Resent 3.8 · Shadow v4.5-u34 · Starlike v0.4.2 · The Broken Script · Tuff Client Beta (1.12.2b3) · Winston Horror v1.0 · Z-Client 1.11 |
| 1.12.2 | EFI Client · Kozmo v1.0 · Larp Client · PixelClient v2.1.4 (+WASM) · Tuff Client v1.1UT13 (+WASM) |
| 1.14.4 | EB Client · Larp Client |
| 1.6.4 | Forge 1.6.4 |

Notes: 1.8.8 is the centre of gravity (last official target, most stable under
TeaVM, every modding API assumes it). Clients are frozen forks — one built on
`u34` never gains `u53` fixes. Eaglerforge and Mineforge are **the same copy**;
Mineforge is an alias.

---

# 4 · THE ARCHIVE (`mc/`)

89 folders, 2.9 GB, 112 `index.html`, 113 rows over 110 distinct copies.
`mc/ir/` = 24 builds from the eaglercraft.ir offline pack. `mc/4k` (66 KB, Java
4k port) is intentionally uncatalogued, as is `mc/1.8.8-wasm`.

## 4.1 Base (55)

| Folder | Shown as | Version | Engine | MB |
| --- | --- | --- | --- | --- |
| `mc/ir/1.12.2` | Latest release | 1.12.2 | JS | 31.5 |
| `mc/ir/1.12.2-wasm` | Latest release WASM | 1.12.2-wasm | WASM | 20.1 |
| `mc/ir/1.8.8` | Previous release | 1.8.8 | JS | 18.0 |
| `mc/ir/1.8.8-wasm` | Previous release WASM | 1.8.8-wasm | WASM | 15.1 |
| `mc/ir/1.5.2` | Older release | 1.5.2 | JS | 26.4 |
| `mc/ir/1.6.4` | — | 1.6.4 | JS | 30.1 |
| `mc/ir/1.2.5` | — | 1.2.5 | JS | 6.3 |
| `mc/26.2-wasm` | Eaglercraft 26.2 WASM | 26.2-wasm | WASM | 75.5 |
| `mc/26.1.2-wasm` | 26.1.2 WASM | 26.1.2-wasm | WASM | 65.7 |
| `mc/1.21.11-wasm` | 1.21.11 WASM | 1.21.11-wasm | WASM | 48.8 |
| `mc/1.20.6-wasm` | 1.20.6 WASM | 1.20.6-wasm | WASM | 55.6 |
| `mc/1.17.1-wasm` | 1.17.1 WASM | 1.17.1-wasm | WASM | 120.6 (split parts) |
| `mc/1.16.5` | 1.16.5 | 1.16.5 | JS | 46.6 |
| `mc/1.16.5-wasm` | 1.16.5 WASM | 1.16.5-wasm | WASM | 53.1 |
| `mc/1.14.4` | 1.14.4 | 1.14.4 | JS | 55.4 |
| `mc/1.14.4-wasm` | 1.14.4 WASM | 1.14.4-wasm | WASM | 36.0 |
| `mc/1.13.2` | 1.13.2 | 1.13.2 | JS | 68.6 |
| `mc/1.13.2-wasm` | 1.13.2 WASM | 1.13.2-wasm | WASM | 54.2 |
| `mc/1.7.10` | 1.7.10 | 1.7.10 | JS | 18.5 |
| `mc/1.7.10-wasm` | 1.7.10 WASM | 1.7.10-wasm | WASM | 12.2 |
| `mc/1.4.7` | 1.4.7 | 1.4.7 | JS | 67.6 |
| `mc/1.4.7-wasm` | 1.4.7 WASM | 1.4.7-wasm | WASM | 39.5 |
| `mc/1.3.2-wasm` | 1.3.2 WASM | 1.3.2-wasm | WASM | 28.9 |
| `mc/1.2.5-wasm` | 1.2.5 WASM | 1.2.5-wasm | WASM | 23.9 |
| `mc/1.2.3` | 1.2.3 | 1.2.3 | JS | 28.0 |
| `mc/1.2.3-wasm` | 1.2.3 WASM | 1.2.3-wasm | WASM | 23.9 |
| `mc/1.1` | 1.1 | 1.1 | JS | 8.2 |
| `mc/1.0` | 1.0 | 1.0 | JS | 25.3 |
| `mc/c0.30` | Classic 0.30 | c0.30 | JS | 3.8 (split files) |
| `mc/ir/classic-0.3.0-wasm` | Classic 0.30 WASM | c0.30-wasm | WASM | 3.7 |
| `mc/classic-0.0.25a-05-wasm` | Classic 0.0.25a-05 WASM | — | WASM | 10.0 |
| `mc/classic-0.0.24a-03-wasm` | 0.0.24a-03 WASM | — | WASM | 10.0 |
| `mc/classic-0.0.23a-01-wasm` | 0.0.23a-01 WASM | — | WASM | 10.0 |
| `mc/classic-0.0.22a-05-wasm` | 0.0.22a-05 WASM | — | WASM | 10.0 |
| `mc/classic-0.0.21a-wasm` | 0.0.21a WASM | — | WASM | 1.1 |
| `mc/classic-0.0.20a-02-wasm` | 0.0.20a-02 WASM | — | WASM | 1.1 |
| `mc/classic-0.0.19a-06-wasm` | 0.0.19a-06 WASM | — | WASM | 1.1 |
| `mc/classic-0.0.18a-02-wasm` | 0.0.18a-02 WASM | — | WASM | 1.1 |
| `mc/classic-0.0.17a-wasm` | 0.0.17a WASM | — | WASM | 1.1 |
| `mc/classic-0.0.16a-02-wasm` | 0.0.16a-02 WASM | — | WASM | 1.1 |
| `mc/classic-0.0.15a-wasm` | 0.0.15a WASM | — | WASM | 1.0 |
| `mc/classic-0.0.14a-08-wasm` | 0.0.14a-08 WASM | — | WASM | 1.0 |
| `mc/classic-0.0.13a-03-wasm` | 0.0.13a-03 WASM | — | WASM | 1.0 |
| `mc/classic-0.0.12a-03-wasm` | 0.0.12a-03 WASM | — | WASM | 1.0 |
| `mc/classic-0.0.11a-wasm` | 0.0.11a WASM | — | WASM | 1.0 |
| `mc/indev` | Eaglercraft Indev | indev | JS | 1.2 |
| `mc/indev-20100223-wasm` | Indev 20100223 WASM | — | WASM | 21.3 |
| `mc/indev-20100219-wasm` | Indev 20100219 WASM | — | WASM | 21.2 |
| `mc/infdev` | Eaglercraft Infdev | infdev | JS | 2.3 (split files) |
| `mc/infdev-wasm` | Infdev WASM | infdev-wasm | WASM | 1.4 |
| `mc/pre-classic-rd-161348-wasm` | Pre-Classic rd-161348 WASM | — | WASM | 1.0 |
| `mc/pre-classic-rd-160052-wasm` | rd-160052 WASM | — | WASM | 1.0 |
| `mc/pre-classic-rd-132328-wasm` | rd-132328 WASM | — | WASM | 1.0 |
| `mc/pre-classic-rd-132211-wasm` | rd-132211 WASM | — | WASM | 0.9 |
| `mc/pre-classic-rd-131655-wasm` | rd-131655 WASM | — | WASM | 0.9 |

## 4.2 Alpha (6)

| Folder | Shown as | Version | Engine | MB |
| --- | --- | --- | --- | --- |
| `mc/ir/alpha-1.2.6` | Alpha 1.2.6 | a1.2.6 | JS | 8.6 |
| `mc/alpha-1.1.2_01` | Alpha 1.1.2 | a1.1.2_01-25w20b | JS | 34.4 |
| `mc/alpha-1.0.16_02-wasm` | Alpha 1.0.16_02 WASM | a1.0.16_02-wasm | WASM | 20.4 |
| `mc/alpha-1.0.6_03` | Alpha 1.0.6_03 | a1.0.6_03 | JS | 43.8 |
| `mc/alpha-1.0.4` | Alpha 1.0.4 | a1.0.4 | JS | 2.3 |
| `mc/alpha-1.0.1_01` | Alpha 1.0.1_01 | a1.0.1_01 | JS | 2.3 |

## 4.3 Beta (14)

| Folder | Shown as | Version | Engine | MB |
| --- | --- | --- | --- | --- |
| `mc/ir/beta-1.7.3` | Beta 1.7.3 | b1.7.3 | JS | 16.4 |
| `mc/beta-1.6.4` | Beta 1.6.4 | b1.6.4 | JS | 37.9 |
| `mc/beta-1.5` | Beta 1.5 | b1.5 | JS | 18.8 |
| `mc/beta-1.4` | Beta 1.4 | b1.4_01-25w21b | JS | 29.9 (split) |
| `mc/ir/beta-1.3` | Beta 1.3 | b1.3 | JS | 4.5 |
| `mc/beta-1.3-wasm` | Beta 1.3 WASM | b1.3-wasm | WASM | 20.8 |
| `mc/beta-1.2` | Beta 1.2 | b1.2 | JS | 28.9 (split) |
| `mc/ir/beta-1.1` | Beta 1.1 | b1.1 | JS | 24.4 |
| `mc/beta-1.0` | Beta 1.0 | b1.0 | JS | 19.4 (split) |
| `mc/beta-1.0.2` | Beta 1.0.2 | b1.0.2 | JS | 2.1 |
| `mc/beta-1.9` | Beta 1.9 | b1.9 | JS | 25.8 |
| `mc/beta-1.9-wasm` | Beta 1.9 WASM | b1.9-wasm | WASM | 23.7 |
| `mc/beta-1.8.1` | Beta 1.8.1 | b1.8.1 | JS | 25.1 |
| `mc/beta-1.8.1-wasm` | Beta 1.8.1 WASM | b1.8.1-wasm | WASM | 21.7 |

## 4.4 Modded (35)

| Folder | Shown as | Version | Engine | MB |
| --- | --- | --- | --- | --- |
| `mc/ir/astra-client` | Astra Client | 1.8.8-v1.6.0 | JS | 70.5 |
| `mc/ir/astra-client-wasm` | Astra Client WASM | 1.8.8-v1.6.0-wasm | WASM | 59.2 |
| `mc/Astra Client 2-1.8.8` | Astra Client 2 | 1.8.8 | JS | 39.3 |
| `mc/Aero Client` | Aero Client | 1.8.8-v1.4 | JS | 42.9 |
| `mc/EB Client` | EB Client | 1.8.8-u53 | JS | 23.6 |
| `mc/EB Client 1.8.8` | EB Client 1.8.8 | 1.8.8 | JS | 22.2 |
| `mc/EB Client 1.14.4` | EB Client 1.14.4 | 1.14.4 | JS | 42.3 |
| `mc/Eaglerforge` | Eaglerforge + Mineforge | 1.8.8-v1.3.2 | JS | 39.7 (modular) |
| `mc/Eclipse Client` | Eclipse Client | 1.8.8-v2.0 | JS | 47.9 |
| `mc/efi-1.8.8` | EFI Client 1.8.8 | 1.8.8 | JS | 78.5 |
| `mc/efi-1.12.2` | EFI Client 1.12.2 | 1.12.2 | JS | 85.5 |
| `mc/Forge 1.6.4` | Forge 1.6.4 | 1.6.4 | JS | 71.2 |
| `mc/Huzzium Client` | Huzzium Client | 1.8.8-v1.2 | JS | 16.3 |
| `mc/Kozmo Client` | Kozmo Client | 1.12.2-v1.0 | JS | 68.7 |
| `mc/Larp Client 1.12.2` | Larp Client 1.12.2 | 1.12.2 | JS | 25.2 |
| `mc/Larp Client 1.14.4` | Larp Client 1.14.4 | 1.14.4 | JS | 44.0 |
| `mc/Modern Client` | Modern Client | 1.8.8-v1.1 | WASM | 45.2 (split files) |
| `mc/Myven Client` | Myven Client | 1.8.8-v1.6 | JS | 85.9 |
| `mc/ir/pixelclient-1.8.8` | PixelClient 1.8.8 | 1.8.8-v2.1.4 | JS | 30.6 |
| `mc/ir/pixelclient-1.8.8-wasm` | PixelClient 1.8.8 WASM | 1.8.8-v2.1.4-wasm | WASM | 17.5 |
| `mc/ir/pixelclient-1.12.2` | PixelClient | 1.12.2-v2.1.4 | JS | 34.2 |
| `mc/ir/pixelclient-1.12.2-wasm` | PixelClient 1.12.2 WASM | 1.12.2-v2.1.4-wasm | WASM | 22.6 |
| `mc/Precision Client` | Precision Client | 1.8.8-v1.3 | JS | 33.7 |
| `mc/Reflex Client` | Reflex Client | 1.8.8-v1.0 | JS | 26.2 |
| `mc/ir/resent-client` | Resent Client | 1.8.8-v4.0 | JS | 33.0 |
| `mc/ir/resent-client-3.8` | Resent Client 3.8 | 1.8.8-v3.8 | JS | 35.1 |
| `mc/Shadow Network` | Shadow Client | 1.8.8-v4.5-u34 | JS | 50.2 |
| `mc/ir/starlike-client` | Starlike | 1.8.8-v0.4.2 | JS | 33.0 |
| `mc/The Broken Script 1.8.8` | The Broken Script | 1.8.8 | JS | 61.9 |
| `mc/Tuff Client` | Tuff Client | 1.12.2-v1.1UT13 | JS | 34.0 |
| `mc/ir/tuff-client-1.12.2-wasm` | Tuff Client WASM | 1.12.2-v1.1UT13-wasm | WASM | 34.0 |
| `mc/Tuff Client Beta` | Tuff Client Beta | 1.12.2-beta3 | JS | 30.9 |
| `mc/ir/winston-horror` | Winston Horror | 1.8.8-v1.0 | JS | 27.0 |
| `mc/ir/z1.11` | Z-Client 1.11 | 1.8.8-v1.11 | JS | 26.0 |
| `mc/beta-1.6.4` alias | — | — | — | (Beta 1.6.4 doubles as the modded base) |

## 4.5 Assisted (3) — one build, three userscripts

`mc/1.8.8` (18.0 MB, plus `js/loader.js` and `js/userscript/`):
FlamedDogo's Mobile UI `1.8.8-v3.0.5b` ·
Red's Mobile UI `1.8.8-v1.40` ·
Red's Controller Support `1.8.8-v1.1`
Links: `./mc/1.8.8/?userscript=<file>`.

---

# 5 · THE LAUNCHER

## 5.1 Files

```
index.html                              all screens in one shell
assets/css/style.css                    tokens, eight themes, components
assets/css/screensize.css               breakpoints; phone block is px-only, last
assets/js/index.js                      routing, catalogues, dropdown, mods, settings
assets/js/skinsview.js | skins.js       skins screen + data
assets/js/jszip-local.js                zero-dep zip writer
assets/js/wispcraft.js                  WISP tunnel (shipped, no UI)
assets/json/*.json                      eleven catalogues
assets/images/{mc-icons,client-icons,mod-icons,credits,icons}/
assets/website/tools/serve.py           server: isolation headers, skins listing
assets/website/tools/verify-offline.mjs 186 checks
assets/website/tools/bake-skins.py      manifest regeneration
assets/website/tools/browser-test.mjs   optional headless pass
mc/                                     builds
mc/README.md                            archive documented per folder
```

## 5.2 Catalogues

| File | Rows |
| --- | --- |
| `base.json` | 55 |
| `beta.json` | 14 |
| `alpha.json` | 6 |
| `modded.json` | 35 |
| `assisted.json` | 3 |
| `mods.json` | 22 |
| `icons.json` | 18 |
| `patchnotes.json` | 15 (head `v1.5.06`) |
| `faqs.json` | 5 |
| `credits.json` | 11 |
| `launchers.json` | 3 presets |

Row schema: `title, version, icon, link, path, active`. Icon must exist on disk.

## 5.3 Screens

Rail order: What's New → Play → Mods → FAQ → Installations → Skins → Patch
Notes → Servers → Downloads. Header tabs in all but Credits and Settings.
Installations = manager (presets Web/Modded/Mobile-controller, green row hover,
**no launch bar**). Custom Installations = play area, only the user's builds, no
edition headings, equal-size boxes.

## 5.4 Themes and modes

Eight themes: Default (Emerald), Redstone, Lapis, Amethyst, Gold, Midnight, Neon,
White. Each restates the whole token set. White = dark chrome + white accent:

```
--ml-chrome #17171a   --ml-bar #141416   --ml-rail #1a1a1d
--ml-panel #1e1e22    --ml-card #232327  --ml-card-hover #2f2f35
--ml-border #3c3c44   --ml-selected #4a4a54
--ui-select #e6e6e9   --ui-select-bright #ffffff
--text-secondary #e8e8ea   ink over accents #111114
```

Five launch modes: `same`, `tab`, `popup`, `blob`, `data-uri`. `about:blank`
cloak removed permanently; unknown values fall back to `tab`. `data-uri` uses a
`document.write` fallback because browsers block top-level `data:` navigation.

## 5.5 Geometry tokens

`--sidebar-w 18vw`, `--header-h 3.5vw`, `--tabstrip-h 3.22vw`,
`--chrome-h 6.72vw`, `--bar-h 5.6vw`, `--gutter 3vw`. At ≤1100 px only
`--sidebar-w 5.5vw` and `--bar-h 6.2vw` change. Phone block: 54 / 56 / 35 / 91 /
64 / 14 px, px-only, single query at end of `screensize.css`.
Version selector: `left: 0`, right-only radius, `bottom: var(--bar-h)`,
icon+arrow pinned, text collapses to `…`; menu width mirrors the selector.

## 5.6 Behaviour notes

- Clear Local Storage: red, `@keyframes clearFlash` 0.6 s steps on hover,
  excluded from the green CTA hover group.
- Mod grid: `grid-auto-rows: 1fr`, cards `height: 100%`, equal to the tallest.
- Quick Stats (playtime, sessions, FPS Boost) toggleable via `#showstats`,
  keys `hideStats`, functions `statsHidden()/togglestats()/togglestatscard()`.
- Theme boot maps legacy `light` → `white`.
- Downloads packages any client as standalone `.html` or `.zip` in-browser.

## 5.7 Server

`python3 assets/website/tools/serve.py` — `Cross-Origin-Opener-Policy:
same-origin`, `Cross-Origin-Embedder-Policy: credentialless`,
`Cross-Origin-Resource-Policy: cross-origin`, `Cache-Control: no-cache`; resolves
directories with and without trailing slash, case-insensitive `mc/` lookup,
falls back to `.cache/mc/` and then to `/tmp/repos/{theveil-media_AmplerLauncher,
Dev-subha-stack_minecraft-launcher,gtrdhf_AmplerLauncher}`, then to
`mc/Eaglerforge` or `mc/1.12.2-wasm`; serves a live skins listing at the skins
manifest path.

---

# 6 · WORK DONE IN THIS REPOSITORY

| Commit | What |
| --- | --- |
| `0f1f576` … | initial build pass (v2–v8): layout, themes, launches, skins, servers, downloads |
| `13b35aa` | IR drop (24 `mc/ir/` builds) |
| `1fbe970` | modded ordering |
| `4082ec5` | Better Eagler removed entirely |
| `63ebf04` | Resent 3.8 added |
| `1cd2c8a` | Installations split into manager + play area |
| `938c1ca` | alignment pass — 178/178 |
| `1674d51` | docs rewritten in neutral third person, self-hosting sections dropped |
| `6deb36e` | EaglerForge payload restored, two favicons added, per-build health checks, `mc/README.md` |
| `c86ce8e` | wording tidy, server path correction |

Verifier history: 142 → 155 → 166 → 172 → 174 → 177 → 178 → 180 → 184 → **186**.

## 6.1 The bug that mattered

`mc/Eaglerforge` shipped `index.html`, `ModAPI.js`, `ModLoader.js`, `ModGUI.js`,
`mods/` and `favicon.png` — but **no `classes.js`, no `assets.epk`, no `lang/`**.
It backs two rows (Eaglerforge, Mineforge), so two entries sat on a loader with
no engine: permanent blank canvas. Fixed with payload from
`theveil-media/AmplerLauncher`:

- `classes.js` — Git blob `3768b3c6db184e5f639ee0ba7add69ed20f5e648`,
  31,207,437 B, SHA-1 verified, `node --check` clean
- `assets.epk` — Git blob `b64b679ebc3a4b31cf50ee315165b412bf1d1eaa`,
  7,217,909 B, SHA-1 verified
- upstream `ModAPI.js` blob `4921e1d659539666d1828fcd97deb02c9c0b93b0` (3,396 B);
  ours adds the `modslauncher` → `ml::Mods` sync block
- `mc/ir/resent-client-3.8/favicon.png` and `mc/beta-1.0/favicon.png` added

Genuine breakage across 113 rows: **this one folder, plus two missing favicons.**
All other pages returned 200 with complete local dependencies. An earlier "19
stubs + 2 dead links" list was a scanner bug (un-encoded folder names).

---

# 7 · VERIFICATION

`node assets/website/tools/verify-offline.mjs` — 186 checks, eight groups:
transport · no-404s + per-build health · geometry/CSS/themes · catalogues ·
skins · jsdom launcher drive · `serve.py` headers · global wording rules.

Per-build health asserts, for every catalogued copy: `index.html` exists; every
`src`/`href` in it resolves beside it; ≥ 400 KB engine payload somewhere in the
folder; `mc/Eaglerforge` has all six runtime files; `mc/README.md` documents the
folder.

Gotchas: §3 has **no `assert`** (use `check/ok/bad`); the CSS parser exposes
`selectors` (array); run from repo root with `jsdom`; dropdown always holds one
extra `.emptyOption` (expected count = catalogue + 1); `.cache/` never survives a
clone, so checks use `d`; `decodeURIComponent` before any `mc/` path check.

---

# 8 · GAPS AND NEXT STEPS

1. `EAGLERCRAFT.md` (this file) is not committed and has no verifier check.
2. Missing twins from EaglerPorts releases: JS for `a1.0.16_02`, `a1.2.6`,
   `b1.3_01`, `in-20100223`; and Beta 1.6 Test Build 3 (`b1.6-tb3`) entirely.
3. `mc/4k` and `mc/1.8.8-wasm` uncatalogued.
4. Mineforge is an alias of Eaglerforge, not a distinct engine.
5. The three assisted rows are one build differing by userscript only.
6. `incari-client` is a candidate modded entry (verify a launchable build first).
7. `mc/1.17.1-wasm` is the only copy with remote scripts at launch.
8. Alpha/Beta ports only reach multiplayer through `betaProxy`.

---

# 9 · ENVIRONMENT PITFALLS

- `eaglercraft.ir` / `eaglercdn.ir` unreachable here; `raw.githubusercontent.com`
  fails TLS → use `api.github.com` and `/git/blobs/<sha>`.
- Blob SHA-1 formula: `sha1("blob <len>\0" + bytes)` — cheapest proof a
  downloaded file matches its source.
- A second `serve.py` on :8080 dies `[Errno 98]`; the first is live — `curl` it.
- `pgrep -f serve.py` matches its own command line.
- Always URL-encode folder names when scanning (`quote(..., safe='%/?=&')`) or
  every path with a space reports a false 404.
- Case-only renames collide; `const sidebar` in the verifier clashed with the page
  id → `sidebarIds`.
- `git rm -rq` exits 128 on untracked directories.
- `.cache/mc/*` is never snapshotted.
- No browser in the sandbox (no Chromium, no Playwright): "it launches" is proven
  statically — page, deps, payload size, byte-identical assets.
- `Arena cannot access this repository` = the GitHub repo is unreachable
  (renamed, private, or authentication needs refreshing); it blocks bash and file
  writes, not just git.
