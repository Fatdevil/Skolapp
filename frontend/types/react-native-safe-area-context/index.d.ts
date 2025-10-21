declare module 'react-native-safe-area-context' {
  import type { ComponentType, ReactNode } from 'react';

  export interface EdgeInsets {
    top: number;
    right: number;
    bottom: number;
    left: number;
  }

  export type Edge = 'top' | 'right' | 'bottom' | 'left';

  export const SafeAreaProvider: ComponentType<{ children?: ReactNode }>;
  export function useSafeAreaInsets(): EdgeInsets;
  export const SafeAreaView: ComponentType<{ children?: ReactNode; edges?: Edge[] }>;
  const SafeAreaContext: ComponentType<{ children?: ReactNode }>;
  export default SafeAreaContext;
}
