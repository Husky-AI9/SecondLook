// Quotekey keyboard panel (Plan A-lite): Check · Counter · Explain, above the keys.
//
// STATUS: starting point, NOT compiled. It follows the design rules in implementation.md:
//   - a panel, not a typing keyboard; the globe key returns to the normal keyboard
//   - one model call per tap, not streamed; rule-based replies if the model is unavailable
//   - it does no setup of its own: it reads the pack the main app prepared
//   - it re-implements only the leak-guard number checks and the reply templates
//
// "A-lite" means the keyboard calls Apple's on-device model directly (FoundationModels) and
// never the network, so it makes no Firebase call. The main app keeps every Firebase AI Logic
// call. If test T3 passed, swap `OnDevice.respond` for a Firebase AI Logic hybrid session.

import UIKit
import Security
#if canImport(FoundationModels)
import FoundationModels
#endif

// MARK: - Pack (written by the app: src/engine/pack.ts)

struct PackLimits: Codable { let maxRate: Double; let maxFees: Double; let targetRate: Double }
struct PackReveal: Codable { let competingQuote: Bool; let creditBand: Bool; let deadline: Bool }
struct PackQuote: Codable { let rate: Double; let written: Bool }
struct PackRange: Codable { let low: Double; let high: Double }
struct PackDeal: Codable {
  let id: String; let label: String; let lender: String; let contact: String?
  let loanType: String; let amount: Double; let termMonths: Double
  let limits: PackLimits?; let reveal: PackReveal; let quote: PackQuote?; let range: PackRange?
}
struct Pack: Codable { let v: Int; let activeId: String?; let deals: [PackDeal] }

enum PackStore {
  static let account = "secondlook.pack.v1"
  static let defaultsKey = "secondlook.pack.imported"

  /// Shared keychain first (see SharedKeychain.swift), then a pack imported from the clipboard code.
  static func load() -> Pack? {
    if let json = SLSharedKeychain.read(account).value, let data = json.data(using: .utf8),
       let pack = try? JSONDecoder().decode(Pack.self, from: data), !pack.deals.isEmpty {
      return pack
    }
    if let data = UserDefaults.standard.data(forKey: defaultsKey) { return try? JSONDecoder().decode(Pack.self, from: data) }
    return nil
  }

  /// "SL1.<checksum>.<base64url JSON>" copied from the app's Keyboard tab.
  static func importCode(_ code: String) -> Bool {
    let parts = code.trimmingCharacters(in: .whitespacesAndNewlines).split(separator: ".")
    guard parts.count == 3, parts[0] == "SL1" else { return false }
    var b64 = String(parts[2]).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
    while b64.count % 4 != 0 { b64 += "=" }
    guard let data = Data(base64Encoded: b64), (try? JSONDecoder().decode(Pack.self, from: data)) != nil else { return false }
    UserDefaults.standard.set(data, forKey: defaultsKey)
    return true
  }
}

// MARK: - Rules (a small port of src/engine)

enum Rules {
  static func firstMatch(_ pattern: String, in text: String) -> Double? {
    guard let re = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]),
          let m = re.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
          let r = Range(m.range(at: 1), in: text) else { return nil }
    return Double(text[r].replacingOccurrences(of: ",", with: ""))
  }
  static func has(_ pattern: String, _ s: String) -> Bool {
    guard let re = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { return false }
    return re.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) != nil
  }
  // Emails mention other percentages before the offer ("your current rate is 7.125%",
  // "20% down", "75% LTV"). Same skips as src/engine/extract.ts.
  static let rateSkipBefore = #"\b(current(ly)?|existing|old|previous|prior|average|paying( about)?)( (interest )?rate| loan| mortgage| apr)?( is| was| of| at| sits at|:)?( (about|around|roughly))?\s*$|(down payment|ltv|loan[- ]to[- ]value)( of| is| at|:)?\s*$"#
  static let rateSkipAfter = #"^\s*(down|ltv|loan[- ]to[- ]value|of (the )?(home|purchase|price|value)|equity|cash back|off)\b"#
  /// The offered note rate; the APR only if no note rate is given.
  static func rate(_ text: String) -> Double? {
    guard let re = try? NSRegularExpression(pattern: #"(\d{1,2}(?:\.\d{1,3})?)\s?%"#) else { return nil }
    let ns = text as NSString
    var apr: Double? = nil
    for m in re.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
      guard let v = Double(ns.substring(with: m.range(at: 1))), v > 0, v < 40 else { continue }
      let start = m.range.location
      let end = m.range.location + m.range.length
      let lineStart = max(0, start - 40)
      var line = ns.substring(with: NSRange(location: lineStart, length: start - lineStart))
      if let nl = line.range(of: "\n", options: .backwards) { line = String(line[nl.upperBound...]) }
      let after = ns.substring(with: NSRange(location: end, length: min(24, ns.length - end)))
      if has(rateSkipBefore, line) || has(rateSkipAfter, after) { continue }
      let b0 = max(0, start - 12)
      let before = ns.substring(with: NSRange(location: b0, length: start - b0))
      if has(#"^\s*(apr|a\.p\.r\.)"#, after) || has(#"apr( of| is| at)?\s*$"#, before) {
        if apr == nil { apr = v }
        continue
      }
      return v
    }
    return apr
  }
  static func fees(_ text: String) -> Double? {
    firstMatch(#"\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?\s?(?:in )?(?:total )?(?:lender |closing )?(?:fees?|closing costs?)"#, in: text)
      ?? firstMatch(#"(?:lender |closing |origination )?(?:fees?|closing costs?)\s*(?:of|are|is|total|:)?\s*\$\s?(\d{1,3}(?:,\d{3})+|\d+)"#, in: text)
  }
  static func percents(_ text: String) -> [Double] {
    guard let re = try? NSRegularExpression(pattern: #"(\d{1,2}(?:\.\d{1,3})?)\s?%"#) else { return [] }
    return re.matches(in: text, range: NSRange(text.startIndex..., in: text)).compactMap { m in
      Range(m.range(at: 1), in: text).flatMap { Double(text[$0]) }
    }
  }

  // Scam rules: the same rules and weights as src/engine/scamRules.ts.
  // Appraisal and credit-report fees are often paid up front to real lenders, so they don't count.
  static let upfrontFee: String = [
    #"(pay|send|wire|deposit|remit|purchase|buy|need|requires?|required)\b.{0,50}\b(?<!appraisal |credit report )(fee|deposit|insurance|bond|tax|charge)s?\b.{0,70}\b(release|unlock|receive|claim|activate|proceed|process|fund|funding|hold|before|to get|first)"#,
    #"\b(processing|advance|insurance|release|activation|verification|transfer|reservation|enrollment)\s+fee\b.{0,50}\b(today|now|first|before|release|upfront|up front)"#,
    #"\b(fee|deposit)s?\b.{0,20}\b(is |are )?(due|required|needed)\b.{0,30}\b(before|to (release|unlock|fund|lock|receive))"#,
    #"\b(pay|send|wire|deposit)\s+(a |the |an )?\$\s?\d[\d,]*.{0,40}\bto (activate|release|unlock|receive|get|claim)\b"#,
    #"upfront (fee|payment)|up-front (fee|payment)|payments? in advance"#,
  ].joined(separator: "|")
  static let scamSigns: [(String, String, Int)] = [
    (upfrontFee, "Asks for a fee before any money is paid out", 4),
    (#"\b(pay|send|act|respond|claim|confirm|click)\b.{0,40}\b(today|now|immediately|right away|within \d+ ?(hours?|hrs?|minutes?|mins?))|expires in \d+ ?(min|hour)|before it expires|expires (soon|today|tonight)|(today|tonight|this week) only|limited (time|spots)|last chance|final notice|act fast|urgent"#,
     "Pressure to pay today", 2),
    (#"https?://|www\.|\b[a-z0-9-]+\.(com|net|org|io|co|info|biz|us|loans?|finance|xyz|top|site|online|click|link|example|app)\b"#, "Link goes to a site that isn't a known lender", 2),
    (#"guaranteed approval|no credit check|100% approv|approval guaranteed|bad credit ok|everyone (is )?approved"#, "Promises approval with no credit check", 3),
    (#"gift ?cards?|bitcoin|\bcrypto|\busdt\b|western union|moneygram|\bzelle\b|cash ?app|wire transfer|\b(by|via) wire\b|prepaid (debit )?card"#, "Wants payment by gift card, crypto or wire", 4),
    (#"(send|reply with|text|confirm|verify|provide|share|enter|need|give us|what is|what's|photo of)\b.{0,40}\b(ssn|social security|bank (login|password|username)|(username|login) and password|online banking|routing number|account number|debit card|\bpin\b|one[- ]time (code|passcode)|verification code|\botp\b)"#,
     "Asks for your SSN, PIN or bank login by text", 4),
    (#"(stop|save|prevent) (your )?foreclosure|payments? to us instead|instead of (paying )?your (lender|bank|servicer)|stop (making |paying )?your (mortgage |bank )?payments|stop paying your (bank|lender|mortgage)"#,
     "Offers to stop a foreclosure if you pay them instead", 4),
    (#"\bCONGRAT|\bWINNER\b|YOU('| HA)VE WON|you(’|'| ha)ve been selected|you (were|are) selected|pre-?approved.{0,40}(claim|click|release)"#, "Prize-style language", 1),
  ]
  static let tooGoodApr = 3.5

  /// "We will never ask for a gift card" is a warning, not a request.
  static func matchesNotNegated(_ pattern: String, _ text: String) -> Bool {
    guard let re = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive, .dotMatchesLineSeparators]) else { return false }
    let ns = text as NSString
    for m in re.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
      let b0 = max(0, m.range.location - 40)
      let before = ns.substring(with: NSRange(location: b0, length: m.range.location - b0))
      let sentence = before.components(separatedBy: CharacterSet(charactersIn: ".!?\n")).last ?? before
      if !has(#"\b(never|not|no one|nobody|won'?t|don'?t|doesn'?t)\b"#, sentence) { return true }
    }
    return false
  }

  /// Same scoring as src/engine/scamRules.ts, including "too good": a rate far below the market.
  static func scamReasons(_ text: String, marketLow: Double? = nil, knownNames: [String] = []) -> [String] {
    var strong: [(String, Int)] = []
    for (pattern, label, weight) in scamSigns where matchesNotNegated(pattern, text) { strong.append((label, weight)) }
    let floor = marketLow.map { min(tooGoodApr, $0 - 2) } ?? tooGoodApr
    if let r = rate(text), r <= floor { strong.append(("Rate is far below anything on the market", 2)) }
    else if has(#"\b0(?:\.0+)?\s?%\s*(apr|interest|financing)\b"#, text) { strong.append(("Rate is far below anything on the market", 2)) }
    if strong.isEmpty { return [] }
    // "No licence number" alone is normal for a text from a loan officer: it only counts with another sign.
    let lower = text.lowercased()
    let fromKnown = knownNames.contains { $0.count >= 3 && lower.contains($0.lowercased()) }
    let hasLicence = has(#"\bnmls\b|licen[cs]e\s*(no\.?|number|#)?\s*:?\s*\d{3,}"#, text)
    let all = (!hasLicence && !fromKnown) ? strong + [("No lender name or licence number", 1)] : strong
    return all.reduce(0) { $0 + $1.1 } >= 5 ? all.map { $0.0 } : []
  }

  // Rate mentions (port of src/engine/rates.ts): the walk-away rate however it is typed:
  // "6.25%", "6.25", "six and a quarter", "six point two five", "6¼%", "6 1/4%", "625 bps".
  static let ones: [String: Int] = [
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
    "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15, "sixteen": 16, "seventeen": 17,
    "eighteen": 18, "nineteen": 19, "twenty": 20,
  ]
  static let digitWords: [String: Int] = ["zero": 0, "oh": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9]
  static let fractionWords: [String: Double] = [
    "a quarter": 0.25, "one quarter": 0.25, "a half": 0.5, "one half": 0.5, "three quarters": 0.75,
    "an eighth": 0.125, "one eighth": 0.125, "three eighths": 0.375, "five eighths": 0.625, "seven eighths": 0.875,
  ]
  static let fractionChars: [String: Double] = ["¼": 0.25, "½": 0.5, "¾": 0.75, "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875]
  static let percentRE = #"\s?(?:%|percent\b|per cent\b)"#
  static let notRateAfter = #"^\s?(?:k\b|dollars?|bucks|a month|per month|/\s?mo|months?|mos?\b|years?|yrs?|points?|pts?\b|square|sq\b|miles?|hours?|hrs?|days?|weeks?|minutes?|mins?|am\b|pm\b|o'?clock)"#

  static func groups(_ pattern: String, _ text: String) -> [[String]] {
    guard let re = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { return [] }
    let ns = text as NSString
    return re.matches(in: text, range: NSRange(location: 0, length: ns.length)).map { m in
      (0..<m.numberOfRanges).map { i in m.range(at: i).location == NSNotFound ? "" : ns.substring(with: m.range(at: i)) }
        + [String(m.range.location + m.range.length)]
    }
  }

  static func rateMentions(_ text: String) -> [Double] {
    var out: [Double] = []
    func add(_ n: Double) { if n > 0 && n < 30 { out.append((n * 1000).rounded() / 1000) } }
    for g in groups(#"(\d{1,2})\s?([¼½¾⅛⅜⅝⅞])"#, text) { add((Double(g[1]) ?? 0) + (fractionChars[g[2]] ?? 0)) }
    for g in groups(#"(?<![\d/])(\d{1,2})\s+(?:and\s+)?([1357])/([248])(?![\d/])"#, text) {
      add((Double(g[1]) ?? 0) + (Double(g[2]) ?? 0) / (Double(g[3]) ?? 1))
    }
    for g in groups(#"(?<![\d.,$])(\d{3,4})\s?(?:basis points?|bps|bp)\b"#, text) { add((Double(g[1]) ?? 0) / 100) }
    let onesRE = ones.keys.joined(separator: "|"), digitRE = digitWords.keys.joined(separator: "|")
    let fracRE = "a quarter|one quarter|a half|one half|three[- ]quarters|an eighth|one[- ]eighth|three[- ]eighths|five[- ]eighths|seven[- ]eighths"
    let wordsRE = "\\b(\(onesRE))(?:\\s+and\\s+(\(fracRE))|\\s+point\\s+((?:\(digitRE))(?:[\\s-]+(?:\(digitRE))){0,2}))?(\(percentRE))?"
    for g in groups(wordsRE, text) {
      guard let whole = ones[g[1].lowercased()] else { continue }
      if !g[2].isEmpty { add(Double(whole) + (fractionWords[g[2].lowercased().replacingOccurrences(of: "-", with: " ")] ?? 0)) }
      else if !g[3].isEmpty {
        let ds = g[3].lowercased().components(separatedBy: CharacterSet(charactersIn: " -")).filter { !$0.isEmpty }.map { String(digitWords[$0] ?? 0) }
        add(Double(whole) + (Double("0." + ds.joined()) ?? 0))
      } else if !g[4].isEmpty { add(Double(whole)) }
    }
    let ns = text as NSString
    for g in groups(#"(?<![\d.,$/])(\d{1,2}(?:\.\d{1,3})?)(?![\d¼½¾⅛⅜⅝⅞]|\s?/)("# + percentRE + #")?"#, text) {
      let hasPct = !g[2].isEmpty
      if !hasPct && !g[1].contains(".") { continue }
      let end = Int(g.last ?? "0") ?? 0
      if !hasPct && has(notRateAfter, ns.substring(from: min(end, ns.length))) { continue }
      if let v = Double(g[1]) { add(v) }
    }
    return out
  }

  /// One sentence comparing their rate with today's range, as the web verdict says it.
  static func rangeLine(_ rate: Double, low: Double, high: Double) -> String {
    if rate > high + 0.0005 { return "Above today's \(pct(low))–\(pct(high))." }
    if rate < low - 0.0005 { return "Below today's \(pct(low))–\(pct(high)). Check the fees and points." }
    return "Inside today's \(pct(low))–\(pct(high))."
  }

  // Mortgage rates come in eighths: 6.375% stays 6.375%.
  static func pct(_ v: Double) -> String { String(format: Int((v * 1000).rounded()) % 10 != 0 ? "%.3f%%" : "%.2f%%", v) }
  static func money(_ v: Double) -> String {
    let f = NumberFormatter(); f.numberStyle = .decimal; f.maximumFractionDigits = 0
    return "$" + (f.string(from: NSNumber(value: v)) ?? String(Int(v)))
  }
  /// Midpoint of target and walk-away, rounded down to 0.05, always below the walk-away.
  static func finalRate(_ l: PackLimits) -> Double {
    guard l.maxRate > l.targetRate else { return l.targetRate }
    let mid = floor(((l.targetRate + l.maxRate) / 2) * 20 + 1e-9) / 20
    return (mid >= l.maxRate || mid < l.targetRate) ? l.targetRate : mid
  }

  struct Reply { let tone: String; let text: String; let reveals: String }

  static func replies(deal: PackDeal, theirFees: Double?) -> [Reply] {
    guard let l = deal.limits else { return [] }
    let name = deal.contact?.split(separator: " ").first.map(String.init)
    let thanks = name.map { "Thanks \($0)!" } ?? "Thanks!"
    let fees = theirFees.map { money(min($0, l.maxFees)) }
    let useQuote = deal.reveal.competingQuote && (deal.quote?.rate ?? 99) <= l.targetRate + 0.0005
    let friendly: String
    if useQuote, let q = deal.quote {
      friendly = "\(thanks) I have a \(q.written ? "written " : "")\(pct(q.rate)) elsewhere. Can you match it\(fees.map { " and bring fees to \($0)" } ?? "")?"
    } else {
      friendly = "\(thanks) Could you get to \(pct(l.targetRate))\(fees.map { " and bring fees to \($0)" } ?? "")?"
    }
    let firm = fees.map { "I'm ready to lock today at \(pct(l.targetRate)) with \($0) in fees. Can you do that?" } ?? "I'm ready to lock today at \(pct(l.targetRate)). Can you do that?"
    let last = fees.map { "\(pct(finalRate(l))) with \($0) in fees is as far as I can go. If that works, send the lock." } ?? "\(pct(finalRate(l))) is as far as I can go. If that works, send the lock."
    return [
      Reply(tone: "FRIENDLY", text: friendly, reveals: useQuote ? "Reveals: your competing quote" : "Reveals: nothing private"),
      Reply(tone: "FIRM", text: firm, reveals: "Reveals: nothing private"),
      Reply(tone: "FINAL OFFER", text: last, reveals: "Reveals: nothing private"),
    ]
  }

  /// The number check from the leak guard: does this text name the walk-away rate?
  static func leaksWalkAway(_ text: String, limits: PackLimits) -> Bool {
    guard abs(limits.maxRate - limits.targetRate) > 0.0005 else { return false }
    return rateMentions(text).contains { abs($0 - limits.maxRate) < 0.0005 }
  }
}

// MARK: - On-device model (optional)

enum OnDevice {
  /// One call, not streamed. Returns (text, nil) or (nil, reason).
  static func respondDetailed(_ prompt: String) async -> (String?, String?) {
    #if canImport(FoundationModels)
    if #available(iOS 26.0, *) {
      let availability = SystemLanguageModel.default.availability
      guard case .available = availability else { return (nil, "model unavailable: \(availability)") }
      do {
        return (try await LanguageModelSession().respond(to: prompt).content, nil)
      } catch {
        return (nil, "model error: \(error)")
      }
    }
    return (nil, "needs iOS 26")
    #else
    return (nil, "FoundationModels is not in this SDK")
    #endif
  }

  static func respond(_ prompt: String) async -> String? {
    return await respondDetailed(prompt).0
  }
}

// MARK: - The panel

final class KeyboardViewController: UIInputViewController {
  let stack = UIStackView()
  let dealChip = UILabel()
  let badge = UILabel()
  let body = UILabel()
  let replyStack = UIStackView()
  var pack: Pack?
  // Test bench for T1–T4 (KeyboardTests.swift). Hidden until the "Tests" key is tapped.
  let testRow = UIStackView()
  var testLog: [String] = []
  var t2Count = 0
  var t2Fails = 0
  var t2First: Date?

  var deal: PackDeal? {
    guard let p = pack else { return nil }
    return p.deals.first { $0.id == p.activeId } ?? p.deals.first
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    pack = PackStore.load()

    stack.axis = .vertical; stack.spacing = 8
    stack.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(stack)
    NSLayoutConstraint.activate([
      stack.topAnchor.constraint(equalTo: view.topAnchor, constant: 10),
      stack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 10),
      stack.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -10),
      stack.bottomAnchor.constraint(equalTo: view.bottomAnchor, constant: -10),
      view.heightAnchor.constraint(greaterThanOrEqualToConstant: 300),
    ])

    let header = UIStackView(arrangedSubviews: [dealChip, UIView(), badge])
    dealChip.font = .systemFont(ofSize: 12, weight: .bold)
    badge.font = .systemFont(ofSize: 12, weight: .bold)
    body.font = .systemFont(ofSize: 13); body.numberOfLines = 0
    replyStack.axis = .vertical; replyStack.spacing = 6

    let keys = UIStackView(); keys.spacing = 8; keys.distribution = .fillEqually
    keys.addArrangedSubview(key("🌐", #selector(nextKeyboard)))
    keys.addArrangedSubview(key("Check", #selector(tapCheck)))
    keys.addArrangedSubview(key("Counter", #selector(tapCounter), hot: true))
    keys.addArrangedSubview(key("Explain", #selector(tapExplain)))
    keys.addArrangedSubview(key("Tests", #selector(tapTests)))
    buildTestRow()

    [header, body, replyStack, UIView(), testRow, keys].forEach { stack.addArrangedSubview($0) }
    showReady()
  }

  func key(_ title: String, _ action: Selector, hot: Bool = false) -> UIButton {
    let b = UIButton(type: .system)
    b.setTitle(title, for: .normal)
    b.titleLabel?.font = .systemFont(ofSize: 15, weight: .bold)
    b.backgroundColor = hot ? UIColor(red: 1, green: 0.42, blue: 0.36, alpha: 1) : .secondarySystemBackground
    b.setTitleColor(hot ? UIColor(red: 0.12, green: 0.14, blue: 0.13, alpha: 1) : .label, for: .normal)
    b.layer.cornerRadius = 12
    b.heightAnchor.constraint(equalToConstant: 46).isActive = true
    b.addTarget(self, action: action, for: .touchUpInside)
    return b
  }

  func show(_ text: String, source: String) {
    replyStack.arrangedSubviews.forEach { $0.removeFromSuperview() }
    body.text = text
    badge.text = source
    dealChip.text = deal.map { "🔒 \($0.label)" } ?? "No deal selected"
  }

  func showReady() {
    if pack == nil {
      // Pack import fallback (test T4 failed): the app copies a code, one tap imports it.
      if let clip = UIPasteboard.general.string, clip.hasPrefix("SL1."), PackStore.importCode(clip) {
        pack = PackStore.load()
      } else {
        return show("Set your limits in the Quotekey app. They are shared with this keyboard so it can keep replies inside them.", source: "")
      }
    }
    show("Copy their message, then pick one.", source: "")
  }

  func copied() -> String? {
    guard hasFullAccess else { show("Turn on Allow Full Access for Quotekey so it can read the message you copied. Nothing is sent anywhere.", source: ""); return nil }
    guard let t = UIPasteboard.general.string, !t.isEmpty, !t.hasPrefix("SL1.") else { show("Copy their message first.", source: ""); return nil }
    return t
  }

  @objc func nextKeyboard() { advanceToNextInputMode() }

  @objc func tapCheck() {
    // Text already typed in the box is the user's own reply: run the leak guard on it.
    if let typed = textDocumentProxy.documentContextBeforeInput, !typed.isEmpty, let l = deal?.limits, Rules.leaksWalkAway(typed, limits: l) {
      return show("Hold on before you send. This gives away your walk-away rate. Once a lender knows the highest number you'll accept, that is usually the number you get.", source: "Offline rules")
    }
    guard let text = copied() else { return }
    let scam = Rules.scamReasons(text, marketLow: deal?.range?.low, knownNames: [deal?.lender, deal?.contact].compactMap { $0 })
    if !scam.isEmpty { return show("Likely a scam. Don't reply.\n• " + scam.joined(separator: "\n• "), source: "Offline rules") }
    guard let rate = Rules.rate(text) else { return show("No rate in this message. Ask for the rate, APR, fees and term in writing.", source: "Offline rules") }
    var parts: [String] = []
    if let r = deal?.range { parts.append(Rules.rangeLine(rate, low: r.low, high: r.high)) }
    if let l = deal?.limits {
      if rate > l.maxRate { parts.append("The rate is over your limit.") }
      if let f = Rules.fees(text), f > l.maxFees { parts.append("Fees are \(Rules.money(f - l.maxFees)) over your limit.") }
    }
    let over = parts.contains { $0.hasPrefix("Above") || $0.contains("over your limit") }
    show("\(Rules.pct(rate)) · \(over ? "Real offer, but overpriced" : "Competitive offer")\n" + parts.joined(separator: " "), source: "Offline rules")
  }

  @objc func tapCounter() {
    guard let text = copied() else { return }
    if !Rules.scamReasons(text, marketLow: deal?.range?.low, knownNames: [deal?.lender, deal?.contact].compactMap { $0 }).isEmpty { return show("Likely a scam. No reply is offered for scam messages. Don't tap the link.", source: "Offline rules") }
    guard let d = deal, d.limits != nil else { return show("Set your limits in the Quotekey app first.", source: "") }
    let replies = Rules.replies(deal: d, theirFees: Rules.fees(text))
    show("Tap a reply to put it in the message box. You press send.", source: "Offline rules")
    for (i, r) in replies.enumerated() {
      let b = UIButton(type: .system)
      b.tag = i
      b.contentHorizontalAlignment = .leading
      b.titleLabel?.numberOfLines = 0
      b.titleLabel?.font = .systemFont(ofSize: 13)
      b.setTitle("\(r.tone)\n\(r.text)\n\(r.reveals)", for: .normal)
      b.setTitleColor(.label, for: .normal)
      b.backgroundColor = .secondarySystemBackground
      b.layer.cornerRadius = 14
      b.contentEdgeInsets = UIEdgeInsets(top: 8, left: 12, bottom: 8, right: 12)
      b.accessibilityValue = r.text
      b.addTarget(self, action: #selector(insertReply(_:)), for: .touchUpInside)
      replyStack.addArrangedSubview(b)
    }
  }

  @objc func insertReply(_ sender: UIButton) {
    guard let text = sender.accessibilityValue else { return }
    // Final gate: nothing that names the walk-away rate is ever typed for the user.
    if let l = deal?.limits, Rules.leaksWalkAway(text, limits: l) { return }
    textDocumentProxy.insertText(text)
    show("Filled in by Quotekey. Read it, then press send.", source: badge.text ?? "")
  }

  @objc func tapExplain() {
    guard let text = copied() else { return }
    show("Putting it in plain words…", source: "")
    Task { @MainActor in
      let prompt = "Explain this loan message to someone with no finance background in three short lines. Do not say whether to accept it.\n-----\n\(text.prefix(1200))\n-----"
      if let answer = await OnDevice.respond(prompt) {
        show(answer, source: "On-device")
      } else {
        show("APR is the yearly cost with most fees folded in. Fees are what you pay at signing; ask which are the lender's own. A rate lock holds the rate until a set date.", source: "Offline rules")
      }
    }
  }
}
