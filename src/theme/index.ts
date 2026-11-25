import { useMemo, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StyleSheet, useColorScheme, type TextStyle } from 'react-native';

// Clause design tokens, mirrored from the design system's tokens.json
// (https://claude.ai/artifact/Pvr3shFeqoSFfMpL84TH2G). Change values there
// first, then here, so the two stay in step.
//
// The look: white cards on a warm grey ground, large bold titles, red for
// warnings and actions, Inter on every platform so iPhone and Android match. Light and dark follow the device unless the person picks
// one with the light/dark button (useAppearance below).
// Every colour in the app comes from a palette below. Screens never write
// a literal colour; they read `t.c.<token>` through makeStyles().

// "Clinical red" (picked 2026-11-24 from
// https://claude.ai/artifact/17dUrosHqR7D2rLn9VsNG4, option C): warm white
// cards on a warm grey ground, Cronometer-style density, and red as the
// voice of the app's warnings, and only its warnings: actions and links are
// neutral charcoal (off-white in dark) so red always means danger. Red tokens:
//   alarm/onAlarm      the solid red hero for D/E apps
//   bad/badTrack       bar fills and their empty track
//   badText            red text on surface or ground
//   blocker/onBlocker  the deepest red, for ToS;DR "blocker" cases
// Good points stay blue (goodStrong/goodText) so they never read as red.
const light = {
  ground: '#f4f2ee',
  surface: '#ffffff',
  surfaceSunk: '#efece7',
  line: '#e7e3dc',
  lineStrong: '#8c877f',
  ink: '#1d1b19',
  inkMuted: '#5f5b55',
  inkFaint: '#b5b0a8',
  tint: '#1d1b19',
  onTint: '#ffffff',
  tintSoft: '#e9e5de',
  onTintSoft: '#1d1b19',
  link: '#1d1b19',
  switchOn: '#3e5c7e',
  switchThumb: '#ffffff',
  marker: '#f8e3b0',
  focus: '#1d1b19',
  // Hover (web): rows on surface get `hoverRow`; ghost buttons and chips `hoverWash`.
  hoverRow: '#faf8f5',
  hoverWash: '#e9e5de',
  tintHover: '#3a3734',
  tintSoftHover: '#dedad2',
  logoGround: '#ffffff',
  shadow: '#000000',
  alarm: '#b42318',
  onAlarm: '#ffffff',
  onAlarmMuted: '#ffd9d4',
  bad: '#d92d20',
  badTrack: '#f1e4e2',
  badText: '#b42318',
  blocker: '#7a1009',
  onBlocker: '#ffffff',
  neutralMark: '#c9c4bc',
  goodStrong: '#3e5c7e',
  onGood: '#ffffff',
  goodText: '#2f4a68',
  gradeA: '#3e5c7e',
  onGradeA: '#ffffff',
  gradeB: '#9fb4c7',
  onGradeB: '#1d1b19',
  gradeC: '#f2d16b',
  onGradeC: '#1d1b19',
  gradeD: '#f79009',
  onGradeD: '#1d1b19',
  gradeE: '#b42318',
  onGradeE: '#ffffff',
  gradeNa: '#efece7',
  onGradeNa: '#4a4743',
  pointGood: '#2f4a68',
  pointBad: '#b42318',
  pointBlocker: '#7a1009',
  pointNeutral: '#5f5b55',
};

export type Palette = typeof light;

const dark: Palette = {
  ground: '#161413',
  surface: '#221f1d',
  surfaceSunk: '#2e2a27',
  line: '#34302c',
  lineStrong: '#8f8a82',
  ink: '#f3efea',
  inkMuted: '#a8a29a',
  inkFaint: '#6b655e',
  tint: '#f3efea',
  onTint: '#161413',
  tintSoft: '#3a3532',
  onTintSoft: '#f3efea',
  link: '#f3efea',
  switchOn: '#7795b3',
  switchThumb: '#ffffff',
  marker: '#5a4520',
  focus: '#f3efea',
  hoverRow: '#2a2624',
  hoverWash: '#3a3532',
  tintHover: '#ffffff',
  tintSoftHover: '#46403c',
  logoGround: '#ffffff',
  shadow: '#000000',
  alarm: '#9b1c13',
  onAlarm: '#ffffff',
  onAlarmMuted: '#ffcfc8',
  bad: '#f04438',
  badTrack: '#3a2422',
  badText: '#ff8577',
  blocker: '#c4261b',
  onBlocker: '#ffffff',
  neutralMark: '#5a554f',
  goodStrong: '#7795b3',
  onGood: '#141211',
  goodText: '#b5c8de',
  gradeA: '#7795b3',
  onGradeA: '#141211',
  gradeB: '#a9bccd',
  onGradeB: '#141211',
  gradeC: '#e8cf74',
  onGradeC: '#141211',
  gradeD: '#f5a33d',
  onGradeD: '#141211',
  gradeE: '#e5483a',
  onGradeE: '#141211',
  gradeNa: '#2e2a27',
  onGradeNa: '#d6d1ca',
  pointGood: '#b5c8de',
  pointBad: '#ff8577',
  pointBlocker: '#ff9e92',
  pointNeutral: '#a8a29a',
};

// Font family names are the keys App.tsx registers with useFonts(). With
// custom fonts each weight is its own family, so styles set fontFamily
// and never fontWeight (Android would otherwise fall back to the system face).
export const fonts = {
  text: 'Inter_400Regular',
  textMedium: 'Inter_500Medium',
  textBold: 'Inter_600SemiBold',
  display: 'Inter_700Bold',
} as const;

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24, 7: 28, 8: 32 } as const;
// xl is app-only: chat bubbles and the empty-state card.
export const radius = { sm: 8, md: 10, lg: 12, xl: 18, pill: 999 } as const;
export const size = {
  tapMin: 44,
  rowMin: 64,
  buttonH: 50,
  chipH: 34,
  badgeSm: 30,
  badgeLg: 48,
  logoSm: 32,
  logoMd: 40,
  logoLg: 56,
} as const;

/** 0.5px on screens that support it; the hairline separators of grouped lists. */
export const hairline = StyleSheet.hairlineWidth;

export const type = {
  display: { fontFamily: fonts.display, fontSize: 34, lineHeight: 41, letterSpacing: -0.68 },
  title: { fontFamily: fonts.display, fontSize: 28, lineHeight: 34, letterSpacing: -0.56 },
  headline: { fontFamily: fonts.textBold, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: fonts.text, fontSize: 17, lineHeight: 22 },
  bodyMedium: { fontFamily: fonts.textMedium, fontSize: 17, lineHeight: 22 },
  bodySm: { fontFamily: fonts.text, fontSize: 15, lineHeight: 20 },
  bodySmBold: { fontFamily: fonts.textBold, fontSize: 15, lineHeight: 20 },
  footnote: { fontFamily: fonts.text, fontSize: 13, lineHeight: 18 },
  label: { fontFamily: fonts.textMedium, fontSize: 13, lineHeight: 18, letterSpacing: 0.26, textTransform: 'uppercase' },
  tag: { fontFamily: fonts.textBold, fontSize: 12, lineHeight: 16 },
  grade: { fontFamily: fonts.display, fontSize: 15, lineHeight: 18 },
  meta: { fontFamily: fonts.text, fontSize: 13, lineHeight: 18 },
} satisfies Record<string, TextStyle>;

export interface Theme {
  scheme: 'light' | 'dark';
  c: Palette;
}

const THEMES: Record<'light' | 'dark', Theme> = {
  light: { scheme: 'light', c: light },
  dark: { scheme: 'dark', c: dark },
};

// --- Appearance: follow the device, or a light/dark choice ------------------
//
// 'system' until the person taps the light/dark button; their choice is
// remembered on the device. Kept in a tiny module-level store (not React
// context) so useTheme() works anywhere without a provider.

export type Appearance = 'system' | 'light' | 'dark';

const APPEARANCE_KEY = '@tosdr/appearance';
let appearance: Appearance = 'system';
const listeners = new Set<() => void>();

function setAppearanceValue(next: Appearance): void {
  appearance = next;
  listeners.forEach((l) => l());
}

void AsyncStorage.getItem(APPEARANCE_KEY)
  .then((saved) => {
    if (saved === 'light' || saved === 'dark') {
      setAppearanceValue(saved);
    }
  })
  .catch(() => undefined);

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The person's choice and a setter that remembers it. */
export function useAppearance(): { appearance: Appearance; setAppearance: (a: Appearance) => void } {
  const value = useSyncExternalStore(subscribe, () => appearance, () => appearance);
  return {
    appearance: value,
    setAppearance: (next: Appearance) => {
      setAppearanceValue(next);
      void AsyncStorage.setItem(APPEARANCE_KEY, next).catch(() => undefined);
    },
  };
}

/** The active theme: the person's light/dark choice, else the device's. */
export function useTheme(): Theme {
  const device = useColorScheme();
  const { appearance: chosen } = useAppearance();
  const scheme = chosen === 'system' ? (device === 'dark' ? 'dark' : 'light') : chosen;
  return THEMES[scheme];
}

/**
 * Build a themed style hook: `const useStyles = makeStyles((t) => ({...}))`
 * at module level, then `const styles = useStyles()` inside the component.
 * Styles are created once per theme.
 */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(build: (t: Theme) => T): () => T {
  const cache = new Map<Theme, T>();
  return function useStyles(): T {
    const theme = useTheme();
    return useMemo(() => {
      let styles = cache.get(theme);
      if (!styles) {
        styles = StyleSheet.create(build(theme));
        cache.set(theme, styles);
      }
      return styles;
    }, [theme]);
  };
}

/** Fill and letter colours for a ToS;DR grade badge. */
export function gradeColors(c: Palette, grade: string): { bg: string; fg: string } {
  switch (grade.toUpperCase()) {
    case 'A':
      return { bg: c.gradeA, fg: c.onGradeA };
    case 'B':
      return { bg: c.gradeB, fg: c.onGradeB };
    case 'C':
      return { bg: c.gradeC, fg: c.onGradeC };
    case 'D':
      return { bg: c.gradeD, fg: c.onGradeD };
    case 'E':
      return { bg: c.gradeE, fg: c.onGradeE };
    default:
      return { bg: c.gradeNa, fg: c.onGradeNa };
  }
}
