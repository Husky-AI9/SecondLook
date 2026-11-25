// SecondLook keyboard for Android: Check · Counter · Explain, in any app.
//
// The Android twin of the iPhone keyboard (targets/keyboard). It follows the same rules from
// implementation.md:
//   - a panel, not a typing keyboard; the globe key goes back to the normal keyboard
//   - it does no setup of its own: it reads the pack the app wrote (locked limits, Deal File
//     facts, cached market range) from app-private storage
//   - Check and Counter use the same rules and reply wording as the iPhone keyboard, so they
//     answer instantly and never put the walk-away rate in a reply
//   - Explain uses Firebase AI Logic: Gemini Nano on the phone when it is there (the message
//     never leaves the phone), otherwise the message with names, numbers that identify people
//     and links removed goes to the cloud, if the user allows that in Settings
//   - one model call per tap; nothing is sent automatically; the user presses send

package expo.modules.secondlookai

import android.content.ClipboardManager
import android.content.Context
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.inputmethodservice.InputMethodService
import android.os.Build
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.google.firebase.Firebase
import com.google.firebase.ai.InferenceMode
import com.google.firebase.ai.OnDeviceConfig
import com.google.firebase.ai.ai
import com.google.firebase.ai.ondevice.FirebaseAIOnDevice
import com.google.firebase.ai.ondevice.OnDeviceModelStatus
import com.google.firebase.ai.type.GenerativeBackend
import com.google.firebase.ai.type.PublicPreviewAPI
import com.google.firebase.remoteconfig.remoteConfig
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONObject
import java.text.NumberFormat
import java.util.Locale
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.min

// ---------------------------------------------------------------- pack (src/engine/pack.ts)

internal data class KLimits(val maxRate: Double, val maxFees: Double, val targetRate: Double)

internal data class KDeal(
  val id: String,
  val label: String,
  val lender: String,
  val contact: String?,
  val limits: KLimits?,
  val revealQuote: Boolean,
  val quoteRate: Double?,
  val quoteWritten: Boolean,
  val rangeLow: Double?,
  val rangeHigh: Double?,
)

internal data class KPack(val activeId: String?, val deals: List<KDeal>, val cloudFallback: Boolean) {
  val deal: KDeal? get() = deals.firstOrNull { it.id == activeId } ?: deals.firstOrNull()

  companion object {
    fun parse(json: String?): KPack? {
      if (json.isNullOrBlank()) return null
      return try {
        val o = JSONObject(json)
        val arr = o.optJSONArray("deals") ?: return null
        val deals = (0 until arr.length()).mapNotNull { i ->
          val d = arr.optJSONObject(i) ?: return@mapNotNull null
          val l = d.optJSONObject("limits")
          val q = d.optJSONObject("quote")
          val r = d.optJSONObject("range")
          val rev = d.optJSONObject("reveal")
          KDeal(
            id = d.optString("id"),
            label = d.optString("label"),
            lender = d.optString("lender"),
            contact = d.optString("contact").takeIf { it.isNotBlank() && d.has("contact") },
            limits = l?.let { KLimits(it.optDouble("maxRate"), it.optDouble("maxFees"), it.optDouble("targetRate")) }
              ?.takeIf { !it.maxRate.isNaN() && !it.targetRate.isNaN() },
            revealQuote = rev?.optBoolean("competingQuote") ?: false,
            quoteRate = q?.optDouble("rate")?.takeIf { !it.isNaN() },
            quoteWritten = q?.optBoolean("written") ?: false,
            rangeLow = r?.optDouble("low")?.takeIf { !it.isNaN() },
            rangeHigh = r?.optDouble("high")?.takeIf { !it.isNaN() },
          )
        }
        KPack(o.optString("activeId").takeIf { it.isNotBlank() }, deals, o.optBoolean("cloudFallback", true))
      } catch (e: Exception) {
        null
      }
    }
  }
}

// ---------------------------------------------------------------- rules (same as the iPhone keyboard)

internal object KRules {
  private val RATE = Regex("""(\d{1,2}(?:\.\d{1,3})?)\s?%""")
  private val FEES = Regex(
    """\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?\s?(?:in )?(?:total )?(?:lender |closing )?(?:fees?|closing costs?)""",
    RegexOption.IGNORE_CASE,
  )

  fun rate(text: String): Double? = RATE.find(text)?.groupValues?.get(1)?.toDoubleOrNull()
  fun fees(text: String): Double? = FEES.find(text)?.groupValues?.get(1)?.replace(",", "")?.toDoubleOrNull()
  fun percents(text: String): List<Double> = RATE.findAll(text).mapNotNull { it.groupValues[1].toDoubleOrNull() }.toList()

  private val SCAM_SIGNS = listOf(
    Triple("""(pay|send|wire|deposit)\b.{0,50}\b(fee|deposit|insurance|tax)s?\b.{0,70}\b(release|unlock|receive|claim|before|first)|(processing|advance|release|activation) fee""", "Asks for a fee before any money is paid out", 3),
    Triple("""\b(pay|send|act|respond|claim|click)\b.{0,40}\b(today|now|immediately)|last chance|final notice|urgent""", "Pressure to pay today", 2),
    Triple("""https?://|www\.|\b[a-z0-9-]+\.(com|net|org|info|biz|xyz|top|site|online|click|example)\b""", "Link goes to a site that isn't a known lender", 2),
    Triple("""gift ?cards?|bitcoin|crypto|western union|moneygram|zelle|cash ?app|wire transfer""", "Wants payment by gift card, crypto or wire", 4),
    Triple("""guaranteed approval|no credit check|100% approv""", "Promises approval with no credit check", 3),
  ).map { (p, label, w) -> Triple(Regex(p, RegexOption.IGNORE_CASE), label, w) }

  fun scamReasons(text: String): List<String> {
    var score = 0
    val reasons = mutableListOf<String>()
    for ((re, label, weight) in SCAM_SIGNS) {
      if (re.containsMatchIn(text)) {
        score += weight
        reasons.add(label)
      }
    }
    return if (score >= 5) reasons else emptyList()
  }

  fun pct(v: Double): String = String.format(Locale.US, "%.2f%%", v)
  fun money(v: Double): String = "$" + NumberFormat.getIntegerInstance(Locale.US).format(v.toLong())

  /** Midpoint of target and walk-away, rounded down to 0.05, always below the walk-away. */
  fun finalRate(l: KLimits): Double {
    if (l.maxRate <= l.targetRate) return l.targetRate
    val mid = floor(((l.targetRate + l.maxRate) / 2) * 20 + 1e-9) / 20
    return if (mid >= l.maxRate || mid < l.targetRate) l.targetRate else mid
  }

  data class Reply(val tone: String, val text: String, val reveals: String)

  fun replies(deal: KDeal, theirFees: Double?): List<Reply> {
    val l = deal.limits ?: return emptyList()
    val name = deal.contact?.split(" ")?.firstOrNull()?.takeIf { it.isNotBlank() }
    val thanks = name?.let { "Thanks $it!" } ?: "Thanks!"
    val fees = theirFees?.let { money(min(it, l.maxFees)) }
    val useQuote = deal.revealQuote && (deal.quoteRate ?: 99.0) <= l.targetRate + 0.0005
    val feePart = fees?.let { " and bring fees to $it" } ?: ""
    val friendly = if (useQuote && deal.quoteRate != null) {
      "$thanks I have a ${if (deal.quoteWritten) "written " else ""}${pct(deal.quoteRate)} elsewhere. Can you match it$feePart?"
    } else {
      "$thanks Could you get to ${pct(l.targetRate)}$feePart?"
    }
    val firm = fees?.let { "I'm ready to lock today at ${pct(l.targetRate)} with $it in fees. Can you do that?" }
      ?: "I'm ready to lock today at ${pct(l.targetRate)}. Can you do that?"
    val last = fees?.let { "${pct(finalRate(l))} with $it in fees is as far as I can go. If that works, send the lock." }
      ?: "${pct(finalRate(l))} is as far as I can go. If that works, send the lock."
    return listOf(
      Reply("FRIENDLY", friendly, if (useQuote) "Reveals: your competing quote" else "Reveals: nothing private"),
      Reply("FIRM", firm, "Reveals: nothing private"),
      Reply("FINAL OFFER", last, "Reveals: nothing private"),
    )
  }

  /** The number check from the leak guard: does this text name the walk-away rate? */
  fun leaksWalkAway(text: String, l: KLimits): Boolean {
    if (abs(l.maxRate - l.targetRate) <= 0.0005) return false
    return percents(text).any { abs(it - l.maxRate) < 0.0005 }
  }

  /** What to say instead of the walk-away rate: the target, which reveals nothing. */
  fun safer(l: KLimits): String =
    "I'm looking for ${pct(l.targetRate)} with ${money(l.maxFees)} in fees. Can you get there?"
}

// ---------------------------------------------------------------- redaction (port of src/engine/redact.ts)

internal object KRedact {
  private val NAME_STOP = setOf("home", "loans", "loan", "auto", "bank", "mortgage", "credit", "union", "finance", "financial", "lending", "the", "and", "group", "desk", "capital", "first", "national")
  private val KEEP = ("monday tuesday wednesday thursday friday saturday sunday january february march april may june july august " +
    "september october november december loan estimate rate lock closing disclosure fixed points apr arm gap fha va usda pmi vin " +
    "nmls ok okay yes no hi hello hey thanks thank dear congrats").split(" ").toSet()

  fun redact(text: String, names: List<String?>): String {
    var t = text
    fun sub(re: Regex, to: String) { t = re.replace(t, to) }
    sub(Regex("""\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b"""), "[email]")
    sub(Regex("""\b(?:https?://|www\.)[^\s)]+""", RegexOption.IGNORE_CASE), "[link]")
    sub(Regex("""\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|co|info|biz|us|loans?|finance|xyz|top|site|online|click|link|example|app)\b(?:/[^\s)]*)?""", RegexOption.IGNORE_CASE), "[link]")
    sub(Regex("""\b\d{3}-\d{2}-\d{4}\b"""), "[id number]")
    sub(Regex("""\bnmls\s*(?:id|no\.?|number)?\s*#?\s*:?\s*\d{3,}""", RegexOption.IGNORE_CASE), "[licence]")
    sub(Regex("""(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b"""), "[phone]")
    sub(Regex("""\b\d{1,5}\s+(?:[A-Z][a-z]+\s){1,3}(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Way|Ct|Court|Pl|Place)\b\.?"""), "[address]")
    sub(Regex("""(?<![$\d.,])\b\d{8,}\b"""), "[number]")
    val full = names.filterNotNull().map { it.trim() }.filter { it.length >= 2 }
    for (n in full) sub(Regex("""\b${Regex.escape(n)}\b""", RegexOption.IGNORE_CASE), "[name]")
    for (n in full) for (w in n.split(Regex("""\s+"""))) {
      if (w.length < 3 || w.lowercase() in NAME_STOP) continue
      sub(Regex("""\b${Regex.escape(w)}\b""", RegexOption.IGNORE_CASE), "[name]")
    }
    sub(Regex("""\b([Hh]i|[Hh]ello|[Hh]ey|[Dd]ear|[Tt]hanks|[Tt]hank you)[ ,]+(?!\[)([A-Z][a-z]{1,15})(?=[\s,.!])"""), "\$1 [name]")
    sub(Regex("""\b([Tt]his is|[Ii]t's|[Ii]ts|[Ii] am|[Ii]'m)\s+(?!\[)([A-Z][a-z]{1,15})(\s+(?:from|at|with)\b)"""), "\$1 [name]\$3")
    sub(Regex("""\b(from|at|with)\s+(?!\[)((?:[A-Z][A-Za-z&]+\s){1,3}(?:Bank|Loans|Lending|Mortgage|Auto|Motors|Credit Union|Financial|Finance|Capital|Home Loans))\b"""), "\$1 [name]")
    // Any other capitalised word in the middle of a sentence is treated as a name or place.
    val whole = t
    t = Regex("""\b[A-Z][a-z]{1,15}\b""").replace(whole) { m ->
      val word = m.value
      if (word.lowercase() in KEEP) return@replace word
      val before = whole.substring(0, m.range.first)
      if (before.isBlank() || Regex("""([.!?:]\s+|\n\s*|]\s*)$""").containsMatchIn(before)) word else "[name]"
    }
    return t.replace(Regex("""(\[name])(\s+\[name])+"""), "[name]")
  }
}

// ---------------------------------------------------------------- the keyboard

@OptIn(PublicPreviewAPI::class)
class SecondLookKeyboardService : InputMethodService() {
  private enum class Tone { NEUTRAL, OK, WARN, DANGER, SCAM }

  private class Palette(dark: Boolean) {
    val panel = if (dark) 0xFF1B1D1B.toInt() else 0xFFD9D6CE.toInt()
    val card = if (dark) 0xFF3B403C.toInt() else 0xFFF8F7F3.toInt()
    val text = if (dark) 0xFFF1EFE9.toInt() else 0xFF232926.toInt()
    val muted = if (dark) 0xFFA9AEA8.toInt() else 0xFF555B57.toInt()
    val coral = 0xFFFF6B5C.toInt()
    val onCoral = 0xFF1F2422.toInt()
    val okBg = if (dark) 0xFF23382C.toInt() else 0xFFD9E8DC.toInt()
    val okText = if (dark) 0xFF7FD8A6.toInt() else 0xFF1F6B45.toInt()
    val warnBg = if (dark) 0xFF3D3216.toInt() else 0xFFF6E7C1.toInt()
    val warnText = if (dark) 0xFFF2C866.toInt() else 0xFF7F5200.toInt()
    val dangerBg = if (dark) 0xFF47201C.toInt() else 0xFFF8D9D4.toInt()
    val dangerText = if (dark) 0xFFFF9C90.toInt() else 0xFFA82A1E.toInt()
    val cloudBg = if (dark) 0xFF173540.toInt() else 0xFFD6ECF5.toInt()
    val cloudText = if (dark) 0xFF7FD3EE.toInt() else 0xFF0F5E7A.toInt()
    val scam = 0xFFC8301F.toInt()
  }

  private val scope = MainScope()
  private lateinit var c: Palette
  private lateinit var dealChip: TextView
  private lateinit var badge: TextView
  private lateinit var body: TextView
  private lateinit var replies: LinearLayout
  private lateinit var scroll: ScrollView
  private var pack: KPack? = null
  private var busy = false
  private var lastInserted: String? = null

  private val deal: KDeal? get() = pack?.deal

  override fun onCreate() {
    super.onCreate()
    try {
      SecondLookShared.ensureFirebase(this)
    } catch (e: Exception) {
      // The keyboard still works on its rules without Firebase.
    }
  }

  override fun onDestroy() {
    scope.cancel()
    super.onDestroy()
  }

  // A small panel, never the full-screen editor.
  override fun onEvaluateFullscreenMode(): Boolean = false

  private fun dp(v: Int): Int = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics).toInt()

  private fun rounded(color: Int, radius: Int, stroke: Int? = null): GradientDrawable = GradientDrawable().apply {
    setColor(color)
    cornerRadius = dp(radius).toFloat()
    if (stroke != null) setStroke(dp(2), stroke)
  }

  private fun label(size: Float, bold: Boolean, color: Int): TextView = TextView(this).apply {
    setTextSize(TypedValue.COMPLEX_UNIT_SP, size)
    setTextColor(color)
    if (bold) typeface = Typeface.DEFAULT_BOLD
  }

  private fun key(text: String, desc: String, hot: Boolean, onTap: () -> Unit): TextView = label(15f, true, if (hot) c.onCoral else c.text).apply {
    this.text = text
    contentDescription = desc
    gravity = Gravity.CENTER
    background = rounded(if (hot) c.coral else c.card, 12)
    isClickable = true
    setOnClickListener { onTap() }
  }

  override fun onCreateInputView(): View {
    val dark = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
    c = Palette(dark)
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setBackgroundColor(c.panel)
      setPadding(dp(10), dp(10), dp(10), dp(12))
      layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
    }

    val header = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
    dealChip = label(12f, true, c.text).apply {
      background = rounded(c.card, 14)
      setPadding(dp(10), dp(5), dp(10), dp(5))
    }
    badge = label(12f, true, c.muted).apply { setPadding(dp(10), dp(5), dp(10), dp(5)) }
    header.addView(dealChip)
    header.addView(View(this), LinearLayout.LayoutParams(0, 1, 1f))
    header.addView(badge)
    root.addView(header)

    val content = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
    body = label(14f, false, c.text).apply {
      setLineSpacing(0f, 1.2f)
      setPadding(dp(12), dp(10), dp(12), dp(10))
      background = rounded(c.card, 14)
    }
    content.addView(body)
    replies = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
    content.addView(replies)
    scroll = ScrollView(this).apply { addView(content) }
    root.addView(scroll, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(200)).apply { topMargin = dp(8) })

    val keys = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
    val globe = key("🌐", "Switch keyboard", false) { nextKeyboard() }
    globe.setOnLongClickListener { picker(); true }
    keys.addView(globe, LinearLayout.LayoutParams(dp(46), dp(46)))
    for ((text, hot, action) in listOf(
      Triple("Check", false, { tapCheck() }),
      Triple("Counter", true, { tapCounter() }),
      Triple("Explain", false, { tapExplain() }),
    )) {
      keys.addView(key(text, text, hot, action), LinearLayout.LayoutParams(0, dp(46), 1f).apply { marginStart = dp(8) })
    }
    root.addView(keys, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(10) })
    return root
  }

  override fun onStartInputView(info: EditorInfo?, restarting: Boolean) {
    super.onStartInputView(info, restarting)
    pack = KPack.parse(SecondLookShared.readKeyboard(this, SecondLookShared.PACK_KEY))
    if (!restarting) lastInserted = null
    if (!busy) showReady()
  }

  // ---------------------------------------------------------------- display

  private fun show(text: String, source: String, tone: Tone = Tone.NEUTRAL) {
    replies.removeAllViews()
    body.text = text
    val (bg, fg) = when (tone) {
      Tone.OK -> c.okBg to c.okText
      Tone.WARN -> c.warnBg to c.warnText
      Tone.DANGER -> c.dangerBg to c.dangerText
      Tone.SCAM -> c.scam to Color.WHITE
      Tone.NEUTRAL -> c.card to c.text
    }
    body.background = rounded(bg, 14)
    body.setTextColor(fg)
    badge.text = source
    val (bbg, bfg) = when {
      source.startsWith("Cloud") -> c.cloudBg to c.cloudText
      source.startsWith("On-device") -> c.okBg to c.okText
      source.isEmpty() -> Color.TRANSPARENT to c.muted
      else -> c.card to c.muted
    }
    badge.background = rounded(bbg, 14)
    badge.setTextColor(bfg)
    dealChip.text = deal?.let { "🔒 ${it.label}" } ?: "No deal selected"
    scroll.scrollTo(0, 0)
  }

  private fun addReply(r: KRules.Reply, hot: Boolean, onTap: (String) -> Unit) {
    val card = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(12), dp(8), dp(12), dp(8))
      background = rounded(c.card, 14, if (hot) c.coral else null)
      isClickable = true
      contentDescription = "${r.tone}. ${r.text}. ${r.reveals}. Tap to put it in the message box."
      setOnClickListener { onTap(r.text) }
    }
    card.addView(label(11f, true, if (hot) c.dangerText else c.muted).apply { text = r.tone })
    card.addView(label(13f, false, c.text).apply { text = r.text; setLineSpacing(0f, 1.15f) })
    card.addView(label(11f, false, c.muted).apply { text = r.reveals })
    replies.addView(card, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(6) })
  }

  private fun showReady() {
    if (deal == null) {
      return show("Set your limits in the SecondLook app. They are shared with this keyboard so it can keep replies inside them.", "")
    }
    show("Copy their message, then pick one.", "")
  }

  // ---------------------------------------------------------------- the text around it

  private fun copied(): String? {
    val clip = (getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).primaryClip
    val text = clip?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.coerceToText(this)?.toString()?.trim()
    if (text.isNullOrEmpty() || text.startsWith("SL1.")) {
      show("Copy their message first. Press and hold it in the chat, tap Copy, then come back here.", "")
      return null
    }
    return text
  }

  private fun fieldText(): String {
    val ic = currentInputConnection ?: return ""
    val before = ic.getTextBeforeCursor(4000, 0) ?: ""
    val after = ic.getTextAfterCursor(4000, 0) ?: ""
    return "$before$after"
  }

  /** Replaces whatever is in the message box. Nothing is sent: the user presses send. */
  private fun replaceField(text: String) {
    val ic = currentInputConnection ?: return
    ic.beginBatchEdit()
    val before = ic.getTextBeforeCursor(4000, 0)?.length ?: 0
    val after = ic.getTextAfterCursor(4000, 0)?.length ?: 0
    ic.deleteSurroundingText(before, after)
    ic.commitText(text, 1)
    ic.endBatchEdit()
    lastInserted = text
  }

  // ---------------------------------------------------------------- keys

  private fun nextKeyboard() {
    val switched = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) switchToNextInputMethod(false) else false
    if (!switched) picker()
  }

  private fun picker() {
    (getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager).showInputMethodPicker()
  }

  private fun tapCheck() {
    if (busy) return
    // Text the user typed in the box is their own reply: run the leak guard on it.
    val own = fieldText().trim()
    if (own.isNotEmpty() && own != lastInserted?.trim()) {
      val l = deal?.limits ?: return show("Set your limits in the SecondLook app so your replies can be checked against them.", "")
      if (KRules.leaksWalkAway(own, l)) {
        show(
          "Hold on before you send\nThis gives away your walk-away rate. Once a lender knows the highest number you'll accept, that is usually the number you get.",
          "Offline rules",
          Tone.DANGER,
        )
        addReply(KRules.Reply("SAFER VERSION", KRules.safer(l), "Reveals: nothing private"), true) { insert(it) }
        return
      }
      return show("Your reply doesn't give away your walk-away rate. Read it, then press send.", "Offline rules", Tone.OK)
    }
    val text = copied() ?: return
    val scam = KRules.scamReasons(text)
    if (scam.isNotEmpty()) {
      return show("Likely a scam. Don't reply.\n• " + scam.joinToString("\n• "), "Offline rules", Tone.SCAM)
    }
    val rate = KRules.rate(text)
      ?: return show("Not enough to judge yet\nNo rate in this message. Ask for the rate, APR, fees and term in writing.", "Offline rules")
    val parts = mutableListOf<String>()
    val d = deal
    if (d?.rangeLow != null && d.rangeHigh != null) {
      parts.add(
        if (rate > d.rangeHigh + 0.0005) "Above today's ${KRules.pct(d.rangeLow)}–${KRules.pct(d.rangeHigh)}."
        else "Inside today's ${KRules.pct(d.rangeLow)}–${KRules.pct(d.rangeHigh)}.",
      )
    }
    d?.limits?.let { l ->
      if (rate > l.maxRate + 0.0005) parts.add("The rate is over your limit.")
      KRules.fees(text)?.let { f -> if (f > l.maxFees) parts.add("Fees are ${KRules.money(f - l.maxFees)} over your limit.") }
    }
    val over = parts.any { it.startsWith("Above") || it.contains("over your limit") }
    val headline = if (over) "Real offer, but overpriced" else if (parts.isEmpty()) "Real offer, not compared yet" else "Competitive offer"
    show("${KRules.pct(rate)} · $headline\n${parts.joinToString(" ")}".trim(), "Offline rules", if (over) Tone.WARN else Tone.OK)
  }

  private fun tapCounter() {
    if (busy) return
    val text = copied() ?: return
    if (KRules.scamReasons(text).isNotEmpty()) {
      return show("Likely a scam. Don't reply.\nNo reply is offered for scam messages. Don't tap the link.", "Offline rules", Tone.SCAM)
    }
    val d = deal
    if (d?.limits == null) return show("Set your limits in the SecondLook app first. Replies are written to stay inside them.", "")
    val list = KRules.replies(d, KRules.fees(text))
    show("Tap a reply to put it in the message box. You press send.", "Offline rules")
    list.forEachIndexed { i, r -> addReply(r, i == 0) { insert(it) } }
  }

  private fun insert(text: String) {
    // Final gate: nothing that names the walk-away rate is ever typed for the user.
    val l = deal?.limits
    if (l != null && KRules.leaksWalkAway(text, l)) return
    replaceField(text)
    show("Filled in by SecondLook. Read it, then press send.", badge.text?.toString() ?: "", Tone.OK)
  }

  private fun tapExplain() {
    if (busy) return
    val text = copied() ?: return
    busy = true
    show("Putting it in plain words…", "")
    scope.launch {
      val result = try {
        withTimeoutOrNull(30_000) { explain(text) }
      } catch (e: Exception) {
        null
      }
      busy = false
      if (result != null) {
        show(result.first, result.second)
      } else {
        show(
          "APR is the yearly cost with most fees folded in. Fees are what you pay at signing; ask which are the lender's own. A rate lock holds the rate until a set date.",
          "Offline rules",
        )
      }
    }
  }

  private fun explainPrompt(message: String): String = listOf(
    "[task:explain]",
    "Explain this loan message to someone with no finance background.",
    "Write three or four short lines, each under 25 words, each starting with \"- \".",
    "Say what is being offered, what each term means, and one question worth asking.",
    "Do not say whether to accept it.",
    "-----",
    message.take(1800),
    "-----",
  ).joinToString("\n")

  private fun tidy(answer: String): String =
    answer.lines().map { it.trim() }.filter { it.isNotEmpty() }.joinToString("\n") { if (it.startsWith("- ")) "• " + it.substring(2) else it }

  /** Gemini Nano on the phone with the real message; otherwise the redacted message in the cloud. */
  private suspend fun explain(text: String): Pair<String, String>? {
    if (!SecondLookShared.ensureFirebase(this)) return null
    val ai = Firebase.ai(backend = GenerativeBackend.googleAI())
    val cloudModel = try {
      Firebase.remoteConfig.getString("cloud_model")
    } catch (e: Exception) {
      ""
    }.ifEmpty { "gemini-3.5-flash-lite" }

    val onDevice = try {
      FirebaseAIOnDevice.checkStatus() == OnDeviceModelStatus.AVAILABLE
    } catch (e: Exception) {
      false
    }
    if (onDevice) {
      try {
        val model = ai.generativeModel(
          modelName = cloudModel,
          onDeviceConfig = OnDeviceConfig(mode = InferenceMode.ONLY_ON_DEVICE, modelOption = SecondLookShared.modelOption(this)),
        )
        val answer = model.generateContent(explainPrompt(text)).text
        if (!answer.isNullOrBlank()) return tidy(answer) to "On-device"
      } catch (e: Exception) {
        // fall through to the redacted cloud path, if allowed
      }
    }
    if (pack?.cloudFallback == false) return null
    val d = deal
    val redacted = KRedact.redact(text, listOf(d?.lender, d?.contact))
    val answer = ai.generativeModel(modelName = cloudModel).generateContent(explainPrompt(redacted)).text
    return if (answer.isNullOrBlank()) null else tidy(answer) to "Cloud · redacted"
  }
}
