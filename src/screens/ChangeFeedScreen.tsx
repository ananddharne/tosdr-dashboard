import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useStore } from '../state/store';
import { Note, SectionTitle } from '../components/ui';
import type { ChangeEntry } from '../services/storage';

const KIND_LABEL: Record<ChangeEntry['kind'], string> = {
  'grade-changed': 'Grade changed',
  'points-added': 'Points added',
  'points-removed': 'Points removed',
  'terms-updated': 'Terms updated',
};

export default function ChangeFeedScreen(): React.JSX.Element {
  const store = useStore();
  const [checking, setChecking] = useState(false);
  const [resultLine, setResultLine] = useState<string | null>(null);

  useEffect(() => {
    store.markChangesRead();
    // Only on mount: viewing the feed clears the "new" badge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkNow = async () => {
    setChecking(true);
    const { newChanges, failures } = await store.refreshAll();
    setResultLine(
      failures.length > 0
        ? `${newChanges} new change(s). ${failures.length} service(s) could not be checked.`
        : `${newChanges} new change(s) found.`,
    );
    setChecking(false);
  };

  return (
    <FlatList
      data={store.changes}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View style={styles.header}>
          <TouchableOpacity style={styles.checkButton} onPress={() => void checkNow()} disabled={checking}>
            <Text style={styles.checkButtonText}>{checking ? 'Checking…' : 'Check for changes now'}</Text>
          </TouchableOpacity>
          {checking && <ActivityIndicator style={styles.spinner} />}
          {resultLine !== null && <Text style={styles.resultLine}>{resultLine}</Text>}
          <Note>
            This standalone version shows changes in-app only. It does not send push notifications — that needs a
            backend and APNs/FCM.
          </Note>
          <SectionTitle>Changes</SectionTitle>
        </View>
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No changes detected yet.</Text>
          <Text style={styles.emptySub}>
            Changes appear here when a followed service&apos;s ToS;DR grade or rated points move.
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.row}>
          <Text style={styles.kind}>{KIND_LABEL[item.kind]}</Text>
          <Text style={styles.service}>{item.serviceName}</Text>
          <Text style={styles.summary}>{item.summary}</Text>
          <Text style={styles.date}>{new Date(item.detectedAt).toLocaleString()}</Text>
        </View>
      )}
      contentContainerStyle={styles.listContent}
    />
  );
}

const styles = StyleSheet.create({
  checkButton: {
    alignItems: 'center',
    backgroundColor: '#101828',
    borderRadius: 10,
    paddingVertical: 12,
  },
  checkButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  date: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 2,
  },
  empty: {
    alignItems: 'center',
    padding: 24,
  },
  emptySub: {
    color: '#64748b',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 17,
    fontWeight: '700',
  },
  header: {
    padding: 16,
  },
  kind: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  listContent: {
    paddingBottom: 24,
  },
  resultLine: {
    color: '#475569',
    fontSize: 13,
    marginTop: 8,
  },
  row: {
    backgroundColor: '#ffffff',
    borderBottomColor: '#e2e8f0',
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  service: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 2,
  },
  spinner: {
    marginTop: 12,
  },
  summary: {
    color: '#475569',
    fontSize: 13,
    marginTop: 2,
  },
});
