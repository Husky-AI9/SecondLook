import React, { useEffect, useState } from 'react';
import { AppState, Platform, Pressable, TextInput, View } from 'react-native';
import { badgeFor, dealListLine, guardLatest, initial, money, roundAbout, roundKind, wonSoFar, type Deal } from '../engine';
import { clipboardHasText, readClipboard } from '../platform/clipboard';
import { runCheck } from '../state/flows';
import { actions, activeDeal, useStore } from '../state/store';
import { Icon } from '../ui/icons';
import { Avatar, Button, Card, IconTile, Pill, RoundBtn, Row, Screen, T, TextLink } from '../ui/kit';
import { font, useTheme } from '../ui/theme';

function Hero({ deal }: { deal: Deal }) {
  const t = useTheme();
  const won = wonSoFar(deal);
  if (!won) return null;
  const kind = deal.loanType === 'refinance' ? 'refinance' : deal.loanType === 'mortgage' ? 'mortgage' : 'car loan';
  return (
    <Pressable testID="hero" accessibilityRole="button" accessibilityLabel={`Won so far on your ${kind}. Open rounds.`} onPress={() => actions.go({ name: 'rounds', dealId: deal.id })} style={{ padding: 6, borderRadius: 30, backgroundColor: t.block, gap: 6 }}>
      <View style={{ gap: 10, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 12 }}>
        <Row between>
          <T size={13} w={500} color={t.onBlockMuted}>
            Won so far on your {kind}
          </T>
          <Pill label={`Round ${won.roundNumber}`} tone="onBlock" />
        </Row>
        <Row gap={8} align="baseline" style={{ flexWrap: 'wrap' }}>
          <T size={52} w={500} color={t.onBlock} ls={-2.08} lh={1}>
            {money(won.monthly, { cents: true })}
          </T>
          <T size={15} w={500} color={t.onBlockMuted}>
            less per month
          </T>
        </Row>
      </View>
      <Row between gap={12} style={{ paddingVertical: 12, paddingLeft: 18, paddingRight: 12, borderRadius: 24, backgroundColor: t.coral }}>
        <T size={15} w={600} color={t.onCoral} style={{ flex: 1 }}>
          About {money(roundAbout(won.lifetime))} over the loan
        </T>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.onCoral, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="arrowUpRight" size={18} color={t.onBlock} stroke={2.2} />
        </View>
      </Row>
    </Pressable>
  );
}

function Welcome() {
  const t = useTheme();
  return (
    <View testID="welcome" style={{ padding: 22, borderRadius: 30, backgroundColor: t.block, gap: 10 }}>
      <T size={28} w={600} color={t.onBlock} ls={-0.6} lh={1.15}>
        Get a second look before you reply.
      </T>
      <T size={15} color={t.onBlockMuted} lh={1.45}>
        Paste a rate quote a lender or dealer texted you. See if it is real and fairly priced, then send a reply that stays inside limits only you know.
      </T>
      <Row gap={8} style={{ marginTop: 4 }}>
        <Icon name="phone" size={14} color={t.onBlockMuted} stroke={2.2} />
        <T size={13} w={600} color={t.onBlockMuted} style={{ flex: 1 }}>
          Their message and your limits stay on this phone.
        </T>
      </Row>
    </View>
  );
}

function CheckCard() {
  const t = useTheme();
  const [text, setText] = useState('');
  const [hasCopied, setHasCopied] = useState(false);
  const [wantsBox, setWantsBox] = useState(false);

  useEffect(() => {
    let alive = true;
    const look = () => clipboardHasText().then((v) => alive && setHasCopied(v));
    look();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && look());
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  const typed = text.trim().length > 0;
  // On a phone with something copied, the card is just the button, as in the design.
  // The paste box is always there on the web, where the clipboard cannot be read silently.
  const showBox = Platform.OS === 'web' || !hasCopied || wantsBox || typed;
  const onCheck = async () => {
    if (typed) {
      await runCheck(text);
      setText('');
      return;
    }
    const copied = await readClipboard();
    if (copied.trim()) await runCheck(copied);
    else actions.toast(Platform.OS === 'web' ? 'Your browser did not share the clipboard. Paste the message into the box.' : 'Nothing copied yet. Copy the message in your chat first.');
  };

  return (
    <Card pad={16} radius={26} style={{ gap: 14 }} testID="check-card">
      <Row gap={12} align="flex-start">
        <IconTile icon="clipboard" />
        <View style={{ flex: 1, gap: 3 }}>
          <T size={16} w={700}>
            {typed ? 'Check this message' : hasCopied ? 'You copied a message' : 'Check a message'}
          </T>
          <T size={14} color={t.muted} lh={1.4}>
            {hasCopied && !typed ? Platform.OS === 'web' ? 'Tap below and SecondLook reads it in this browser.' : 'Tap below and SecondLook reads it on this phone.' : 'Copy a text from a lender or dealer, or paste it here.'}
          </T>
        </View>
      </Row>
      {showBox ? (
      <TextInput
        testID="paste-input"
        accessibilityLabel="Paste a lender's message"
        value={text}
        onChangeText={setText}
        placeholder="Paste their message here"
        placeholderTextColor={t.muted}
        multiline
        maxLength={2000}
        style={[font(500), { minHeight: 64, maxHeight: 140, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 16, backgroundColor: t.surface, color: t.text, fontSize: 15, textAlignVertical: 'top' }]}
      />
      ) : null}
      <Button testID="check-btn" height={50} label={typed ? 'Check this message' : 'Check copied text'} onPress={onCheck} />
      {!showBox ? <TextLink testID="paste-instead" icon="pencil" label="Type or paste it instead" onPress={() => setWantsBox(true)} /> : null}
    </Card>
  );
}

function DealRow({ deal }: { deal: Deal }) {
  const t = useTheme();
  const last = [...deal.rounds].reverse().find((r) => r.who === 'them');
  const kind = last ? roundKind(last, deal) : undefined;
  const badge = deal.status === 'accepted' ? { label: 'Accepted', tone: 'ok' as const } : !deal.limits ? { label: 'Set limits', tone: 'neutral' as const } : kind ? badgeFor(kind, guardLatest(deal)) : { label: 'No offer yet', tone: 'neutral' as const };
  return (
    <Pressable
      testID={`deal-${deal.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${deal.lender}. ${dealListLine(deal)}. ${badge.label}.`}
      onPress={() => {
        actions.setActive(deal.id);
        actions.go({ name: 'rounds', dealId: deal.id });
      }}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 20, backgroundColor: t.card, borderWidth: 1, borderColor: t.border, opacity: pressed ? 0.85 : 1 })}
    >
      <IconTile icon={deal.loanType === 'auto' ? 'car' : 'home'} />
      <View style={{ flex: 1, gap: 2 }}>
        <T size={15} w={700} lines={1}>
          {deal.lender}
        </T>
        <T size={13} color={t.muted}>
          {dealListLine(deal)}
        </T>
      </View>
      <Pill label={badge.label} tone={badge.tone} />
    </Pressable>
  );
}

export function Home() {
  const t = useTheme();
  const name = useStore((s) => s.profile.name);
  const deals = useStore((s) => s.deals);
  const active = useStore(activeDeal);
  const heroDeal = active && wonSoFar(active) ? active : deals.find((d) => wonSoFar(d));

  return (
    <Screen gap={18} navSpace testID="screen-home">
      <Row between gap={12}>
        <Row gap={12} style={{ flex: 1 }}>
          <Avatar letter={name ? initial(name) : 'S'} />
          <View style={{ gap: 1, flex: 1 }}>
            <T size={13} color={t.muted}>
              {name ? 'Welcome back' : 'Welcome to'}
            </T>
            <T size={19} w={700} ls={-0.19} lines={1}>
              {name || 'SecondLook'}
            </T>
          </View>
        </Row>
        <RoundBtn testID="open-settings" icon="settings" label="Settings" onPress={() => actions.go({ name: 'settings' })} />
      </Row>

      {heroDeal ? <Hero deal={heroDeal} /> : <Welcome />}

      <CheckCard />

      <View style={{ gap: 10 }}>
        <T size={18} w={700} ls={-0.18}>
          Your deals
        </T>
        {deals.length === 0 ? (
          <Card pad={18} style={{ gap: 12 }} testID="empty-deals">
            <T size={15} color={t.muted} lh={1.45}>
              No deals yet. Start one with the + button, or load two made-up deals to see how a negotiation looks.
            </T>
            <Row gap={16} style={{ flexWrap: 'wrap' }}>
              <TextLink testID="load-sample" label="Load sample deals" onPress={() => actions.loadSample()} />
            </Row>
          </Card>
        ) : (
          deals.map((d) => <DealRow key={d.id} deal={d} />)
        )}
      </View>
    </Screen>
  );
}
