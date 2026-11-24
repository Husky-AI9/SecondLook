# Setup checklist

What has to be done outside the code, in order. Nothing here needs a purchase: Firebase AI
Logic with the Gemini Developer API and the on-device models are free-tier.

Legend: ☐ you do this · ✔ already in the repo

---

## 0. First run on your machine (10 minutes, no Firebase needed)

☐ In this folder:

```bash
npm install
npx expo install --fix
npm test
npm run web
```

The dependency versions in `package.json` were written **without access to the npm registry**
(for Expo SDK 58). If `npm install` rejects one, run `npm run setup:deps`: it lets Expo choose
the matching versions and rewrites `package.json`. Then commit `package.json` and the lockfile.

☐ Run `npx expo-doctor` and fix anything it reports.

At this point the app works on built-in rules, with "Offline rules" badges.

## 1. Firebase project (console.firebase.google.com)

Use your existing Google Cloud project.

☐ **Add Firebase** to the project if it is not there yet.

☐ **AI Services → AI Logic** → Get started → choose **Gemini Developer API**. This enables
the APIs and **turns App Check enforcement on for AI Logic straight away**, so every model call
fails until §2 is done. The app keeps working on its built-in rules ("Offline rules") meanwhile.

Models (checked Nov 24): `gemini-3.8-flash` (market range) and `gemini-3.5-flash-lite`
(redacted fallback) are stable, no-cost and support Grounding with Google Search. The newest
no-cost model is `gemini-4-hydrogen`; to try it, change `benchmark_model` in Remote Config.
No rebuild needed.

☐ **Register three apps** (Project settings → Your apps):

| App | Identifier | What you get | Where it goes |
|---|---|---|---|
| Web | any nickname | config object | `.env` (copy `.env.example`) |
| iOS | `com.secondlook.app` | `GoogleService-Info.plist` | project root |
| Android | `com.secondlook.app` | `google-services.json` | project root |

All three files are in `.gitignore`. Do not commit them.

☐ **Authentication** → Sign-in method → enable **Anonymous**.

☐ **Remote Config**: optional. `firebase deploy --only remoteconfig` publishes the four
parameters in `firebase/remoteconfig.template.json` (model names, scam rules, a kill switch).
Without it the app uses the same values as built-in defaults.

☐ **Budget alert** in Google Cloud Billing, as your plan says.

## 2. App Check (required by Firebase AI Logic; debug tokens are accepted)

☐ **Web**: Google Cloud console → reCAPTCHA Enterprise → create a key for your Hosting domain
(and `localhost`). In Firebase → App Check → register the web app with that site key. Put the
site key in `.env` as `EXPO_PUBLIC_RECAPTCHA_SITE_KEY`.
For local testing set `EXPO_PUBLIC_APPCHECK_DEBUG_TOKEN=true`, open the app, copy the token
from the browser console, and add it under App Check → your web app → Manage debug tokens.

☐ **iOS**: make up a token (any UUID), add it under App Check → iOS app → Manage debug tokens,
and save the same value as the GitHub secret `APPCHECK_DEBUG_TOKEN_IOS`. The build bakes it
into the app so a sideloaded iPhone does not need Xcode logs.

☐ **Android**: run the app once, find `DebugAppCheckProvider` in logcat, copy the token it
prints, and add it under App Check → Android app → Manage debug tokens.

☐ In App Check → APIs, check that **Firebase AI Logic** shows as enforced.

## 3. Web: on-device Gemini Nano in Chrome, and hosting

☐ Desktop Chrome 139 or newer. Enable `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`
and restart. The first on-device call downloads the model (several minutes).

☐ Optional: register for the Prompt API **origin trial** for your Hosting domain and put the
token in `EXPO_PUBLIC_PROMPT_API_ORIGIN_TRIAL`, so judges get on-device without the flag.

☐ Deploy:

```bash
cp .firebaserc.example .firebaserc     # put your project id in it
npm install -g firebase-tools && firebase login
npm run deploy:web
```

On a phone browser there is no on-device model, so the web app shows "Cloud · redacted". That
is the intended demo for mobile web.

## 4. Android

☐ `npx expo run:android` on the emulator. The emulator has no Gemini Nano, so it shows the
cloud fallback badge, as your plan expects.

☐ For on-device **Gemini Nano 4** on a real supported phone, enrol the device in the AICore
developer preview (developers.google.com/ml-kit/genai/aicore-dev-preview). Not enrolled?
Set `ANDROID_ONDEVICE_OPTION=STABLE` and rebuild.

☐ Try the shortcut: select text in any app → **SecondLook** in the pop-up menu.

☐ APK for judges: GitHub → Actions → "Android APK" → Run workflow.
Secret: `GOOGLE_SERVICES_JSON_B64` (`base64 -w0 google-services.json`).

## 5. iPhone

☐ **Confirm the phone first**: iPhone 15 Pro or newer, iOS 26, Apple Intelligence turned on.
Without that nothing runs on-device on iPhone.

☐ GitHub repo secrets: `GOOGLE_SERVICE_INFO_PLIST_B64` (base64 of the plist) and
`APPCHECK_DEBUG_TOKEN_IOS`. Optional variable: `IOS_BUNDLE_ID`.

☐ Actions → "iOS unsigned .ipa" → Run workflow → download the artifact → install with
Sideloadly using your free Apple ID.

☐ If Sideloadly changes the bundle id when it signs, register **that** id as an iOS app in
Firebase (new plist), set the `IOS_BUNDLE_ID` variable to it, and rebuild.

### Testing iOS in a browser (Appetize)

Appetize streams an iOS **Simulator** in the browser, so it needs a simulator build, not the
.ipa. Actions → **iOS simulator build (Appetize)** → Run workflow makes one, and uploads it
if the `APPETIZE_API_TOKEN` secret is set (Appetize → Account → API token). The run summary
shows the link. After the first upload, save the public key it prints as the repository
variable `APPETIZE_PUBLIC_KEY` so later uploads keep the same link.

Good for: checking the iOS app builds and runs, the screens, the cloud path, and a link for
judges. Not for: Apple's on-device model (in a simulator it needs a host Mac with Apple
Intelligence on, so expect "Not on this device") or keyboard test T2. Use the real iPhone.

The simulator uses the App Check debug provider with `APPCHECK_DEBUG_TOKEN_IOS`, the same
token as the device build, so nothing extra to register.

### If the iOS build fails

This is the least certain part of the project, for two reasons I could not test here:

1. **Swift Package Manager inside a CocoaPods pod.** Firebase ships hybrid inference through
   SPM only; the module's podspec pulls it in with React Native's `spm_dependency` helper.
   If `pod install` or linking fails there, try `["expo-build-properties", { ios: { useFrameworks: "dynamic" } }]`
   in `app.config.ts`. The fallback in your plan (a small native iOS app) still stands.
2. **Experimental API names.** `SecondLookAIModule.swift` follows the Firebase docs as of
   Nov 2026; the docs themselves spell one call two ways (`HybridModel(primary:secondary:)`
   and `.hybridModel(primary:secondary:)`). Compiler errors will point at the lines tagged
   `API:`; the fix is a rename.

The same applies to `SecondLookAIModule.kt` on Android (`FirebaseAIOnDevice`, `OnDeviceConfig`,
`inferenceSource`).

## 6. GitHub repository

☐ Public repo, **Apache 2.0** shown in the About box (the `LICENSE` file is in place).

| Secret | Used by |
|---|---|
| `GOOGLE_SERVICE_INFO_PLIST_B64` | iOS build |
| `APPCHECK_DEBUG_TOKEN_IOS` | iOS build |
| `GOOGLE_SERVICES_JSON_B64` | Android build |
| `FIREBASE_WEB_API_KEY`, `FIREBASE_SERVICE_ACCOUNT` | Web deploy |
| `APPETIZE_API_TOKEN` | iOS simulator build → Appetize (optional) |

| Variable | Used by |
|---|---|
| `FIREBASE_PROJECT_ID`, `FIREBASE_WEB_APP_ID`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_STORAGE_BUCKET`, `RECAPTCHA_SITE_KEY` | Web deploy |
| `IOS_BUNDLE_ID`, `ANDROID_PACKAGE`, `ANDROID_ONDEVICE_OPTION` | Native builds (optional) |
| `APPETIZE_PUBLIC_KEY` | Keeps the same Appetize link across uploads (optional) |

## 7. The keyboard (Plan A) and tests T1–T4

The main app does not depend on the keyboard. The keyboard extension is in `targets/keyboard`
and is only built when `EXPO_PUBLIC_KEYBOARD=1`; the "iOS unsigned .ipa" workflow turns that
on by default. It includes a test bench for T1–T4.

☐ Follow **[docs/T1-T4.md](docs/T1-T4.md)**: the build half is a workflow run, the phone half
is about ten minutes of tapping and one log to paste back.

## 8. Things only you can do

☐ Check that Grounding with Google Search is available to your project on the model in
`benchmark_model` (`gemini-3.8-flash`). If it needs billing, either request the Sprint 3 quota
(**request by Wed Nov 25, 10:00 AM PT**) or switch the model in Remote Config.

☐ Record the demo (3 minutes or less, phone on power), upload to YouTube, public.

☐ Devpost text: how AI Logic is used (the table at the top of the README), features, value,
what was built in the period.

☐ Submit by **Mon Nov 30, 2:00 PM Pacific (3:00 PM Phoenix)**. Your plan's target is noon Pacific.
