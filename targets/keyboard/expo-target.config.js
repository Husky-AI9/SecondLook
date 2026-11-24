// Plan A: the SecondLook keyboard panel as an iOS keyboard extension.
// Picked up by @bacons/apple-targets when EXPO_PUBLIC_KEYBOARD=1 (see app.config.ts, SETUP.md §7).

/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'keyboard',
  name: 'SecondLookKeyboard',
  displayName: 'SecondLook',
  deploymentTarget: '17.0',
  frameworks: ['UIKit', 'Security'],
  entitlements: {
    // Shared with the app so the keyboard can read the limits pack (test T4).
    // A sideloaded build is re-signed, so the code works the real prefix out at run time.
    'keychain-access-groups': ['$(AppIdentifierPrefix)' + config.ios.bundleIdentifier + '.SecondLookKeyboard', '$(AppIdentifierPrefix)secondlook.shared'],
  },
});
