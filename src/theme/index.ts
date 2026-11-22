import { useMemo, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StyleSheet, useColorScheme, type TextStyle } from 'react-native';

// Clause design tokens, mirrored from the design system's tokens.json
// (https://claude.ai/artifact/Pvr3shFeqoSFfMpL84TH2G). Change values there
// first, then here, so the two stay in step.
//
// The look: grouped white lists on a warm grey ground, large bold titles, one
// muted blue `tint` for actions, Inter on every platform so iPhone and
// Android match. Light and dark follow the device unless the person picks
// one with the light/dark button (useAppearance below).
// Every colour in the app comes from a palette below. Screens never write
// a literal colour; they read `t.c.<token>` through makeStyles().

// Option B "warm neutrals + dusty-blue accent" (picked 2026-11-22 from
// https://claude.ai/artifact/FyjG6Gcxkps6JidsCsx8b1): warm greys like the
// Claude app, one quiet blue for actions, softened blue-to-orange grades.
const light = {
  ground: '#f4f3ee',
  surface: '#ffffff',
  surfaceSunk: '#eae8e1',
  line: '#e3e1d9',
  lineStrong: '#8c8a83',
  ink: '#1f1e1d',
  inkMuted: '#6b6a65',
  inkFaint: '#b9b7b0',
  tint: '#3e5c7e',
  onTint: '#ffffff',
  tintSoft: '#e2e7ed',
  onTintSoft: '#2f4a68',
  link: '#3e5c7e',
  switchOn: '#6f9472',
  switchThumb: '#ffffff',
  marker: '#f2e4b8',
  focus: '#3e5c7e',
  logoGround: '#ffffff',
  gradeA: '#4a6a8a',
  onGradeA: '#ffffff',
  gradeB: '#9fb4c7',
  onGradeB: '#1f1e1d',
  gradeC: '#cfccc3',
  onGradeC: '#1f1e1d',
  gradeD: '#d9a86e',
  onGradeD: '#1f1e1d',
  gradeE: '#a95f3f',
  onGradeE: '#ffffff',
  gradeNa: '#eae8e1',
  onGradeNa: '#4a4945',
  pointGood: '#4a6a8a',
  pointBad: '#9a5536',
  pointBlocker: '#7a3a22',
  pointNeutral: '#6b6a65',
};

export type Palette = typeof light;

const dark: Palette = {
  ground: '#1f1e1d',
  surface: '#2a2927',
  surfaceSunk: '#363531',
  line: '#3a3935',
  lineStrong: '#8f8c84',
  ink: '#f2f0ea',
  inkMuted: '#a3a19a',
  inkFaint: '#66645e',
  tint: '#9db4cf',
  onTint: '#141413',
  tintSoft: '#2d3440',
  onTintSoft: '#bccbdd',
  link: '#9db4cf',
  switchOn: '#7fa382',
  switchThumb: '#ffffff',
  marker: '#544a2a',
  focus: '#9db4cf',
  logoGround: '#ffffff',
  gradeA: '#7795b3',
  onGradeA: '#141413',
  gradeB: '#a9bccd',
  onGradeB: '#141413',
  gradeC: '#8f8c84',
  onGradeC: '#141413',
  gradeD: '#d2a46f',
  onGradeD: '#141413',
  gradeE: '#c77d5a',
  onGradeE: '#141413',
  gradeNa: '#363531',
  onGradeNa: '#d6d3ca',
  pointGood: '#9fb8d2',
  pointBad: '#d9967a',
  pointBlocker: '#e08a6e',
  pointNeutral: '#a3a19a',
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
