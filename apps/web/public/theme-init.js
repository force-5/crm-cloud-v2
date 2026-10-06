/* Force 5 CRM — apply the saved colour theme before first paint.
 * Loaded synchronously from <head>; kept external because the CSP forbids inline scripts.
 * Valid values: "light" | "dark" | "system". Anything else (including the legacy "null"
 * string bug) is treated as "system" and removed from storage. */
(function () {
  var KEY = 'crm-theme';
  var theme = 'system';
  try {
    var stored = window.localStorage.getItem(KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      theme = stored;
    } else if (stored !== null) {
      window.localStorage.removeItem(KEY);
    }
  } catch (e) {
    /* storage blocked (private mode, policy) — fall back to system */
  }
  var dark = theme === 'dark';
  if (theme === 'system') {
    try {
      dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch (e) {
      dark = false;
    }
  }
  var root = document.documentElement;
  if (dark) root.classList.add('dark');
  else root.classList.remove('dark');
  root.style.colorScheme = dark ? 'dark' : 'light';
})();
