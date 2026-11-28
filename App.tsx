import React, { useEffect, useState } from 'react';
import { AppState, BackHandler, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { getAi } from './src/ai';
import { announceReady, inExtension, onPageText } from './src/platform/extension';
import { onIncomingText, takeIncomingText } from './src/platform/incoming';
import { runCheck } from './src/state/flows';
import { actions, currentRoute, getState, persistNow, useStore } from './src/state/store';
import { DealFile } from './src/screens/DealFile';
import { Drafts } from './src/screens/Drafts';
import { Home } from './src/screens/Home';
import { Keyboard } from './src/screens/Keyboard';
import { Limits } from './src/screens/Limits';
import { Rounds } from './src/screens/Rounds';
import { Settings } from './src/screens/Settings';
import { Verdict } from './src/screens/Verdict';
import { BusyOverlay, NavBar, Toast } from './src/ui/kit';
import { useTheme } from './src/ui/theme';

function Shell() {
  const t = useTheme();
  const route = useStore(currentRoute);
  const depth = useStore((s) => s.stack.length);
  const busy = useStore((s) => s.busy);
  const toast = useStore((s) => s.toast);
  const unlocked = useStore((s) => s.unlocked);
  const hasPin = useStore((s) => !!s.pin);
  const hasDeals = useStore((s) => s.deals.length > 0);

  let screen: React.ReactNode;
  switch (route.name) {
    case 'limits':
      screen = <Limits dealId={route.dealId} />;
      break;
    case 'keyboard':
      screen = <Keyboard />;
      break;
    case 'settings':
      screen = <Settings />;
      break;
    case 'dealFile':
      screen = <DealFile key={route.dealId ?? 'new'} dealId={route.dealId} fromCheck={route.fromCheck} />;
      break;
    case 'verdict':
      screen = <Verdict />;
      break;
    case 'drafts':
      screen = <Drafts dealId={route.dealId} />;
      break;
    case 'rounds':
      screen = <Rounds dealId={route.dealId} />;
      break;
    default:
      screen = <Home />;
  }

  const isTab = depth === 1 && (route.name === 'home' || route.name === 'limits' || route.name === 'keyboard');
  // On the Limits tab the nav gives way to the "Lock limits" button while editing.
  const editingLimits = route.name === 'limits' && hasDeals && (!hasPin || unlocked);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      {screen}
      {isTab && !editingLimits ? <NavBar current={route.name as 'home' | 'limits' | 'keyboard'} onTab={(n) => actions.tab(n)} onNew={() => actions.go({ name: 'dealFile' })} /> : null}
      {busy ? <BusyOverlay label={busy} /> : null}
      {toast ? <Toast label={toast} /> : null}
    </View>
  );
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold });
  const ready = useStore((s) => s.ready);
  const [gaveUpOnFonts, setGaveUp] = useState(false);

  useEffect(() => {
    void actions.load().then(() => {
      // Warm up: ask Firebase AI Logic what this device can do, and fetch Remote Config.
      void getAi().status(true);
      // Judge mode on the web: sample deals with locked limits, so Counter works at once.
      if (Platform.OS === 'web' && typeof window !== 'undefined' && /[?&]judge=1\b/.test(window.location.search)) actions.judgeMode();
      // Android "select text → Quotekey": the selected text may have launched the app.
      const incoming = takeIncomingText();
      if (incoming) void runCheck(incoming);
      // Chrome extension side panel: open on the keyboard panel and ask for the page's text.
      if (inExtension) {
        if (!getState().page) actions.tab('keyboard');
        announceReady();
      }
    });
    const offText = onIncomingText((text) => void runCheck(text));
    const offPage = onPageText((m) => actions.setPage(m.kind, m.text));
    const fontTimer = setTimeout(() => setGaveUp(true), 2500);

    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (getState().stack.length > 1) {
        actions.back();
        return true;
      }
      return false;
    });
    // Lock the limits and flush storage whenever the app leaves the foreground.
    const app = AppState.addEventListener('change', (s) => {
      if (s !== 'active') {
        actions.lock();
        void persistNow();
      }
    });
    return () => {
      offText();
      offPage();
      clearTimeout(fontTimer);
      back.remove();
      app.remove();
    };
  }, []);

  if (!ready || (!fontsLoaded && !fontError && !gaveUpOnFonts)) {
    return <View style={{ flex: 1, backgroundColor: Platform.OS === 'web' ? '#E9E7E1' : undefined }} />;
  }
  return (
    <SafeAreaProvider>
      <Shell />
    </SafeAreaProvider>
  );
}
