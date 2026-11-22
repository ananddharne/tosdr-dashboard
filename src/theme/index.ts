import { useMemo } from 'react';
import { StyleSheet, useColorScheme, type TextStyle } from 'react-native';

// Clause design tokens, mirrored from the design system's tokens.json
// (https://claude.ai/artifact/Pvr3shFeqoSFfMpL84TH2G). Change values there
// first, then here, so the two stay in step.
//
// The look: grouped white lists on a grey ground, large bold titles, one blue
// `tint` for actions, Inter on every platform so iPhone and Android match.
// Every colour in the app comes from a palette below. Screens never write
// a literal colour; they read `t.c.<token>` through makeStyles().

const light = {
  ground: '#f2f2f7',
  surface: '#ffffff',
  surfaceSunk: '#e3e3e8',
  line: '#c6c6c8',
  lineStrong: '#86868b',
  ink: '#000000',
  inkMuted: '#6c6c70',
  inkFaint: '#b4b4b8',
  tint: '#0066d6',
  onTint: '#ffffff',
  tintSoft: '#dde9f8',
  onTintSoft: '#0057b8',
  link: '#0066d6',
  switchOn: '#34c759',
  switchThumb: '#ffffff',
  marker: '#fff3b0',
  focus: '#0066d6',
  logoGround: '#ffffff',
  gradeA: '#1f5c96',
  onGradeA: '#ffffff',
  gradeB: '#7fb3dc',
  onGradeB: '#161c1f',
  gradeC: '#c4c9c5',
  onGradeC: '#161c1f',
  gradeD: '#eaa54e',
  onGradeD: '#161c1f',
  gradeE: '#ad451d',
  onGradeE: '#ffffff',
  gradeNa: '#e3e3e8',
  onGradeNa: '#3c3c43',
  pointGood: '#1f5c96',
  pointBad: '#a8431c',
  pointBlocker: '#7d2612',
  pointNeutral: '#6c6c70',
};

export type Palette = typeof light;

const dark: Palette = {
  ground: '#000000',
  surface: '#1c1c1e',
  surfaceSunk: '#2c2c2e',
  line: '#38383a',
  lineStrong: '#8e8e93',
  ink: '#ffffff',
  inkMuted: '#98989f',
  inkFaint: '#5a5a5f',
  tint: '#0070e0',
  onTint: '#ffffff',
  tintSoft: '#10243d',
  onTintSoft: '#6cb4ff',
  link: '#4da3ff',
  switchOn: '#30d158',
  switchThumb: '#ffffff',
  marker: '#5c4f14',
  focus: '#4da3ff',
  logoGround: '#ffffff',
  gradeA: '#4b8ccc',
  onGradeA: '#0a1420',
  gradeB: '#9cc6e8',
  onGradeB: '#0a1420',
  gradeC: '#8d9692',
  onGradeC: '#0a1420',
  gradeD: '#e8a456',
  onGradeD: '#1a1004',
  gradeE: '#d9693c',
  onGradeE: '#1a0904',
  gradeNa: '#2c2c2e',
  onGradeNa: '#c7c7cc',
  pointGood: '#8cc1f0',
  pointBad: '#f0966c',
  pointBlocker: '#ff8f75',
  pointNeutral: '#98989f',
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

/** The active theme, following the phone's light/dark setting. */
export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? THEMES.dark : THEMES.light;
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
