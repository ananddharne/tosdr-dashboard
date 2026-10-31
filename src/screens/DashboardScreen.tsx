import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useStore, followKey } from '../state/store';
import { approvedPoints, type TosdrServiceDetail } from '../api/tosdr';
import { CONCERNS } from '../utils/concerns';
import { aiSummaryLine, deriveAiLens, gradeRank } from '../utils/grades';
import { Chip, GradeBadge, SectionTitle } from '../components/ui';
import type { FollowedService } from '../services/storage';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function DashboardScreen(): React.JSX.Element {
  const navigation = useNavigation<Nav>();
  const store = useStore();
  const [details, setDetails] = useState<Record<number, TosdrServiceDetail>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);

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
      newChanges > 0 ? `${newChanges} new change(s) — see the change feed.` : 'Checked just now — no new changes.',
    );
    setRefreshing(false);
  }, [store.refreshAll]);

  const aiLineFor = (follow: FollowedService): string => {
    if (follow.source === 'direct') {
      return 'Unrated · direct check';
    }
    const detail = follow.serviceId !== null ? details[follow.serviceId] : undefined;
    if (!detail) {
      return 'Loading AI practices…';
    }
    return aiSummaryLine(deriveAiLens(approvedPoints(detail)));
  };

  const renderRow = ({ item }: { item: FollowedService }) => (
    <TouchableOpacity
      style={styles.row}
      onPress={() => {
        if (item.source === 'tosdr' && item.serviceId !== null) {
          navigation.navigate('ServiceDetail', { serviceId: item.serviceId, name: item.name });
        } else if (item.directCheckId) {
          navigation.navigate('DirectCheck', { directCheckId: item.directCheckId });
        }
      }}
    >
      <GradeBadge grade={item.rating === 'UNRATED' ? '?' : item.rating} />
      <View style={styles.rowText}>
        <Text style={styles.rowName}>{item.name}</Text>
        <Text style={styles.rowSub}>{aiLineFor(item)}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );

  if (!store.ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <FlatList
      data={sorted}
      keyExtractor={(item) => followKey(item)}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.title}>Your Apps</Text>
          <Text style={styles.subtitle}>Worst grade first. Pull down to check for changes.</Text>

          <TouchableOpacity style={styles.addButton} onPress={() => navigation.navigate('AddApps')}>
            <Text style={styles.addButtonText}>+ Add apps</Text>
          </TouchableOpacity>

          {lastRefresh !== null && <Text style={styles.refreshNote}>{lastRefresh}</Text>}

          <SectionTitle>Concerns</SectionTitle>
          <Text style={styles.stripHint}>Tap to filter what the dashboard highlights. No selection = all.</Text>
          <View style={styles.chipRow}>
            {CONCERNS.map((concern) => (
              <Chip
                key={concern.id}
                label={concern.label}
                selected={store.concerns.includes(concern.id)}
                onPress={() => store.toggleConcern(concern.id)}
              />
            ))}
          </View>

          <View style={styles.stripRow}>
            <Text style={styles.stripLabel}>Change alerts</Text>
            <Switch value={store.settings.alertsEnabled} onValueChange={store.setAlertsEnabled} />
          </View>
          <View style={styles.linkRow}>
            <TouchableOpacity onPress={() => navigation.navigate('ChangeFeed')}>
              <Text style={styles.link}>
                Change feed{store.unreadChanges > 0 ? ` (${store.unreadChanges} new)` : ''}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('Chat', {})}>
              <Text style={styles.link}>Ask the chat</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('About')}>
              <Text style={styles.link}>About</Text>
            </TouchableOpacity>
          </View>
        </View>
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No apps yet.</Text>
          <Text style={styles.emptySub}>Add the apps and sites you actually use, and this dashboard becomes your privacy overview.</Text>
          <TouchableOpacity style={styles.addButton} onPress={() => navigation.navigate('AddApps')}>
            <Text style={styles.addButtonText}>+ Add your first app</Text>
          </TouchableOpacity>
        </View>
      }
      renderItem={renderRow}
      contentContainerStyle={styles.listContent}
    />
  );
}

const styles = StyleSheet.create({
  addButton: {
    alignItems: 'center',
    backgroundColor: '#101828',
    borderRadius: 10,
    marginVertical: 12,
    paddingVertical: 14,
  },
  addButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  center: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  chevron: {
    color: '#94a3b8',
    fontSize: 24,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  empty: {
    alignItems: 'center',
    padding: 24,
  },
  emptySub: {
    color: '#64748b',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  header: {
    padding: 16,
  },
  link: {
    color: '#1d4ed8',
    fontSize: 14,
    fontWeight: '600',
  },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  listContent: {
    paddingBottom: 24,
  },
  refreshNote: {
    color: '#475569',
    fontSize: 13,
    marginBottom: 4,
  },
  row: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderBottomColor: '#e2e8f0',
    borderBottomWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowName: {
    fontSize: 16,
    fontWeight: '600',
  },
  rowSub: {
    color: '#64748b',
    fontSize: 13,
    marginTop: 2,
  },
  rowText: {
    flex: 1,
    marginLeft: 12,
  },
  stripHint: {
    color: '#64748b',
    fontSize: 12,
    marginBottom: 8,
  },
  stripLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  stripRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  subtitle: {
    color: '#64748b',
    fontSize: 14,
    marginTop: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
  },
});
