// Setup shared by the app's native module and the SecondLook keyboard. Both run in the same
// app process, and either can be the first to start it: the keyboard can be opened in another
// app before SecondLook itself has run.

package expo.modules.secondlookai

import android.content.Context
import android.content.pm.PackageManager
import com.google.firebase.Firebase
import com.google.firebase.FirebaseApp
import com.google.firebase.ai.OnDeviceModelOption
import com.google.firebase.ai.type.PublicPreviewAPI
import com.google.firebase.appcheck.appCheck
import com.google.firebase.appcheck.debug.DebugAppCheckProviderFactory
import com.google.firebase.appcheck.playintegrity.PlayIntegrityAppCheckProviderFactory

@OptIn(PublicPreviewAPI::class)
internal object SecondLookShared {
  /** App-private storage the keyboard reads: the limits pack written by the app. */
  const val KEYBOARD_PREFS = "secondlook.keyboard"
  const val PACK_KEY = "secondlook.pack.v1"

  private var appCheckInstalled = false

  fun meta(ctx: Context, key: String): String? = try {
    val info = ctx.packageManager.getApplicationInfo(ctx.packageName, PackageManager.GET_META_DATA)
    info.metaData?.get(key)?.toString()
  } catch (e: Exception) {
    null
  }

  /** Starts Firebase and App Check once per process. Returns false when Firebase is not in this build. */
  @Synchronized
  fun ensureFirebase(context: Context): Boolean {
    val ctx = context.applicationContext
    // With google-services.json present Firebase starts itself; this covers a late start.
    if (FirebaseApp.getApps(ctx).isEmpty()) FirebaseApp.initializeApp(ctx)
    if (FirebaseApp.getApps(ctx).isEmpty()) return false
    if (!appCheckInstalled) {
      // App Check: debug provider for development and the hackathon builds (the rules accept
      // debug tokens). Play Integrity otherwise.
      val debug = meta(ctx, "secondlook.appcheck.debug") != "false"
      if (debug) seedDebugToken(ctx)
      Firebase.appCheck.installAppCheckProviderFactory(
        if (debug) DebugAppCheckProviderFactory.getInstance() else PlayIntegrityAppCheckProviderFactory.getInstance(),
      )
      appCheckInstalled = true
    }
    return true
  }

  /**
   * A build can carry a fixed App Check debug token (registered in the Firebase console), so
   * every install passes App Check without anyone reading logcat. The debug provider keeps its
   * secret in this store and only makes up a random one, printed to logcat, when it is empty.
   */
  private fun seedDebugToken(ctx: Context) {
    val token = meta(ctx, "secondlook.appcheck.debug_token")?.trim()?.takeIf { it.isNotEmpty() } ?: return
    val app = FirebaseApp.getInstance()
    ctx.getSharedPreferences("com.google.firebase.appcheck.debug.store.${app.persistenceKey}", Context.MODE_PRIVATE)
      .edit()
      .putString("com.google.firebase.appcheck.debug.DEBUG_SECRET", token)
      .commit()
  }

  /** Gemini Nano 4 is the PREVIEW category (needs the AICore developer preview). */
  fun modelOption(ctx: Context): OnDeviceModelOption = when (meta(ctx, "secondlook.ondevice.option")?.uppercase()) {
    "STABLE" -> OnDeviceModelOption.STABLE
    "PREVIEW_FAST" -> OnDeviceModelOption.PREVIEW_FAST
    else -> OnDeviceModelOption.PREVIEW
  }

  fun writeKeyboard(ctx: Context, key: String, value: String): Boolean =
    ctx.applicationContext.getSharedPreferences(KEYBOARD_PREFS, Context.MODE_PRIVATE).edit().putString(key, value).commit()

  fun readKeyboard(ctx: Context, key: String): String? =
    ctx.applicationContext.getSharedPreferences(KEYBOARD_PREFS, Context.MODE_PRIVATE).getString(key, null)
}
