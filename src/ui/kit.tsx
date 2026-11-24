import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { InferenceSource } from '../engine';
import { Icon, type IconName } from './icons';
import { font, useTheme, type Weight } from './theme';

// ---------- text ----------
export function T(props: {
  children?: React.ReactNode;
  size?: number;
  w?: Weight;
  color?: string;
  lh?: number;
  ls?: number;
  center?: boolean;
  lines?: number;
  style?: StyleProp<TextStyle>;
  selectable?: boolean;
  testID?: string;
}) {
  const t = useTheme();
  const size = props.size ?? 15;
  return (
    <Text
      testID={props.testID}
      selectable={props.selectable}
      numberOfLines={props.lines}
      style={[
        font(props.w ?? 400),
        { fontSize: size, color: props.color ?? t.text, lineHeight: Math.round(size * (props.lh ?? 1.35)), letterSpacing: props.ls ?? 0, textAlign: props.center ? 'center' : 'left' },
        props.style,
      ]}
    >
      {props.children}
    </Text>
  );
}

// ---------- layout ----------
export function Screen(props: { children: React.ReactNode; footer?: React.ReactNode; gap?: number; navSpace?: boolean; testID?: string }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const top = Math.max(insets.top, Platform.OS === 'web' ? 12 : 0) + 16;
  const bottom = Math.max(insets.bottom, 12) + 12;
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View testID={props.testID} style={{ flex: 1, width: '100%', maxWidth: 520, alignSelf: 'center' }}>
        <ScrollView
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: top, paddingHorizontal: 20, paddingBottom: props.footer ? 16 : props.navSpace ? bottom + 84 : bottom, gap: props.gap ?? 14, flexGrow: 1 }}
        >
          {props.children}
        </ScrollView>
        {props.footer ? <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: bottom, gap: 10 }}>{props.footer}</View> : null}
      </View>
    </KeyboardAvoidingView>
  );
}

export function Card(props: { children: React.ReactNode; style?: StyleProp<ViewStyle>; pad?: number; radius?: number; testID?: string }) {
  const t = useTheme();
  return (
    <View testID={props.testID} style={[{ backgroundColor: t.card, borderRadius: props.radius ?? 22, padding: props.pad ?? 16, boxShadow: t.shadow }, props.style]}>
      {props.children}
    </View>
  );
}

export function Row(props: { children: React.ReactNode; gap?: number; style?: StyleProp<ViewStyle>; between?: boolean; align?: ViewStyle['alignItems']; testID?: string }) {
  return <View testID={props.testID} style={[{ flexDirection: 'row', alignItems: props.align ?? 'center', gap: props.gap ?? 8, justifyContent: props.between ? 'space-between' : 'flex-start' }, props.style]}>{props.children}</View>;
}

export function Divider() {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: t.border }} />;
}

// ---------- chips ----------
export type Tone = 'ok' | 'warn' | 'danger' | 'neutral' | 'cloud' | 'coral' | 'onBlock';

export function Pill(props: { label: string; tone?: Tone; icon?: IconName; size?: 'sm' | 'md'; testID?: string }) {
  const t = useTheme();
  const tone = props.tone ?? 'neutral';
  const bg = { ok: t.okBg, warn: t.warnBg, danger: t.dangerBg, neutral: t.surface, cloud: t.cloudBg, coral: t.coral, onBlock: t.onBlockChip }[tone];
  const fg = { ok: t.okText, warn: t.warnText, danger: t.dangerText, neutral: t.text, cloud: t.cloudText, coral: t.onCoral, onBlock: t.onBlock }[tone];
  const md = props.size === 'md';
  return (
    <View testID={props.testID} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: md ? 28 : 26, paddingHorizontal: md ? 12 : 10, borderRadius: 14, backgroundColor: bg, alignSelf: 'flex-start' }}>
      {props.icon ? <Icon name={props.icon} size={12} color={fg} stroke={2.2} /> : null}
      <T size={md ? 13 : 12} w={700} color={fg} lh={1.2}>
        {props.label}
      </T>
    </View>
  );
}

const SOURCE_LABEL: Record<InferenceSource, string> = {
  'on-device': 'on-device',
  cloud: 'Cloud',
  'cloud-redacted': 'Cloud · redacted',
  'offline-rules': 'Offline rules',
};

/** Every result says where it ran. `verb` turns "on-device" into "Read on-device". */
export function SourceChip(props: { source: InferenceSource; verb?: string; size?: 'sm' | 'md' }) {
  const s = props.source;
  const label = s === 'on-device' ? (props.verb ? `${props.verb} on-device` : 'On-device') : SOURCE_LABEL[s];
  return <Pill testID="source-chip" size={props.size ?? 'md'} label={label} tone={s === 'on-device' ? 'ok' : s === 'offline-rules' ? 'neutral' : 'cloud'} icon={s === 'on-device' ? 'phone' : s === 'offline-rules' ? 'list' : 'cloud'} />;
}

// ---------- buttons ----------
export function Button(props: {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'coral' | 'danger';
  icon?: IconName;
  iconRight?: IconName;
  disabled?: boolean;
  loading?: boolean;
  height?: number;
  flex?: number;
  testID?: string;
}) {
  const t = useTheme();
  const v = props.variant ?? 'primary';
  const bg = v === 'primary' ? t.primary : v === 'coral' ? t.coral : v === 'danger' ? t.scam : t.card;
  const fg = v === 'primary' ? t.onPrimary : v === 'coral' ? t.onCoral : v === 'danger' ? t.onScam : t.text;
  const h = props.height ?? 54;
  const off = props.disabled || props.loading;
  return (
    <Pressable
      testID={props.testID}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityState={{ disabled: !!off }}
      disabled={off}
      onPress={props.onPress}
      style={({ pressed }) => ({
        height: h,
        borderRadius: h / 2,
        backgroundColor: bg,
        borderWidth: v === 'secondary' ? 1 : 0,
        borderColor: t.border,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingHorizontal: 18,
        opacity: off ? 0.45 : pressed ? 0.85 : 1,
        flex: props.flex,
      })}
    >
      {props.loading ? <ActivityIndicator color={fg} /> : props.icon ? <Icon name={props.icon} size={18} color={fg} stroke={2.2} /> : null}
      <T size={16} w={700} color={fg} lh={1.2}>
        {props.label}
      </T>
      {props.iconRight ? <Icon name={props.iconRight} size={18} color={fg} stroke={2.2} /> : null}
    </Pressable>
  );
}

export function RoundBtn(props: { icon: IconName; label: string; onPress?: () => void; testID?: string }) {
  const t = useTheme();
  return (
    <Pressable
      testID={props.testID}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      onPress={props.onPress}
      hitSlop={6}
      style={({ pressed }) => ({ width: 46, height: 46, borderRadius: 23, borderWidth: 1, borderColor: t.border, backgroundColor: t.card, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}
    >
      <Icon name={props.icon} size={20} color={t.text} stroke={props.icon === 'back' ? 2.2 : 2} />
    </Pressable>
  );
}

export function TextLink(props: { label: string; onPress?: () => void; color?: string; testID?: string; icon?: IconName }) {
  const t = useTheme();
  const c = props.color ?? t.text;
  return (
    <Pressable testID={props.testID} accessibilityRole="button" accessibilityLabel={props.label} onPress={props.onPress} hitSlop={10} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32, opacity: pressed ? 0.6 : 1 })}>
      {props.icon ? <Icon name={props.icon} size={14} color={c} stroke={2.2} /> : null}
      <T size={14} w={700} color={c} style={{ textDecorationLine: 'underline' }}>
        {props.label}
      </T>
    </Pressable>
  );
}

// ---------- small pieces ----------
export function IconTile(props: { icon: IconName; size?: number; bg?: string; color?: string; radius?: number }) {
  const t = useTheme();
  const s = props.size ?? 44;
  return (
    <View style={{ width: s, height: s, borderRadius: props.radius ?? 14, backgroundColor: props.bg ?? t.surface, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={props.icon} size={Math.round(s * 0.45)} color={props.color ?? t.text} />
    </View>
  );
}

export function Avatar(props: { letter: string; size?: number }) {
  const t = useTheme();
  const s = props.size ?? 46;
  return (
    <View style={{ width: s, height: s, borderRadius: s / 2, backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center' }}>
      <T size={Math.round(s * 0.39)} w={700} lh={1.2}>
        {props.letter}
      </T>
    </View>
  );
}

export function Toggle(props: { value: boolean; onChange?: (v: boolean) => void; label: string; disabled?: boolean; testID?: string }) {
  const t = useTheme();
  return (
    <Pressable
      testID={props.testID}
      accessibilityRole="switch"
      accessibilityLabel={props.label}
      accessibilityState={{ checked: props.value, disabled: !!props.disabled }}
      disabled={props.disabled}
      onPress={() => props.onChange?.(!props.value)}
      hitSlop={8}
      style={{ width: 52, height: 32, borderRadius: 16, padding: 3, backgroundColor: props.value ? (t.dark ? t.coral : t.primary) : t.toggleOff, flexDirection: 'row', justifyContent: props.value ? 'flex-end' : 'flex-start', opacity: props.disabled ? 0.5 : 1 }}
    >
      <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: t.knob }} />
    </Pressable>
  );
}

export function NumField(props: { value: string; onChange: (v: string) => void; unit: string; label: string; editable?: boolean; testID?: string; width?: number }) {
  const t = useTheme();
  return (
    <Row gap={8}>
      <TextInput
        testID={props.testID}
        accessibilityLabel={props.label}
        value={props.value}
        onChangeText={(v) => props.onChange(v.replace(/[^0-9.,]/g, ''))}
        editable={props.editable !== false}
        keyboardType="decimal-pad"
        inputMode="decimal"
        selectTextOnFocus
        style={[font(700), { width: props.width ?? 92, height: 44, paddingHorizontal: 12, paddingVertical: 0, borderRadius: 12, backgroundColor: t.surface, color: t.text, fontSize: 18, textAlign: 'right' }]}
      />
      <T size={15} w={600} color={t.muted} style={{ width: 14 }}>
        {props.unit}
      </T>
    </Row>
  );
}

export function Field(props: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string; numeric?: boolean; testID?: string; multiline?: boolean; maxLength?: number }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <T size={13} w={700} color={t.muted}>
        {props.label}
      </T>
      <TextInput
        testID={props.testID}
        accessibilityLabel={props.label}
        value={props.value}
        onChangeText={props.onChange}
        placeholder={props.placeholder}
        placeholderTextColor={t.muted}
        keyboardType={props.numeric ? 'decimal-pad' : 'default'}
        inputMode={props.numeric ? 'decimal' : 'text'}
        multiline={props.multiline}
        maxLength={props.maxLength ?? 200}
        style={[font(600), { minHeight: props.multiline ? 84 : 48, paddingHorizontal: 14, paddingVertical: props.multiline ? 12 : 0, borderRadius: 14, backgroundColor: t.surface, color: t.text, fontSize: 16, textAlignVertical: props.multiline ? 'top' : 'center' }]}
      />
      {props.hint ? (
        <T size={12} color={t.muted}>
          {props.hint}
        </T>
      ) : null}
    </View>
  );
}

export function Segmented<V extends string>(props: { value: V; options: { value: V; label: string }[]; onChange: (v: V) => void; testID?: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {props.options.map((o) => {
        const on = o.value === props.value;
        return (
          <Pressable
            key={o.value}
            testID={props.testID ? `${props.testID}-${o.value}` : undefined}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            onPress={() => props.onChange(o.value)}
            style={{ height: 40, paddingHorizontal: 16, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.primary : t.surface }}
          >
            <T size={14} w={700} color={on ? t.onPrimary : t.text} lh={1.2}>
              {o.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A coloured note block, like "What the cloud saw". */
export function Note(props: { tone: 'cloud' | 'ok' | 'warn' | 'danger' | 'neutral'; icon?: IconName; title?: string; children?: React.ReactNode; testID?: string }) {
  const t = useTheme();
  const bg = { cloud: t.cloudBg, ok: t.okBg, warn: t.warnBg, danger: t.dangerBg, neutral: t.surface }[props.tone];
  const fg = { cloud: t.cloudText, ok: t.okText, warn: t.warnText, danger: t.dangerText, neutral: t.text }[props.tone];
  return (
    <View testID={props.testID} style={{ gap: 6, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 18, backgroundColor: bg }}>
      {props.title ? (
        <Row gap={8}>
          {props.icon ? <Icon name={props.icon} size={16} color={fg} /> : null}
          <T size={13} w={700} color={fg} style={{ flex: 1 }}>
            {props.title}
          </T>
        </Row>
      ) : null}
      {props.children}
    </View>
  );
}

// ---------- overlays ----------
export function Sheet(props: { children: React.ReactNode; onClose: () => void; title?: string; testID?: string }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View testID={props.testID} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end', zIndex: 50 }}>
      <Pressable accessibilityLabel="Close" onPress={props.onClose} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: t.backdrop }} />
      <View style={{ width: '100%', maxWidth: 520, alignSelf: 'center', maxHeight: '88%', backgroundColor: t.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 12) + 12 }}>
        <View style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: t.toggleOff, marginBottom: 10 }} />
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, gap: 14, paddingBottom: 4 }}>
          {props.title ? (
            <T size={20} w={700} ls={-0.2}>
              {props.title}
            </T>
          ) : null}
          {props.children}
        </ScrollView>
      </View>
    </View>
  );
}

export function PinPad(props: { onDone: (pin: string) => boolean; error?: string }) {
  const t = useTheme();
  const [pin, setPin] = useState('');
  const [wrong, setWrong] = useState(false);
  const press = (k: string) => {
    if (k === 'del') {
      setPin((p) => p.slice(0, -1));
      setWrong(false);
      return;
    }
    const next = (pin + k).slice(0, 4);
    setPin(next);
    setWrong(false);
    if (next.length === 4) {
      const ok = props.onDone(next);
      if (!ok) {
        setWrong(true);
        setTimeout(() => setPin(''), 250);
      }
    }
  };
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];
  return (
    <View style={{ gap: 16, alignItems: 'center' }}>
      <Row gap={14} style={{ height: 24 }}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: i < pin.length ? (wrong ? t.scam : t.text) : t.toggleOff }} />
        ))}
      </Row>
      <T size={13} w={600} color={wrong ? t.dangerText : t.muted} testID="pin-msg">
        {wrong ? 'That PIN is not right. Try again.' : 'Enter your 4-digit PIN'}
      </T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: 264, gap: 12, justifyContent: 'center' }}>
        {keys.map((k, i) =>
          k === '' ? (
            <View key={i} style={{ width: 80, height: 60 }} />
          ) : (
            <Pressable
              key={i}
              testID={`pin-${k}`}
              accessibilityRole="button"
              accessibilityLabel={k === 'del' ? 'Delete' : k}
              onPress={() => press(k)}
              style={({ pressed }) => ({ width: 80, height: 60, borderRadius: 20, backgroundColor: pressed ? t.toggleOff : t.surface, alignItems: 'center', justifyContent: 'center' })}
            >
              {k === 'del' ? <Icon name="back" size={22} color={t.text} stroke={2.2} /> : <T size={24} w={600} lh={1.2}>{k}</T>}
            </Pressable>
          ),
        )}
      </View>
    </View>
  );
}

export function BusyOverlay(props: { label: string }) {
  const t = useTheme();
  return (
    <View testID="busy" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: t.backdrop, zIndex: 80 }}>
      <View style={{ backgroundColor: t.card, borderRadius: 24, paddingVertical: 20, paddingHorizontal: 24, gap: 12, alignItems: 'center', minWidth: 200 }}>
        <ActivityIndicator color={t.text} />
        <T size={15} w={700}>
          {props.label}
        </T>
      </View>
    </View>
  );
}

export function Toast(props: { label: string }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: Math.max(insets.top, 12) + 8, alignItems: 'center', zIndex: 90, paddingHorizontal: 20 }}>
      <View testID="toast" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.okBg, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 16, maxWidth: 480, boxShadow: t.shadowNav }}>
        <Icon name="check" size={16} color={t.okText} stroke={2.5} />
        <T size={13} w={700} color={t.okText} style={{ flexShrink: 1 }}>
          {props.label}
        </T>
      </View>
    </View>
  );
}

export function NavBar(props: { current: 'home' | 'limits' | 'keyboard' | null; onTab: (t: 'home' | 'limits' | 'keyboard') => void; onNew: () => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const item = (name: 'home' | 'limits' | 'keyboard', icon: IconName, label: string) => {
    const on = props.current === name;
    return (
      <Pressable
        key={name}
        testID={`nav-${name}`}
        accessibilityRole="tab"
        accessibilityLabel={label}
        accessibilityState={{ selected: on }}
        onPress={() => props.onTab(name)}
        style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: on ? t.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}
      >
        <Icon name={icon} size={20} color={on ? t.onPrimary : t.text} />
      </Pressable>
    );
  };
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: Math.max(insets.bottom, 12) + 12, alignItems: 'center', zIndex: 20 }}>
      <View accessibilityRole="tablist" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8, borderRadius: 36, backgroundColor: t.card, boxShadow: t.shadowNav }}>
        {item('home', 'home', 'Deals')}
        {item('limits', 'lock', 'Limits')}
        {item('keyboard', 'keyboard', 'Keyboard')}
        <Pressable testID="nav-new" accessibilityRole="button" accessibilityLabel="New deal" onPress={props.onNew} style={({ pressed }) => ({ width: 52, height: 52, borderRadius: 26, backgroundColor: t.coral, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
          <Icon name="plus" size={20} color={t.onCoral} stroke={2.4} />
        </Pressable>
      </View>
    </View>
  );
}
