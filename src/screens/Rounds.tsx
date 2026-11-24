import React, { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { badgeFor, dealSubtitle, effectiveRate, guardLatest, initial, latestOffer, money, pct, roundAbout, roundKind, roundSubtitle, roundTitle, wonSoFar, type Deal, type Round } from '../engine';
import { readClipboard } from '../platform/clipboard';
import { openRound, runCheck } from '../state/flows';
import { actions, findDeal, useStore } from '../state/store';
import { Avatar, Button, Card, Divider, Pill, RoundBtn, Row, Screen, Sheet, T, TextLink } from '../ui/kit';
import { font, useTheme } from '../ui/theme';

function WonHero({ deal }: { deal: Deal }) {
  const t = useTheme();
  const won = wonSoFar(deal);
  if (!won) return null;
  return (
    <View testID="won-hero" style={{ padding: 6, borderRadius: 30, backgroundColor: t.block, gap: 6 }}>
      <View style={{ gap: 10, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 12 }}>
        <T size={13} w={500} color={t.onBlockMuted}>
          Won so far
        </T>
        <Row gap={8} align="baseline" style={{ flexWrap: 'wrap' }}>
          <T size={56} w={500} color={t.onBlock} ls={-2.24} lh={1}>
            {money(won.monthly, { cents: true })}
          </T>
          <T size={15} w={500} color={t.onBlockMuted}>
            less per month
          </T>
        </Row>
      </View>
      <Row gap={6} align="stretch">
        <View style={{ flex: 1, gap: 2, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 24, backgroundColor: t.coral }}>
          <T size={22} w={600} color={t.onCoral} ls={-0.44}>
            ~{money(roundAbout(won.lifetime))}
          </T>
          <T size={12} w={500} color={t.onCoral}>
            less over the loan
          </T>
        </View>
        <View style={{ flex: 1, gap: 2, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 24, backgroundColor: t.onBlockChip }}>
          <T size={22} w={600} color={t.onBlock} ls={-0.44}>
            {money(Math.max(won.fees, 0))}
          </T>
          <T size={12} w={500} color={t.onBlockMuted}>
            less in fees
          </T>
        </View>
      </Row>
    </View>
  );
}

function RoundRow({ round, deal, last, me }: { round: Round; deal: Deal; last: boolean; me: string }) {
  const t = useTheme();
  const kind = roundKind(round, deal);
  const badge = kind ? badgeFor(kind, roundWithin(round, deal)) : null;
  const body = (
    <Row gap={12} style={{ paddingVertical: 14 }}>
      <Avatar size={40} letter={round.who === 'you' ? initial(me || 'You') : initial(deal.contact || deal.lender)} />
      <View style={{ flex: 1, gap: 1 }}>
        <T size={16} w={700}>
          {roundTitle(round)}
        </T>
        <T size={13} color={t.muted}>
          {roundSubtitle(round, deal)}
        </T>
      </View>
      {badge ? <Pill label={badge.label} tone={badge.tone} /> : null}
    </Row>
  );
  return (
    <>
      {round.who === 'them' && round.offer ? (
        <Pressable testID={`round-${round.id}`} accessibilityRole="button" accessibilityLabel={`${roundTitle(round)}. ${roundSubtitle(round, deal)}. Open verdict.`} onPress={() => openRound(deal.id, round.id)}>
          {body}
        </Pressable>
      ) : (
        <View testID={`round-${round.id}`}>{body}</View>
      )}
      {last ? null : <Divider />}
    </>
  );
}

function roundWithin(round: Round, deal: Deal): boolean | undefined {
  if (!deal.limits || !round.offer) return undefined;
  const r = effectiveRate(round.offer);
  if (r !== undefined && r > deal.limits.maxRate + 0.0005) return false;
  if (round.offer.fees !== undefined && round.offer.fees > deal.limits.maxFees + 0.5) return false;
  return true;
}

export function Rounds({ dealId }: { dealId: string }) {
  const t = useTheme();
  const deal = useStore((s) => findDeal(s, dealId));
  const me = useStore((s) => s.profile.name);
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const [confirmAccept, setConfirmAccept] = useState(false);

  if (!deal) return null;
  const offer = latestOffer(deal);
  const rate = offer ? effectiveRate(offer) : undefined;
  const within = guardLatest(deal);
  const isAuto = deal.loanType === 'auto';
  const accepted = deal.status === 'accepted';

  const submit = async () => {
    const msg = text.trim() || (await readClipboard()).trim();
    if (!msg) return actions.toast('Copy or paste their reply first.');
    setAdding(false);
    setText('');
    await runCheck(msg, deal.id);
  };

  const footer = accepted ? (
    <Button testID="reopen" variant="secondary" label="Reopen this deal" onPress={() => actions.setStatus(deal.id, 'open')} />
  ) : offer ? (
    <Row gap={10}>
      <Button testID="counter-again" flex={1} variant={within ? 'secondary' : 'primary'} label={deal.rounds.some((r) => r.who === 'you') ? 'Counter again' : 'Draft a counter'} onPress={() => actions.go({ name: 'drafts', dealId: deal.id })} />
      {within && rate !== undefined ? <Button testID="accept" flex={1} label={`Accept ${pct(rate, isAuto)}`} onPress={() => setConfirmAccept(true)} /> : null}
    </Row>
  ) : (
    <Button testID="add-first" label="Add their message" icon="plus" onPress={() => setAdding(true)} />
  );

  return (
    <>
      <Screen testID="screen-rounds" gap={16} footer={footer}>
        <Row gap={12}>
          <RoundBtn testID="back" icon="back" label="Back to deals" onPress={() => actions.back()} />
          <View style={{ flex: 1, gap: 1 }}>
            <T size={19} w={700} ls={-0.19} lines={1}>
              {deal.lender}
            </T>
            <T size={13} color={t.muted} lines={1}>
              {dealSubtitle(deal)}
            </T>
          </View>
          <RoundBtn testID="edit-deal" icon="pencil" label="Edit the Deal File" onPress={() => actions.go({ name: 'dealFile', dealId: deal.id })} />
        </Row>

        {accepted ? <Pill size="md" tone="ok" icon="check" label={rate !== undefined ? `Accepted at ${pct(rate, isAuto)}` : 'Accepted'} /> : null}

        <WonHero deal={deal} />

        <T size={18} w={700} ls={-0.18}>
          Rounds
        </T>
        {deal.rounds.length === 0 ? (
          <Card style={{ gap: 8 }} testID="no-rounds">
            <T size={15} color={t.muted} lh={1.45}>
              No messages yet. When {deal.contact || deal.lender} texts you a quote, copy it and add it here.
            </T>
          </Card>
        ) : (
          <Card pad={0} style={{ paddingVertical: 4, paddingHorizontal: 16 }} testID="rounds-list">
            {deal.rounds.map((r, i) => (
              <RoundRow key={r.id} round={r} deal={deal} me={me} last={i === deal.rounds.length - 1} />
            ))}
          </Card>
        )}

        {!accepted && offer ? (
          <Row gap={18} style={{ flexWrap: 'wrap' }}>
            <TextLink testID="add-reply" icon="plus" label="Add their reply" onPress={() => setAdding(true)} />
            {!deal.limits ? <TextLink testID="set-limits" icon="lock" label="Set limits" onPress={() => actions.go({ name: 'limits', dealId: deal.id })} /> : null}
          </Row>
        ) : null}
      </Screen>

      {adding ? (
        <Sheet testID="add-sheet" title="Add their reply" onClose={() => setAdding(false)}>
          <TextInput
            testID="add-input"
            accessibilityLabel="Their reply"
            value={text}
            onChangeText={setText}
            placeholder="Paste their message here"
            placeholderTextColor={t.muted}
            multiline
            maxLength={2000}
            style={[font(500), { minHeight: 96, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 16, backgroundColor: t.surface, color: t.text, fontSize: 15, textAlignVertical: 'top' }]}
          />
          <Button testID="add-check" label={text.trim() ? 'Check this message' : 'Check copied text'} onPress={submit} />
        </Sheet>
      ) : null}

      {confirmAccept && rate !== undefined ? (
        <Sheet testID="accept-sheet" title={`Accept ${pct(rate, isAuto)}?`} onClose={() => setConfirmAccept(false)}>
          <T size={15} lh={1.45} color={t.muted}>
            This marks the deal as accepted in SecondLook. It does not send anything. Get the final terms in writing before you sign.
          </T>
          <Row gap={10}>
            <Button flex={1} variant="secondary" label="Not yet" onPress={() => setConfirmAccept(false)} />
            <Button
              testID="accept-confirm"
              flex={1}
              label="Mark accepted"
              onPress={() => {
                actions.setStatus(deal.id, 'accepted');
                setConfirmAccept(false);
                actions.toast('Marked as accepted.');
              }}
            />
          </Row>
        </Sheet>
      ) : null}
    </>
  );
}
