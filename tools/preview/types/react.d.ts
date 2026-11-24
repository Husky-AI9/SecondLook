// Minimal React typings so `tsc` can check the app in the no-install preview environment.
// A normal install uses the real @types/react; this file is only referenced by
// tools/preview/tsconfig.json.
declare module 'react' {
  namespace React {
    type ReactNode = any;
    type CSSProperties = Record<string, any>;
    type ComponentType<P = {}> = (props: P) => any;
    const Fragment: any;
    function createElement(type: any, props?: any, ...children: any[]): any;
  }
  export default React;
  export type ReactNode = any;
  export type CSSProperties = Record<string, any>;
  export type ComponentType<P = {}> = (props: P) => any;
  export const Fragment: any;
  export interface Context<T> {
    Provider: (p: { value: T; children?: any }) => any;
  }
  export function createContext<T>(d: T): Context<T>;
  export function useContext<T>(c: Context<T>): T;
  export function useState<T>(init: T | (() => T)): [T, (v: T | ((p: T) => T)) => void];
  export function useEffect(fn: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useMemo<T>(fn: () => T, deps: readonly unknown[]): T;
  export function useCallback<T extends (...a: any[]) => any>(fn: T, deps: readonly unknown[]): T;
  export function useRef<T>(init: T): { current: T };
  export function useSyncExternalStore<T>(sub: (cb: () => void) => () => void, get: () => T, getServer?: () => T): T;
}
declare module 'react/jsx-runtime' {
  export namespace JSX {
    interface Element {}
    interface IntrinsicElements {
      [k: string]: any;
    }
    interface ElementChildrenAttribute {
      children: {};
    }
    interface IntrinsicAttributes {
      key?: string | number;
    }
  }
  export const jsx: any;
  export const jsxs: any;
  export const Fragment: any;
}
declare module 'react-dom/client' {
  export function createRoot(el: Element): { render(n: any): void };
}
declare const process: { env: Record<string, string | undefined> };
