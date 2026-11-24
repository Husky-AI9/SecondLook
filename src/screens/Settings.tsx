import React, { useEffect, useState } from 'react';
import { Platform, TextInput, View } from 'react-native';
import { getAi } from '../ai';
import { nativeAi } from '../../modules/secondlook-ai';
import { APP_VERSION, isFirebaseConfigured, keyboardExtensionEnabled } from '../config';
import { hasSecureStore } from '../platform/storage';
import { actions, useStore } from '../state/store';
import { Button, Card, Divider, Field, Pill, RoundBtn, Row, Screen, Segmented, T, TextLink, Toggle } from '../ui/kit';
import { font, useTheme } from '../ui/theme';

const ON_DEVICE_TEXT: Record<string, { label: string; tone: 'ok' | 'warn' | 'neutral' }> = {
  available: { label: 'Ready', tone: 'ok' },
  downloadable: { label: 'Not downloaded', tone: 'warn' },
  downloading: { label: 'Downloading', tone: 'warn' },
  unavailable: { label: 'Not on this device', tone: 'neutral' },
  unknown: { label: 'Checking', tone: 'neutral' },
};

const MODEL_NAME = Platform.OS === 'ios' ? "Apple's on-device model" : Platform.OS === 'android' ? 'Gemini Nano on this phone' : "Chrome's built-in Gemini Nano";

/** App half of the keyboard tests T1 and T4. Only in iOS builds that include the keyboard. */
function KeyboardTestBench() {
  const t = useTheme();
  const [info] = useState(() => {
    try {
      return nativeAi?.deviceInfo?.() ?? null;
    } catch {
      return null;
    }
  });
  const [t4, setT4] = useState<string | null>(null);
  const [box, setBox] = useState('');
  if (!info) return null;

  const write = () => {
    const stamp = 'app wrote ' + new Date().toLocaleTimeString();
    try {
      const r = nativeAi!.sharedKeychainSet!('secondlook.t4', stamp);
      setT4(r.ok ? `Wrote "${stamp}". Now open the keyboard, tap Tests, then T4.` : `Could not write (status ${r.status}). Keychain sharing is not available in this build; the keyboard will use the pack code instead.`);
    } catch (e) {
      setT4('Could not write: ' + String((e as Error)?.message || e));
    }
  };

  return (
    <Card style={{ gap: 10 }} testID="kb-bench">
      <T size={15} w={700}>
        Keyboard test bench (T1–T4)
      </T>
      <T testID="kb-bench-ids" size={13} color={t.muted} lh={1.45} selectable>
        T1 · App id: {info.bundleId || 'unknown'}{'\n'}Shared keychain group: {info.group || 'not available'}{'\n'}Firebase in this build: {info.firebase ? 'yes' : 'no'} · {info.os}
      </T>
      <Button testID="kb-bench-t4" height={46} variant="secondary" label="Write T4 value" onPress={write} />
      {t4 ? (
        <T testID="kb-bench-t4-out" size={13} w={600} lh={1.45}>
          {t4}
        </T>
      ) : null}
      <TextInput
        testID="kb-bench-box"
        accessibilityLabel="Test box for the SecondLook keyboard"
        value={box}
        onChangeText={setBox}
        placeholder="Tap here, hold the globe key, pick SecondLook"
        placeholderTextColor={t.muted}
        multiline
        style={[font(500), { minHeight: 84, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 16, backgroundColor: t.surface, color: t.text, fontSize: 15, textAlignVertical: 'top' }]}
      />
      <T size={12} color={t.muted} lh={1.45}>
        Steps are in docs/T1-T4.md. "Paste log" in the keyboard types the results into this box.
      </T>
    </Card>
  );
}

export function Settings() {
  const t = useTheme();
  const name = useStore((s) => s.profile.name);
  const settings = useStore((s) => s.settings);
  const ai = useStore((s) => s.ai);
  const dealCount = useStore((s) => s.deals.length);
  const [draftName, setDraftName] = useState(name);
  const [confirmErase, setConfirmErase] = useState(false);

  useEffect(() => {
    void getAi().status(true);
  }, []);

  const od = ON_DEVICE_TEXT[ai.onDevice] ?? ON_DEVICE_TEXT.unknown;
  const cloudReady = Platform.OS === 'web' ? isFirebaseConfigured : ai.configured;

  return (
    <Screen testID="screen-settings">
      <Row gap={12}>
        <RoundBtn
          testID="back"
          icon="back"
          label="Back"
          onPress={() => {
            if (draftName.trim() !== name) actions.setName(draftName.trim());
            actions.back();
          }}
        />
        <T size={19} w={700} ls={-0.19}>
          Settings
        </T>
      </Row>

      <Card style={{ gap: 14 }}>
        <Field testID="set-name" label="Your first name" value={draftName} onChange={setDraftName} placeholder="Alex" maxLength={30} hint="Used to greet you, and removed from anything sent to the cloud." />
        <View style={{ gap: 6 }}>
          <T size={13} w={700} color={t.muted}>
            Appearance
          </T>
          <Segmented
            testID="appearance"
            value={settings.appearance}
            onChange={(v) => actions.setSettings({ appearance: v })}
            options={[
              { value: 'system', label: 'Match phone' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </View>
      </Card>

      <Card pad={0} style={{ paddingHorizontal: 16, paddingVertical: 6 }} testID="ai-status">
        <View style={{ paddingVertical: 10, gap: 2 }}>
          <T size={15} w={700}>
            Where answers run
          </T>
          <T size={12} color={t.muted} lh={1.4}>
            The phone knows you. The cloud knows the market.
          </T>
        </View>
        <Divider />
        <Row between gap={12} style={{ minHeight: 56, paddingVertical: 10 }}>
          <View style={{ flex: 1, gap: 1 }}>
            <T size={15} w={600}>
              On this device
            </T>
            <T size={12} color={t.muted} lh={1.35}>
              {ai.onDevice === 'available' ? `${MODEL_NAME} reads messages and writes replies.` : ai.reason || `${MODEL_NAME} is not available here.`}
            </T>
          </View>
          <Pill testID="ondevice-pill" label={od.label} tone={od.tone} />
        </Row>
        <Divider />
        <Row between gap={12} style={{ minHeight: 56, paddingVertical: 10 }}>
          <View style={{ flex: 1, gap: 1 }}>
            <T size={15} w={600}>
              Cloud (Firebase AI Logic)
            </T>
            <T size={12} color={t.muted} lh={1.35}>
              {cloudReady ? "Used for today's market range, and as a redacted fallback." : 'Not set up in this build. The app runs on built-in rules.'}
            </T>
          </View>
          <Pill testID="cloud-pill" label={cloudReady ? 'Connected' : 'Not set up'} tone={cloudReady ? 'cloud' : 'neutral'} />
        </Row>
        <Divider />
        <Row between gap={12} style={{ minHeight: 64, paddingVertical: 10 }}>
          <View style={{ flex: 1, gap: 1 }}>
            <T size={15} w={600}>
              Allow the redacted cloud fallback
            </T>
            <T size={12} color={t.muted} lh={1.35}>
              When there is no on-device model, send the message with names, numbers that identify you and links removed. Your limits and Deal File are never sent.
            </T>
          </View>
          <Toggle testID="cloud-fallback" label="Allow the redacted cloud fallback" value={settings.cloudFallback} onChange={(v) => actions.setSettings({ cloudFallback: v })} />
        </Row>
      </Card>

      {Platform.OS === 'ios' && keyboardExtensionEnabled ? <KeyboardTestBench /> : null}

      <Card style={{ gap: 12 }}>
        <T size={15} w={700}>
          Your data
        </T>
        <T size={13} color={t.muted} lh={1.45}>
          {dealCount} deal{dealCount === 1 ? '' : 's'} on this {Platform.OS === 'web' ? 'browser' : 'phone'}. {hasSecureStore ? 'Limits and PIN are in the system keychain.' : "Limits and PIN are in this browser's storage."} There is no account and no server copy.
        </T>
        <Row gap={18} style={{ flexWrap: 'wrap' }}>
          <TextLink
            testID="settings-sample"
            label="Load sample deals"
            onPress={() => {
              actions.loadSample();
              actions.resetTo({ name: 'home' });
              actions.toast('Two made-up deals added.');
            }}
          />
          {!confirmErase ? <TextLink testID="erase" icon="trash" color={t.dangerText} label="Erase everything" onPress={() => setConfirmErase(true)} /> : null}
        </Row>
        {confirmErase ? (
          <View style={{ gap: 10 }}>
            <T size={14} w={600}>
              Erase every deal, your limits and your PIN from this {Platform.OS === 'web' ? 'browser' : 'phone'}? This cannot be undone.
            </T>
            <Row gap={10}>
              <Button flex={1} height={46} variant="secondary" label="Keep them" onPress={() => setConfirmErase(false)} />
              <Button
                testID="erase-confirm"
                flex={1}
                height={46}
                variant="danger"
                label="Erase"
                onPress={async () => {
                  await actions.eraseAll();
                  actions.toast('Everything was erased.');
                }}
              />
            </Row>
          </View>
        ) : null}
      </Card>

      <T size={12} color={t.muted} lh={1.5}>
        SecondLook compares offers and helps you word a reply. It is not a lender or a financial adviser, and a range from the web is a guide, not a quote. You always press send yourself.
      </T>
      <T size={12} color={t.muted}>
        Version {APP_VERSION} · Built with Firebase AI Logic hybrid inference
      </T>
    </Screen>
  );
}
