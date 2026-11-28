// Builds a browser preview of the app with NO install of Expo or React Native.
// React Native, the Expo packages and the Firebase SDK are swapped for small stand-ins in
// ./shims, so the real screens, state and engine can be driven by tests/flows.py.
//
//   node tools/preview/build.mjs                      web adapter, fake Firebase configured
//   node tools/preview/build.mjs --firebase off       web adapter, Firebase not configured
//   node tools/preview/build.mjs --os ios             native adapter + a fake native module
//   node tools/preview/build.mjs --font path/to/DMSans.woff2
//
// This is a test harness. The shipped web build is `npx expo export -p web`.
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const arg = (name, dflt) => {
  const i = process.argv.indexOf('--' + name);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const os = arg('os', 'web');
const firebase = arg('firebase', 'on') === 'on';
const out = resolve(root, arg('out', 'dist-preview'));
const fontPath = arg('font', '');
const keyboard = arg('keyboard', '0');

const shim = (f) => resolve(here, 'shims', f);
const others = shim('others.tsx');
const fb = shim('firebase.ts');
const env = {
  EXPO_PUBLIC_FIREBASE_API_KEY: firebase ? 'preview-key' : '',
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: firebase ? 'preview.example' : '',
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: firebase ? 'preview' : '',
  EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: '',
  EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '',
  EXPO_PUBLIC_FIREBASE_APP_ID: firebase ? '1:0:web:preview' : '',
  EXPO_PUBLIC_RECAPTCHA_SITE_KEY: firebase ? 'preview-site-key' : '',
  EXPO_PUBLIC_APPCHECK_DEBUG_TOKEN: '',
  EXPO_PUBLIC_PROMPT_API_ORIGIN_TRIAL: '',
  EXPO_PUBLIC_KEYBOARD: keyboard,
  EXPO_PUBLIC_KEYCHAIN_GROUP: '',
};

mkdirSync(out, { recursive: true });
const exts = os === 'web' ? ['.web.tsx', '.web.ts'] : [`.${os}.tsx`, `.${os}.ts`, '.native.tsx', '.native.ts'];
await build({
  entryPoints: [resolve(root, 'index.ts')],
  bundle: true,
  outfile: resolve(out, 'app.js'),
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  // Do not read the app's tsconfig.json (it extends expo's, which may not be installed here).
  tsconfigRaw: '{}',
  sourcemap: 'inline',
  logLevel: 'warning',
  resolveExtensions: [...exts, '.tsx', '.ts', '.jsx', '.js', '.json'],
  nodePaths: (process.env.NODE_PATH || '').split(':').filter(Boolean),
  alias: {
    'react-native': shim('react-native.tsx'),
    'react-native-svg': shim('svg.tsx'),
    'react-native-safe-area-context': others,
    expo: others,
    'expo-status-bar': others,
    'expo-font': others,
    '@expo-google-fonts/dm-sans': others,
    'expo-clipboard': others,
    'expo-secure-store': others,
    '@react-native-async-storage/async-storage': others,
    'firebase/app': fb,
    'firebase/ai': fb,
    'firebase/app-check': fb,
    'firebase/remote-config': fb,
    'firebase/auth': fb,
  },
  define: {
    __PREVIEW_OS__: JSON.stringify(os),
    'process.env.NODE_ENV': '"production"',
    ...Object.fromEntries(Object.entries(env).map(([k, v]) => [`process.env.${k}`, JSON.stringify(v)])),
  },
});

// The font: a variable .woff2 passed with --font, or else the four DM Sans weights from the
// installed @expo-google-fonts/dm-sans package (so CI lays text out like the app).
function findFile(dir, name, depth = 0) {
  if (depth > 3 || !existsSync(dir)) return null;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = resolve(dir, e.name);
    if (e.isFile() && e.name === name) return p;
    if (e.isDirectory()) {
      const hit = findFile(p, name, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}
let font = '';
if (fontPath && existsSync(fontPath)) {
  font = `@font-face{font-family:'DM Sans';font-weight:100 1000;font-style:normal;src:url(data:font/woff2;base64,${readFileSync(fontPath).toString('base64')}) format('woff2')}`;
} else {
  const pkg = resolve(root, 'node_modules/@expo-google-fonts/dm-sans');
  for (const [w, n] of [[400, 'Regular'], [500, 'Medium'], [600, 'SemiBold'], [700, 'Bold']]) {
    const f = findFile(pkg, `DMSans_${w}${n}.ttf`);
    if (f) font += `@font-face{font-family:'DM Sans';font-weight:${w};font-style:normal;src:url(data:font/ttf;base64,${readFileSync(f).toString('base64')}) format('truetype')}`;
  }
}
writeFileSync(
  resolve(out, 'index.html'),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Quotekey preview</title><style>
${font}
html,body,#root{height:100%;margin:0}
body{background:#E9E7E1;-webkit-font-smoothing:antialiased;font-family:'DM Sans',system-ui,sans-serif}
#root{display:flex;flex-direction:column}
.rn-view{display:flex;flex-direction:column;position:relative;box-sizing:border-box;align-items:stretch;flex-shrink:0;min-width:0;min-height:0;margin:0;padding:0;border:0 solid black}
.rn-text{display:inline;position:relative;box-sizing:border-box;white-space:pre-wrap;overflow-wrap:break-word;margin:0;padding:0;border:0 solid black;flex-shrink:0;max-width:100%}
.rn-text-nested{white-space:inherit}
.rn-pressable{cursor:pointer;user-select:none;-webkit-tap-highlight-color:transparent;outline:none}
.rn-pressable:focus-visible{outline:2px solid #FF6B5C;outline-offset:2px}
.rn-disabled{cursor:default}
.rn-input{box-sizing:border-box;border:0 solid black;outline:none;margin:0;resize:none;min-width:0}
.rn-input::placeholder{color:var(--ph);opacity:1}
.rn-scroll{scrollbar-width:none}.rn-scroll::-webkit-scrollbar{display:none}
.pe-none{pointer-events:none}.pe-box-none{pointer-events:none}.pe-box-none>*{pointer-events:auto}
.rn-spinner{width:18px;height:18px;border-radius:50%;border:2px solid;box-sizing:border-box;animation:rnspin 1s linear infinite}
@keyframes rnspin{to{transform:rotate(360deg)}}
</style></head><body><div id="root"></div><script>globalThis.process=globalThis.process||{env:{}}</script><script src="app.js"></script></body></html>`,
);
console.log(`preview built: ${out}/index.html (os=${os}, firebase=${firebase ? 'fake' : 'off'})`);
