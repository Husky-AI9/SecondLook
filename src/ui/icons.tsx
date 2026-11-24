import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

// Line icons copied from the design file (24px grid, round caps and joins).

export type IconName =
  | 'settings' | 'arrowUpRight' | 'clipboard' | 'home' | 'car' | 'lock' | 'keyboard' | 'plus' | 'back'
  | 'phone' | 'cloud' | 'eye' | 'check' | 'arrowRight' | 'globe' | 'shield' | 'swap' | 'help' | 'warning'
  | 'x' | 'list' | 'user' | 'send' | 'pencil' | 'trash' | 'chevronRight' | 'unlock' | 'refresh' | 'copy' | 'link';

export function Icon({ name, size = 20, color, stroke = 2 }: { name: IconName; size?: number; color: string; stroke?: number }) {
  const p = { stroke: color, strokeWidth: stroke, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  let body: React.ReactNode = null;
  switch (name) {
    case 'settings':
      body = (<><Path {...p} d="M4 7h10M18 7h2M4 17h2M10 17h10" /><Circle {...p} cx={16} cy={7} r={2} /><Circle {...p} cx={8} cy={17} r={2} /></>);
      break;
    case 'arrowUpRight':
      body = <Path {...p} d="M7 17L17 7M9 7h8v8" />;
      break;
    case 'clipboard':
      body = (<><Rect {...p} x={6} y={5} width={12} height={16} rx={2} /><Path {...p} d="M9 5V3h6v2" /></>);
      break;
    case 'home':
      body = (<><Path {...p} d="M4 11l8-7 8 7" /><Path {...p} d="M6 10v10h12V10" /></>);
      break;
    case 'car':
      body = (<><Path {...p} d="M5 14l1.6-4.6A2 2 0 0 1 8.5 8h7a2 2 0 0 1 1.9 1.4L19 14" /><Rect {...p} x={3} y={14} width={18} height={5} rx={2} /><Path {...p} d="M7 19v1.5M17 19v1.5" /></>);
      break;
    case 'lock':
      body = (<><Rect {...p} x={5} y={11} width={14} height={10} rx={2} /><Path {...p} d="M8 11V7a4 4 0 0 1 8 0v4" /></>);
      break;
    case 'unlock':
      body = (<><Rect {...p} x={5} y={11} width={14} height={10} rx={2} /><Path {...p} d="M8 11V7a4 4 0 0 1 7.5-2" /></>);
      break;
    case 'keyboard':
      body = (<><Rect {...p} x={3} y={6} width={18} height={12} rx={2} /><Path {...p} d="M7 10h.01M11 10h.01M15 10h.01M8 14h8" /></>);
      break;
    case 'plus':
      body = <Path {...p} d="M12 5v14M5 12h14" />;
      break;
    case 'back':
      body = <Path {...p} d="M15 5l-7 7 7 7" />;
      break;
    case 'chevronRight':
      body = <Path {...p} d="M9 5l7 7-7 7" />;
      break;
    case 'phone':
      body = (<><Rect {...p} x={7} y={2} width={10} height={20} rx={2} /><Path {...p} d="M11 18h2" /></>);
      break;
    case 'cloud':
      body = <Path {...p} d="M7 19a4 4 0 0 1-.8-7.9A6 6 0 0 1 18 10.5 4.3 4.3 0 0 1 17.5 19z" />;
      break;
    case 'eye':
      body = (<><Path {...p} d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><Circle {...p} cx={12} cy={12} r={3} /></>);
      break;
    case 'check':
      body = <Path {...p} d="M5 12l5 5 9-10" />;
      break;
    case 'arrowRight':
      body = <Path {...p} d="M4 12h14M13 6l6 6-6 6" />;
      break;
    case 'globe':
      body = (<><Circle {...p} cx={12} cy={12} r={9} /><Path {...p} d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>);
      break;
    case 'shield':
      body = (<><Path {...p} d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><Path {...p} d="M9 12l2 2 4-4" /></>);
      break;
    case 'swap':
      body = (<><Path {...p} d="M4 8h13M13 4l4 4-4 4" /><Path {...p} d="M20 16H7M11 12l-4 4 4 4" /></>);
      break;
    case 'help':
      body = (<><Circle {...p} cx={12} cy={12} r={9} /><Path {...p} d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17v.5" /></>);
      break;
    case 'warning':
      body = (<><Path {...p} d="M12 4l9 16H3z" /><Path {...p} d="M12 10v4M12 17v.5" /></>);
      break;
    case 'x':
      body = <Path {...p} d="M6 6l12 12M18 6L6 18" />;
      break;
    case 'list':
      body = <Path {...p} d="M4 6h16M4 12h16M4 18h10" />;
      break;
    case 'user':
      body = (<><Circle {...p} cx={12} cy={8} r={4} /><Path {...p} d="M4 21a8 8 0 0 1 16 0" /></>);
      break;
    case 'send':
      body = <Path {...p} d="M12 19V5M6 11l6-6 6 6" />;
      break;
    case 'pencil':
      body = (<><Path {...p} d="M4 20h4L19 9l-4-4L4 16v4z" /><Path {...p} d="M13.5 6.5l4 4" /></>);
      break;
    case 'trash':
      body = (<><Path {...p} d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></>);
      break;
    case 'refresh':
      body = (<><Path {...p} d="M20 12a8 8 0 1 1-2.3-5.6" /><Path {...p} d="M20 4v5h-5" /></>);
      break;
    case 'copy':
      body = (<><Rect {...p} x={8} y={8} width={12} height={12} rx={2} /><Path {...p} d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>);
      break;
    case 'link':
      body = (<><Path {...p} d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><Path {...p} d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>);
      break;
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {body}
    </Svg>
  );
}
