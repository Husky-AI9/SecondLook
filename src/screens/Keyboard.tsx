import React, { useEffect, useMemo, useState } from 'react';
import { AppState, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BLOCK_AND_REPORT, buildPack, checkMessage, checkOwnDraft, draftCounter, effectiveRate, explainMessage, initial, latestOffer, matchDeal, packCode, pct, revealsLine,
  SAMPLE_MESSAGES, shortDealLabel, type CheckResult, type Draft, type InferenceSource, type OwnDraftResult,
} from '../engine';
import { nativeAi } from '../../modules/secondlook-ai';
import { keyboardExtensionEnabled } from '../config';
import { writeClipboard } from '../platform/clipboard';
import { inExtension, typeIntoPage } from '../platform/extension';
import { pipelineCtx } from '../state/flows';
import { actions, activeDeal, useStore } from '../state/store';
import { Icon, type IconName } from '../ui/icons';
import { Avatar, Pill, Row, SourceChip, T } from '../ui/kit';
import { font, useTheme } from '../ui/theme';

// The keyboard panel from the design, running inside the app against the real engine.
// It is the practice box from the setup flow, and it is how the panel is shown on Android
// and the web, where there is no keyboard extension.

type Panel =
  | { kind: 'ready' }
  | { kind: 'busy'; label: string }
  | { kind: 'verdict'; result: CheckResult }
  | { kind: 'drafts'; result?: CheckResult; drafts: Draft[]; source: InferenceSource }
  | { kind: 'explain'; points: string[]; source: InferenceSource }
  | { kind: 'leak'; own: OwnDraftResult }
  | { kind: 'ok-own'; own: OwnDraftResult }
  | { kind: 'scam'; result: CheckResult; help: boolean }
  | { kind: 'needs-setup'; why: string };

const SAMPLES = [
  { id: 'lender', label: 'Lender', from: 'Dana Ruiz', sub: 'Summit Home Loans', text: SAMPLE_MESSAGES.lender },
  { id: 'dealer', label: 'Dealer', from: 'Ridgeline Auto', sub: 'Finance desk', text: SAMPLE_MESSAGES.dealer },
  { id: 'scam', label: 'Scam', from: '+1 (555) 010-0142', sub: 'Not in your contacts', text: SAMPLE_MESSAGES.scam },
] as const;

function Key(props: { label: string; onPress: () => void; hot?: boolean; flex?: number; testID?: string }) {
  const t = useTheme();
  return (
    <Pressable
      testID={props.testID}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      onPress={props.onPress}
      style={({ pressed }) => ({ flex: props.flex ?? 1, height: 46, borderRadius: 12, backgroundColor: props.hot ? t.coral : t.panelCard, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}
    >
      <T size={15} w={700} color={props.hot ? t.onCoral : t.text} lh={1.2}>
        {props.label}
      </T>
    </Pressable>
  );
}

function BigKey(props: { icon: IconName; title: string; sub: string; onPress: () => void; hot?: boolean; testID: string }) {
  const t = useTheme();
  return (
    <Pressable
      testID={props.testID}
      accessibilityRole="button"
      accessibilityLabel={`${props.title}. ${props.sub}`}
      onPress={props.onPress}
      style={({ pressed }) => ({ flex: 1, minHeight: 148, padding: 12, borderRadius: 18, backgroundColor: props.hot ? t.coral : t.panelCard, gap: 10, opacity: pressed ? 0.85 : 1 })}
    >
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: props.hot ? t.onCoral : t.surface, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={props.icon} size={20} color={props.hot ? t.onBlock : t.text} />
      </View>
      <T size={17} w={700} color={props.hot ? t.onCoral : t.text}>
        {props.title}
      </T>
      <T size={12} w={props.hot ? 600 : 400} color={props.hot ? t.onCoral : t.muted} lh={1.35}>
        {props.sub}
      </T>
    </Pressable>
  );
}

export function Keyboard() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const deals = useStore((s) => s.deals);
  const active = useStore(activeDeal);
  const hasPin = useStore((s) => !!s.pin);
  const packShared = useStore((s) => s.packShared);

  const [sampleId, setSampleId] = useState<(typeof SAMPLES)[number]['id']>('lender');
  const sample = SAMPLES.find((s) => s.id === sampleId)!;
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState('');
  const [filled, setFilled] = useState(false);
  const [sent, setSent] = useState<string[]>([]);
  const [panel, setPanel] = useState<Panel>({ kind: 'ready' });
  const [showSetup, setShowSetup] = useState(inExtension);
  // Chrome extension: the lender's message the user selected on a web page, if any.
  const page = useStore((s) => s.page);
  const [pageTheirs, setPageTheirs] = useState<string | null>(null);
  const [autoCheck, setAutoCheck] = useState(false);
  // Android: whether the SecondLook keyboard is turned on / in use (refreshed on return from Settings).
  const [kb, setKb] = useState<{ enabled: boolean; selected: boolean } | null>(null);
  useEffect(() => {
    if (Platform.OS !== 'android' || !nativeAi?.keyboardStatus) return;
    const read = () => {
      try {
        setKb(nativeAi?.keyboardStatus?.() ?? null);
      } catch {
        setKb(null);
      }
    };
    read();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && read());
    return () => sub.remove();
  }, [showSetup]);

  const theirs = pageTheirs ?? sample.text;
  const deal = useMemo(
    () => (pageTheirs ? matchDeal(pageTheirs, deals, active?.id) : sample.id === 'scam' ? undefined : matchDeal(sample.text, deals, active?.id)),
    [pageTheirs, sample, deals, active?.id],
  );
  const source: InferenceSource | null =
    panel.kind === 'verdict' ? panel.result.source : panel.kind === 'drafts' ? panel.source : panel.kind === 'explain' ? panel.source : panel.kind === 'scam' ? panel.result.source : panel.kind === 'leak' || panel.kind === 'ok-own' ? panel.own.source : null;

  const pick = (id: (typeof SAMPLES)[number]['id']) => {
    setSampleId(id);
    setPageTheirs(null);
    setCopied(false);
    setMessage('');
    setFilled(false);
    setSent([]);
    setPanel({ kind: 'ready' });
  };

  const needCopy = () => {
    if (copied) return false;
    setPanel({ kind: 'needs-setup', why: 'Copy their message first. Tap the bubble above to copy it.' });
    return true;
  };

  const doCheck = async () => {
    // Text typed in the box is the user's own reply: run the leak guard on it.
    if (message.trim() && !filled) {
      if (!deal?.limits) return setPanel({ kind: 'needs-setup', why: 'Set your limits in the SecondLook app so replies can be checked against them.' });
      setPanel({ kind: 'busy', label: 'Checking your wording' });
      const own = await checkOwnDraft(message.trim(), deal, latestOffer(deal), pipelineCtx(deal));
      return setPanel(own.guard.ok ? { kind: 'ok-own', own } : { kind: 'leak', own });
    }
    if (needCopy()) return;
    setPanel({ kind: 'busy', label: 'Reading on this phone' });
    const result = await checkMessage(theirs, pipelineCtx(deal));
    setPanel(result.kind === 'scam' ? { kind: 'scam', result, help: false } : { kind: 'verdict', result });
  };

  const doCounter = async () => {
    if (needCopy()) return;
    setPanel({ kind: 'busy', label: 'Writing three replies' });
    const result = await checkMessage(theirs, pipelineCtx(deal));
    if (result.kind === 'scam') return setPanel({ kind: 'scam', result, help: false });
    if (!deal) return setPanel({ kind: 'needs-setup', why: 'No deal matches this message. Add one in the SecondLook app.' });
    if (!deal.limits || !hasPin) return setPanel({ kind: 'needs-setup', why: 'Set your limits in the SecondLook app. Replies are written to stay inside them.' });
    const c = await draftCounter(deal, result.offer, theirs, pipelineCtx(deal));
    setPanel({ kind: 'drafts', result, drafts: c.drafts, source: c.source === 'offline-rules' ? 'offline-rules' : c.source });
  };

  const doExplain = async () => {
    if (needCopy()) return;
    setPanel({ kind: 'busy', label: 'Putting it in plain words' });
    const e = await explainMessage(theirs, pipelineCtx(deal));
    setPanel({ kind: 'explain', points: e.points, source: e.source });
  };

  useEffect(() => {
    if (!autoCheck) return;
    setAutoCheck(false);
    void doCheck();
  }, [autoCheck]);

  const insert = (text: string) => {
    setMessage(text);
    setFilled(true);
    // In the Chrome extension the reply goes into the reply box on the page. The user sends it.
    if (inExtension) {
      void typeIntoPage(text).then(async (ok) => {
        if (!ok) await writeClipboard(text);
        actions.toast(ok ? 'Typed into the page. Read it, then press send.' : 'Copied. Paste it into the reply box on the page.');
      });
    }
  };

  // Chrome extension: text sent from a page. Their message is checked at once; the user's own
  // draft goes through the leak guard.
  useEffect(() => {
    if (!page) return;
    if (page.kind === 'theirs') {
      setPageTheirs(page.text);
      setCopied(true);
      setMessage('');
      setSent([]);
    } else {
      setMessage(page.text);
    }
    setFilled(false);
    setShowSetup(false);
    setAutoCheck(true);
  }, [page?.at]);

  const send = () => {
    if (!message.trim()) return;
    setSent([...sent, message.trim()]);
    setMessage('');
    setFilled(false);
    setPanel({ kind: 'ready' });
    actions.toast('Practice chat: nothing was sent.');
  };

  const copyPack = async () => {
    const ok = await writeClipboard(packCode(buildPack(deals, active?.id)));
    actions.toast(ok ? 'Pack code copied. Open the keyboard and tap Import.' : 'Could not copy the pack code.');
  };

  const verdictBanner = (r: CheckResult) => {
    const rate = effectiveRate(r.offer);
    const tone = r.kind === 'overpriced' ? { bg: t.warnBg, fg: t.warnText } : r.kind === 'competitive' ? { bg: t.okBg, fg: t.okText } : { bg: t.panelCard, fg: t.text };
    return (
      <View testID="kb-verdict" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 16, backgroundColor: tone.bg }}>
        {rate !== undefined ? (
          <T size={26} w={700} color={tone.fg} ls={-0.52} lh={1}>
            {pct(rate, r.offer.rate === undefined)}
          </T>
        ) : null}
        <View style={{ flex: 1, gap: 2 }}>
          <T size={13} w={700} color={tone.fg}>
            {r.headline}
          </T>
          <T size={12} lh={1.35}>
            {r.detail}
          </T>
        </View>
      </View>
    );
  };

  const chip = (d: Draft, i: number, hot: boolean) => (
    <Pressable
      key={d.tone}
      testID={`kb-draft-${i}`}
      accessibilityRole="button"
      accessibilityLabel={`${d.label}. ${d.text}. ${revealsLine(d.reveals)}. Tap to put it in the message box.`}
      onPress={() => insert(d.text)}
      style={{ gap: 4, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 16, borderWidth: 2, borderColor: hot ? t.coral : t.panelCard, backgroundColor: t.panelCard }}
    >
      <T size={11} w={700} ls={0.66} color={hot ? t.dangerText : t.muted}>
        {d.label.toUpperCase()}
      </T>
      <T size={13} w={500} lh={1.4}>
        {d.text}
      </T>
      <T size={11} color={t.muted}>
        {revealsLine(d.reveals)}
      </T>
    </Pressable>
  );

  const globe = (
    <Pressable testID="kb-globe" accessibilityRole="button" accessibilityLabel="Back to the start of the panel" onPress={() => setPanel({ kind: 'ready' })} style={{ width: 46, height: 46, borderRadius: 12, backgroundColor: t.panelCard, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="globe" size={20} color={t.text} stroke={1.8} />
    </Pressable>
  );

  return (
    // The tab bar floats over the bottom of every tab; here the chat stops above it so the
    // panel's keys are never covered.
    <View testID="screen-keyboard" style={{ flex: 1, backgroundColor: t.panel, paddingBottom: Math.max(insets.bottom, 12) + 12 + 68 + 8 }}>
      <View style={{ flex: 1, width: '100%', maxWidth: 520, alignSelf: 'center', backgroundColor: t.bg }}>
        {/* chat header */}
        <View style={{ paddingTop: Math.max(insets.top, Platform.OS === 'web' ? 12 : 0) + 8, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: t.border, gap: 10 }}>
          <Row gap={12}>
            <Avatar size={40} letter={pageTheirs || sample.id === 'scam' ? '?' : initial(sample.from)} />
            <View style={{ flex: 1, gap: 1 }}>
              <T size={16} w={700} lines={1}>
                {pageTheirs ? 'Their message' : sample.from}
              </T>
              <T size={12} color={t.muted} lines={1}>
                {pageTheirs ? 'Selected on the page' : `${sample.sub} · practice chat`}
              </T>
            </View>
            <Pressable testID="kb-setup" accessibilityRole="button" accessibilityLabel="How to use SecondLook where you type" onPress={() => setShowSetup(!showSetup)} hitSlop={8} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.card, borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="help" size={18} color={t.text} />
            </Pressable>
          </Row>
          <Row gap={8}>
            {SAMPLES.map((s) => {
              const on = s.id === sampleId;
              return (
                <Pressable key={s.id} testID={`kb-sample-${s.id}`} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`Practise with a ${s.label.toLowerCase()} message`} onPress={() => pick(s.id)} style={{ height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: on ? t.primary : t.surface, justifyContent: 'center' }}>
                  <T size={12} w={700} color={on ? t.onPrimary : t.text} lh={1.2}>
                    {s.label}
                  </T>
                </Pressable>
              );
            })}
          </Row>
        </View>

        {/* messages */}
        {/* One scroll area for chat, message box and panel, so short phones can reach all of it. */}
        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
        <View style={{ flexGrow: 1, minHeight: 150, justifyContent: 'flex-end', gap: 8, paddingVertical: 14, paddingHorizontal: 16 }}>
          {showSetup ? (
            <View testID="kb-setup-card" style={{ gap: 8, padding: 14, borderRadius: 18, backgroundColor: t.card, borderWidth: 1, borderColor: t.border }}>
              <T size={14} w={700}>
                Use it where you type
              </T>
              {keyboardExtensionEnabled && Platform.OS === 'ios' ? (
                <>
                  <T size={13} lh={1.45}>1. Settings → General → Keyboard → Keyboards → Add New Keyboard → SecondLook.</T>
                  <T size={13} lh={1.45}>2. Tap SecondLook → Allow Full Access. This lets the keyboard read your locked limits and reach the redacted cloud fallback. Their message and your limits still stay on this phone.</T>
                  <T size={13} lh={1.45}>3. In Messages, copy their text, hold the globe key and pick SecondLook.</T>
                  <Row between gap={8}>
                    <T size={12} color={t.muted} style={{ flex: 1 }}>
                      {packShared === false ? 'Keychain sharing is off in this build. Copy the pack code and import it in the keyboard.' : 'Your limits pack is shared with the keyboard through the keychain.'}
                    </T>
                    <Pressable testID="kb-copy-pack" accessibilityRole="button" accessibilityLabel="Copy pack code" onPress={copyPack} hitSlop={8}>
                      <Pill label="Copy pack code" icon="copy" />
                    </Pressable>
                  </Row>
                </>
              ) : Platform.OS === 'android' ? (
                <>
                  <T size={13} lh={1.45}>1. Tap "Turn on the keyboard" and switch on SecondLook. Android warns that any keyboard could collect what you type. SecondLook reads only your reply box and the message you copied, and only when you tap a key. Nothing is sent.</T>
                  <T size={13} lh={1.45}>2. In any chat, press and hold their message, tap Copy, then tap the keyboard button at the bottom of the screen and pick SecondLook. The globe key takes you back.</T>
                  <T size={13} lh={1.45}>3. Or press and hold their message: "SecondLook" is next to Copy and Share, and opens the verdict in the app.</T>
                  <Row gap={8} style={{ flexWrap: 'wrap' }}>
                    <Pressable testID="kb-enable" accessibilityRole="button" accessibilityLabel="Turn on the keyboard" onPress={() => nativeAi?.openKeyboardSettings?.()} hitSlop={6}>
                      <Pill label="Turn on the keyboard" icon="settings" />
                    </Pressable>
                    <Pressable testID="kb-pick" accessibilityRole="button" accessibilityLabel="Switch keyboard" onPress={() => nativeAi?.showKeyboardPicker?.()} hitSlop={6}>
                      <Pill label="Switch keyboard" icon="globe" />
                    </Pressable>
                    {kb ? <Pill testID="kb-status" label={kb.selected ? 'SecondLook keyboard in use' : kb.enabled ? 'Keyboard on' : 'Keyboard off'} tone={kb.enabled ? 'ok' : 'warn'} /> : null}
                  </Row>
                  <T size={12} color={t.muted} lh={1.45}>Try it here: tap the message above to copy it, tap the message box below, and switch to SecondLook.</T>
                </>
              ) : Platform.OS === 'ios' ? (
                <T size={13} lh={1.45}>Copy their message in Messages, open SecondLook and tap "Check copied text". After you pick a reply, Messages reopens with it filled in.</T>
              ) : inExtension ? (
                <>
                  <T size={13} lh={1.45}>1. On any page (Gmail, Messages for web, Facebook Marketplace…), select the lender's message, right-click and choose "SecondLook: check their message". The verdict shows here.</T>
                  <T size={13} lh={1.45}>2. Tap Counter and pick a reply. SecondLook types it into the reply box on the page. You press send.</T>
                  <T size={13} lh={1.45}>3. Before you send your own words, select them and choose "SecondLook: check my reply before sending".</T>
                  <T size={12} color={t.muted} lh={1.45}>Your limits stay in this browser. With Chrome's built-in Gemini Nano, the message is read on this computer.</T>
                </>
              ) : (
                <T size={13} lh={1.45}>Copy their message, come back to this tab and paste it into the box on the Deals screen. On iPhone and Android the app picks up copied text for you.</T>
              )}
              {inExtension ? null : (
                <T size={12} color={t.muted} lh={1.45}>
                  This screen is a practice chat with made-up messages. Nothing here is sent to anyone.
                </T>
              )}
            </View>
          ) : null}

          <Pressable
            testID="kb-bubble"
            accessibilityRole="button"
            accessibilityLabel={`Message: ${theirs}. Tap to copy.`}
            onPress={() => {
              // A real copy, so the SecondLook keyboard can practise on it too.
              void writeClipboard(theirs);
              setCopied(true);
              if (panel.kind === 'needs-setup') setPanel({ kind: 'ready' });
            }}
            style={{ alignSelf: 'flex-start', maxWidth: 300, paddingVertical: 12, paddingHorizontal: 14, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderBottomRightRadius: 20, borderBottomLeftRadius: 6, backgroundColor: t.card, borderWidth: 1, borderColor: t.border }}
          >
            <T size={15} lh={1.45}>
              {theirs}
            </T>
          </Pressable>
          <Row gap={6}>
            {copied ? <Icon name="check" size={14} color={t.okText} stroke={2.5} /> : null}
            <T testID="kb-copied" size={12} w={700} color={copied ? t.okText : t.muted}>
              {copied ? 'Copied' : 'Tap the message to copy it'}
            </T>
          </Row>
          {sent.map((s, i) => (
            <View key={i} style={{ alignSelf: 'flex-end', maxWidth: 300, paddingVertical: 12, paddingHorizontal: 14, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderBottomLeftRadius: 20, borderBottomRightRadius: 6, backgroundColor: t.block }}>
              <T size={15} lh={1.45} color={t.onBlock}>
                {s}
              </T>
            </View>
          ))}
          {filled ? (
            <Row testID="kb-filled" gap={8} style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: 16, backgroundColor: t.okBg }}>
              <Icon name="check" size={16} color={t.okText} stroke={2.5} />
              <T size={13} w={700} color={t.okText} style={{ flex: 1 }}>
                Filled in by SecondLook. Read it, then press send.
              </T>
            </Row>
          ) : null}
        </View>

        {/* message box */}
        <Row gap={8} align="flex-end" style={{ paddingTop: 6, paddingHorizontal: 12, paddingBottom: 12 }}>
          <TextInput
            testID="kb-input"
            accessibilityLabel="Message"
            value={message}
            onChangeText={(v) => {
              setMessage(v);
              setFilled(false);
              if (panel.kind === 'leak' || panel.kind === 'ok-own') setPanel({ kind: 'ready' });
            }}
            placeholder="Message"
            placeholderTextColor={t.muted}
            multiline
            maxLength={600}
            style={[font(400), { flex: 1, minHeight: 46, maxHeight: 110, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 23, borderWidth: panel.kind === 'leak' || filled ? 2 : 1, borderColor: panel.kind === 'leak' ? t.dangerText : filled ? t.coral : t.border, backgroundColor: t.card, color: t.text, fontSize: 15 }]}
          />
          <Pressable testID="kb-send" accessibilityRole="button" accessibilityLabel="Send" onPress={send} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: message.trim() && panel.kind !== 'leak' ? t.coral : t.surface, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="send" size={18} color={message.trim() && panel.kind !== 'leak' ? t.onCoral : t.muted} stroke={2.2} />
          </Pressable>
        </Row>

        {/* the panel */}
        <View testID="kb-panel" style={{ backgroundColor: t.panel, paddingTop: 12, paddingHorizontal: 12, paddingBottom: 14, gap: 10 }}>
          <Row between gap={8}>
            {deal ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: t.panelCard }}>
                <Icon name="lock" size={12} color={t.text} stroke={2.2} />
                <T testID="kb-deal" size={12} w={700} lh={1.2}>
                  {shortDealLabel(deal)}
                </T>
              </View>
            ) : (
              <T testID="kb-deal" size={12} w={700} color={t.muted}>
                No deal selected
              </T>
            )}
            {source ? <SourceChip source={source} size="sm" /> : null}
          </Row>

          {panel.kind === 'ready' ? (
            <>
              <T size={14} w={600} color={t.muted}>
                Copy their message, then pick one.
              </T>
              <Row gap={8} align="stretch">
                <BigKey testID="kb-check" icon="shield" title="Check" sub="Is it real, and is it fair?" onPress={doCheck} />
                <BigKey testID="kb-counter" icon="swap" title="Counter" sub="Three replies inside your limits" onPress={doCounter} hot />
                <BigKey testID="kb-explain" icon="help" title="Explain" sub="Plain words for the terms" onPress={doExplain} />
              </Row>
              <Row gap={8}>
                {globe}
                <View style={{ flex: 1, minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 12, backgroundColor: t.panelCard }}>
                  <Icon name="lock" size={14} color={t.muted} />
                  <T size={12} color={t.muted} lh={1.35} style={{ flex: 1 }}>
                    {hasPin ? 'Limits locked with your PIN. The numbers stay hidden here.' : 'Set and lock your limits in the app to get replies.'}
                  </T>
                </View>
              </Row>
            </>
          ) : null}

          {panel.kind === 'busy' ? (
            <View testID="kb-busy" style={{ minHeight: 120, alignItems: 'center', justifyContent: 'center' }}>
              <T size={14} w={700} color={t.muted}>
                {panel.label}…
              </T>
            </View>
          ) : null}

          {panel.kind === 'needs-setup' ? (
            <View testID="kb-needs-setup" style={{ gap: 6, padding: 14, borderRadius: 16, backgroundColor: t.panelCard }}>
              <T size={15} w={700}>
                One thing first
              </T>
              <T size={13} color={t.muted} lh={1.45}>
                {panel.why}
              </T>
            </View>
          ) : null}

          {panel.kind === 'verdict' ? verdictBanner(panel.result) : null}

          {panel.kind === 'drafts' ? (
            <>
              {panel.result ? verdictBanner(panel.result) : null}
              <View style={{ gap: 8 }}>{panel.drafts.map((d, i) => chip(d, i, message === d.text))}</View>
            </>
          ) : null}

          {panel.kind === 'explain' ? (
            <View testID="kb-explain-out" style={{ gap: 8, padding: 14, borderRadius: 16, backgroundColor: t.panelCard }}>
              {panel.points.map((p, i) => (
                <T key={i} size={13} lh={1.45}>
                  {p}
                </T>
              ))}
            </View>
          ) : null}

          {panel.kind === 'leak' ? (
            <>
              <View testID="kb-leak" style={{ flexDirection: 'row', gap: 12, padding: 14, borderRadius: 18, backgroundColor: t.dangerBg }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: t.scam, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="warning" size={20} color={t.onScam} stroke={2.2} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <T size={16} w={700} color={t.dangerText}>
                    {panel.own.guard.violations[0].title}
                  </T>
                  <T size={13} lh={1.45}>
                    {panel.own.guard.violations[0].why}
                  </T>
                </View>
              </View>
              {panel.own.safer ? (
                <View testID="kb-safer" style={{ gap: 4, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, borderWidth: 2, borderColor: t.coral, backgroundColor: t.panelCard }}>
                  <T size={11} w={700} ls={0.66} color={t.dangerText}>
                    SAFER VERSION
                  </T>
                  <T size={14} w={500} lh={1.4}>
                    {panel.own.safer.text}
                  </T>
                  <T size={11} color={t.muted}>
                    {revealsLine(panel.own.safer.reveals)}
                  </T>
                </View>
              ) : null}
            </>
          ) : null}

          {panel.kind === 'ok-own' ? (
            <View testID="kb-own-ok" style={{ gap: 4, padding: 14, borderRadius: 16, backgroundColor: panel.own.advisory ? t.warnBg : t.okBg }}>
              <T size={14} w={700} color={panel.own.advisory ? t.warnText : t.okText}>
                {panel.own.advisory ? 'Inside your limits, but read it once more' : 'Within your limits'}
              </T>
              <T size={12} lh={1.4}>
                {panel.own.advisory ? panel.own.advisory + ' ' : ''}
                {revealsLine(panel.own.guard.reveals)}.
              </T>
            </View>
          ) : null}

          {panel.kind === 'scam' ? (
            <>
              <View testID="kb-scam" style={{ gap: 14, padding: 18, borderRadius: 20, backgroundColor: t.scam }}>
                <Row gap={12}>
                  <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: t.scamTile, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="warning" size={24} color={t.onScam} stroke={2.2} />
                  </View>
                  <T size={21} w={700} color={t.onScam} ls={-0.21} lh={1.15} style={{ flex: 1 }}>
                    Likely a scam. Don't reply.
                  </T>
                </Row>
                <View style={{ gap: 8 }}>
                  {(panel.help ? BLOCK_AND_REPORT.map((l, i) => ({ id: String(i), label: l })) : panel.result.scamReasons.slice(0, 4)).map((r) => (
                    <Row key={r.id} gap={10} align="flex-start">
                      <View style={{ marginTop: 2 }}>
                        <Icon name={panel.help ? 'chevronRight' : 'x'} size={16} color={t.onScam} stroke={2.6} />
                      </View>
                      <T size={14} w={600} color={t.onScam} lh={1.35} style={{ flex: 1 }}>
                        {r.label}
                      </T>
                    </Row>
                  ))}
                </View>
              </View>
              <T size={12} color={t.muted} lh={1.4}>
                No reply is offered for scam messages. Don't tap the link.
              </T>
            </>
          ) : null}

          {panel.kind !== 'ready' ? (
            <Row gap={8}>
              {globe}
              {panel.kind === 'leak' ? (
                <>
                  <Key testID="kb-keep" label="Keep mine" onPress={() => setPanel({ kind: 'ready' })} />
                  {panel.own.safer ? <Key testID="kb-use-safer" flex={1.5} hot label="Use safer version" onPress={() => { insert(panel.own.safer!.text); setPanel({ kind: 'ready' }); }} /> : null}
                </>
              ) : panel.kind === 'scam' ? (
                <Key testID="kb-block" label={panel.help ? 'Show the warning signs' : 'How to block and report'} onPress={() => setPanel({ ...panel, help: !panel.help })} />
              ) : (
                <>
                  <Key testID="kb-check" label="Check" onPress={doCheck} hot={panel.kind === 'verdict' || panel.kind === 'ok-own'} />
                  <Key testID="kb-counter" label="Counter" onPress={doCounter} hot={panel.kind === 'drafts' || panel.kind === 'needs-setup' || panel.kind === 'busy'} />
                  <Key testID="kb-explain" label="Explain" onPress={doExplain} hot={panel.kind === 'explain'} />
                </>
              )}
            </Row>
          ) : null}
        </View>
        </ScrollView>
      </View>
    </View>
  );
}
