// Ampler Launcher - first-paint bootstrap
// ---------------------------------------------------------------------------
// Applies the saved theme, layout, text size and mode flags before the
// stylesheet paints, so there is no flash of the default theme.
//
// This used to be an inline <script> in index.html. It lives in its own file so
// the page can be served with a Content-Security-Policy of script-src 'self'.
// ---------------------------------------------------------------------------
try {
    var root = document.documentElement;
    if (localStorage.getItem("theme")) { root.dataset.theme = localStorage.getItem("theme"); }
    if (localStorage.getItem("layout")) { root.dataset.layout = localStorage.getItem("layout"); }
    if (localStorage.getItem("textscale")) { root.style.setProperty("--text-scale", localStorage.getItem("textscale")); }
    if (localStorage.getItem("mcBranding") === "true") { root.classList.add("mc-branding"); }
    if (localStorage.getItem("performanceMode") === "true") { root.classList.add("perf-mode"); }
    if (localStorage.getItem("fpsBoost") !== "false") { root.classList.add("fps-boost"); }
} catch (e) {}
