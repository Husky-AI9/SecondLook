// Test bench for the two-day keyboard test in implementation.md (T1–T4).
// Tap "Tests" in the panel, then T2 / T3 / T4. "Paste log" types the results into the
// message box so they can be copied out of Messages.
//
//   T1  the keyboard is installed and opens; this header shows what the build really is
//   T2  button → Apple's on-device model → reply typed into the box (8 taps over 5 minutes)
//   T3  same through Firebase AI Logic hybrid inference with an App Check debug token
//   T4  a value written by the app is read here through the shared keychain

import UIKit
import os
#if canImport(FirebaseAILogic)
import FirebaseCore
import FirebaseAILogic
import FirebaseAppCheck
#endif

extension KeyboardViewController {
  func buildTestRow() {
    testRow.spacing = 8
    testRow.distribution = .fillEqually
    testRow.isHidden = true
    testRow.addArrangedSubview(key("T2", #selector(tapT2)))
    testRow.addArrangedSubview(key("T3", #selector(tapT3)))
    testRow.addArrangedSubview(key("T4", #selector(tapT4)))
    testRow.addArrangedSubview(key("Paste log", #selector(tapPasteLog)))
  }

  /// The conditions the plan asks to be recorded with each result.
  func conditions() -> String {
    UIDevice.current.isBatteryMonitoringEnabled = true
    let power: String
    switch UIDevice.current.batteryState {
    case .charging, .full: power = "on power"
    case .unplugged: power = "on battery"
    default: power = "power unknown"
    }
    let level = UIDevice.current.batteryLevel >= 0 ? " \(Int(UIDevice.current.batteryLevel * 100))%" : ""
    let lowPower = ProcessInfo.processInfo.isLowPowerModeEnabled ? ", Low Power Mode" : ""
    let memory = os_proc_available_memory() / 1_048_576
    return "T1 \(Bundle.main.bundleIdentifier ?? "?") · Full Access \(hasFullAccess ? "ON" : "OFF") · \(power)\(level)\(lowPower) · \(memory) MB free · \(ProcessInfo.processInfo.operatingSystemVersionString)"
  }

  func logTest(_ line: String) {
    testLog.append(line)
    showTestStatus()
  }

  func showTestStatus() {
    show(([conditions()] + testLog.suffix(6)).joined(separator: "\n"), source: "Tests")
  }

  @objc func tapTests() {
    testRow.isHidden.toggle()
    if testRow.isHidden { showReady() } else { showTestStatus() }
  }

  @objc func tapPasteLog() {
    textDocumentProxy.insertText(([conditions()] + testLog).joined(separator: "\n"))
  }

  // MARK: T2 — Apple's model, called directly from the keyboard

  @objc func tapT2() {
    t2Count += 1
    let n = t2Count
    let first = t2First ?? Date()
    t2First = first
    let start = Date()
    Task { @MainActor in
      let (text, problem) = await OnDevice.respondDetailed("Write one short, polite sentence asking a lender to lower a 6.40% rate offer.")
      let ms = Int(Date().timeIntervalSince(start) * 1000)
      let since = Int(Date().timeIntervalSince(first))
      if let text = text {
        self.textDocumentProxy.insertText(text + " ")
        self.logTest("T2 #\(n) ok \(ms) ms (+\(since / 60):\(String(format: "%02d", since % 60)))")
      } else {
        self.t2Fails += 1
        self.logTest("T2 #\(n) FAILED \(ms) ms: \(problem ?? "unknown")")
      }
      if n >= 8 && since >= 300 {
        self.logTest(self.t2Fails == 0 ? "T2 PASS: \(n) taps over \(since / 60) min, none throttled" : "T2 FAIL: \(self.t2Fails) of \(n) taps failed")
      }
    }
  }

  // MARK: T3 — the same call through Firebase AI Logic hybrid inference

  @objc func tapT3() {
    #if canImport(FirebaseAILogic)
    let start = Date()
    Task { @MainActor in
      let line = await KeyboardFirebase.hybrid("Write one short, polite sentence asking a lender to lower a 6.40% rate offer.")
      self.logTest("\(line) \(Int(Date().timeIntervalSince(start) * 1000)) ms")
    }
    #else
    logTest("T3 not in this build: Firebase is not linked into the keyboard.")
    #endif
  }

  // MARK: T4 — read what the app wrote to the shared keychain

  @objc func tapT4() {
    let result = SLSharedKeychain.read("secondlook.t4")
    let group = SLSharedKeychain.group() ?? "no group"
    if let value = result.value {
      logTest("T4 PASS: read \"\(value)\" from \(group)")
    } else if result.status == errSecItemNotFound {
      logTest("T4: nothing there yet (status \(result.status), \(group)). In the app: Settings → Keyboard test bench → Write T4 value.")
    } else {
      logTest("T4 FAIL: status \(result.status) on \(group)")
    }
    logTest("Pack: \(pack == nil ? "not readable" : "\(pack!.deals.count) deal(s) readable")")
  }
}

#if canImport(FirebaseAILogic)
enum KeyboardFirebase {
  private static var started = false

  static func start() -> Bool {
    if FirebaseApp.app() != nil { return true }
    if started { return false }
    started = true
    guard Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil else { return false }
    if let token = Bundle.main.object(forInfoDictionaryKey: "SLAppCheckDebugToken") as? String, !token.isEmpty {
      setenv("FIRAAppCheckDebugToken", token, 1)
    }
    AppCheck.setAppCheckProviderFactory(AppCheckDebugProviderFactory())
    FirebaseApp.configure()
    return FirebaseApp.app() != nil
  }

  /// One hybrid call. Returns a log line saying where it ran.
  static func hybrid(_ prompt: String) async -> String {
    guard start() else { return "T3 FAIL: no GoogleService-Info.plist in the keyboard bundle." }
    guard #available(iOS 26.0, *) else { return "T3 FAIL: needs iOS 26." }
    do {
      let ai = FirebaseAI.firebaseAI(backend: .googleAI())
      let hybrid = HybridModel(primary: FirebaseAI.SystemLanguageModel.default, secondary: ai.geminiModel(name: "gemini-3.5-flash-lite"))
      let response = try await ai.generativeModelSession(model: hybrid).respond(to: prompt)
      let version = response.rawResponse.modelVersion ?? ""
      return "T3 PASS: answered by \(version.hasPrefix("apple-foundation-models") ? "ON-DEVICE" : "CLOUD (\(version))")"
    } catch {
      return "T3 FAIL: \(error)"
    }
  }
}
#endif
