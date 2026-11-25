import React, { useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { fetchBreaches, formatCount, HIBP_SITE, type Breach, type BreachReport } from '../api/breaches';
import { makeStyles, size, space, type, useTheme } from '../theme';
import { Card, CardTitle, Chevron } from './risk';
import { ServiceLogo } from './ServiceLogo';
import { webInteractive, useRowPress, type PressState } from './ui';

// Breach records from Have I Been Pwned: a card on an app's page and a
// "Breached" summary on the dashboard. Breaches are real events, so they get
// the danger colour; "none found" stays neutral, since HIBP only knows about
// breaches that became public.

export type BreachState = { status: 'loading' } | { status: 'error' } | { status: 'ok'; report: BreachReport };

/** Breaches for an app's URLs. Pass an empty list to skip. */
export function useBreaches(urls: string[]): BreachState {
  const key = urls.join('|');
  const [state, setState] = useState<BreachState>({ status: 'loading' });
  useEffect(() => {
    if (key === '') {
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    fetchBreaches(key.split('|')).then(
      (report) => !cancelled && setState({ status: 'ok', report }),
      () => !cancelled && setState({ status: 'error' }),
    );
    return () => {
      cancelled = true;
    };
  }, [key]);
  return state;
}

const monthYear = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' });

// Data types that let someone get into your accounts or find you.
const SEVERE = /password|security question|credit card|bank|payment|social security|passport|government|physical address|phone|date of birth|private message|health/i;

function BreachRow({ breach }: { breach: Breach }): React.JSX.Element {
  const { c } = useTheme();
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const severe = breach.dataClasses.filter((d) => SEVERE.test(d));
  const rest = breach.dataClasses.filter((d) => !SEVERE.test(d));
  return (
    <Pressable
      onPress={() => setOpen((o) => !o)}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      style={(state) => [styles.row, webInteractive, (state as PressState).hovered && styles.rowHovered]}
    >
      <View style={[styles.dot, { backgroundColor: c.bad }]} />
      <View style={styles.rowText}>
        <View style={styles.rowHead}>
          <Text style={styles.rowTitle}>{breach.title}</Text>
          <Text style={styles.rowCount}>{formatCount(breach.accounts)}</Text>
        </View>
        <Text style={styles.rowMeta}>
          {`${monthYear(breach.breachDate)} · ${formatCount(breach.accounts)} accounts${breach.verified ? '' : ' · Unverified'}${breach.match === 'brand' ? ` · ${breach.domain}` : ''}`}
        </Text>
        <Text style={styles.rowData} numberOfLines={open ? undefined : 2}>
          {severe.length > 0 && <Text style={styles.severe}>{severe.join(' · ')}</Text>}
          {severe.length > 0 && rest.length > 0 ? ' · ' : ''}
          {rest.join(' · ')}
        </Text>
        {open && (
          <>
            <Text style={styles.description}>{breach.description}</Text>
            <Pressable onPress={() => void Linking.openURL(breach.url)} accessibilityRole="link" hitSlop={6} style={[styles.source, webInteractive]}>
              <Text style={styles.sourceText}>Details on Have I Been Pwned ↗</Text>
            </Pressable>
          </>
        )}
      </View>
    </Pressable>
  );
}

const SHOW_FIRST = 3;

/** "Data breaches" card for one app. */
export function BreachCard({ urls }: { urls: string[] }): React.JSX.Element | null {
  const styles = useStyles();
  const press = useRowPress();
  const state = useBreaches(urls);
  const [all, setAll] = useState(false);
  if (urls.length === 0) {
    return null;
  }

  const credit = (
    <Pressable onPress={() => void Linking.openURL(HIBP_SITE)} accessibilityRole="link" hitSlop={6} style={webInteractive}>
      <Text style={styles.meta}>Have I Been Pwned ↗</Text>
    </Pressable>
  );

  if (state.status !== 'ok' || state.report.breaches.length === 0) {
    return (
      <Card>
        <CardTitle right={credit}>Data breaches</CardTitle>
        {state.status === 'loading' && <Text style={styles.meta}>Checking breach records…</Text>}
        {state.status === 'error' && <Text style={styles.meta}>Couldn't reach Have I Been Pwned. Try again later.</Text>}
        {state.status === 'ok' && (
          <>
            <Text style={styles.noneTitle}>No known breaches</Text>
            <Text style={styles.meta}>
              {`Not in Have I Been Pwned's list for ${state.report.domains.join(', ')}. That list only has breaches whose data leaked publicly, so it misses many.`}
            </Text>
          </>
        )}
      </Card>
    );
  }

  const { breaches, accounts } = state.report;
  const shown = all ? breaches : breaches.slice(0, SHOW_FIRST);
  return (
    <Card flush>
      <View style={styles.head}>
        <CardTitle right={credit}>Data breaches</CardTitle>
        <View style={styles.summary}>
          <Text style={styles.big}>{breaches.length}</Text>
          <View style={styles.summaryText}>
            <Text style={styles.summaryLine}>
              {`breach${breaches.length === 1 ? '' : 'es'} · `}
              <Text style={styles.summaryBad}>{`${formatCount(accounts)} accounts`}</Text>
              {' exposed'}
            </Text>
            <Text style={styles.meta}>{`Most recent ${monthYear([...breaches].sort((a, b) => b.breachDate.localeCompare(a.breachDate))[0].breachDate)}`}</Text>
          </View>
        </View>
      </View>
      {breaches.some((b) => b.match === 'brand') && (
        <Text style={[styles.meta, styles.brandNote]}>
          {breaches.every((b) => b.match === 'brand')
            ? `None listed for ${state.report.domains.join(', ')} itself. These are other sites under the same name, which may be run by a separate company such as a local franchise.`
            : 'Some of these are other sites under the same name, which may be run by a separate company such as a local franchise.'}
        </Text>
      )}
      {shown.map((b) => (
        <BreachRow key={b.id} breach={b} />
      ))}
      {breaches.length > SHOW_FIRST && (
        <Pressable onPress={() => setAll((a) => !a)} accessibilityRole="button" style={(s) => [styles.showAll, press.stateStyle(s)]}>
          <Text style={styles.showAllText}>{all ? 'Show fewer' : `Show all ${breaches.length}`}</Text>
        </Pressable>
      )}
    </Card>
  );
}

export interface BreachedApp {
  key: string;
  name: string;
  logoUri?: string;
  report: BreachReport;
  onPress: () => void;
}

/** Dashboard summary: which of your apps have had breaches. */
export function BreachedAppsCard({ apps, checked }: { apps: BreachedApp[]; checked: number }): React.JSX.Element | null {
  const { c } = useTheme();
  const styles = useStyles();
  const press = useRowPress();
  if (checked === 0) {
    return null;
  }
  const breached = apps.filter((a) => a.report.breaches.length > 0).sort((a, b) => b.report.accounts - a.report.accounts);
  const total = breached.reduce((n, a) => n + a.report.accounts, 0);
  return (
    <Card flush>
      <View style={styles.head}>
        <CardTitle right={<Text style={styles.meta}>{`${breached.length} of ${checked} apps`}</Text>}>Breached</CardTitle>
        {breached.length > 0 ? (
          <Text style={styles.summaryLine}>
            <Text style={styles.summaryBad}>{`${formatCount(total)} accounts`}</Text>
            {` leaked in ${breached.reduce((n, a) => n + a.report.breaches.length, 0)} known breaches`}
          </Text>
        ) : (
          <Text style={styles.meta}>None of your apps are in Have I Been Pwned's list, which misses many breaches.</Text>
        )}
      </View>
      {breached.map((a) => {
        const latest = [...a.report.breaches].sort((x, y) => y.breachDate.localeCompare(x.breachDate))[0];
        return (
          <Pressable
            key={a.key}
            onPress={a.onPress}
            accessibilityRole="button"
            accessibilityLabel={`${a.name}, ${a.report.breaches.length} breaches`}
            android_ripple={press.android_ripple}
            style={(s) => [styles.appRow, press.stateStyle(s)]}
          >
            <ServiceLogo name={a.name} uri={a.logoUri} size="sm" />
            <View style={styles.rowText}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {a.name}
              </Text>
              <Text style={styles.rowMeta} numberOfLines={1}>
                {`${a.report.breaches.length} breach${a.report.breaches.length === 1 ? '' : 'es'} · latest ${monthYear(latest.breachDate)}`}
              </Text>
            </View>
            <Text style={styles.rowCount}>{formatCount(a.report.accounts)}</Text>
            <Chevron dir="right" color={c.inkFaint} px={16} />
          </Pressable>
        );
      })}
      <Text style={[styles.meta, styles.footCredit]}>Breach data: Have I Been Pwned (CC BY 4.0)</Text>
    </Card>
  );
}

const useStyles = makeStyles(({ c }) => ({
  brandNote: {
    paddingBottom: space[3],
    paddingHorizontal: space[4],
  },
  appRow: {
    alignItems: 'center',
    backgroundColor: c.surface,
    borderTopColor: c.line,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: space[3],
    minHeight: size.tapMin + 8,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
  },
  big: {
    ...type.display,
    color: c.badText,
  },
  description: {
    ...type.footnote,
    color: c.ink,
    marginTop: 2,
  },
  dot: {
    borderRadius: 4,
    height: 8,
    marginTop: 6,
    width: 8,
  },
  footCredit: {
    borderTopColor: c.line,
    borderTopWidth: 1,
    paddingHorizontal: space[4],
    paddingVertical: space[2] + 2,
  },
  head: {
    gap: space[3],
    paddingBottom: space[3],
    paddingHorizontal: space[4],
    paddingTop: 14,
  },
  meta: {
    ...type.footnote,
    color: c.inkMuted,
  },
  noneTitle: {
    ...type.bodySmBold,
    color: c.ink,
  },
  row: {
    borderTopColor: c.line,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3] - 2,
  },
  rowCount: {
    ...type.bodySmBold,
    color: c.badText,
  },
  rowData: {
    ...type.footnote,
    color: c.inkMuted,
  },
  rowHead: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: space[2],
    justifyContent: 'space-between',
  },
  rowHovered: {
    backgroundColor: c.hoverRow,
  },
  rowMeta: {
    ...type.meta,
    color: c.inkMuted,
  },
  rowText: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  rowTitle: {
    ...type.bodySmBold,
    color: c.ink,
    flexShrink: 1,
  },
  severe: {
    color: c.badText,
    fontFamily: type.bodySmBold.fontFamily,
  },
  showAll: {
    borderTopColor: c.line,
    borderTopWidth: 1,
    justifyContent: 'center',
    minHeight: size.tapMin,
    paddingHorizontal: space[4],
  },
  showAllText: {
    ...type.bodySmBold,
    color: c.link,
  },
  source: {
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  sourceText: {
    ...type.footnote,
    color: c.link,
  },
  summary: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space[3],
  },
  summaryBad: {
    color: c.badText,
    fontFamily: type.bodySmBold.fontFamily,
  },
  summaryLine: {
    ...type.bodySm,
    color: c.ink,
  },
  summaryText: {
    flex: 1,
    gap: 2,
  },
}));
