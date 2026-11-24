import React, { useState } from 'react';
import { View } from 'react-native';
import { uid, type CreditBand, type Deal, type LoanType } from '../engine';
import { prefillFromCheck } from '../state/flows';
import { actions, findDeal, getState, useStore } from '../state/store';
import { Icon } from '../ui/icons';
import { Button, Card, Field, RoundBtn, Row, Screen, Segmented, T, TextLink, Toggle } from '../ui/kit';
import { useTheme } from '../ui/theme';

const num = (s: string) => parseFloat(s.replace(/[,$\s]/g, ''));

export function DealFile({ dealId, fromCheck }: { dealId?: string; fromCheck?: boolean }) {
  const t = useTheme();
  const existing = useStore((s) => findDeal(s, dealId));
  const pre = !existing && fromCheck ? prefillFromCheck() : {};

  const [lender, setLender] = useState(existing?.lender ?? '');
  const [contact, setContact] = useState(existing?.contact ?? '');
  const [loanType, setLoanType] = useState<LoanType>(existing?.loanType ?? pre.loanType ?? 'refinance');
  const [amount, setAmount] = useState(existing ? String(existing.amount) : pre.amount ? String(pre.amount) : '');
  const [years, setYears] = useState(() => {
    const m = existing?.termMonths ?? pre.termMonths;
    if (!m) return '';
    return (existing?.loanType ?? pre.loanType) === 'auto' ? String(m) : String(m / 12);
  });
  const [rateType, setRateType] = useState<'fixed' | 'arm'>(existing?.rateType ?? pre.rateType ?? 'fixed');
  const [state, setState] = useState(existing?.state ?? '');
  const [credit, setCredit] = useState<CreditBand>(existing?.creditBand ?? 'unknown');
  const [hasQuote, setHasQuote] = useState(!!existing?.competingQuote);
  const [quoteRate, setQuoteRate] = useState(existing?.competingQuote ? String(existing.competingQuote.rate) : '');
  const [quoteWritten, setQuoteWritten] = useState(existing?.competingQuote?.inWriting ?? false);
  const [deadline, setDeadline] = useState(existing?.deadline ?? '');
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isAuto = loanType === 'auto';

  const save = () => {
    const a = num(amount);
    const term = num(years);
    if (!lender.trim()) return setError('Add the lender or dealer name.');
    if (!(a >= 500)) return setError('Add the loan amount in dollars.');
    if (!(term > 0)) return setError(isAuto ? 'Add the term in months, like 60.' : 'Add the term in years, like 30.');
    const q = num(quoteRate);
    if (hasQuote && !(q > 0 && q < 40)) return setError('Add the rate of the other quote, like 6.15.');
    const termMonths = isAuto ? Math.round(term) : Math.round(term * 12);
    const base: Deal = existing ?? {
      id: uid('d'),
      lender: '',
      loanType,
      amount: a,
      termMonths,
      rateType,
      creditBand: credit,
      reveal: { competingQuote: false, creditBand: false, deadline: false },
      rounds: [],
      status: 'open',
      createdAt: new Date().toISOString(),
    };
    const deal: Deal = {
      ...base,
      lender: lender.trim(),
      contact: contact.trim() || undefined,
      loanType,
      amount: a,
      termMonths,
      rateType,
      state: state.trim() || undefined,
      creditBand: credit,
      competingQuote: hasQuote ? { rate: q, inWriting: quoteWritten } : undefined,
      deadline: deadline.trim() || undefined,
      // A changed product invalidates a saved market range.
      benchmark: existing && (existing.loanType !== loanType || existing.termMonths !== termMonths) ? undefined : base.benchmark,
      reveal: { ...base.reveal, competingQuote: hasQuote ? base.reveal.competingQuote : false },
    };
    actions.upsertDeal(deal);

    if (existing) {
      actions.back();
      actions.toast('Deal File saved.');
      return;
    }
    // New deal: attach the message that was just checked, then go set limits.
    const check = getState().check;
    if (fromCheck && check && check.result.kind !== 'scam') {
      const roundId = actions.addRound(deal.id, { who: 'them', text: check.text, offer: check.result.offer, verdict: check.result.kind, source: check.result.source });
      actions.setCheck({ ...check, dealId: deal.id, roundId });
    }
    actions.resetTo({ name: 'home' }, { name: 'limits', dealId: deal.id });
    actions.toast('Deal saved. Now lock your limits.');
  };

  return (
    <Screen testID="screen-dealfile" footer={<Button testID="save-deal" label={existing ? 'Save Deal File' : 'Save and set limits'} onPress={save} />}>
      <Row gap={12}>
        <RoundBtn testID="back" icon="back" label="Back" onPress={() => actions.back()} />
        <View style={{ flex: 1, gap: 1 }}>
          <T size={19} w={700} ls={-0.19}>
            {existing ? 'Deal File' : 'New deal'}
          </T>
          <Row gap={6}>
            <Icon name="phone" size={12} color={t.okText} stroke={2.2} />
            <T size={13} w={600} color={t.okText}>
              Stays on this phone
            </T>
          </Row>
        </View>
      </Row>

      <Card style={{ gap: 14 }}>
        <Field testID="df-lender" label="Lender or dealer" value={lender} onChange={setLender} placeholder="Summit Home Loans" maxLength={60} />
        <Field testID="df-contact" label="Who you are texting (optional)" value={contact} onChange={setContact} placeholder="Dana Ruiz" maxLength={40} />
        <View style={{ gap: 6 }}>
          <T size={13} w={700} color={t.muted}>
            Loan type
          </T>
          <Segmented
            testID="df-type"
            value={loanType}
            onChange={(v) => {
              setLoanType(v);
              setYears('');
            }}
            options={[
              { value: 'refinance', label: 'Refinance' },
              { value: 'mortgage', label: 'Mortgage' },
              { value: 'auto', label: 'Car loan' },
            ]}
          />
        </View>
        <Row gap={12} align="flex-start">
          <View style={{ flex: 1.4 }}>
            <Field testID="df-amount" label="Loan amount ($)" value={amount} onChange={setAmount} placeholder={isAuto ? '27,000' : '350,000'} numeric />
          </View>
          <View style={{ flex: 1 }}>
            <Field testID="df-term" label={isAuto ? 'Term (months)' : 'Term (years)'} value={years} onChange={setYears} placeholder={isAuto ? '60' : '30'} numeric />
          </View>
        </Row>
        {!isAuto ? (
          <Segmented
            testID="df-ratetype"
            value={rateType}
            onChange={setRateType}
            options={[
              { value: 'fixed', label: 'Fixed' },
              { value: 'arm', label: 'Adjustable' },
            ]}
          />
        ) : null}
      </Card>

      <Card style={{ gap: 14 }}>
        <T size={15} w={700}>
          Your leverage
        </T>
        <View style={{ gap: 6 }}>
          <T size={13} w={700} color={t.muted}>
            Credit score band
          </T>
          <Segmented
            testID="df-credit"
            value={credit}
            onChange={setCredit}
            options={[
              { value: '740+', label: '740+' },
              { value: '670-739', label: '670–739' },
              { value: '580-669', label: '580–669' },
              { value: 'under-580', label: 'Under 580' },
              { value: 'unknown', label: 'Not sure' },
            ]}
          />
        </View>
        <Field testID="df-state" label="State (optional)" value={state} onChange={setState} placeholder="Arizona" maxLength={30} hint="Used, with the band above, to look up today's range. Nothing else is sent." />
        <Row between gap={12}>
          <View style={{ flex: 1, gap: 1 }}>
            <T size={15} w={600}>
              I hold a competing quote
            </T>
            <T size={12} color={t.muted}>
              Only quotes you can show. The app will not cite one you do not have.
            </T>
          </View>
          <Toggle testID="df-hasquote" label="I hold a competing quote" value={hasQuote} onChange={setHasQuote} />
        </Row>
        {hasQuote ? (
          <>
            <Field testID="df-quoterate" label={isAuto ? 'Their APR (%)' : 'Their rate (%)'} value={quoteRate} onChange={setQuoteRate} placeholder="6.15" numeric />
            <Row between gap={12}>
              <T size={15} w={600} style={{ flex: 1 }}>
                I have it in writing
              </T>
              <Toggle testID="df-written" label="I have it in writing" value={quoteWritten} onChange={setQuoteWritten} />
            </Row>
          </>
        ) : null}
        <Field testID="df-deadline" label="My deadline (optional)" value={deadline} onChange={setDeadline} placeholder="Friday" maxLength={30} hint="Kept so a reply never mentions it by accident." />
      </Card>

      {error ? (
        <T testID="df-error" size={13} w={700} color={t.dangerText}>
          {error}
        </T>
      ) : null}

      {existing ? (
        confirmDelete ? (
          <Card style={{ gap: 12 }}>
            <T size={15} w={600}>
              Delete this deal, its rounds and its limits from this phone?
            </T>
            <Row gap={10}>
              <Button flex={1} height={46} variant="secondary" label="Keep it" onPress={() => setConfirmDelete(false)} />
              <Button
                testID="confirm-delete"
                flex={1}
                height={46}
                variant="danger"
                label="Delete"
                onPress={() => {
                  actions.removeDeal(existing.id);
                  actions.resetTo({ name: 'home' });
                  actions.toast('Deal deleted.');
                }}
              />
            </Row>
          </Card>
        ) : (
          <TextLink testID="delete-deal" icon="trash" color={t.dangerText} label="Delete this deal" onPress={() => setConfirmDelete(true)} />
        )
      ) : null}
    </Screen>
  );
}
