import { useColorScheme } from 'react-native';
import { useStore } from '../state/store';

// Colours are taken one-for-one from the "SecondLook — app concept" design, light and dark.
export interface Theme {
  dark: boolean;
  bg: string;
  text: string;
  muted: string;
  card: string;
  surface: string; // icon tiles, inputs, neutral chips
  border: string;
  block: string; // deep green hero
  onBlock: string;
  onBlockMuted: string;
  onBlockChip: string;
  coral: string;
  onCoral: string;
  primary: string; // main button: dark green in light mode, coral in dark mode
  onPrimary: string;
  okBg: string;
  okText: string;
  warnBg: string;
  warnText: string;
  cloudBg: string;
  cloudText: string;
  dangerBg: string;
  dangerText: string;
  scam: string;
  onScam: string;
  scamTile: string;
  selectedBg: string;
  toggleOff: string;
  knob: string;
  range: string;
  panel: string; // keyboard panel ground
  panelCard: string;
  highlight: string;
  backdrop: string;
  shadow: string;
  shadowNav: string;
}

export const light: Theme = {
  dark: false,
  bg: '#E9E7E1',
  text: '#232926',
  muted: '#555B57',
  card: '#F6F5F1',
  surface: '#DEDBD3',
  border: '#D2CFC6',
  block: '#3D4A45',
  onBlock: '#FEFEFD',
  onBlockMuted: '#DADFDB',
  onBlockChip: 'rgba(254,254,253,0.14)',
  coral: '#FF6B5C',
  onCoral: '#1F2422',
  primary: '#2F3935',
  onPrimary: '#FDFEFD',
  okBg: '#D9E8DC',
  okText: '#1F6B45',
  warnBg: '#F6E7C1',
  warnText: '#7F5200',
  cloudBg: '#D6ECF5',
  cloudText: '#0F5E7A',
  dangerBg: '#F8D9D4',
  dangerText: '#A82A1E',
  scam: '#C8301F',
  onScam: '#FFFFFE',
  scamTile: 'rgba(14,17,22,0.22)',
  selectedBg: '#FFE1DC',
  toggleOff: '#BDB9AF',
  knob: '#FFFFFE',
  range: '#3E9B6E',
  panel: '#D9D6CE',
  panelCard: '#F8F7F3',
  highlight: '#F9C9C2',
  backdrop: 'rgba(14,17,22,0.45)',
  shadow: '0px 1px 2px rgba(16,24,40,0.04), 0px 10px 28px rgba(16,24,40,0.06)',
  shadowNav: '0px 1px 2px rgba(16,24,40,0.04), 0px 10px 28px rgba(16,24,40,0.08)',
};

export const dark: Theme = {
  dark: true,
  bg: '#232623',
  text: '#F1EFE9',
  muted: '#A9AEA8',
  card: '#2F3330',
  surface: '#3A3F3B',
  border: '#474D48',
  block: '#3F4B46',
  onBlock: '#FEFEFD',
  onBlockMuted: '#DADFDB',
  onBlockChip: 'rgba(254,254,253,0.14)',
  coral: '#FF6B5C',
  onCoral: '#1F2422',
  primary: '#FF6B5C',
  onPrimary: '#1F2422',
  okBg: '#23382C',
  okText: '#7FD8A6',
  warnBg: '#3D3216',
  warnText: '#F2C866',
  cloudBg: '#173540',
  cloudText: '#7FD3EE',
  dangerBg: '#47201C',
  dangerText: '#FF9C90',
  scam: '#C8301F',
  onScam: '#FFFFFE',
  scamTile: 'rgba(14,17,22,0.22)',
  selectedBg: '#4A2A26',
  toggleOff: '#565C57',
  knob: '#FFFFFE',
  range: '#3E9B6E',
  panel: '#1B1D1B',
  panelCard: '#3B403C',
  highlight: '#6B3A34',
  backdrop: 'rgba(0,0,0,0.6)',
  shadow: '0px 1px 2px rgba(16,24,40,0.04), 0px 10px 28px rgba(16,24,40,0.06)',
  shadowNav: '0px 1px 2px rgba(16,24,40,0.04), 0px 10px 28px rgba(16,24,40,0.08)',
};

/** Follows the phone's setting unless the user picked light or dark in Settings. */
export function useTheme(): Theme {
  const system = useColorScheme();
  const pref = useStore((s) => s.settings.appearance);
  const isDark = pref === 'system' ? system === 'dark' : pref === 'dark';
  return isDark ? dark : light;
}

export type Weight = 400 | 500 | 600 | 700;

/**
 * DM Sans is loaded as one font file per weight, so weight is chosen by family name.
 * (fontWeight on a custom font is unreliable on Android.)
 */
export function font(w: Weight = 400): { fontFamily: string } {
  switch (w) {
    case 700:
      return { fontFamily: 'DMSans_700Bold' };
    case 600:
      return { fontFamily: 'DMSans_600SemiBold' };
    case 500:
      return { fontFamily: 'DMSans_500Medium' };
    default:
      return { fontFamily: 'DMSans_400Regular' };
  }
}
