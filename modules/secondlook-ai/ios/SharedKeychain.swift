// A keychain drawer shared by the app and the keyboard extension.
//
// The access group has to start with the signing team's prefix, and with a sideloaded build
// that prefix is only known after Sideloadly has signed the app. So it is discovered at run
// time: add a probe item, read back the access group iOS gave it, keep the first component.
//
// This file exists twice with the same contents (module and keyboard target), because the
// two are separate binaries: modules/secondlook-ai/ios and targets/keyboard.

import Foundation
import Security

enum SLSharedKeychain {
  static let service = "secondlook.shared"
  static let suffix = "secondlook.shared"

  static func teamPrefix() -> String? {
    let base: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: "secondlook.probe",
      kSecAttrAccount as String: "probe",
    ]
    var query = base
    query[kSecReturnAttributes as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var out: CFTypeRef?
    var status = SecItemCopyMatching(query as CFDictionary, &out)
    if status == errSecItemNotFound {
      var add = base
      add[kSecValueData as String] = Data("1".utf8)
      add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
      add[kSecReturnAttributes as String] = true
      status = SecItemAdd(add as CFDictionary, &out)
    }
    guard status == errSecSuccess, let attrs = out as? [String: Any],
          let group = attrs[kSecAttrAccessGroup as String] as? String else { return nil }
    return group.split(separator: ".").first.map(String.init)
  }

  static func group() -> String? {
    return teamPrefix().map { "\($0).\(suffix)" }
  }

  private static func key(_ account: String, _ group: String) -> [String: Any] {
    return [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      kSecAttrAccessGroup as String: group,
    ]
  }

  /// errSecSuccess (0) on success. -34018 means this build is not entitled to the shared group.
  @discardableResult
  static func write(_ account: String, _ value: String) -> OSStatus {
    guard let group = group() else { return errSecMissingEntitlement }
    SecItemDelete(key(account, group) as CFDictionary)
    var add = key(account, group)
    add[kSecValueData as String] = Data(value.utf8)
    add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
    return SecItemAdd(add as CFDictionary, nil)
  }

  static func read(_ account: String) -> (value: String?, status: OSStatus) {
    guard let group = group() else { return (nil, errSecMissingEntitlement) }
    var query = key(account, group)
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var out: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &out)
    guard status == errSecSuccess, let data = out as? Data else { return (nil, status) }
    return (String(data: data, encoding: .utf8), status)
  }
}
