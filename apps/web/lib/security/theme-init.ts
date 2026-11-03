/**
 * Applies the saved theme before first paint (dark is default). Also moves a pre-rename `sentra_theme` value once
 * (see lib/legacy-storage.ts). Theme is a UI preference, not account data.
 * Rendered as a plain inline <script> child (no dangerouslySetInnerHTML) and allowed by its SHA-256 hash in the CSP.
 */
export const THEME_INIT = `try{var s=localStorage,t=s.getItem('centurion_theme');if(t===null){t=s.getItem('sentra_theme');if(t!==null){s.setItem('centurion_theme',t);s.removeItem('sentra_theme')}}document.documentElement.dataset.theme=(t==='light'?'light':'dark')}catch(e){document.documentElement.dataset.theme='dark'}`;
