/**
 * Applies the saved theme before first paint. No saved choice follows the system preference.
 * Also moves a pre-rename `sentra_theme` value once
 * (see lib/legacy-storage.ts). Theme is a UI preference, not account data.
 * Rendered as a plain inline <script> child (no dangerouslySetInnerHTML) and allowed by its SHA-256 hash in the CSP.
 */
export const THEME_INIT = `try{var s=localStorage,t=s.getItem('centurion_theme');if(t===null){var o=s.getItem('sentra_theme');if(o!==null){s.setItem('centurion_theme',o);s.removeItem('sentra_theme');t=o}}var dark=window.matchMedia('(prefers-color-scheme: dark)').matches;var mode=t==='light'?'light':t==='dark'?'dark':(dark?'dark':'light');document.documentElement.dataset.theme=mode;document.documentElement.dataset.themeChoice=(t==='light'||t==='dark')?t:'system'}catch(e){document.documentElement.dataset.theme='dark'}`;
