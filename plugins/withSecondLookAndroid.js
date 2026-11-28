// Expo config plugin (Android):
//  1. Adds a PROCESS_TEXT intent filter, so "Quotekey" appears in the text-selection menu
//     of every app next to Copy and Share.
//  2. Writes meta-data the native module reads: whether to use the App Check debug provider,
//     an optional fixed debug token (from the APPCHECK_DEBUG_TOKEN_ANDROID secret, never from
//     the repo), and which on-device model category to ask AICore for.
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
    if (props.appCheckDebug !== false && props.appCheckDebugToken) {
      AndroidConfig.Manifest.addMetaDataItemToMainApplication(app, 'secondlook.appcheck.debug_token', String(props.appCheckDebugToken));
    } else {
      AndroidConfig.Manifest.removeMetaDataItemFromMainApplication(app, 'secondlook.appcheck.debug_token');
    }
    return cfg;
  });
};
