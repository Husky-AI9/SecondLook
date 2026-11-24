// The versions in package.json were written without access to the npm registry, for
// Expo SDK 58. If `npm install` rejects one of them, run this once: it lets Expo pick the
// versions that match the SDK and rewrites package.json. Commit the result and the lockfile.
import { execSync } from 'node:child_process';

const run = (cmd) => {
  console.log('\n> ' + cmd);
  execSync(cmd, { stdio: 'inherit' });
};

run('npm install expo@^58.0.0 --no-audit --no-fund --legacy-peer-deps');
run(
  'npx expo install react react-dom react-native react-native-web ' +
    'expo-build-properties expo-clipboard expo-dev-client expo-font expo-secure-store expo-splash-screen expo-status-bar ' +
    'react-native-safe-area-context react-native-svg @react-native-async-storage/async-storage @expo-google-fonts/dm-sans',
);
run('npm install firebase@^12.5.0 --no-audit --no-fund');
run('npx expo install --dev typescript @types/react');
run('npm install -D tsx esbuild --no-audit --no-fund');
run('npx expo install --check');
console.log('\nDependencies aligned to the installed Expo SDK. Commit package.json and package-lock.json.');
