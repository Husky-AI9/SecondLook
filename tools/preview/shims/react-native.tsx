// Preview-only stand-in for react-native, mapping the small part of React Native this app
// uses onto plain DOM. It exists so the screens can be exercised in a headless browser with
// no install step. It is NOT react-native-web and is never part of a shipped build:
// `expo export -p web` uses the real react-native-web.
import React, { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';

declare const __PREVIEW_OS__: string;
const OS = __PREVIEW_OS__;
const w = globalThis as any;

export const Platform = {
  OS,
  Version: 0,
  select<T>(o: { [k: string]: T }): T | undefined {
    return o[OS] ?? o.native ?? o.default;
  },
};

// Style props React Native accepts (the subset used here). Anything else is recorded in
// window.__styleWarnings so a browser-only CSS property cannot slip into the app unnoticed.
const VALID = new Set(
  'alignContent alignItems alignSelf aspectRatio backgroundColor borderBottomColor borderBottomLeftRadius borderBottomRightRadius borderBottomWidth borderColor borderLeftColor borderLeftWidth borderRadius borderRightColor borderRightWidth borderStyle borderTopColor borderTopLeftRadius borderTopRightRadius borderTopWidth borderWidth bottom boxShadow color columnGap display flex flexBasis flexDirection flexGrow flexShrink flexWrap fontFamily fontSize fontStyle fontWeight gap height justifyContent left letterSpacing lineHeight margin marginBottom marginHorizontal marginLeft marginRight marginTop marginVertical maxHeight maxWidth minHeight minWidth opacity overflow padding paddingBottom paddingHorizontal paddingLeft paddingRight paddingTop paddingVertical position right rowGap textAlign textAlignVertical textDecorationLine textTransform top transform width zIndex pointerEvents includeFontPadding'.split(
    ' ',
  ),
);
const UNITLESS = new Set(['flex', 'flexGrow', 'flexShrink', 'opacity', 'zIndex', 'aspectRatio', 'fontWeight']);
const FONT: Record<string, number> = { DMSans_400Regular: 400, DMSans_500Medium: 500, DMSans_600SemiBold: 600, DMSans_700Bold: 700 };

function flatten(style: any, out: Record<string, any> = {}): Record<string, any> {
  if (!style) return out;
  if (Array.isArray(style)) {
    for (const s of style) flatten(s, out);
    return out;
  }
  if (typeof style === 'object') Object.assign(out, style);
  return out;
}

function toCss(style: any, isText: boolean): React.CSSProperties {
  const f = flatten(style);
  const css: Record<string, any> = {};
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined || v === null) continue;
    if (!VALID.has(k)) {
      (w.__styleWarnings ||= []).push(k);
      continue;
    }
    const px = (x: any) => (typeof x === 'number' && !UNITLESS.has(k) ? `${x}px` : x);
    switch (k) {
      case 'flex':
        if (typeof v === 'number' && v > 0) css.flex = `${v} 1 0%`;
        else if (v === 0) css.flex = '0 0 auto';
        break;
      case 'paddingHorizontal':
        css.paddingLeft = css.paddingRight = px(v);
        break;
      case 'paddingVertical':
        css.paddingTop = css.paddingBottom = px(v);
        break;
      case 'marginHorizontal':
        css.marginLeft = css.marginRight = px(v);
        break;
      case 'marginVertical':
        css.marginTop = css.marginBottom = px(v);
        break;
      case 'fontFamily':
        if (FONT[v]) {
          css.fontFamily = "'DM Sans', system-ui, sans-serif";
          css.fontWeight = FONT[v];
        } else css.fontFamily = v;
        break;
      case 'textDecorationLine':
        css.textDecorationLine = v;
        break;
      case 'textAlignVertical':
      case 'includeFontPadding':
        break;
      case 'transform':
        css.transform = (v as any[]).map((t) => Object.entries(t).map(([n, val]) => `${n}(${typeof val === 'number' && !/scale/.test(n) ? val + 'px' : val})`).join(' ')).join(' ');
        break;
      default:
        css[k] = px(v);
    }
  }
  if (!isText && css.borderWidth === undefined && (css.borderColor || css.borderTopWidth || css.borderBottomWidth)) {
    /* individual widths set below by base rule */
  }
  return css as React.CSSProperties;
}

function a11y(p: any): Record<string, any> {
  const o: Record<string, any> = {};
  if (p.testID) o['data-testid'] = p.testID;
  if (p.accessibilityLabel) o['aria-label'] = p.accessibilityLabel;
  if (p.accessibilityRole) o.role = p.accessibilityRole === 'none' ? undefined : p.accessibilityRole;
  const s = p.accessibilityState;
  if (s) {
    if (s.checked !== undefined) o['aria-checked'] = !!s.checked;
    if (s.selected !== undefined) o['aria-selected'] = !!s.selected;
    if (s.disabled) o['aria-disabled'] = true;
  }
  return o;
}

export function View(p: any) {
  const pe = p.pointerEvents;
  return (
    <div {...a11y(p)} className={'rn-view' + (pe === 'box-none' ? ' pe-box-none' : pe === 'none' ? ' pe-none' : '')} style={toCss(p.style, false)}>
      {p.children}
    </div>
  );
}

const InText = createContext(false);

export function Text(p: any) {
  const nested = useContext(InText);
  const css = toCss(p.style, true) as any;
  if (p.numberOfLines === 1) Object.assign(css, { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' });
  else if (p.numberOfLines > 1) Object.assign(css, { display: '-webkit-box', WebkitLineClamp: p.numberOfLines, WebkitBoxOrient: 'vertical', overflow: 'hidden' });
  if (p.selectable) css.userSelect = 'text';
  const Tag: any = nested ? 'span' : 'div';
  return (
    <InText.Provider value={true}>
      <Tag {...a11y(p)} className={nested ? 'rn-text-nested' : 'rn-text'} style={css}>
        {p.children}
      </Tag>
    </InText.Provider>
  );
}

export interface PressableProps {
  style?: Record<string, unknown> | Record<string, unknown>[] | null | false | ((s: { pressed: boolean }) => Record<string, unknown> | Record<string, unknown>[]);
  onPress?: () => void;
  children?: any;
  [k: string]: any;
}

export function Pressable(p: PressableProps) {
  const [pressed, setPressed] = useState(false);
  const style = typeof p.style === 'function' ? p.style({ pressed }) : p.style;
  const disabled = !!p.disabled;
  return (
    <div
      {...a11y(p)}
      role={p.accessibilityRole || 'button'}
      tabIndex={disabled ? -1 : 0}
      className={'rn-view rn-pressable' + (disabled ? ' rn-disabled' : '')}
      style={toCss(style, false)}
      onClick={(e: any) => {
        if (disabled) return;
        e.stopPropagation();
        p.onPress?.();
      }}
      onKeyDown={(e: any) => {
        if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          p.onPress?.();
        }
      }}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
    >
      {typeof p.children === 'function' ? p.children({ pressed }) : p.children}
    </div>
  );
}

export function ScrollView(p: any) {
  return (
    <div {...a11y(p)} className="rn-view rn-scroll" style={{ ...toCss(p.style, false), overflowY: 'auto', overflowX: 'hidden' }}>
      <div className="rn-view" style={toCss(p.contentContainerStyle, false)}>
        {p.children}
      </div>
    </div>
  );
}

export interface TextInputProps {
  onChangeText?: (v: string) => void;
  [k: string]: any;
}

export function TextInput(p: TextInputProps) {
  const css = toCss(p.style, true) as any;
  css['--ph'] = p.placeholderTextColor || '#888';
  const common: any = {
    ...a11y(p),
    className: 'rn-input',
    style: css,
    value: p.value ?? '',
    placeholder: p.placeholder,
    maxLength: p.maxLength,
    readOnly: p.editable === false,
    inputMode: p.inputMode,
    onChange: (e: any) => p.onChangeText?.(e.target.value),
    onFocus: (e: any) => p.selectTextOnFocus && e.target.select?.(),
  };
  return p.multiline ? <textarea {...common} rows={1} /> : <input {...common} type={p.secureTextEntry ? 'password' : 'text'} />;
}

export function KeyboardAvoidingView(p: any) {
  return <View {...p} />;
}

export function ActivityIndicator(p: any) {
  return <div className="rn-spinner" style={{ borderColor: p.color || '#888', borderTopColor: 'transparent' }} />;
}

export const StyleSheet = {
  create<T>(s: T): T {
    return s;
  },
  flatten,
  hairlineWidth: 1,
  absoluteFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
};

// Appearance: follows the browser, or window.__setScheme('dark') in tests.
const schemeListeners = new Set<() => void>();
const mq = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-color-scheme: dark)') : null;
mq?.addEventListener?.('change', () => schemeListeners.forEach((l) => l()));
w.__setScheme = (s: string | null) => {
  w.__scheme = s;
  schemeListeners.forEach((l) => l());
};
export function useColorScheme(): 'light' | 'dark' {
  return useSyncExternalStore(
    (cb) => {
      schemeListeners.add(cb);
      return () => schemeListeners.delete(cb);
    },
    () => w.__scheme || (mq?.matches ? 'dark' : 'light'),
  );
}

export function useWindowDimensions() {
  const [d, setD] = useState({ width: innerWidth, height: innerHeight });
  useEffect(() => {
    const f = () => setD({ width: innerWidth, height: innerHeight });
    addEventListener('resize', f);
    return () => removeEventListener('resize', f);
  }, []);
  return d;
}

export const Linking = {
  async openURL(url: string) {
    (w.__opened ||= []).push(url);
    if (w.__failOpen) throw new Error('cannot open');
  },
  async canOpenURL() {
    return true;
  },
};

export const AppState = {
  currentState: 'active',
  addEventListener(_type: string, cb: (s: string) => void) {
    const f = () => cb(document.visibilityState === 'visible' ? 'active' : 'background');
    document.addEventListener('visibilitychange', f);
    (w.__appState ||= []).push(cb);
    return { remove: () => document.removeEventListener('visibilitychange', f) };
  },
};

export const BackHandler = {
  addEventListener(_type: string, cb: () => boolean) {
    w.__hardwareBack = cb;
    return { remove() {} };
  },
};

export const Keyboard = { dismiss() {} };
export type StyleProp<T> = T | T[] | null | undefined | false;
export type ViewStyle = Record<string, any>;
export type TextStyle = Record<string, any>;
