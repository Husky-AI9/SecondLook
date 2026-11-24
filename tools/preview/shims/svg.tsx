// Preview-only stand-in for react-native-svg.
import React from 'react';
export default function Svg(p: any) {
  return <svg width={p.width} height={p.height} viewBox={p.viewBox} fill={p.fill} style={{ flex: '0 0 auto', display: 'block' }}>{p.children}</svg>;
}
export const Path = (p: any) => <path {...p} />;
export const Rect = (p: any) => <rect {...p} />;
export const Circle = (p: any) => <circle {...p} />;
