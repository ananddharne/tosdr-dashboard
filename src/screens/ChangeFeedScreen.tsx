import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { useStore } from '../state/store';
import { Button, Note, SectionTitle, useListItemStyle } from '../components/ui';
import { makeStyles, radius, space, type, useTheme } from '../theme';
import type { ChangeEntry } from '../services/storage';

const KIND_LABEL: Record<ChangeEntry['kind'], string> = {
  'grade-changed': 'Grade changed',
  'points-added': 'Points added',
  'points-removed': 'Points removed',
  'terms-updated': 'Terms updated',
};

export default function ChangeFeedScreen(): React.JSX.Element {
  const store = useStore();
  const { c } = useTheme();
  const styles = useStyles();
  const listItemStyle = useListItemStyle();
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
      style={styles.screen}
      data={store.changes}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            Changes
          </Text>
          <Text style={styles.subtitle}>When ToS;DR updates the grade or points of an app you follow, it shows up here.</Text>
          <Button
            label={checking ? 'Checking…' : 'Check for changes now'}
            onPress={() => void checkNow()}
            disabled={checking}
            style={styles.check}
          />
          {checking && <ActivityIndicator style={styles.spinner} color={c.tint} />}
          {resultLine !== null && <Text style={styles.resultLine}>{resultLine}</Text>}
          <Note>Changes show up only inside the app. There are no push notifications yet.</Note>
          {store.changes.length > 0 && <SectionTitle>Latest first</SectionTitle>}
        </View>
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No changes yet</Text>
          <Text style={styles.emptyText}>
            We compare each app you follow with its last check. The first check only records a starting point.
          </Text>
        </View>
      }
      renderItem={({ item, index }) => (
        <View style={[listItemStyle(index, store.changes.length), styles.row]}>
          <Text style={styles.kind}>{KIND_LABEL[item.kind]}</Text>
          <Text style={styles.service}>{item.serviceName}</Text>
          <Text style={styles.summary}>{item.summary}</Text>
          <Text style={styles.date}>
            {new Date(item.detectedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
          </Text>
        </View>
      )}
      contentContainerStyle={styles.listContent}
    />
  );
}

const useStyles = makeStyles(({ c }) => ({
  check: {
    marginBottom: space[2],
    marginTop: space[4],
  },
  date: {
    ...type.meta,
    color: c.inkMuted,
    marginTop: space[1],
  },
  empty: {
    backgroundColor: c.surface,
    borderRadius: radius.md,
    gap: space[2],
    marginHorizontal: space[4],
    marginTop: space[4],
    padding: space[6],
  },
  emptyText: {
    ...type.body,
    color: c.inkMuted,
  },
  emptyTitle: {
    ...type.title,
    color: c.ink,
  },
  header: {
    paddingHorizontal: space[4],
    paddingTop: space[3],
  },
  kind: {
    ...type.label,
    color: c.inkMuted,
  },
  listContent: {
    paddingBottom: space[8],
  },
  resultLine: {
    ...type.bodySmBold,
    color: c.ink,
    marginBottom: space[1],
  },
  row: {
    gap: 2,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  screen: {
    backgroundColor: c.ground,
  },
  service: {
    ...type.headline,
    color: c.ink,
  },
  spinner: {
    marginTop: space[2],
  },
  subtitle: {
    ...type.bodySm,
    color: c.inkMuted,
    marginTop: space[1],
  },
  summary: {
    ...type.bodySm,
    color: c.ink,
  },
  title: {
    ...type.display,
    color: c.ink,
  },
}));
