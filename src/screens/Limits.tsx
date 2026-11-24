import React, { useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { isValidPin, pct, shortDealLabel, type Deal } from '../engine';
import { actions, activeDeal, findDeal, useStore } from '../state/store';
import { hasSecureStore } from '../platform/storage';
import { Icon } from '../ui/icons';
import { Button, Card, Divider, NumField, PinPad, RoundBtn, Row, Screen, Sheet, T, TextLink, Toggle } from '../ui/kit';
import { font, useTheme } from '../ui/theme';

function parseNum(s: string): number {
  return parseFloat(s.replace(/,/g, ''));
}

function fmtFees(n?: number): string {
  return n === undefined ? '' : Math.round(n).toLocaleString('en-US');
}

function LimitRow(props: { label: string; value: string; onChange: (v: string) => void; unit: string; locked: boolean; testID: string; last?: boolean }) {
  const t = useTheme();
  return (
    <>
      <Row between gap={12} style={{ paddingVertical: 10 }}>
        <T size={15} w={600} style={{ flex: 1 }}>
          {props.label}
        </T>
        {props.locked ? (
          <Row gap={8}>
            <View style={{ width: 92, height: 44, borderRadius: 12, backgroundColor: t.surface, alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: 12 }}>
              <T size={18} w={700} color={t.muted} ls={2}>
                ••••
              </T>
            </View>
            <T size={15} w={600} color={t.muted} style={{ width: 14 }}>
              {props.unit}
            </T>
          </Row>
        ) : (
          <NumField testID={props.testID} label={props.label} value={props.value} onChange={props.onChange} unit={props.unit} />
        )}
      </Row>
      {props.last ? null : <Divider />}
    </>
  );
}

function RevealRow(props: { title: string; sub?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean; testID: string; last?: boolean }) {
  const t = useTheme();
  return (
    <>
      <Row between gap={12} style={{ minHeight: props.sub ? 56 : 52 }}>
        <View style={{ flex: 1, gap: 1 }}>
          <T size={15} w={600}>
            {props.title}
          </T>
          {props.sub ? (
            <T size={12} color={t.muted}>
              {props.sub}
            </T>
          ) : null}
        </View>
        <Toggle testID={props.testID} label={`Allow mentioning ${props.title.toLowerCase()}`} value={props.value} onChange={props.onChange} disabled={props.disabled} />
      </Row>
      {props.last ? null : <Divider />}
    </>
  );
}

export function Limits({ dealId }: { dealId?: string }) {
  const t = useTheme();
  const deals = useStore((s) => s.deals);
  const fallback = useStore(activeDeal);
  const routed = useStore((s) => findDeal(s, dealId));
  const deal: Deal | undefined = routed ?? fallback;
  const hasPin = useStore((s) => !!s.pin);
  const unlocked = useStore((s) => s.unlocked);
  const locked = hasPin && !unlocked;
  const pushed = useStore((s) => s.stack.length > 1);

  const [maxRate, setMaxRate] = useState('');
  const [maxFees, setMaxFees] = useState('');
  const [target, setTarget] = useState('');
  const [reveal, setReveal] = useState({ competingQuote: false, creditBand: false, deadline: false });
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showPad, setShowPad] = useState(false);

  // Load the deal's values whenever the deal changes or the screen is unlocked.
  useEffect(() => {
    setMaxRate(deal?.limits ? deal.limits.maxRate.toFixed(2) : '');
    setMaxFees(fmtFees(deal?.limits?.maxFees));
    setTarget(deal?.limits ? deal.limits.targetRate.toFixed(2) : '');
    setReveal(deal?.reveal ?? { competingQuote: false, creditBand: false, deadline: false });
    setError(null);
    setPin('');
  }, [deal?.id, unlocked]);

  if (!deal) {
    return (
      <Screen navSpace testID="screen-limits">
        <T size={28} w={700} ls={-0.56}>
          Your limits
        </T>
        <Card style={{ gap: 12 }}>
          <T size={15} color={t.muted} lh={1.45}>
            Limits belong to a deal. Add a deal first, then lock the most you would accept for it.
          </T>
          <Button label="New deal" icon="plus" onPress={() => actions.go({ name: 'dealFile' })} />
        </Card>
      </Screen>
    );
  }

  const cq = deal.competingQuote;
  const isAuto = deal.loanType === 'auto';

  const save = () => {
    const m = parseNum(maxRate);
    const f = parseNum(maxFees);
    const a = parseNum(target);
    if (!(m > 0 && m < 40) || !(a > 0 && a < 40)) return setError('Enter both rates as percentages, like 6.25.');
    if (!(f >= 0 && f < 1000000)) return setError('Enter the most you would pay in fees, like 1200.');
    if (a > m) return setError('"Aim for" has to be at or below "Walk away above".');
    if (!hasPin && !isValidPin(pin)) return setError('Choose a 4-digit PIN to lock these.');
    if (hasPin && pin && !isValidPin(pin)) return setError('A new PIN needs exactly 4 digits.');
    const res = actions.saveLimits(deal.id, { maxRate: m, maxFees: f, targetRate: a }, reveal, pin || undefined);
    if (res === 'ok') {
      actions.toast('Limits locked on this phone.');
      setError(null);
    } else setError(res === 'need-pin' ? 'Unlock with your PIN first.' : 'That PIN needs exactly 4 digits.');
  };

  return (
    <>
      <Screen
        navSpace={locked}
        testID="screen-limits"
        footer={locked ? undefined : <Button testID="lock-limits" icon="lock" label="Lock limits" onPress={save} />}
      >
        {pushed || !locked ? (
          <Row>
            <RoundBtn
              testID="back"
              icon="back"
              label={hasPin ? 'Lock and go back' : 'Back'}
              onPress={() => {
                actions.lock();
                if (pushed) actions.back();
                else actions.tab('home');
              }}
            />
          </Row>
        ) : null}
        <View style={{ gap: 6 }}>
          <T size={28} w={700} ls={-0.56}>
            Your limits
          </T>
          <Row gap={8}>
            <Icon name="phone" size={14} color={t.okText} stroke={2.2} />
            <T size={13} w={600} color={t.okText}>
              These never leave this phone
            </T>
          </Row>
        </View>

        {deals.length > 1 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {deals.map((d) => {
              const on = d.id === deal.id;
              return (
                <Pressable
                  key={d.id}
                  testID={`limits-deal-${d.id}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`Limits for ${d.lender}`}
                  onPress={() => {
                    actions.setActive(d.id);
                    actions.replace({ name: 'limits', dealId: d.id });
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: on ? t.primary : t.card, borderWidth: on ? 0 : 1, borderColor: t.border }}
                >
                  <T size={13} w={700} color={on ? t.onPrimary : t.text} lh={1.2}>
                    {shortDealLabel(d)}
                  </T>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <Card pad={0} style={{ paddingVertical: 4, paddingHorizontal: 16 }}>
          <LimitRow testID="limit-max" label="Walk away above" value={maxRate} onChange={setMaxRate} unit="%" locked={locked} />
          <LimitRow testID="limit-fees" label="Fees no higher than" value={maxFees} onChange={setMaxFees} unit="$" locked={locked} />
          <LimitRow testID="limit-target" label="Aim for" value={target} onChange={setTarget} unit="%" locked={locked} last />
        </Card>

        <Card pad={0} style={{ paddingTop: 14, paddingBottom: 6, paddingHorizontal: 16 }}>
          <T size={13} w={700} color={t.muted}>
            A reply may mention
          </T>
          <RevealRow
            testID="reveal-quote"
            title="My competing quote"
            sub={cq ? `${pct(cq.rate, isAuto)}${isAuto ? ' APR' : ''}${cq.inWriting ? ' in writing' : ', not in writing,'} from another lender` : 'None saved in the Deal File'}
            value={reveal.competingQuote && !!cq}
            disabled={locked || !cq}
            onChange={(v) => setReveal({ ...reveal, competingQuote: v })}
          />
          <RevealRow testID="reveal-credit" title="My credit score band" value={reveal.creditBand} disabled={locked} onChange={(v) => setReveal({ ...reveal, creditBand: v })} />
          <RevealRow testID="reveal-deadline" title="My deadline" value={reveal.deadline} disabled={locked} onChange={(v) => setReveal({ ...reveal, deadline: v })} last />
        </Card>

        <Card pad={0} style={{ paddingVertical: 14, paddingHorizontal: 16 }}>
          <Row between gap={12}>
            <View style={{ flex: 1, gap: 1 }}>
              <T size={15} w={600}>
                4-digit PIN
              </T>
              <T size={12} color={t.muted}>
                {locked ? 'Locked. Needed to view or change these' : hasPin ? 'Leave empty to keep your PIN' : 'Needed to view or change these'}
              </T>
            </View>
            {locked ? (
              <Button testID="unlock" height={44} variant="secondary" icon="unlock" label="Unlock" onPress={() => setShowPad(true)} />
            ) : (
              <TextInput
                testID="pin-input"
                accessibilityLabel={hasPin ? 'New PIN, optional' : 'Choose a 4-digit PIN'}
                value={pin}
                onChangeText={(v) => setPin(v.replace(/\D/g, '').slice(0, 4))}
                keyboardType="number-pad"
                inputMode="numeric"
                secureTextEntry
                maxLength={4}
                placeholder="••••"
                placeholderTextColor={t.muted}
                style={[font(700), { width: 116, height: 44, paddingHorizontal: 12, paddingVertical: 0, borderRadius: 12, backgroundColor: t.surface, color: t.text, fontSize: 22, letterSpacing: 6, textAlign: 'center' }]}
              />
            )}
          </Row>
        </Card>

        {error ? (
          <T testID="limits-error" size={13} w={700} color={t.dangerText}>
            {error}
          </T>
        ) : null}

        {!hasSecureStore ? (
          <T size={12} color={t.muted} lh={1.45}>
            In a browser these are kept in this browser's storage. On iPhone and Android they are kept in the system keychain.
          </T>
        ) : null}

        <Row gap={16} style={{ flexWrap: 'wrap' }}>
          <TextLink testID="edit-deal-file" icon="pencil" label="Edit the Deal File" onPress={() => actions.go({ name: 'dealFile', dealId: deal.id })} />
        </Row>
      </Screen>

      {showPad ? (
        <Sheet testID="pin-sheet" title="Unlock your limits" onClose={() => setShowPad(false)}>
          <PinPad
            onDone={(p) => {
              const ok = actions.unlock(p);
              if (ok) setShowPad(false);
              return ok;
            }}
          />
        </Sheet>
      ) : null}
    </>
  );
}
