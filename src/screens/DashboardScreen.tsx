import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, RefreshControl, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useStore, followKey } from '../state/store';
import { approvedPoints, type TosdrServiceDetail } from '../api/tosdr';
import { CONCERNS } from '../utils/concerns';
import { aiSummaryLine, deriveAiLens, gradeRank } from '../utils/grades';
import { Button, Chip, ChipRow, SectionTitle, ServiceRow, Switch, useListItemStyle } from '../components/ui';
import { logoForFollow } from '../utils/logos';
import { hairline, makeStyles, radius, size, space, type, useTheme } from '../theme';
import type { FollowedService } from '../services/storage';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function DashboardScreen(): React.JSX.Element {
  const navigation = useNavigation<Nav>();
  const store = useStore();
  const { c } = useTheme();
  const styles = useStyles();
  const listItemStyle = useListItemStyle();
  const [details, setDetails] = useState<Record<number, TosdrServiceDetail>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => navigation.navigate('About')}
          accessibilityRole="link"
          hitSlop={8}
          // On web the header adds no inset; match the content gutter.
          style={Platform.OS === 'web' ? { marginRight: space[4] } : undefined}
        >
          {({ pressed }) => <Text style={[styles.navAction, pressed && styles.navActionPressed]}>About</Text>}
        </Pressable>
      ),
    });
  }, [navigation, styles]);

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

  const sorted = useMemo(() => {
    return [...store.follows].sort((a, b) => gradeRank(a.rating) - gradeRank(b.rating));
  }, [store.follows]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const { newChanges } = await store.refreshAll();
    setLastRefresh(
      newChanges > 0 ? `${newChanges} new change(s). See Changes.` : 'Checked just now. No new changes.',
    );
    setRefreshing(false);
  }, [store.refreshAll]);

  const summaryFor = (follow: FollowedService): string => {
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

  if (!store.ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={c.tint} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.screen}
      data={sorted}
      keyExtractor={(item) => followKey(item)}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.tint} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            Your apps
          </Text>
          <Text style={styles.subtitle}>Worst grade first. Pull down to check for changes.</Text>
          {lastRefresh !== null && <Text style={styles.refreshNote}>{lastRefresh}</Text>}

          <View style={styles.actions}>
            <Button label="Add apps" onPress={() => navigation.navigate('AddApps')} style={styles.grow} />
            <Button
              label="Ask a question"
              variant="secondary"
              onPress={() => navigation.navigate('Chat', {})}
              style={styles.grow}
            />
          </View>

          <SectionTitle>Concerns</SectionTitle>
          <ChipRow>
            {CONCERNS.map((concern) => (
              <Chip
                key={concern.id}
                label={concern.label}
                selected={store.concerns.includes(concern.id)}
                onPress={() => store.toggleConcern(concern.id)}
              />
            ))}
          </ChipRow>
          <Text style={styles.hint}>Nothing selected shows every concern.</Text>

          <View style={styles.group}>
            <View style={[styles.groupRow, styles.groupRowSeparator]}>
              <Text style={styles.groupLabel}>Change alerts</Text>
              <Switch
                value={store.settings.alertsEnabled}
                onValueChange={store.setAlertsEnabled}
                accessibilityLabel="Change alerts"
              />
            </View>
            <Pressable
              onPress={() => navigation.navigate('ChangeFeed')}
              accessibilityRole="button"
              android_ripple={Platform.OS === 'android' ? { color: c.surfaceSunk } : undefined}
              style={({ pressed }) => [styles.groupRowPress, Platform.OS !== 'android' && pressed && styles.groupRowPressed]}
            >
              <View style={styles.groupRow}>
                <Text style={styles.groupLabel}>Changes</Text>
                <View style={styles.groupValue}>
                  {store.unreadChanges > 0 && <Text style={styles.groupValueText}>{`${store.unreadChanges} new`}</Text>}
                  <Text style={styles.chevron}>›</Text>
                </View>
              </View>
            </Pressable>
          </View>

          {sorted.length > 0 && <SectionTitle>{`${sorted.length} app${sorted.length === 1 ? '' : 's'}`}</SectionTitle>}
        </View>
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No apps yet</Text>
          <Text style={styles.emptyText}>Add the apps you use and see what each one does with your data.</Text>
          <Button label="Add your first app" onPress={() => navigation.navigate('AddApps')} />
        </View>
      }
      renderItem={({ item, index }) => (
        <ServiceRow
          style={listItemStyle(index, sorted.length, true)}
          separator={index < sorted.length - 1}
          name={item.name}
          logoUri={logoForFollow(item, store.directChecks)}
          grade={item.rating === 'UNRATED' ? '?' : item.rating}
          pending={
            item.directCheckId !== undefined &&
            store.pendingChecks[item.directCheckId] !== undefined &&
            !store.pendingChecks[item.directCheckId].error
          }
          summary={summaryFor(item)}
          onPress={() => {
            if (item.source === 'tosdr' && item.serviceId !== null) {
              navigation.navigate('ServiceDetail', { serviceId: item.serviceId, name: item.name });
            } else if (item.directCheckId) {
              navigation.navigate('DirectCheck', { directCheckId: item.directCheckId });
            }
          }}
        />
      )}
      contentContainerStyle={styles.listContent}
    />
  );
}

const useStyles = makeStyles(({ c }) => ({
  actions: {
    flexDirection: 'row',
    gap: space[3] - 2,
    marginTop: space[4],
  },
  center: {
    alignItems: 'center',
    backgroundColor: c.ground,
    flex: 1,
    justifyContent: 'center',
  },
  chevron: {
    color: c.inkFaint,
    fontSize: 24,
    lineHeight: 26,
  },
  empty: {
    backgroundColor: c.surface,
    borderRadius: radius.md,
    gap: space[3],
    marginHorizontal: space[4],
    marginTop: space[7],
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
  group: {
    backgroundColor: c.surface,
    borderRadius: radius.md,
    marginTop: space[7],
    overflow: 'hidden',
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
  groupRowPressed: {
    backgroundColor: c.surfaceSunk,
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
    paddingBottom: space[1],
    paddingHorizontal: space[4],
  },
  hint: {
    ...type.footnote,
    color: c.inkMuted,
    marginLeft: space[4],
    marginTop: space[2],
  },
  listContent: {
    paddingBottom: space[8],
  },
  navAction: {
    ...type.body,
    color: c.link,
  },
  navActionPressed: {
    opacity: 0.6,
  },
  refreshNote: {
    ...type.footnote,
    color: c.inkMuted,
    marginTop: space[2],
  },
  screen: {
    backgroundColor: c.ground,
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
