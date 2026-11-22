import React from 'react';
import {
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { gradeColors, hairline, makeStyles, radius, size, space, type, useTheme } from '../theme';
import { ServiceLogo } from './ServiceLogo';

// Clause components for React Native. Guidelines for each live in the
// design system (components/<Name>/README.md); keep behaviour in step.
// One look on iPhone and Android: grouped lists, a blue tint, Inter.

/** Row press feedback: the system ripple on Android, a grey wash elsewhere. */
function useRowPress(): { android_ripple?: { color: string }; pressedStyle: (pressed: boolean) => StyleProp<ViewStyle> } {
  const { c } = useTheme();
  if (Platform.OS === 'android') {
    return { android_ripple: { color: c.surfaceSunk }, pressedStyle: () => null };
  }
  return { pressedStyle: (pressed) => (pressed ? { backgroundColor: c.surfaceSunk } : null) };
}

// --- GradeBadge ------------------------------------------------------------

export function GradeBadge({ grade, large = false }: { grade: string; large?: boolean }): React.JSX.Element {
  const { c } = useTheme();
  const styles = useStyles();
  const upper = grade.toUpperCase();
  const known = ['A', 'B', 'C', 'D', 'E'].includes(upper);
  const text = known ? upper : upper === 'N/A' ? 'N/A' : '?';
  const { bg, fg } = gradeColors(c, upper);
  const px = large ? size.badgeLg : size.badgeSm;
  return (
    <View
      style={[styles.badge, large && styles.badgeLarge, { backgroundColor: bg, width: px, height: px }]}
      accessibilityRole="image"
      accessibilityLabel={known ? `Grade ${upper}` : upper === 'N/A' ? 'Not graded' : 'Unrated'}
    >
      <Text
        style={[
          type.grade,
          { color: fg },
          large && { fontSize: 24, lineHeight: 28 },
          text === 'N/A' && { fontSize: large ? 13 : 10, lineHeight: 14 },
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

// --- Button ----------------------------------------------------------------

export type ButtonVariant = 'primary' | 'secondary' | 'quiet';

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  compact = false,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        styles[variant],
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text style={[styles.buttonText, styles[`${variant}Text`]]}>{label}</Text>
    </Pressable>
  );
}

// --- Chip ------------------------------------------------------------------

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
        {selected ? '✓ ' : ''}
        {label}
      </Text>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: React.ReactNode }): React.JSX.Element {
  const styles = useStyles();
  return <View style={styles.chipRow}>{children}</View>;
}

// --- Switch ----------------------------------------------------------------

/** The same rounded switch on every platform (the native one is Material on Android). */
export function Switch({
  value,
  onValueChange,
  accessibilityLabel,
}: {
  value: boolean;
  onValueChange: (next: boolean) => void;
  accessibilityLabel: string;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      style={[styles.switchTrack, value && styles.switchTrackOn]}
    >
      <View style={[styles.switchThumb, value && styles.switchThumbOn]} />
    </Pressable>
  );
}

// --- Text helpers ----------------------------------------------------------

/** Uppercase header above a grouped section, inset to line up with cell text. */
export function SectionTitle({ children }: { children: React.ReactNode }): React.JSX.Element {
  const styles = useStyles();
  return (
    <Text style={styles.sectionTitle} accessibilityRole="header">
      {children}
    </Text>
  );
}

export function Link({ label, onPress }: { label: string; onPress: () => void }): React.JSX.Element {
  const styles = useStyles();
  return (
    <Pressable onPress={onPress} accessibilityRole="link" hitSlop={8}>
      {({ pressed }) => <Text style={[styles.link, pressed && styles.linkPressed]}>{label}</Text>}
    </Pressable>
  );
}

// --- Note ------------------------------------------------------------------

export function Note({ title, children }: { title?: string; children: React.ReactNode }): React.JSX.Element {
  const styles = useStyles();
  return (
    <View style={styles.note}>
      {title !== undefined && <Text style={styles.noteTitle}>{title}</Text>}
      <Text style={styles.noteText}>{children}</Text>
    </View>
  );
}

// --- TextField -------------------------------------------------------------

export function TextField(props: TextInputProps): React.JSX.Element {
  const { c } = useTheme();
  const styles = useStyles();
  return (
    <TextInput
      placeholderTextColor={c.inkMuted}
      selectionColor={c.tint}
      {...props}
      style={[styles.field, props.style]}
    />
  );
}

// --- PointTag --------------------------------------------------------------

const TAGS: Record<string, [string, string]> = {
  good: ['+', 'Good'],
  bad: ['−', 'Bad'],
  blocker: ['!', 'Blocker'],
  neutral: ['○', 'Neutral'],
};

export function PointTag({ classification }: { classification: string }): React.JSX.Element {
  const { c } = useTheme();
  const styles = useStyles();
  const kind = TAGS[classification.toLowerCase()] ? classification.toLowerCase() : 'neutral';
  const color =
    kind === 'good' ? c.pointGood : kind === 'bad' ? c.pointBad : kind === 'blocker' ? c.pointBlocker : c.pointNeutral;
  return (
    <View style={[styles.tag, { borderColor: color }]}>
      <Text style={[styles.tagText, { color }]}>
        {TAGS[kind][0]} {TAGS[kind][1]}
      </Text>
    </View>
  );
}

// --- ClauseQuote -----------------------------------------------------------

/**
 * One finding with its evidence, as a flat card on ground. `verbatim` marks
 * text copied word for word from the company's own pages: only that text
 * gets the highlighter.
 */
export function ClauseQuote({
  classification,
  kicker,
  title,
  body,
  verbatim = false,
  sourceLabel,
  onPressSource,
}: {
  classification?: string;
  kicker?: string;
  title: string;
  body?: string;
  verbatim?: boolean;
  sourceLabel?: string;
  onPressSource?: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <View style={styles.quote}>
      {(classification !== undefined || kicker !== undefined) && (
        <View style={styles.quoteHead}>
          {classification !== undefined && <PointTag classification={classification} />}
          {kicker !== undefined && <Text style={styles.quoteKicker}>{kicker}</Text>}
        </View>
      )}
      <Text style={styles.quoteTitle}>{title}</Text>
      {body !== undefined && body !== '' && (
        <Text style={verbatim ? styles.quoteVerbatim : styles.quoteBody}>
          {verbatim ? <Text style={styles.mark}>{body}</Text> : body}
        </Text>
      )}
      {sourceLabel !== undefined &&
        (onPressSource ? (
          <Pressable onPress={onPressSource} accessibilityRole="link" hitSlop={6} style={styles.quoteSourceHit}>
            <Text style={styles.quoteSourceLink}>{sourceLabel} ↗</Text>
          </Pressable>
        ) : (
          <Text style={styles.quoteSource}>{sourceLabel}</Text>
        ))}
    </View>
  );
}

// --- Lists -----------------------------------------------------------------

/**
 * Grouped-list look for items rendered one by one in a FlatList: the first
 * item gets the top corners, the last the bottom ones. Rows that draw their
 * own inset separator (ServiceRow) pass `insetSeparator`; others get a
 * full-width hairline between items.
 */
export function useListItemStyle(): (index: number, count: number, insetSeparator?: boolean) => StyleProp<ViewStyle> {
  const styles = useStyles();
  return (index, count, insetSeparator = false) => [
    styles.listItem,
    index === 0 && styles.listFirst,
    index === count - 1 && styles.listLast,
    !insetSeparator && index < count - 1 && styles.listSeparator,
  ];
}

export function ServiceRow({
  name,
  logoUri,
  grade,
  summary,
  onPress,
  separator = false,
  style,
}: {
  name: string;
  logoUri?: string;
  grade: string;
  summary?: string;
  onPress?: () => void;
  /** Draw the hairline under this row, inset to the text. Off for the last row. */
  separator?: boolean;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const styles = useStyles();
  const press = useRowPress();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      android_ripple={press.android_ripple}
      style={({ pressed }) => [styles.row, style, press.pressedStyle(pressed)]}
    >
      <ServiceLogo name={name} uri={logoUri} />
      <View style={[styles.rowBody, separator && styles.rowSeparator]}>
        <View style={styles.rowText}>
          <Text style={styles.rowName} numberOfLines={1}>
            {name}
          </Text>
          {summary !== undefined && <Text style={styles.rowSummary}>{summary}</Text>}
        </View>
        <GradeBadge grade={grade} />
        <Text style={styles.chevron}>›</Text>
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles(({ c }) => ({
  badge: {
    alignItems: 'center',
    borderRadius: radius.sm,
    justifyContent: 'center',
  },
  badgeLarge: {
    borderRadius: radius.lg,
  },

  button: {
    alignItems: 'center',
    borderRadius: radius.lg,
    justifyContent: 'center',
    minHeight: size.buttonH,
    paddingHorizontal: space[4],
  },
  buttonCompact: {
    minHeight: size.tapMin - 8,
    paddingHorizontal: space[3],
  },
  buttonText: {
    ...type.headline,
  },
  primary: { backgroundColor: c.tint },
  primaryText: { color: c.onTint },
  secondary: { backgroundColor: c.tintSoft },
  secondaryText: { color: c.onTintSoft },
  quiet: { backgroundColor: 'transparent', minHeight: size.tapMin, paddingHorizontal: space[2] },
  quietText: { ...type.body, color: c.link },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.4 },

  chip: {
    backgroundColor: c.surfaceSunk,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: size.chipH,
    paddingHorizontal: 14,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[2],
  },
  chipSelected: {
    backgroundColor: c.tint,
  },
  chipText: {
    ...type.bodySm,
    color: c.ink,
  },
  chipTextSelected: {
    fontFamily: type.bodyMedium.fontFamily,
    color: c.onTint,
  },

  switchTrack: {
    backgroundColor: c.surfaceSunk,
    borderRadius: radius.pill,
    height: 31,
    justifyContent: 'center',
    padding: 2,
    width: 51,
  },
  switchTrackOn: {
    backgroundColor: c.switchOn,
  },
  switchThumb: {
    backgroundColor: c.switchThumb,
    borderRadius: radius.pill,
    elevation: 2,
    height: 27,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    width: 27,
  },
  switchThumbOn: {
    alignSelf: 'flex-end',
  },

  sectionTitle: {
    ...type.label,
    color: c.inkMuted,
    marginBottom: space[2],
    marginLeft: space[4],
    marginTop: space[7],
  },
  link: {
    ...type.body,
    color: c.link,
  },
  linkPressed: {
    opacity: 0.6,
  },

  note: {
    backgroundColor: c.surface,
    borderRadius: radius.md,
    gap: 2,
    marginTop: space[2],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  noteTitle: {
    ...type.bodySmBold,
    color: c.ink,
  },
  noteText: {
    ...type.bodySm,
    color: c.inkMuted,
  },

  field: {
    ...type.body,
    backgroundColor: c.surface,
    borderRadius: radius.md,
    color: c.ink,
    minHeight: size.tapMin,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },

  tag: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  tagText: {
    ...type.tag,
  },

  quote: {
    backgroundColor: c.surface,
    borderRadius: radius.md,
    gap: space[2],
    marginBottom: space[3],
    paddingHorizontal: space[4],
    paddingVertical: 14,
  },
  quoteHead: {
    alignItems: 'flex-start',
    gap: space[2],
  },
  quoteKicker: {
    ...type.meta,
    color: c.inkMuted,
  },
  quoteTitle: {
    ...type.headline,
    color: c.ink,
  },
  quoteBody: {
    ...type.bodySm,
    color: c.inkMuted,
  },
  quoteVerbatim: {
    ...type.body,
    color: c.ink,
    lineHeight: 26,
  },
  mark: {
    backgroundColor: c.marker,
    color: c.ink,
  },
  quoteSource: {
    ...type.bodySm,
    color: c.inkMuted,
  },
  quoteSourceHit: {
    alignSelf: 'flex-start',
  },
  quoteSourceLink: {
    ...type.bodySm,
    color: c.link,
  },

  listItem: {
    backgroundColor: c.surface,
    marginHorizontal: space[4],
    overflow: 'hidden',
  },
  listFirst: {
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
  },
  listLast: {
    borderBottomLeftRadius: radius.md,
    borderBottomRightRadius: radius.md,
  },
  listSeparator: {
    borderBottomColor: c.line,
    borderBottomWidth: hairline,
  },

  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space[3],
    paddingLeft: space[4],
  },
  rowBody: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: space[3],
    minHeight: size.rowMin,
    paddingRight: space[4],
    paddingVertical: space[2],
  },
  rowSeparator: {
    borderBottomColor: c.line,
    borderBottomWidth: hairline,
  },
  rowText: {
    flex: 1,
    gap: 1,
  },
  rowName: {
    ...type.bodyMedium,
    color: c.ink,
  },
  rowSummary: {
    ...type.bodySm,
    color: c.inkMuted,
  },
  chevron: {
    color: c.inkFaint,
    fontFamily: type.body.fontFamily,
    fontSize: 24,
    lineHeight: 26,
  },
}));
