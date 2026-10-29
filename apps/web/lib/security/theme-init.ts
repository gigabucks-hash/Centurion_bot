/**
 * Applies the saved theme before first paint (dark is default). Theme is a UI preference, not account data.
 * Rendered as a plain inline <script> child (no dangerouslySetInnerHTML) and allowed by its SHA-256 hash in the CSP.
 */
export const THEME_INIT = `try{var t=localStorage.getItem('sentra_theme');document.documentElement.dataset.theme=(t==='light'?'light':'dark')}catch(e){document.documentElement.dataset.theme='dark'}`;
