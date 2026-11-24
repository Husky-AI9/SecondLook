// Expo config plugin (Android):
//  1. Adds a PROCESS_TEXT intent filter, so "SecondLook" appears in the text-selection menu
//     of every app next to Copy and Share.
//  2. Writes two meta-data flags the native module reads: whether to use the App Check debug
//     provider, and which on-device model category to ask AICore for.
const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

const ACTION = 'android.intent.action.PROCESS_TEXT';

module.exports = function withSecondLookAndroid(config, props = {}) {
  return withAndroidManifest(config, (cfg) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(cfg.modResults);
    activity['intent-filter'] = activity['intent-filter'] || [];
    const already = activity['intent-filter'].some((f) => (f.action || []).some((a) => a.$ && a.$['android:name'] === ACTION));
    if (!already) {
      activity['intent-filter'].push({
        action: [{ $: { 'android:name': ACTION } }],
        category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
        data: [{ $: { 'android:mimeType': 'text/plain' } }],
      });
    }

    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(app, 'secondlook.appcheck.debug', String(props.appCheckDebug !== false));
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(app, 'secondlook.ondevice.option', String(props.onDeviceOption || 'PREVIEW'));
    return cfg;
  });
};
