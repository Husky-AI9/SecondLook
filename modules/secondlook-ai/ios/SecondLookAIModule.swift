// SecondLook · Firebase AI Logic hybrid inference on iOS.
//
// On-device: Apple's Foundation Models framework (iPhone 15 Pro or newer, iOS 26,
// Apple Intelligence on). Cloud: Gemini through the same Firebase AI Logic SDK.
//
// NOTE: written against the Firebase AI Logic documentation as of November 2026
// (firebase.google.com/docs/ai-logic/hybrid/ios); compiled by the GitHub Actions builds. The hybrid API is
// marked Experimental by Firebase; if a name has moved, the three places to look are tagged
// "API:" below. Keep this file small: every change here needs a native build.

import ExpoModulesCore
import FirebaseCore
import FirebaseAILogic
import FirebaseAppCheck
import FirebaseRemoteConfig

/// App Attest for real distribution builds.
final class SLAppAttestFactory: NSObject, AppCheckProviderFactory {
  func createProvider(with app: FirebaseApp) -> AppCheckProvider? {
    return AppAttestProvider(app: app)
  }
}

enum SLFirebase {
  private static var started = false

  /// Configures Firebase once. Does nothing when GoogleService-Info.plist is missing, so the
  /// app still launches (on offline rules) before Firebase has been set up.
  static func startIfNeeded() {
    if started { return }
    started = true
    if FirebaseApp.app() != nil { return }
    guard Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil else { return }

    // App Check. Debug provider for development and sideloaded hackathon builds (the rules
    // accept debug tokens); App Attest otherwise. Set through app.config.ts → Info.plist.
    let wantsDebug = (Bundle.main.object(forInfoDictionaryKey: "SLAppCheckDebug") as? Bool) ?? false
    #if DEBUG || targetEnvironment(simulator)
    let useDebug = true
    #else
    let useDebug = wantsDebug
    #endif
    if useDebug {
      // A fixed token (from a CI secret, never from the repository) lets a sideloaded build
      // be registered in the Firebase console without reading the device log.
      if let token = Bundle.main.object(forInfoDictionaryKey: "SLAppCheckDebugToken") as? String, !token.isEmpty {
        setenv("FIRAAppCheckDebugToken", token, 1)
      }
      AppCheck.setAppCheckProviderFactory(AppCheckDebugProviderFactory())
    } else {
      AppCheck.setAppCheckProviderFactory(SLAppAttestFactory())
    }
    FirebaseApp.configure()
  }

  static var isConfigured: Bool { FirebaseApp.app() != nil }
}

struct SLError: Error, CustomStringConvertible {
  let description: String
}

public final class SecondLookAIModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SecondLookAI")
    Events("onSharedText")

    OnCreate {
      SLFirebase.startIfNeeded()
    }

    // { onDevice: "available" | "downloading" | "unavailable", reason? }
    AsyncFunction("availability") { () -> [String: Any] in
      SLFirebase.startIfNeeded()
      guard SLFirebase.isConfigured else {
        return ["onDevice": "unavailable", "reason": "Firebase is not set up in this build."]
      }
      if #available(iOS 26.0, *) {
        // API: FirebaseAI.SystemLanguageModel.default (.isAvailable / .availability)
        let model = FirebaseAI.SystemLanguageModel.default
        if model.isAvailable { return ["onDevice": "available"] }
        let why = String(describing: model.availability)
        if why.contains("modelNotReady") {
          return ["onDevice": "downloading", "reason": "Apple Intelligence is still downloading its model."]
        }
        if why.contains("appleIntelligenceNotEnabled") {
          return ["onDevice": "unavailable", "reason": "Turn on Apple Intelligence in Settings to keep everything on this iPhone."]
        }
        return ["onDevice": "unavailable", "reason": "This iPhone does not support Apple Intelligence."]
      }
      return ["onDevice": "unavailable", "reason": "On-device answers need iOS 26 or later."]
    }

    // mode: "only-on-device" | "prefer-on-device" | "only-cloud"
    AsyncFunction("generate") { (prompt: String, mode: String, grounded: Bool, cloudModel: String) async throws -> [String: Any] in
      SLFirebase.startIfNeeded()
      guard SLFirebase.isConfigured else { throw SLError(description: "Firebase is not set up in this build.") }
      let ai = FirebaseAI.firebaseAI(backend: .googleAI())

      // The market range: cloud only, with Grounding with Google Search.
      if grounded || mode == "only-cloud" {
        let model = grounded
          ? ai.generativeModel(modelName: cloudModel, tools: [Tool.googleSearch()])
          : ai.generativeModel(modelName: cloudModel)
        let response = try await model.generateContent(prompt)
        var out: [String: Any] = ["text": response.text ?? "", "source": "cloud", "model": cloudModel]
        if let meta = response.candidates.first?.groundingMetadata {
          out["sources"] = meta.groundingChunks.compactMap { chunk -> [String: String]? in
            guard let web = chunk.web, let uri = web.uri else { return nil }
            return ["title": web.title ?? uri, "url": uri]
          }
          out["searchQueries"] = meta.webSearchQueries
          if let html = meta.searchEntryPoint?.renderedContent { out["searchHtml"] = html }
        }
        return out
      }

      guard #available(iOS 26.0, *) else {
        if mode == "only-on-device" { throw SLError(description: "No on-device model before iOS 26.") }
        let response = try await ai.generativeModel(modelName: cloudModel).generateContent(prompt)
        return ["text": response.text ?? "", "source": "cloud", "model": cloudModel]
      }

      // API: geminiModel(name:), SystemLanguageModel.default, HybridModel(primary:secondary:),
      //      generativeModelSession(model:), respond(to:), rawResponse.modelVersion
      let cloud = ai.geminiModel(name: cloudModel)
      let system = FirebaseAI.SystemLanguageModel.default

      // A session keeps chat history, so every tap gets a fresh one.
      if mode == "only-on-device" {
        // Private prompt: hand the SDK only the on-device model. There is no cloud model in
        // this session, so the text cannot leave the phone.
        let session = ai.generativeModelSession(model: system)
        let response = try await session.respond(to: prompt)
        return ["text": response.content, "source": "on-device", "model": "apple-foundation-models-system-language-model"]
      }

      // Redacted or generic prompt: true hybrid. On-device first, cloud if it is unavailable.
      let hybrid = HybridModel(primary: system, secondary: cloud)
      let session = ai.generativeModelSession(model: hybrid)
      let response = try await session.respond(to: prompt)
      let version = response.rawResponse.modelVersion ?? ""
      let onDevice = version.hasPrefix("apple-foundation-models")
      return ["text": response.content, "source": onDevice ? "on-device" : "cloud", "model": version.isEmpty ? cloudModel : version]
    }

    // Remote Config: scam rules and model names can change without a new build.
    AsyncFunction("remoteConfig") { (defaults: [String: String]) async -> [String: String] in
      SLFirebase.startIfNeeded()
      guard SLFirebase.isConfigured else { return defaults }
      let rc = RemoteConfig.remoteConfig()
      rc.setDefaults(defaults as [String: NSObject])
      _ = try? await rc.fetchAndActivate()
      var out = defaults
      for key in defaults.keys {
        let value: String? = rc.configValue(forKey: key).stringValue
        if let value = value, !value.isEmpty { out[key] = value }
      }
      return out
    }

    // Shared keychain for the keyboard extension (the limits pack, and test T4).
    Function("sharedKeychainSet") { (key: String, value: String) -> [String: Any] in
      let status = SLSharedKeychain.write(key, value)
      return ["ok": status == errSecSuccess, "status": Int(status), "group": SLSharedKeychain.group() ?? ""]
    }

    // What this build actually is, after signing. Used by the T1 check.
    Function("deviceInfo") { () -> [String: Any] in
      return [
        "bundleId": Bundle.main.bundleIdentifier ?? "",
        "teamPrefix": SLSharedKeychain.teamPrefix() ?? "",
        "group": SLSharedKeychain.group() ?? "",
        "os": ProcessInfo.processInfo.operatingSystemVersionString,
        "firebase": SLFirebase.isConfigured,
      ]
    }

    // Android-only feature; present so the JavaScript side is the same on both platforms.
    Function("consumeSharedText") { () -> String? in
      return nil
    }
  }
}
