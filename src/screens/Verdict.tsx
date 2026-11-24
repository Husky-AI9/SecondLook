import React, { useState } from 'react';
import { Linking, Platform, Pressable, View } from 'react-native';
import { BLOCK_AND_REPORT, cloudQuery, cloudSawLine, effectiveRate, money, notSentLine, pct, rejudge, termLabel, type CheckResult, type Deal, type ExplainResult } from '../engine';
import { fetchRange, runExplain } from '../state/flows';
import { actions, findDeal, useStore } from '../state/store';
import { Icon } from '../ui/icons';
import { Button, Card, Note, Pill, RoundBtn, Row, Screen, Sheet, SourceChip, T, TextLink } from '../ui/kit';
import { useTheme } from '../ui/theme';

function Tile(props: { label: string; value: string; sub?: string; subTone?: 'warn' | 'ok' }) {
  const t = useTheme();
  return (
    <View style={{ flexGrow: 1, flexBasis: '45%', gap: 2, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 18, backgroundColor: t.card, borderWidth: 1, borderColor: t.border }}>
      <T size={12} w={600} color={t.muted}>
        {props.label}
      </T>
      <T size={18} w={700}>
        {props.value}
      </T>
      {props.sub ? (
        <T size={12} w={700} color={props.subTone === 'ok' ? t.okText : t.warnText}>
          {props.sub}
        </T>
      ) : null}
    </View>
  );
}

function RangeCard({ deal, theirs, unit }: { deal: Deal; theirs?: number; unit: string }) {
  const t = useTheme();
  const b = deal.benchmark;
  const [showSources, setShowSources] = useState(false);
  const query = cloudSawLine(cloudQuery(deal));

  if (!b) {
    return (
      <Card style={{ gap: 10 }} testID="range-empty">
        <T size={14} w={700}>
          Today's range
        </T>
        <T size={13} color={t.muted} lh={1.45}>
          Compare this with what lenders are charging today. This is the only step that uses the cloud, and only if you ask.
        </T>
        <Note tone="cloud" icon="eye" title="What the cloud will see">
          <T size={13} w={600} lh={1.4}>
            {query}
          </T>
          <T size={12} color={t.muted} lh={1.4}>
            {notSentLine(!!deal.limits, !!deal.competingQuote)}
          </T>
        </Note>
        <Button
          testID="get-range"
          height={46}
          variant="secondary"
          icon="cloud"
          label="Get today's range"
          onPress={async () => {
            const out = await fetchRange(deal.id);
            actions.toast(
              out === 'live' ? "Today's range saved for this deal." : out === 'sample' ? 'Firebase is not set up yet, so this is a sample range.' : out === 'disabled' ? 'Range lookups are switched off right now.' : 'Could not reach the cloud. Your verdict still uses your limits.',
            );
          }}
        />
      </Card>
    );
  }

  const lo = Math.min(b.low, theirs ?? b.low);
  const hi = Math.max(b.high, theirs ?? b.high);
  const span = Math.max(hi - lo, 0.05);
  const min = lo - span * 0.25;
  const max = hi + span * 0.1;
  const total = max - min;
  const left = (b.low - min) / total;
  const seg = (b.high - b.low) / total;
  const mark = theirs !== undefined ? ((theirs - min) / total) * 100 : undefined;
  const above = theirs !== undefined && theirs > b.high + 0.0005;

  return (
    <Card style={{ gap: 10 }} testID="range-card">
      <Row between gap={8}>
        <T size={14} w={700}>
          Today's range
        </T>
        {b.sample ? (
          <Pill label="Sample range" tone="neutral" icon="list" />
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel="Show sources" onPress={() => setShowSources(!showSources)} hitSlop={8}>
            <Pill label={`Cloud · ${b.sources.length} source${b.sources.length === 1 ? '' : 's'}`} tone="cloud" icon="cloud" />
          </Pressable>
        )}
      </Row>
      <View style={{ height: 20, justifyContent: 'center' }}>
        <View style={{ height: 12, borderRadius: 6, backgroundColor: t.border, flexDirection: 'row' }}>
          <View style={{ flex: left }} />
          <View style={{ flex: seg, height: 12, borderRadius: 6, backgroundColor: t.range }} />
          <View style={{ flex: Math.max(1 - left - seg, 0.0001) }} />
        </View>
        {mark !== undefined ? (
          <View style={{ position: 'absolute', left: `${Math.min(Math.max(mark, 2), 98)}%`, marginLeft: -10, width: 20, height: 20, borderRadius: 10, backgroundColor: above ? t.coral : t.okText, borderWidth: 3, borderColor: t.card }} />
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: left }} />
        <View style={{ flex: seg, flexDirection: 'row', justifyContent: 'space-between', minWidth: 96 }}>
          <T size={12} w={700} color={t.muted}>
            {pct(b.low, unit === 'APR')}
          </T>
          <T size={12} w={700} color={t.muted}>
            {pct(b.high, unit === 'APR')}
          </T>
        </View>
        <View style={{ flex: Math.max(1 - left - seg, 0.0001), alignItems: 'flex-end' }}>
          {above && theirs !== undefined ? (
            <T size={12} w={700} color={t.warnText} lines={1}>
              Theirs {pct(theirs, unit === 'APR')}
            </T>
          ) : null}
        </View>
      </View>
      {!above && theirs !== undefined ? (
        <T size={12} w={700} color={t.okText}>
          Theirs, {pct(theirs, unit === 'APR')}, is inside the range.
        </T>
      ) : null}
      {b.sample ? (
        <T size={12} color={t.muted} lh={1.4}>
          Sample numbers for trying the app. Connect Firebase to look up a live range with sources.
        </T>
      ) : null}
      {!b.sample && b.searchHtml && Platform.OS === 'web' ? (
        // Grounding with Google Search asks apps to show Google's own "Search suggestions"
        // markup with a grounded result. On the web it is rendered as supplied, sandboxed.
        <View testID="search-suggestions" style={{ height: 52, borderRadius: 12, overflow: 'hidden' }}>
          {React.createElement('iframe', { srcDoc: b.searchHtml, sandbox: 'allow-popups allow-popups-to-escape-sandbox', title: 'Google Search suggestions', style: { border: 0, width: '100%', height: 52 } })}
        </View>
      ) : null}
      {showSources && !b.sample ? (
        <View style={{ gap: 6 }} testID="sources">
          {b.sources.length === 0 ? (
            <T size={12} color={t.muted}>
              The model answered without listing web sources. Treat this range as a rough guide.
            </T>
          ) : (
            b.sources.map((s) => <TextLink key={s.url} icon="link" label={s.title.slice(0, 48)} onPress={() => void Linking.openURL(s.url)} />)
          )}
          {(b.searchQueries || []).slice(0, 3).map((q) => (
            <TextLink key={q} icon="globe" label={`Google: ${q.slice(0, 40)}`} onPress={() => void Linking.openURL('https://www.google.com/search?q=' + encodeURIComponent(q))} />
          ))}
          <T size={11} color={t.muted}>
            Looked up {new Date(b.fetchedAt).toLocaleString()} with Google Search.
          </T>
        </View>
      ) : null}
    </Card>
  );
}

function ScamView({ result, text }: { result: CheckResult; text: string }) {
  const t = useTheme();
  const [help, setHelp] = useState(false);
  return (
    <>
      <Screen
        testID="screen-scam"
        footer={
          <>
            <Button testID="block-report" variant="secondary" label="How to block and report" onPress={() => setHelp(true)} />
            <Button testID="scam-done" label="Back to deals" onPress={() => actions.resetTo({ name: 'home' })} />
          </>
        }
      >
        <Row between>
          <RoundBtn testID="back" icon="back" label="Back to deals" onPress={() => actions.back()} />
          <SourceChip source={result.source} verb="Read" />
        </Row>
        <View testID="scam-banner" style={{ gap: 14, padding: 18, borderRadius: 24, backgroundColor: t.scam }}>
          <Row gap={12}>
            <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: t.scamTile, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="warning" size={24} color={t.onScam} stroke={2.2} />
            </View>
            <T size={21} w={700} color={t.onScam} ls={-0.21} lh={1.15} style={{ flex: 1 }}>
              Likely a scam. Don't reply.
            </T>
          </Row>
          <View style={{ gap: 8 }}>
            {result.scamReasons.slice(0, 5).map((r) => (
              <Row key={r.id} gap={10} align="flex-start">
                <View style={{ marginTop: 2 }}>
                  <Icon name="x" size={16} color={t.onScam} stroke={2.6} />
                </View>
                <T size={14} w={600} color={t.onScam} lh={1.35} style={{ flex: 1 }}>
                  {r.label}
                </T>
              </Row>
            ))}
          </View>
        </View>
        <T size={13} color={t.muted} lh={1.4}>
          No reply is offered for scam messages. Don't tap the link.
        </T>
        <Card style={{ gap: 6 }}>
          <T size={12} w={700} color={t.muted}>
            THE MESSAGE
          </T>
          <T size={14} lh={1.45} color={t.muted}>
            {text}
          </T>
        </Card>
      </Screen>
      {help ? (
        <Sheet testID="block-sheet" title="Block and report" onClose={() => setHelp(false)}>
          {BLOCK_AND_REPORT.map((line, i) => (
            <Row key={i} gap={12} align="flex-start">
              <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center' }}>
                <T size={13} w={700} lh={1.2}>
                  {i + 1}
                </T>
              </View>
              <T size={15} lh={1.45} style={{ flex: 1 }}>
                {line}
              </T>
            </Row>
          ))}
          <Button label="Done" onPress={() => setHelp(false)} />
        </Sheet>
      ) : null}
    </>
  );
}

export function Verdict() {
  const t = useTheme();
  const check = useStore((s) => s.check);
  const deal = useStore((s) => findDeal(s, s.check?.dealId));
  const [explain, setExplain] = useState<ExplainResult | 'loading' | null>(null);

  if (!check) {
    return (
      <Screen testID="screen-verdict">
        <RoundBtn icon="back" label="Back" onPress={() => actions.resetTo({ name: 'home' })} />
        <T size={15} color={t.muted}>
          Nothing has been checked yet.
        </T>
      </Screen>
    );
  }
  const { text } = check;
  if (check.result.kind === 'scam') return <ScamView result={check.result} text={text} />;
  // Always judged against the deal as it is now, so a new range or new limits show at once.
  const result = rejudge(check.result, text, deal);

  const o = result.offer;
  const rate = effectiveRate(o);
  const aprOnly = o.rate === undefined && o.apr !== undefined;
  const unit = aprOnly ? 'APR' : 'rate';
  const term = o.termMonths ?? deal?.termMonths;
  const isAuto = deal ? deal.loanType === 'auto' : aprOnly && (term ?? 999) <= 96;
  const amount = o.amount ?? deal?.amount;
  const tone = result.kind === 'overpriced' ? 'warn' : result.kind === 'competitive' ? 'ok' : 'neutral';

  const subBits: string[] = [];
  if (aprOnly) subBits.push('APR');
  if (term) subBits.push(isAuto ? `${term} months` : termLabel(term, o.rateType ?? deal?.rateType ?? 'fixed'));
  if (isAuto && o.monthlyPayment !== undefined) subBits.push(`${money(o.monthlyPayment)}/mo`);

  // Numbers first: lead with the money, then the words.
  const leadBits: string[] = [];
  if (result.math?.aboveRangeMonthly && result.math.aboveRangeMonthly > 0.5) leadBits.push(`About ${money(result.math.aboveRangeMonthly)}/mo above the top of today's range.`);
  if (result.math?.rateOverLimit) leadBits.push('Over the rate you said you would walk away at.');
  const lead = leadBits.length ? leadBits.join(' ') : result.detail;

  const openExplain = async () => {
    setExplain('loading');
    setExplain(await runExplain(text, deal?.id));
  };

  const footer =
    rate === undefined && o.monthlyPayment === undefined ? (
      <Button testID="verdict-back" label="Back to deals" onPress={() => actions.resetTo({ name: 'home' })} />
    ) : deal ? (
      <Button testID="draft-counter" label={result.kind === 'competitive' ? 'Draft a reply' : 'Draft a counter'} onPress={() => actions.go({ name: 'drafts', dealId: deal.id })} />
    ) : (
      <Button testID="start-deal" label="Start a deal from this" icon="plus" onPress={() => actions.go({ name: 'dealFile', fromCheck: true })} />
    );

  return (
    <>
      <Screen testID="screen-verdict" footer={footer}>
        <Row between>
          <RoundBtn testID="back" icon="back" label="Back to deals" onPress={() => actions.back()} />
          <SourceChip source={result.source} verb="Read" />
        </Row>

        <View style={{ gap: 6 }}>
          <Pill testID="verdict-pill" label={result.headline} tone={tone} size="md" />
          {rate !== undefined ? (
            <Row gap={10} align="baseline" style={{ flexWrap: 'wrap' }}>
              <T testID="verdict-rate" size={64} w={500} ls={-2.56} lh={1}>
                {pct(rate, isAuto)}
              </T>
              <T size={14} w={600} color={t.muted}>
                {subBits.join(' · ')}
              </T>
            </Row>
          ) : o.monthlyPayment !== undefined ? (
            <T size={48} w={500} ls={-1.9} lh={1}>
              {money(o.monthlyPayment)}/mo
            </T>
          ) : null}
          <T testID="verdict-detail" size={14} w={500} color={t.muted} lh={1.45}>
            {lead}
          </T>
        </View>

        {deal && rate !== undefined ? <RangeCard deal={deal} theirs={rate} unit={unit} /> : null}

        {rate !== undefined || o.monthlyPayment !== undefined ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {amount ? <Tile label={isAuto ? 'Financed' : 'Loan'} value={money(amount)} /> : null}
            {result.math?.payment ? <Tile label="Payment" value={`${money(result.math.payment)}/mo`} /> : null}
            {o.fees !== undefined ? (
              <Tile label="Fees" value={money(o.fees)} sub={result.math?.feesOverLimit ? `${money(result.math.feesOverLimit)} over your limit` : deal?.limits ? 'Within your limit' : undefined} subTone={result.math?.feesOverLimit ? 'warn' : 'ok'} />
            ) : null}
            {o.expires ? <Tile label={isAuto ? 'Offer ends' : 'Lock ends'} value={o.expires} /> : null}
            {o.points !== undefined && o.points > 0 ? <Tile label="Points" value={String(o.points)} /> : null}
          </View>
        ) : null}

        {result.notes.length > 0 ? (
          <View style={{ gap: 10 }} testID="verdict-notes">
            {result.notes.slice(0, 4).map((n, i) => (
              <Row key={i} gap={12} align="flex-start">
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.coral, marginTop: 7 }} />
                <T size={14} lh={1.45} style={{ flex: 1 }}>
                  {n}
                </T>
              </Row>
            ))}
          </View>
        ) : null}

        {deal?.benchmark ? (
          <Note tone="cloud" icon="eye" title={deal.benchmark.sample ? 'What the cloud would see' : 'What the cloud saw'} testID="cloud-saw">
            <T size={13} w={600} lh={1.4}>
              {deal.benchmark.cloudSaw}
            </T>
            <T size={12} color={t.muted} lh={1.4}>
              {notSentLine(!!deal.limits, !!deal.competingQuote)}
            </T>
          </Note>
        ) : null}

        {result.source === 'cloud-redacted' ? (
          <Note tone="cloud" testID="redacted-note">
            <T size={13} lh={1.45}>
              This phone has no on-device model, so details that identify you were removed before the cloud check.
              {result.redacted && result.redacted.length ? ` Removed: ${result.redacted.join(', ')}.` : ''}
            </T>
          </Note>
        ) : null}

        {result.source === 'offline-rules' ? (
          <T size={12} color={t.muted} lh={1.45}>
            Read with built-in rules: no model was used and nothing left this phone.
          </T>
        ) : null}

        <Row gap={18} style={{ flexWrap: 'wrap' }}>
          <TextLink testID="explain" icon="help" label="Explain these terms" onPress={openExplain} />
          {deal ? <TextLink testID="to-rounds" icon="list" label="See all rounds" onPress={() => actions.resetTo({ name: 'home' }, { name: 'rounds', dealId: deal.id })} /> : null}
        </Row>

        <T size={11} color={t.muted} lh={1.4}>
          SecondLook compares numbers and suggests questions. It does not give financial advice.
        </T>
      </Screen>

      {explain ? (
        <Sheet testID="explain-sheet" title="In plain words" onClose={() => setExplain(null)}>
          {explain === 'loading' ? (
            <T size={15} color={t.muted}>
              Reading the terms…
            </T>
          ) : (
            <>
              <SourceChip source={explain.source} verb="Explained" />
              {explain.points.map((p, i) => (
                <Row key={i} gap={12} align="flex-start">
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.coral, marginTop: 7 }} />
                  <T size={15} lh={1.45} style={{ flex: 1 }}>
                    {p}
                  </T>
                </Row>
              ))}
            </>
          )}
          <Button label="Done" onPress={() => setExplain(null)} />
        </Sheet>
      ) : null}
    </>
  );
}
