import React, { useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { revealsLine, type CounterResult, type Draft, type OwnDraftResult } from '../engine';
import { runCounter, runOwnDraft, sendDraft } from '../state/flows';
import { sendLabel } from '../platform/send';
import { actions, findDeal, useStore } from '../state/store';
import { Icon } from '../ui/icons';
import { Button, Card, Note, Pill, RoundBtn, Row, Screen, SourceChip, T, TextLink } from '../ui/kit';
import { font, useTheme } from '../ui/theme';

function DraftCard({ draft, selected, onPress, index }: { draft: Draft; selected: boolean; onPress: () => void; index: number }) {
  const t = useTheme();
  return (
    <Pressable
      testID={`draft-${index}`}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${draft.label}. ${draft.text}. ${draft.withinLimits ? 'Within your limits.' : 'Outside your limits.'} ${revealsLine(draft.reveals)}`}
      onPress={onPress}
      style={{ gap: 10, padding: 16, borderRadius: 22, borderWidth: 2, borderColor: selected ? t.coral : t.border, backgroundColor: selected ? t.selectedBg : t.card }}
    >
      <Row between>
        <Pill label={draft.label} tone={selected ? 'coral' : 'neutral'} />
        {selected ? (
          <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: t.coral, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="check" size={14} color={t.onCoral} stroke={3} />
          </View>
        ) : (
          <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: t.toggleOff, marginRight: 2 }} />
        )}
      </Row>
      <T size={15} w={500} lh={1.45} selectable>
        {draft.text}
      </T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 4 }}>
        <Row gap={4}>
          <Icon name={draft.withinLimits ? 'check' : 'warning'} size={12} color={draft.withinLimits ? t.okText : t.dangerText} stroke={3} />
          <T size={12} w={700} color={draft.withinLimits ? t.okText : t.dangerText}>
            {draft.withinLimits ? 'Within your limits' : 'Outside your limits'}
          </T>
        </Row>
        <T size={12} color={t.muted}>
          {revealsLine(draft.reveals)}
        </T>
      </View>
    </Pressable>
  );
}

export function Drafts({ dealId }: { dealId: string }) {
  const t = useTheme();
  const deal = useStore((s) => findDeal(s, dealId));
  const [res, setRes] = useState<CounterResult | null>(null);
  const [pick, setPick] = useState(0);
  const [own, setOwn] = useState('');
  const [ownOpen, setOwnOpen] = useState(false);
  const [ownRes, setOwnRes] = useState<OwnDraftResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);

  const limitsKey = deal?.limits ? `${deal.limits.maxRate}|${deal.limits.targetRate}|${deal.limits.maxFees}|${JSON.stringify(deal.reveal)}` : 'none';
  useEffect(() => {
    let alive = true;
    setRes(null);
    runCounter(dealId).then((r) => alive && setRes(r));
    return () => {
      alive = false;
    };
  }, [dealId, limitsKey]);

  if (!deal) return null;

  const send = async (d: Draft) => {
    if (sending) return;
    setSending(true);
    await sendDraft(deal.id, d);
  };

  const checkOwn = async () => {
    if (!own.trim()) return;
    setChecking(true);
    setOwnRes(await runOwnDraft(own.trim(), deal.id));
    setChecking(false);
  };

  const ownDraft = (within: boolean): Draft => ({ tone: 'own', label: 'Your wording', text: own.trim(), withinLimits: within, reveals: ownRes?.guard.reveals ?? ['nothing private'] });

  const footer =
    res && !res.needsLimits && res.drafts.length > 0 && !ownOpen ? (
      <>
        <T size={13} color={t.muted} center lh={1.4}>
          You press send. SecondLook never sends for you.
        </T>
        <Button testID="send-draft" label={sendLabel} iconRight="arrowRight" loading={sending} onPress={() => send(res.drafts[pick])} />
      </>
    ) : undefined;

  return (
    <Screen testID="screen-drafts" footer={footer}>
      <Row between>
        <RoundBtn testID="back" icon="back" label="Back to verdict" onPress={() => actions.back()} />
        {res && !res.needsLimits ? <SourceChip source={res.source} verb="Written" /> : null}
      </Row>
      <T size={28} w={700} ls={-0.56}>
        Pick your reply
      </T>

      {!res ? (
        <Card style={{ gap: 8 }} testID="drafts-loading">
          <T size={15} w={700}>
            Writing three replies…
          </T>
          <T size={13} color={t.muted}>
            Each one is checked against your limits before you see it.
          </T>
        </Card>
      ) : res.needsLimits ? (
        <Card style={{ gap: 12 }} testID="needs-limits">
          <Row gap={12} align="flex-start">
            <Icon name="lock" size={20} color={t.text} />
            <View style={{ flex: 1, gap: 4 }}>
              <T size={16} w={700}>
                Set your limits first
              </T>
              <T size={14} color={t.muted} lh={1.45}>
                A reply is written to stay inside the most you would accept. Lock that number and SecondLook can draft for you.
              </T>
            </View>
          </Row>
          <Button testID="go-limits" icon="lock" label="Set limits" onPress={() => actions.go({ name: 'limits', dealId: deal.id })} />
        </Card>
      ) : (
        <>
          {!ownOpen
            ? res.drafts.map((d, i) => (
                <DraftCard key={d.tone} index={i} draft={d} selected={i === pick} onPress={() => setPick(i)} />
              ))
            : null}
          {res.replaced > 0 && !ownOpen ? (
            <T testID="replaced-note" size={12} color={t.muted} lh={1.4}>
              {res.replaced === 1 ? 'One draft' : `${res.replaced} drafts`} from the model broke a limit and {res.replaced === 1 ? 'was' : 'were'} replaced with a safe version.
            </T>
          ) : null}

          {!ownOpen ? (
            <TextLink testID="own-open" icon="pencil" label="Write my own and check it" onPress={() => setOwnOpen(true)} />
          ) : (
            <Card style={{ gap: 12 }} testID="own-card">
              <Row between>
                <T size={15} w={700}>
                  Your own wording
                </T>
                <TextLink
                  testID="own-close"
                  label="Back to drafts"
                  onPress={() => {
                    setOwnOpen(false);
                    setOwnRes(null);
                  }}
                />
              </Row>
              <TextInput
                testID="own-input"
                accessibilityLabel="Your reply"
                value={own}
                onChangeText={(v) => {
                  setOwn(v);
                  setOwnRes(null);
                }}
                placeholder="Type what you want to say"
                placeholderTextColor={t.muted}
                multiline
                maxLength={600}
                style={[font(500), { minHeight: 84, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 16, borderWidth: 2, borderColor: ownRes && !ownRes.guard.ok ? t.dangerText : 'transparent', backgroundColor: t.surface, color: t.text, fontSize: 15, textAlignVertical: 'top' }]}
              />
              {!ownRes ? <Button testID="own-check" height={48} icon="shield" label="Check my wording" loading={checking} disabled={!own.trim()} onPress={checkOwn} /> : null}

              {ownRes && !ownRes.guard.ok ? (
                <>
                  <View testID="leak-block" style={{ flexDirection: 'row', gap: 12, padding: 14, borderRadius: 18, backgroundColor: t.dangerBg }}>
                    <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: t.scam, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="warning" size={20} color={t.onScam} stroke={2.2} />
                    </View>
                    <View style={{ flex: 1, gap: 4 }}>
                      <T size={16} w={700} color={t.dangerText}>
                        {ownRes.guard.violations[0].title}
                      </T>
                      {ownRes.guard.violations.map((v, i) => (
                        <T key={i} size={13} lh={1.45}>
                          {v.why}
                        </T>
                      ))}
                    </View>
                  </View>
                  {ownRes.safer ? (
                    <View testID="safer" style={{ gap: 4, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, borderWidth: 2, borderColor: t.coral, backgroundColor: t.panelCard }}>
                      <T size={11} w={700} color={t.dangerText} ls={0.66}>
                        SAFER VERSION
                      </T>
                      <T size={14} w={500} lh={1.4}>
                        {ownRes.safer.text}
                      </T>
                      <T size={11} color={t.muted}>
                        {revealsLine(ownRes.safer.reveals)}
                      </T>
                    </View>
                  ) : null}
                  <Row gap={8}>
                    <Button testID="keep-mine" flex={1} height={48} variant="secondary" label="Keep mine" onPress={() => send(ownDraft(false))} />
                    {ownRes.safer ? <Button testID="use-safer" flex={1.5} height={48} variant="coral" label="Use safer version" onPress={() => send(ownRes.safer as Draft)} /> : null}
                  </Row>
                </>
              ) : null}

              {ownRes && ownRes.guard.ok ? (
                <>
                  <Note tone={ownRes.advisory ? 'warn' : 'ok'} icon={ownRes.advisory ? 'warning' : 'check'} title={ownRes.advisory ? 'Inside your limits, but read it once more' : 'Within your limits'} testID="own-ok">
                    <T size={13} lh={1.45}>
                      {ownRes.advisory ? ownRes.advisory + ' ' : ''}
                      {revealsLine(ownRes.guard.reveals)}.
                    </T>
                  </Note>
                  <Button testID="use-mine" height={48} label={sendLabel} iconRight="arrowRight" onPress={() => send(ownDraft(true))} />
                </>
              ) : null}
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}
