Pod::Spec.new do |s|
  s.name           = 'SecondLookAI'
  s.version        = '1.0.0'
  s.summary        = 'Firebase AI Logic hybrid inference for SecondLook'
  s.description    = 'Calls Firebase AI Logic on iOS: Apple Foundation Models on-device, Gemini in the cloud as fallback.'
  s.license        = 'Apache-2.0'
  s.author         = 'SecondLook'
  s.homepage       = 'https://github.com/'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
  s.source_files = '**/*.{h,m,swift}'

  # Firebase AI Logic's hybrid (on-device) support is only distributed through Swift Package
  # Manager, while Expo modules are CocoaPods pods. React Native's `spm_dependency` helper
  # (available in every podspec during `pod install`) bridges the two.
  #
  # If the first iOS build fails at this step, see SETUP.md, "If the iOS build fails".
  if defined?(spm_dependency)
    spm_dependency(s,
      url: 'https://github.com/firebase/firebase-ios-sdk.git',
      requirement: { kind: 'upToNextMajorVersion', minimumVersion: '12.13.0' },
      products: ['FirebaseCore', 'FirebaseAILogic', 'FirebaseAppCheck', 'FirebaseRemoteConfig']
    )
  else
    raise 'SecondLookAI needs the React Native `spm_dependency` helper to pull Firebase through Swift Package Manager.'
  end
end
