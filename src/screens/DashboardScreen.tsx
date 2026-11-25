import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useStore, followKey } from '../state/store';
import { approvedPoints, type TosdrServiceDetail } from '../api/tosdr';
import { aiSummaryLine, deriveAiLens, gradeRank } from '../utils/grades';
import { countByClass, findingsFromDirect, findingsFromTosdr, isRedFlag, type Finding } from '../utils/findings';
import { EXPOSURE_GROUPS, redFlagsFor } from '../utils/exposure';
import { Button, Switch, ThemeToggle, useGhostPress, useRowPress, webInteractive } from '../components/ui';
import { AppGroup, AppRiskRow, BarCell, BarGrid, Card, CardTitle, Pager, RiskRing } from '../components/risk';
import { logoForFollow } from '../utils/logos';
import { fetchBreaches, type BreachReport } from '../api/breaches';
import { BreachedAppsCard } from '../components/breaches';
import { hairline, makeStyles, radius, size, space, type, useTheme } from '../theme';
import type { FollowedService } from '../services/storage';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function DashboardScreen(): React.JSX.Element {
  const navigation = useNavigation<Nav>();
  const store = useStore();
  const { c } = useTheme();
  const styles = useStyles();
  const ghostPress = useGhostPress();
  const rowPress = useRowPress();
  const [details, setDetails] = useState<Record<number, TosdrServiceDetail>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [exposure, setExposure] = useState<string | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        // On web the header adds no inset; match the content gutter.
        <View style={[styles.headerActions, Platform.OS === 'web' && { marginRight: space[4] }]}>
          <ThemeToggle />
          <Pressable
            onPress={() => navigation.navigate('AddApps')}
            accessibilityRole="button"
            accessibilityLabel="Add apps"
            hitSlop={6}
            style={(state) => [styles.addButton, webInteractive, state.pressed && styles.pressed]}
          >
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={c.onTint} strokeWidth={2.4} strokeLinecap="round">
              <Path d="M12 5v14M5 12h14" />
            </Svg>
          </Pressable>
          <Pressable onPress={() => navigation.navigate('About')} accessibilityRole="link" hitSlop={8} style={ghostPress}>
            <Text style={styles.navAction}>About</Text>
          </Pressable>
        </View>
      ),
    });
  }, [navigation, styles, ghostPress, c]);

  const loadDetails = useCallback(async () => {
    for (const follow of store.follows) {
      if (follow.source === 'tosdr' && follow.serviceId !== null && !details[follow.serviceId]) {
        const detail = await store.getServiceDetail(follow.serviceId);
        if (detail) {
          setDetails((prev) => ({ ...prev, [follow.serviceId as number]: detail }));
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.follows]);

  useEffect(() => {
    void loadDetails();
  }, [loadDetails]);

  // Each app's findings, once loaded: ToS;DR's approved points, or a
  // direct check's verified quotes. Null while loading or when ungraded.
  const findingsFor = useCallback(
    (follow: FollowedService): Finding[] | null => {
      if (follow.source === 'tosdr') {
        const detail = follow.serviceId !== null ? details[follow.serviceId] : undefined;
        return detail ? findingsFromTosdr(approvedPoints(detail)) : null;
      }
      const check = follow.directCheckId ? store.directChecks[follow.directCheckId] : undefined;
      return check?.rating ? findingsFromDirect(check.rating) : null;
    },
    [details, store.directChecks],
  );

  const apps = useMemo(
    () =>
      [...store.follows]
        .map((follow) => {
          const findings = findingsFor(follow);
          return { follow, findings, redFlags: findings ? findings.filter(isRedFlag).length : undefined };
        })
        // Worst grade first, then most red flags.
        .sort((a, b) => gradeRank(a.follow.rating) - gradeRank(b.follow.rating) || (b.redFlags ?? 0) - (a.redFlags ?? 0)),
    [store.follows, findingsFor],
  );

  // Each app's domains: ToS;DR's list once its detail loads, or the checked site.
  const urlsFor = useCallback(
    (follow: FollowedService): string[] | null => {
      if (follow.source === 'tosdr') {
        const detail = follow.serviceId !== null ? details[follow.serviceId] : undefined;
        return detail ? detail.urls : null;
      }
      const check = follow.directCheckId ? store.directChecks[follow.directCheckId] : undefined;
      return check ? [check.siteUrl] : null;
    },
    [details, store.directChecks],
  );

  const [breaches, setBreaches] = useState<Record<string, BreachReport>>({});
  useEffect(() => {
    for (const follow of store.follows) {
      const key = followKey(follow);
      const urls = urlsFor(follow);
      if (urls !== null && urls.length > 0 && breaches[key] === undefined) {
        // Failures just leave the app out of the breach card.
        fetchBreaches(urls).then(
          (report) => setBreaches((prev) => ({ ...prev, [key]: report })),
          () => undefined,
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.follows, urlsFor]);

  const loaded = apps.filter((a) => a.findings !== null);
  const allFindings = useMemo(() => loaded.flatMap((a) => a.findings as Finding[]), [loaded]);
  const totals = countByClass(allFindings);
  const maxRedFlags = Math.max(1, ...apps.map((a) => a.redFlags ?? 0));

  const isPending = (f: FollowedService) =>
    f.directCheckId !== undefined && store.pendingChecks[f.directCheckId] !== undefined && !store.pendingChecks[f.directCheckId].error;
  const letter = (f: FollowedService) => f.rating.toUpperCase();
  const risky = apps.filter((a) => ['D', 'E'].includes(letter(a.follow)));
  const better = apps.filter((a) => ['A', 'B', 'C'].includes(letter(a.follow)));
  const ungraded = apps.filter((a) => !['A', 'B', 'C', 'D', 'E'].includes(letter(a.follow)));
  const graded = risky.length + better.length;

  const level = risky.length === 0 ? 'Low exposure' : risky.length * 2 >= graded ? 'High exposure' : 'Some exposure';

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const { newChanges } = await store.refreshAll();
    setLastRefresh(
      newChanges > 0 ? `${newChanges} new change(s). See Changes.` : 'Checked just now. No new changes.',
    );
    setRefreshing(false);
  }, [store.refreshAll]);

  const statusFor = (follow: FollowedService): string => {
    if (follow.source === 'direct') {
      const pending = follow.directCheckId ? store.pendingChecks[follow.directCheckId] : undefined;
      if (pending) {
        return pending.error ? "Check didn't finish · tap to retry" : 'Grading… usually 1–2 min';
      }
      const check = follow.directCheckId ? store.directChecks[follow.directCheckId] : undefined;
      if (!check) {
        return "Check didn't finish · tap to retry";
      }
      return check.rating ? 'Estimated · not reviewed by ToS;DR' : 'Unrated · direct check';
    }
    const detail = follow.serviceId !== null ? details[follow.serviceId] : undefined;
    if (!detail) {
      return 'Loading…';
    }
    return aiSummaryLine(deriveAiLens(approvedPoints(detail)));
  };

  const open = (follow: FollowedService) => {
    if (follow.source === 'tosdr' && follow.serviceId !== null) {
      navigation.navigate('ServiceDetail', { serviceId: follow.serviceId, name: follow.name });
    } else if (follow.directCheckId) {
      navigation.navigate('DirectCheck', { directCheckId: follow.directCheckId });
    }
  };

  const renderApp = ({ follow, redFlags }: (typeof apps)[number]) => (
    <AppRiskRow
      key={followKey(follow)}
      name={follow.name}
      logoUri={logoForFollow(follow, store.directChecks)}
      grade={follow.rating === 'UNRATED' ? '?' : follow.rating}
      pending={isPending(follow)}
      redFlags={redFlags}
      maxRedFlags={maxRedFlags}
      summary={statusFor(follow)}
      onPress={() => open(follow)}
    />
  );

  if (!store.ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={c.tint} />
      </View>
    );
  }

  const group = EXPOSURE_GROUPS[page];
  const selected = group.items.find((i) => i.id === exposure);
  const selectedApps = selected
    ? loaded.filter((a) => redFlagsFor(a.findings as Finding[], selected).length > 0).map((a) => a.follow.name)
    : [];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.tint} />}
    >
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          Your apps
        </Text>
        <Text style={styles.subtitle}>Pull down to check for changes.</Text>
        {lastRefresh !== null && <Text style={styles.refreshNote}>{lastRefresh}</Text>}
      </View>

      {apps.length === 0 ? (
        <Card style={styles.empty}>
          <Text style={styles.emptyTitle}>No apps yet</Text>
          <Text style={styles.emptyText}>Add the apps you use and see what their terms let them do to you.</Text>
          <Button label="Add your first app" onPress={() => navigation.navigate('AddApps')} />
        </Card>
      ) : (
        <>
          <Card style={styles.heroCard}>
            <RiskRing counts={totals} />
            <View style={styles.heroText}>
              <Text style={styles.heroKicker}>{level}</Text>
              <Text style={styles.heroHeadline}>
                {`${risky.length} of your ${apps.length} app${apps.length === 1 ? '' : 's'} ${apps.length === 1 ? 'is' : 'are'} rated D or E`}
              </Text>
              <Text style={styles.heroCounts}>
                <Text style={styles.heroBad}>{totals.bad + totals.blocker}</Text>
                {' red flags · '}
                <Text style={styles.heroBad}>{totals.blocker}</Text>
                {' blockers · '}
                <Text style={styles.heroGood}>{totals.good}</Text>
                {' good'}
              </Text>
            </View>
          </Card>

          <BreachedAppsCard
            checked={store.follows.filter((f) => breaches[followKey(f)] !== undefined).length}
            apps={store.follows
              .filter((f) => breaches[followKey(f)] !== undefined)
              .map((f) => ({
                key: followKey(f),
                name: f.name,
                logoUri: logoForFollow(f, store.directChecks),
                report: breaches[followKey(f)],
                onPress: () => open(f),
              }))}
          />

          {loaded.length > 0 && (
            <Card>
              <CardTitle right={<Text style={styles.cardMeta}>{`of ${loaded.length} graded`}</Text>}>{group.title}</CardTitle>
              <BarGrid>
                {group.items.map((item) => {
                  const n = loaded.filter((a) => redFlagsFor(a.findings as Finding[], item).length > 0).length;
                  return (
                    <BarCell
                      key={item.id}
                      label={item.label}
                      value={`${n}/${loaded.length}`}
                      fraction={n / loaded.length}
                      muted={n === 0}
                      selected={exposure === item.id}
                      onPress={() => setExposure((e) => (e === item.id ? null : item.id))}
                    />
                  );
                })}
              </BarGrid>
              {selected !== undefined && (
                <Text style={styles.selectedApps}>
                  {selectedApps.length > 0 ? `${selected.label}: ${selectedApps.join(' · ')}` : `${selected.label}: none of your apps`}
                </Text>
              )}
              <Pager
                index={page}
                count={EXPOSURE_GROUPS.length}
                onChange={(i) => {
                  setPage(i);
                  setExposure(null);
                }}
              />
            </Card>
          )}

          {risky.length > 0 && (
            <AppGroup title="Rated D or E" count={risky.length} defaultOpen>
              {risky.map(renderApp)}
            </AppGroup>
          )}
          {ungraded.length > 0 && (
            <AppGroup title="Not graded or checking" count={ungraded.length} defaultOpen={ungraded.some((a) => isPending(a.follow)) || risky.length === 0}>
              {ungraded.map(renderApp)}
            </AppGroup>
          )}
          {better.length > 0 && (
            <AppGroup title="Rated A to C" count={better.length} defaultOpen={risky.length === 0}>
              {better.map(renderApp)}
            </AppGroup>
          )}

          <View style={styles.actions}>
            <Button label="Add apps" onPress={() => navigation.navigate('AddApps')} style={styles.grow} />
            <Button label="Ask a question" variant="secondary" onPress={() => navigation.navigate('Chat', {})} style={styles.grow} />
          </View>
        </>
      )}

      <Card flush>
        <View style={[styles.groupRow, styles.groupRowSeparator]}>
          <Text style={styles.groupLabel}>Change alerts</Text>
          <Switch value={store.settings.alertsEnabled} onValueChange={store.setAlertsEnabled} accessibilityLabel="Change alerts" />
        </View>
        <Pressable
          onPress={() => navigation.navigate('ChangeFeed')}
          accessibilityRole="button"
          android_ripple={rowPress.android_ripple}
          style={(state) => [styles.groupRowPress, rowPress.stateStyle(state)]}
        >
          <View style={styles.groupRow}>
            <Text style={styles.groupLabel}>Changes</Text>
            <View style={styles.groupValue}>
              {store.unreadChanges > 0 && <Text style={styles.groupValueText}>{`${store.unreadChanges} new`}</Text>}
              <Text style={styles.chevron}>›</Text>
            </View>
          </View>
        </Pressable>
      </Card>
    </ScrollView>
  );
}

const useStyles = makeStyles(({ c }) => ({
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space[3] + 2,
  },
  addButton: {
    alignItems: 'center',
    backgroundColor: c.tint,
    borderRadius: radius.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  pressed: {
    opacity: 0.7,
  },
  actions: {
    flexDirection: 'row',
    gap: space[3] - 2,
  },
  center: {
    alignItems: 'center',
    backgroundColor: c.ground,
    flex: 1,
    justifyContent: 'center',
  },
  cardMeta: {
    ...type.footnote,
    color: c.inkMuted,
  },
  chevron: {
    color: c.inkFaint,
    fontSize: 24,
    lineHeight: 26,
  },
  content: {
    gap: space[3] + 2,
    paddingBottom: space[8],
    paddingHorizontal: space[3],
  },
  empty: {
    marginTop: space[4],
    padding: space[6],
  },
  emptyText: {
    ...type.bodySm,
    color: c.inkMuted,
  },
  emptyTitle: {
    ...type.headline,
    color: c.ink,
  },
  groupLabel: {
    ...type.body,
    color: c.ink,
    flex: 1,
  },
  groupRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginLeft: space[4],
    minHeight: size.tapMin,
    paddingRight: space[4],
    paddingVertical: space[1] + 2,
  },
  groupRowPress: {
    backgroundColor: c.surface,
  },
  groupRowSeparator: {
    borderBottomColor: c.line,
    borderBottomWidth: hairline,
  },
  groupValue: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space[2],
  },
  groupValueText: {
    ...type.body,
    color: c.inkMuted,
  },
  grow: {
    flex: 1,
  },
  header: {
    paddingHorizontal: space[1],
  },
  heroBad: {
    color: c.badText,
    fontFamily: type.bodySmBold.fontFamily,
  },
  heroCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space[4],
  },
  heroCounts: {
    ...type.footnote,
    color: c.inkMuted,
  },
  heroGood: {
    color: c.goodText,
    fontFamily: type.bodySmBold.fontFamily,
  },
  heroHeadline: {
    ...type.headline,
    color: c.ink,
    fontFamily: type.display.fontFamily,
    fontSize: 18,
    lineHeight: 23,
  },
  heroKicker: {
    ...type.label,
    color: c.badText,
    fontFamily: type.bodySmBold.fontFamily,
    fontSize: 11,
    letterSpacing: 1.1,
    lineHeight: 15,
  },
  heroText: {
    flex: 1,
    gap: space[2],
    minWidth: 0,
  },
  navAction: {
    ...type.body,
    color: c.link,
  },
  refreshNote: {
    ...type.footnote,
    color: c.inkMuted,
    marginTop: space[1],
  },
  screen: {
    backgroundColor: c.ground,
  },
  selectedApps: {
    ...type.footnote,
    color: c.ink,
  },
  subtitle: {
    ...type.bodySm,
    color: c.inkMuted,
    marginTop: space[1],
  },
  title: {
    ...type.display,
    color: c.ink,
  },
}));
