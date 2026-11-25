import React, { useMemo, useState } from 'react';
import { Linking, Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { makeStyles, radius, size, space, type, useTheme, type Palette } from '../theme';
import { EXPOSURE_ITEMS, findingMatches, redFlagsFor, type ExposureItem } from '../utils/exposure';
import { countByClass, isRedFlag, sortWorstFirst, type ClassCounts, type Classification, type Finding } from '../utils/findings';
import { GradeBadge, PendingBadge, webInteractive, type PressState, useRowPress } from './ui';
import { ServiceLogo } from './ServiceLogo';

// "Clinical red" building blocks (design canvas option C): white cards, small
// uppercase card titles, two-column bar grids that page like Cronometer's
// nutrient groups, and sections that open and close instead of one long list.

// --- Icons -----------------------------------------------------------------

export function Chevron({ dir, color, px = 18 }: { dir: 'up' | 'down' | 'left' | 'right'; color: string; px?: number }): React.JSX.Element {
  const d = { up: 'm6 15 6-6 6 6', down: 'm6 9 6 6 6-6', left: 'm15 6-6 6 6 6', right: 'm9 6 6 6-6 6' }[dir];
  return (
    <Svg width={px} height={px} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d={d} />
    </Svg>
  );
}

function PlusMinus({ open, color }: { open: boolean; color: string }): React.JSX.Element {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round">
      <Path d={open ? 'M5 12h14' : 'M12 5v14M5 12h14'} />
    </Svg>
  );
}

// --- Card ------------------------------------------------------------------

export function Card({ children, style, flush = false }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; flush?: boolean }): React.JSX.Element {
  const styles = useStyles();
  return <View style={[styles.card, flush && styles.cardFlush, style]}>{children}</View>;
}

export function CardTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }): React.JSX.Element {
  const styles = useStyles();
  return (
    <View style={styles.cardTitleRow}>
      <Text style={styles.cardTitle} accessibilityRole="header">
        {children}
      </Text>
      {right}
    </View>
  );
}

// --- Bars ------------------------------------------------------------------

export function Bar({ fraction, thin = false, color }: { fraction: number; thin?: boolean; color?: string }): React.JSX.Element {
  const { c } = useTheme();
  const styles = useStyles();
  const pct = `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%` as const;
  return (
    <View style={[styles.barTrack, thin && styles.barThin]}>
      <View style={[styles.barFill, thin && styles.barThin, { width: pct, backgroundColor: color ?? c.bad }]} />
    </View>
  );
}

/** One labelled bar in a two-column BarGrid. Tappable when `onPress` is set. */
export function BarCell({
  label,
  value,
  fraction,
  onPress,
  selected = false,
  muted = false,
}: {
  label: string;
  value: string;
  fraction: number;
  onPress?: () => void;
  selected?: boolean;
  muted?: boolean;
}): React.JSX.Element {
  const styles = useStyles();
  const body = (
    <>
      <View style={styles.barHead}>
        <Text style={[styles.barLabel, selected && styles.barLabelSelected]} numberOfLines={2}>
          {label}
        </Text>
        <Text style={[styles.barValue, muted && styles.barValueMuted]}>{value}</Text>
      </View>
      <Bar fraction={fraction} />
    </>
  );
  if (!onPress) {
    return <View style={styles.barCell}>{body}</View>;
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}: ${value}`}
      style={(state) => [
        styles.barCell,
        webInteractive,
        (state as PressState).hovered && styles.barCellHovered,
        selected && styles.barCellSelected,
      ]}
    >
      {body}
    </Pressable>
  );
}

export function BarGrid({ children }: { children: React.ReactNode }): React.JSX.Element {
  const styles = useStyles();
  return <View style={styles.barGrid}>{children}</View>;
}

/** ‹ • • • › under a paged card. */
export function Pager({ index, count, onChange }: { index: number; count: number; onChange: (i: number) => void }): React.JSX.Element | null {
  const { c } = useTheme();
  const styles = useStyles();
  if (count <= 1) {
    return null;
  }
  const go = (i: number) => onChange((i + count) % count);
  return (
    <View style={styles.pager}>
      <Pressable onPress={() => go(index - 1)} accessibilityRole="button" accessibilityLabel="Previous group" hitSlop={10} style={[styles.pagerArrow, webInteractive]}>
        <Chevron dir="left" color={c.ink} px={16} />
      </Pressable>
      {Array.from({ length: count }, (_, i) => (
        <Pressable
          key={i}
          onPress={() => go(i)}
          accessibilityRole="button"
          accessibilityLabel={`Group ${i + 1} of ${count}`}
          accessibilityState={{ selected: i === index }}
          hitSlop={6}
          style={webInteractive}
        >
          <View style={[styles.dot, i === index && styles.dotActive]} />
        </Pressable>
      ))}
      <Pressable onPress={() => go(index + 1)} accessibilityRole="button" accessibilityLabel="Next group" hitSlop={10} style={[styles.pagerArrow, webInteractive]}>
        <Chevron dir="right" color={c.ink} px={16} />
      </Pressable>
    </View>
  );
}

// --- Class mix: ring, stacked bar, counts ------------------------------------

function classColors(c: Palette): Record<Classification, string> {
  return { blocker: c.blocker, bad: c.bad, neutral: c.neutralMark, good: c.goodStrong };
}

const CLASS_ORDER: Classification[] = ['blocker', 'bad', 'neutral', 'good'];

/** Donut of blocker / bad / neutral / good, with the red-flag share in the middle. */
export function RiskRing({ counts, px = 112 }: { counts: ClassCounts; px?: number }): React.JSX.Element {
  const { c } = useTheme();
  const styles = useStyles();
  const stroke = 14;
  const r = (px - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const colors = classColors(c);
  const red = counts.blocker + counts.bad;
  const pct = counts.total > 0 ? Math.round((red / counts.total) * 100) : 0;
  let offset = 0;
  return (
    <View style={{ width: px, height: px }} accessibilityRole="image" accessibilityLabel={`${pct} percent of rated clauses are red flags`}>
      <Svg width={px} height={px}>
        <Circle cx={px / 2} cy={px / 2} r={r} fill="none" stroke={c.badTrack} strokeWidth={stroke} />
        {counts.total > 0 &&
          CLASS_ORDER.map((k) => {
            const len = (counts[k] / counts.total) * circ;
            const el =
              len > 0 ? (
                <Circle
                  key={k}
                  cx={px / 2}
                  cy={px / 2}
                  r={r}
                  fill="none"
                  stroke={colors[k]}
                  strokeWidth={stroke}
                  strokeDasharray={`${len} ${circ - len}`}
                  strokeDashoffset={-offset}
                  rotation={-90}
                  origin={`${px / 2}, ${px / 2}`}
                />
              ) : null;
            offset += len;
            return el;
          })}
      </Svg>
      <View style={[styles.ringCenter, { width: px, height: px }]}>
        <Text style={styles.ringValue}>{`${pct}%`}</Text>
        <Text style={styles.ringCaption}>red flags</Text>
      </View>
    </View>
  );
}

export function StackedBar({ counts }: { counts: ClassCounts }): React.JSX.Element {
  const { c } = useTheme();
  const styles = useStyles();
  const colors = classColors(c);
  return (
    <View style={styles.stacked}>
      {counts.total === 0 ? (
        <View style={[styles.stackedPart, { flex: 1, backgroundColor: c.badTrack }]} />
      ) : (
        CLASS_ORDER.filter((k) => counts[k] > 0).map((k) => (
          <View key={k} style={[styles.stackedPart, { flex: counts[k], backgroundColor: colors[k] }]} />
        ))
      )}
    </View>
  );
}

export function ClassCountsRow({ counts }: { counts: ClassCounts }): React.JSX.Element {
  const { c } = useTheme();
  const styles = useStyles();
  const cells: [string, number, string][] = [
    ['blockers', counts.blocker, c.pointBlocker],
    ['bad', counts.bad, c.badText],
    ['neutral', counts.neutral, c.inkMuted],
    ['good', counts.good, c.goodText],
  ];
  return (
    <View style={styles.countsRow}>
      {cells.map(([label, n, color]) => (
        <View key={label} style={styles.countCell}>
          <Text style={[styles.countValue, { color }]}>{n}</Text>
          <Text style={styles.countLabel}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

// --- Hero ------------------------------------------------------------------

const GRADE_WORDS: Record<string, string> = {
  E: 'Very serious concerns',
  D: 'Important issues',
  C: 'Some issues to weigh',
  B: 'Fairly good',
  A: 'Treats you fairly',
};

/**
 * The top of an app's page. D and E get the solid red alarm; A and B are
 * blue; C and ungraded stay on a plain card. The headline is the worst red
 * flag's own case title, so the alarm always says something the terms say.
 */
export function RiskHero({ grade, findings, estimated = false }: { grade: string; findings: Finding[]; estimated?: boolean }): React.JSX.Element {
  const styles = useStyles();
  const upper = grade.toUpperCase();
  const tone = upper === 'D' || upper === 'E' ? 'alarm' : upper === 'A' || upper === 'B' ? 'good' : 'plain';
  const red = sortWorstFirst(findings.filter(isRedFlag));
  const worst = red[0];
  const kicker = `${estimated ? 'Estimated grade' : 'ToS;DR grade'} · ${GRADE_WORDS[upper] ?? 'Not graded yet'}`;
  const headline = worst ? worst.caseTitle : findings.length > 0 ? 'No red flags in the rated clauses' : 'No rated clauses yet';
  const sub = red.length > 1 ? `+ ${red.length - 1} more red flag${red.length - 1 === 1 ? '' : 's'}` : undefined;
  return (
    <View style={[styles.hero, tone === 'alarm' && styles.heroAlarm, tone === 'good' && styles.heroGood]}>
      <View style={[styles.heroGrade, tone === 'plain' && styles.heroGradePlain]}>
        {tone === 'plain' ? (
          <GradeBadge grade={grade} large />
        ) : (
          <Text style={[styles.heroGradeText, tone === 'good' && styles.heroGradeTextGood]}>{upper}</Text>
        )}
      </View>
      <View style={styles.heroText}>
        <Text style={[styles.heroKicker, tone !== 'plain' && styles.heroKickerOn]}>{kicker}</Text>
        <Text style={[styles.heroHeadline, tone !== 'plain' && styles.heroHeadlineOn]}>{headline}</Text>
        {sub !== undefined && <Text style={[styles.heroSub, tone !== 'plain' && styles.heroKickerOn]}>{sub}</Text>}
      </View>
    </View>
  );
}

// --- Findings ----------------------------------------------------------------

const hostOf = (url: string) => url.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[/?#].*$/, '');

function FindingRow({ finding }: { finding: Finding }): React.JSX.Element {
  const { c } = useTheme();
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const dot = classColors(c)[finding.classification];
  const kicker = finding.caseTitle.trim() !== finding.title.trim() ? finding.caseTitle : undefined;
  const hasMore = finding.body !== undefined && finding.body !== '';
  return (
    <Pressable
      onPress={() => setOpen((o) => !o)}
      disabled={!hasMore}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      style={(state) => [styles.finding, hasMore && webInteractive, (state as PressState).hovered && styles.findingHovered]}
    >
      <View style={[styles.findingDot, { backgroundColor: dot }]} />
      <View style={styles.findingText}>
        <Text style={styles.findingTitle}>{finding.title}</Text>
        {kicker !== undefined && <Text style={styles.findingKicker}>{kicker}</Text>}
        {hasMore && (
          <Text style={finding.verbatim ? styles.findingQuote : styles.findingBody} numberOfLines={open ? undefined : 2}>
            {finding.verbatim ? <Text style={styles.mark}>{`“${finding.body}”`}</Text> : finding.body}
          </Text>
        )}
        {open && finding.source !== undefined && (
          <Pressable onPress={() => void Linking.openURL(finding.source as string)} accessibilityRole="link" hitSlop={6} style={[styles.findingSource, webInteractive]}>
            <Text style={styles.findingSourceText}>{`${finding.verbatim ? hostOf(finding.source) : 'Source'} ↗`}</Text>
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

const SECTION_LABELS: Record<Classification, string> = {
  blocker: 'Blockers',
  bad: 'Red flags',
  neutral: 'Neutral',
  good: 'What they get right',
};

const SHOW_FIRST = 5;

function FindingSection({ kind, findings, defaultOpen }: { kind: Classification; findings: Finding[]; defaultOpen: boolean }): React.JSX.Element {
  const { c } = useTheme();
  const styles = useStyles();
  const press = useRowPress();
  const [open, setOpen] = useState(defaultOpen);
  const [all, setAll] = useState(false);
  const pill = {
    blocker: [c.blocker, c.onBlocker],
    bad: [c.alarm, c.onAlarm],
    neutral: [c.inkMuted, c.surface],
    good: [c.goodStrong, c.onGood],
  }[kind];
  const shown = all ? findings : findings.slice(0, SHOW_FIRST);
  return (
    <Card flush>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        android_ripple={press.android_ripple}
        style={(state) => [styles.sectionHead, press.stateStyle(state)]}
      >
        <PlusMinus open={open} color={pill[0]} />
        <Text style={styles.sectionTitle}>{SECTION_LABELS[kind]}</Text>
        <View style={[styles.pill, { backgroundColor: pill[0] }]}>
          <Text style={[styles.pillText, { color: pill[1] }]}>{findings.length}</Text>
        </View>
        <View style={styles.grow} />
        <Chevron dir={open ? 'up' : 'down'} color={c.ink} />
      </Pressable>
      {open && (
        <>
          {shown.map((f) => (
            <FindingRow key={f.key} finding={f} />
          ))}
          {findings.length > SHOW_FIRST && (
            <Pressable onPress={() => setAll((a) => !a)} accessibilityRole="button" style={(state) => [styles.showAll, press.stateStyle(state)]}>
              <Text style={styles.showAllText}>{all ? 'Show fewer' : `Show all ${findings.length}`}</Text>
            </Pressable>
          )}
        </>
      )}
    </Card>
  );
}

// --- Breakdown: one app's whole page body --------------------------------------

const OTHER: ExposureItem = { id: 'other', label: 'Other', keywords: [] };
const PER_PAGE = 8;

/**
 * Summary card, red flags by topic (tap a topic to filter), then the
 * findings in sections: blockers open, red flags open when there are no
 * blockers, neutral and the good points closed at the bottom.
 */
export function Breakdown({ findings, afterTopics }: { findings: Finding[]; afterTopics?: React.ReactNode }): React.JSX.Element {
  const styles = useStyles();
  const [topic, setTopic] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const counts = useMemo(() => countByClass(findings), [findings]);

  const topics = useMemo(() => {
    const rows = EXPOSURE_ITEMS.map((item) => ({ item, n: redFlagsFor(findings, item).length })).filter((r) => r.n > 0);
    rows.sort((a, b) => b.n - a.n);
    const other = findings.filter((f) => isRedFlag(f) && !EXPOSURE_ITEMS.some((i) => findingMatches(f, i))).length;
    if (other > 0) {
      rows.push({ item: OTHER, n: other });
    }
    return rows;
  }, [findings]);
  const maxTopic = Math.max(1, ...topics.map((t) => t.n));
  const pages = Math.ceil(topics.length / PER_PAGE);

  const filtered = useMemo(() => {
    if (topic === null) {
      return findings;
    }
    if (topic === OTHER.id) {
      return findings.filter((f) => !EXPOSURE_ITEMS.some((i) => findingMatches(f, i)));
    }
    const item = EXPOSURE_ITEMS.find((i) => i.id === topic);
    return item ? findings.filter((f) => findingMatches(f, item)) : findings;
  }, [findings, topic]);

  const byClass = (k: Classification) => sortWorstFirst(filtered.filter((f) => f.classification === k));
  const blockers = byClass('blocker');
  const topicLabel = topics.find((t) => t.item.id === topic)?.item.label;

  return (
    <View style={styles.stack}>
      <Card>
        <CardTitle right={<Text style={styles.cardMeta}>{`${counts.total} rated clause${counts.total === 1 ? '' : 's'}`}</Text>}>Summary</CardTitle>
        <StackedBar counts={counts} />
        <ClassCountsRow counts={counts} />
      </Card>

      {topics.length > 0 && (
        <Card>
          <CardTitle>Red flags by topic</CardTitle>
          <BarGrid>
            {topics.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE).map(({ item, n }) => (
              <BarCell
                key={item.id}
                label={item.label}
                value={String(n)}
                fraction={n / maxTopic}
                selected={topic === item.id}
                onPress={() => setTopic((t) => (t === item.id ? null : item.id))}
              />
            ))}
          </BarGrid>
          <Pager index={page} count={pages} onChange={setPage} />
          <Text style={styles.cardHint}>Tap a topic to see only those clauses.</Text>
        </Card>
      )}

      {afterTopics}

      {topicLabel !== undefined && (
        <View style={styles.filterRow}>
          <Text style={styles.filterText} numberOfLines={1}>{`Showing: ${topicLabel}`}</Text>
          <Pressable onPress={() => setTopic(null)} accessibilityRole="button" hitSlop={8} style={webInteractive}>
            <Text style={styles.filterClear}>Show all</Text>
          </Pressable>
        </View>
      )}

      {(['blocker', 'bad', 'neutral', 'good'] as Classification[]).map((k) => {
        const list = k === 'blocker' ? blockers : byClass(k);
        if (list.length === 0) {
          return null;
        }
        const defaultOpen = k === 'blocker' || (k === 'bad' && blockers.length === 0);
        // Remount when the filter changes so open/closed starts fresh.
        return <FindingSection key={`${k}-${topic ?? 'all'}`} kind={k} findings={list} defaultOpen={defaultOpen} />;
      })}
    </View>
  );
}

// --- Dashboard row -------------------------------------------------------------

/** An app in a dashboard group: red-flag count and bar, or a status line. */
export function AppRiskRow({
  name,
  logoUri,
  grade,
  pending = false,
  redFlags,
  maxRedFlags,
  summary,
  onPress,
}: {
  name: string;
  logoUri?: string;
  grade: string;
  pending?: boolean;
  /** Undefined while loading, or when there is nothing graded to count. */
  redFlags?: number;
  maxRedFlags: number;
  summary?: string;
  onPress: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  const press = useRowPress();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      android_ripple={press.android_ripple}
      style={(state) => [styles.appRow, press.stateStyle(state)]}
    >
      <ServiceLogo name={name} uri={logoUri} size="sm" />
      <View style={styles.appBody}>
        <View style={styles.appHead}>
          <Text style={styles.appName} numberOfLines={1}>
            {name}
          </Text>
          {redFlags !== undefined && (
            <Text style={[styles.appFlags, redFlags === 0 && styles.appFlagsNone]}>
              {`${redFlags} red flag${redFlags === 1 ? '' : 's'}`}
            </Text>
          )}
        </View>
        {redFlags !== undefined ? (
          <Bar fraction={redFlags / Math.max(1, maxRedFlags)} thin />
        ) : (
          summary !== undefined && (
            <Text style={styles.appSummary} numberOfLines={1}>
              {summary}
            </Text>
          )
        )}
      </View>
      {pending ? <PendingBadge /> : <GradeBadge grade={grade} />}
    </Pressable>
  );
}

/** A dashboard group of apps that opens and closes ("Rated D or E · 6"). */
export function AppGroup({ title, count, defaultOpen, children }: { title: string; count: number; defaultOpen: boolean; children: React.ReactNode }): React.JSX.Element {
  const { c } = useTheme();
  const styles = useStyles();
  const press = useRowPress();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card flush>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        android_ripple={press.android_ripple}
        style={(state) => [styles.groupHead, press.stateStyle(state)]}
      >
        <Text style={styles.cardTitle}>{`${title} · ${count}`}</Text>
        <Chevron dir={open ? 'up' : 'down'} color={c.ink} />
      </Pressable>
      {open && <View style={styles.groupBody}>{children}</View>}
    </Card>
  );
}

const useStyles = makeStyles(({ c }) => ({
  stack: {
    gap: space[3] + 2,
  },
  grow: {
    flex: 1,
  },
  card: {
    backgroundColor: c.surface,
    borderRadius: radius.xl,
    elevation: 1,
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: 14,
    shadowColor: c.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
  },
  cardFlush: {
    gap: 0,
    overflow: 'hidden',
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  cardTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space[2],
    justifyContent: 'space-between',
  },
  cardTitle: {
    ...type.label,
    color: c.ink,
    fontFamily: type.bodySmBold.fontFamily,
    letterSpacing: 1,
  },
  cardMeta: {
    ...type.footnote,
    color: c.inkMuted,
  },
  cardHint: {
    ...type.footnote,
    color: c.inkMuted,
  },

  barGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -space[2],
    rowGap: space[1],
  },
  barCell: {
    borderRadius: radius.sm,
    gap: 5,
    justifyContent: 'space-between',
    paddingHorizontal: space[2],
    paddingVertical: space[1],
    width: '50%',
  },
  barCellHovered: {
    backgroundColor: c.hoverRow,
  },
  barCellSelected: {
    backgroundColor: c.tintSoft,
  },
  barHead: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: space[1] + 2,
    justifyContent: 'space-between',
  },
  barLabel: {
    ...type.footnote,
    color: c.ink,
    flex: 1,
    fontFamily: type.bodyMedium.fontFamily,
  },
  barLabelSelected: {
    color: c.onTintSoft,
  },
  barValue: {
    ...type.footnote,
    color: c.badText,
    fontFamily: type.bodySmBold.fontFamily,
  },
  barValueMuted: {
    color: c.inkMuted,
  },
  barTrack: {
    backgroundColor: c.badTrack,
    borderRadius: 5,
    height: 10,
    overflow: 'hidden',
  },
  barThin: {
    borderRadius: 3,
    height: 6,
  },
  barFill: {
    borderRadius: 5,
    height: 10,
  },

  pager: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    justifyContent: 'center',
  },
  pagerArrow: {
    padding: space[1],
  },
  dot: {
    backgroundColor: c.line,
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  dotActive: {
    backgroundColor: c.ink,
  },

  ringCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    top: 0,
  },
  ringValue: {
    color: c.badText,
    fontFamily: type.display.fontFamily,
    fontSize: 26,
    lineHeight: 30,
  },
  ringCaption: {
    ...type.meta,
    color: c.inkMuted,
    fontSize: 11,
    lineHeight: 14,
  },

  stacked: {
    borderRadius: 7,
    flexDirection: 'row',
    gap: 2,
    height: 14,
    overflow: 'hidden',
  },
  stackedPart: {
    height: 14,
  },
  countsRow: {
    flexDirection: 'row',
  },
  countCell: {
    flex: 1,
  },
  countValue: {
    fontFamily: type.display.fontFamily,
    fontSize: 22,
    lineHeight: 26,
  },
  countLabel: {
    ...type.meta,
    color: c.inkMuted,
  },

  hero: {
    alignItems: 'center',
    backgroundColor: c.surface,
    borderRadius: radius.xl,
    flexDirection: 'row',
    gap: space[4],
    padding: space[4],
  },
  heroAlarm: {
    backgroundColor: c.alarm,
  },
  heroGood: {
    backgroundColor: c.goodStrong,
  },
  heroGrade: {
    alignItems: 'center',
    backgroundColor: c.onAlarm,
    borderRadius: radius.xl - 2,
    height: 72,
    justifyContent: 'center',
    width: 72,
  },
  heroGradePlain: {
    backgroundColor: 'transparent',
    width: size.badgeLg,
  },
  heroGradeText: {
    color: c.alarm,
    fontFamily: type.display.fontFamily,
    fontSize: 44,
    lineHeight: 50,
  },
  heroGradeTextGood: {
    color: c.goodText,
  },
  heroText: {
    flex: 1,
    gap: space[1],
  },
  heroKicker: {
    ...type.label,
    color: c.inkMuted,
    fontFamily: type.bodySmBold.fontFamily,
    fontSize: 11,
    letterSpacing: 1.1,
    lineHeight: 15,
  },
  heroKickerOn: {
    color: c.onAlarmMuted,
  },
  heroHeadline: {
    ...type.headline,
    color: c.ink,
    fontFamily: type.display.fontFamily,
    fontSize: 18,
    lineHeight: 23,
  },
  heroHeadlineOn: {
    color: c.onAlarm,
  },
  heroSub: {
    ...type.footnote,
    color: c.inkMuted,
    fontFamily: type.bodySmBold.fontFamily,
  },

  sectionHead: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space[3],
    minHeight: 56,
    paddingHorizontal: space[4],
  },
  sectionTitle: {
    ...type.headline,
    color: c.ink,
  },
  pill: {
    borderRadius: 10,
    paddingHorizontal: space[2],
    paddingVertical: 1,
  },
  pillText: {
    ...type.tag,
    fontSize: 13,
  },
  finding: {
    borderTopColor: c.line,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3] - 2,
  },
  findingHovered: {
    backgroundColor: c.hoverRow,
  },
  findingDot: {
    borderRadius: 4,
    height: 8,
    marginTop: 6,
    width: 8,
  },
  findingText: {
    flex: 1,
    gap: 3,
  },
  findingTitle: {
    ...type.bodySmBold,
    color: c.ink,
  },
  findingKicker: {
    ...type.meta,
    color: c.inkMuted,
  },
  findingBody: {
    ...type.footnote,
    color: c.inkMuted,
  },
  findingQuote: {
    ...type.footnote,
    color: c.ink,
    lineHeight: 20,
  },
  mark: {
    backgroundColor: c.marker,
  },
  findingSource: {
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  findingSourceText: {
    ...type.footnote,
    color: c.link,
  },
  showAll: {
    borderTopColor: c.line,
    borderTopWidth: 1,
    minHeight: size.tapMin,
    justifyContent: 'center',
    paddingHorizontal: space[4],
  },
  showAllText: {
    ...type.bodySmBold,
    color: c.link,
  },
  filterRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space[3],
    justifyContent: 'space-between',
    paddingHorizontal: space[1],
  },
  filterText: {
    ...type.bodySmBold,
    color: c.ink,
    flex: 1,
  },
  filterClear: {
    ...type.bodySm,
    color: c.link,
  },

  groupHead: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: space[4],
  },
  groupBody: {
    paddingBottom: space[2],
  },
  appRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space[3],
    minHeight: 56,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
  },
  appBody: {
    flex: 1,
    gap: space[1],
    minWidth: 0,
  },
  appHead: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: space[2],
    justifyContent: 'space-between',
  },
  appName: {
    ...type.bodySmBold,
    color: c.ink,
    flexShrink: 1,
  },
  appFlags: {
    ...type.footnote,
    color: c.badText,
    fontFamily: type.bodySmBold.fontFamily,
  },
  appFlagsNone: {
    color: c.goodText,
  },
  appSummary: {
    ...type.footnote,
    color: c.inkMuted,
  },
}));
