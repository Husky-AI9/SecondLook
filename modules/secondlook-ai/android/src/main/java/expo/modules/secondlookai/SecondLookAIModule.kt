// SecondLook · Firebase AI Logic hybrid inference on Android.
//
// On-device: Gemini Nano through AICore (ML Kit Prompt API under the hood).
// Cloud: Gemini through the same Firebase AI Logic SDK.
//
// NOTE: written against the Firebase AI Logic documentation as of November 2026
// (firebase.google.com/docs/ai-logic/hybrid/android) and NOT yet compiled. The hybrid API is
// marked Experimental by Firebase; places most likely to need a tweak are tagged "API:".

package expo.modules.secondlookai

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import com.google.firebase.Firebase
import com.google.firebase.FirebaseApp
import com.google.firebase.ai.InferenceMode
import com.google.firebase.ai.OnDeviceConfig
import com.google.firebase.ai.OnDeviceModelOption
import com.google.firebase.ai.ai
import com.google.firebase.ai.ondevice.FirebaseAIOnDevice
import com.google.firebase.ai.ondevice.OnDeviceModelStatus
import com.google.firebase.ai.type.GenerativeBackend
import com.google.firebase.ai.type.PublicPreviewAPI
import com.google.firebase.ai.type.Tool
import com.google.firebase.appcheck.appCheck
import com.google.firebase.appcheck.debug.DebugAppCheckProviderFactory
import com.google.firebase.appcheck.playintegrity.PlayIntegrityAppCheckProviderFactory
import com.google.firebase.remoteconfig.remoteConfig
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

@OptIn(PublicPreviewAPI::class)
class SecondLookAIModule : Module() {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private var pendingShared: String? = null
  private var downloadStarted = false

  private fun meta(key: String): String? {
    val ctx = appContext.reactContext ?: return null
    return try {
      val info = ctx.packageManager.getApplicationInfo(ctx.packageName, PackageManager.GET_META_DATA)
      info.metaData?.get(key)?.toString()
    } catch (e: Exception) {
      null
    }
  }

  private fun configured(): Boolean {
    val ctx = appContext.reactContext ?: return false
    return FirebaseApp.getApps(ctx).isNotEmpty()
  }

  /** "Highlight text → SecondLook": the selected text arrives as EXTRA_PROCESS_TEXT. */
  private fun takeProcessText(intent: Intent?): String? {
    if (intent == null || intent.action != Intent.ACTION_PROCESS_TEXT) return null
    val text = intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT)?.toString()
    intent.removeExtra(Intent.EXTRA_PROCESS_TEXT)
    return text?.takeIf { it.isNotBlank() }
  }

  /**
   * A build can carry a fixed App Check debug token (registered in the Firebase console), so
   * every install passes App Check without anyone reading logcat. The debug provider keeps its
   * secret in this store and only makes up a random one, printed to logcat, when it is empty.
   */
  private fun seedDebugToken(ctx: Context) {
    val token = meta("secondlook.appcheck.debug_token")?.trim()?.takeIf { it.isNotEmpty() } ?: return
    val app = FirebaseApp.getInstance()
    ctx.getSharedPreferences("com.google.firebase.appcheck.debug.store.${app.persistenceKey}", Context.MODE_PRIVATE)
      .edit()
      .putString("com.google.firebase.appcheck.debug.DEBUG_SECRET", token)
      .commit()
  }

  /** Gemini Nano 4 is the PREVIEW category (needs the AICore developer preview). */
  private fun modelOption(): OnDeviceModelOption = when (meta("secondlook.ondevice.option")?.uppercase()) {
    "STABLE" -> OnDeviceModelOption.STABLE
    "PREVIEW_FAST" -> OnDeviceModelOption.PREVIEW_FAST
    else -> OnDeviceModelOption.PREVIEW
  }

  override fun definition() = ModuleDefinition {
    Name("SecondLookAI")
    Events("onSharedText")

    OnCreate {
      val ctx = appContext.reactContext
      if (ctx != null) {
        // With google-services.json present Firebase starts itself; this covers a late start.
        if (FirebaseApp.getApps(ctx).isEmpty()) FirebaseApp.initializeApp(ctx)
        if (FirebaseApp.getApps(ctx).isNotEmpty()) {
          // App Check: debug provider for development and the hackathon APK (the rules accept
          // debug tokens). Play Integrity otherwise.
          val debug = meta("secondlook.appcheck.debug") != "false"
          if (debug) seedDebugToken(ctx)
          Firebase.appCheck.installAppCheckProviderFactory(
            if (debug) DebugAppCheckProviderFactory.getInstance() else PlayIntegrityAppCheckProviderFactory.getInstance(),
          )
        }
      }
      pendingShared = takeProcessText(appContext.currentActivity?.intent)
    }

    OnNewIntent { intent ->
      takeProcessText(intent)?.let { sendEvent("onSharedText", mapOf("text" to it)) }
    }

    Function("consumeSharedText") {
      val text = pendingShared ?: takeProcessText(appContext.currentActivity?.intent)
      pendingShared = null
      text
    }

    // { onDevice: "available" | "downloadable" | "downloading" | "unavailable", reason? }
    AsyncFunction("availability") Coroutine { ->
      if (!configured()) {
        return@Coroutine mapOf("onDevice" to "unavailable", "reason" to "Firebase is not set up in this build.")
      }
      try {
        // API: FirebaseAIOnDevice.checkStatus() / download()
        when (FirebaseAIOnDevice.checkStatus()) {
          OnDeviceModelStatus.AVAILABLE -> mapOf("onDevice" to "available")
          OnDeviceModelStatus.DOWNLOADING -> mapOf("onDevice" to "downloading", "reason" to "Gemini Nano is downloading.")
          OnDeviceModelStatus.DOWNLOADABLE -> {
            if (!downloadStarted) {
              downloadStarted = true
              scope.launch { try { FirebaseAIOnDevice.download().collect { } } catch (e: Exception) { downloadStarted = false } }
            }
            mapOf("onDevice" to "downloading", "reason" to "Gemini Nano is downloading. Answers use the cloud until it is ready.")
          }
          else -> mapOf("onDevice" to "unavailable", "reason" to "This phone has no on-device Gemini Nano.")
        }
      } catch (e: Exception) {
        mapOf("onDevice" to "unavailable", "reason" to (e.message ?: "Could not check the on-device model."))
      }
    }

    // mode: "only-on-device" | "prefer-on-device" | "only-cloud"
    AsyncFunction("generate") Coroutine { prompt: String, mode: String, grounded: Boolean, cloudModel: String ->
      if (!configured()) throw IllegalStateException("Firebase is not set up in this build.")
      val ai = Firebase.ai(backend = GenerativeBackend.googleAI())

      // The market range: cloud only, with Grounding with Google Search.
      if (grounded) {
        val model = ai.generativeModel(modelName = cloudModel, tools = listOf(Tool.googleSearch()))
        val response = model.generateContent(prompt)
        val meta = response.candidates.firstOrNull()?.groundingMetadata
        val sources = meta?.groundingChunks?.mapNotNull { chunk ->
          val uri = chunk.web?.uri ?: return@mapNotNull null
          mapOf("title" to (chunk.web?.title ?: uri), "url" to uri)
        } ?: emptyList()
        return@Coroutine mapOf(
          "text" to (response.text ?: ""),
          "source" to "cloud",
          "model" to cloudModel,
          "sources" to sources,
          "searchQueries" to (meta?.webSearchQueries ?: emptyList<String>()),
          "searchHtml" to meta?.searchEntryPoint?.renderedContent,
        )
      }

      // ONLY_ON_DEVICE is the privacy contract for private prompts: the SDK throws rather
      // than fall back to the cloud. PREFER_ON_DEVICE is used for redacted or generic text.
      val inference = when (mode) {
        "only-on-device" -> InferenceMode.ONLY_ON_DEVICE
        "only-cloud" -> InferenceMode.ONLY_IN_CLOUD
        else -> InferenceMode.PREFER_ON_DEVICE
      }
      val model = ai.generativeModel(
        modelName = cloudModel,
        onDeviceConfig = OnDeviceConfig(mode = inference, modelOption = modelOption()),
      )
      val response = model.generateContent(prompt)
      // API: inferenceSource is ON_DEVICE or IN_CLOUD.
      val onDevice = mode == "only-on-device" || response.inferenceSource.toString().contains("DEVICE")
      mapOf(
        "text" to (response.text ?: ""),
        "source" to (if (onDevice) "on-device" else "cloud"),
        "model" to (if (onDevice) "gemini-nano" else cloudModel),
      )
    }

    // Remote Config: scam rules and model names can change without a new build.
    AsyncFunction("remoteConfig") Coroutine { defaults: Map<String, String> ->
      if (!configured()) return@Coroutine defaults
      try {
        val rc = Firebase.remoteConfig
        rc.setDefaultsAsync(defaults).await()
        rc.fetchAndActivate().await()
        defaults.mapValues { (key, fallback) -> rc.getString(key).ifEmpty { fallback } }
      } catch (e: Exception) {
        defaults
      }
    }
  }
}
