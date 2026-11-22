import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { searchServices, type TosdrSearchService } from '../api/tosdr';
import { appInventory, type InstalledApp } from '../services/appInventory';
import { useStore } from '../state/store';
import {
  Button,
  Chip,
  ChipRow,
  GradeBadge,
  Note,
  SectionTitle,
  TextField,
  useListItemStyle,
} from '../components/ui';
import { ServiceLogo } from '../components/ServiceLogo';
import { tosdrLogoUrl } from '../utils/logos';
import { makeStyles, space, type, useTheme } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

// Built-in catalog used when search is empty or unreachable. Tapping an
// entry runs a live search for that name, so the followed service is always
// the real ToS;DR record, never a hardcoded grade.
const POPULAR_CATALOG: { name: string; query: string }[] = [
  { name: 'OpenAI (ChatGPT)', query: 'OpenAI' },
  { name: 'Facebook', query: 'Facebook' },
  { name: 'Google', query: 'Google' },
  { name: 'Instagram', query: 'Instagram' },
  { name: 'TikTok', query: 'TikTok' },
  { name: 'Spotify', query: 'Spotify' },
  { name: 'Netflix', query: 'Netflix' },
  { name: 'Amazon', query: 'Amazon' },
  { name: 'Microsoft', query: 'Microsoft' },
  { name: 'WhatsApp', query: 'WhatsApp' },
  { name: 'Signal', query: 'Signal' },
  { name: 'Mullvad', query: 'Mullvad' },
];

export default function AddAppsScreen(): React.JSX.Element {
  const navigation = useNavigation<Nav>();
  const store = useStore();
  const { c } = useTheme();
  const styles = useStyles();
  const listItemStyle = useListItemStyle();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TosdrSearchService[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [installed, setInstalled] = useState<InstalledApp[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void appInventory.getInstalledApps().then(setInstalled).catch(() => setInstalled([]));
  }, []);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearchError(null);
      return;
    }
    debounceRef.current = setTimeout(() => {
      setSearching(true);
      searchServices(q)
        .then((services) => {
          setResults(services);
          setSearchError(null);
        })
        .catch((err: unknown) => {
          setResults([]);
          setSearchError(err instanceof Error ? err.message : 'Search failed.');
        })
        .finally(() => setSearching(false));
    }, 400);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query]);

  const toggleFollow = (service: TosdrSearchService) => {
    if (store.isFollowing(service.id)) {
      store.unfollowService(`tosdr:${service.id}`);
    } else {
      store.followService({
        serviceId: service.id,
        name: service.name,
        slug: service.slug,
        rating: service.rating,
        source: 'tosdr',
      });
    }
  };

  return (
    <FlatList
      style={styles.screen}
      data={results}
      keyExtractor={(item) => String(item.id)}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={styles.header}>
          <TextField
            placeholder="Search services, e.g. Spotify"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Search services"
          />
          {searching && <ActivityIndicator style={styles.spinner} color={c.tint} />}
          {searchError !== null && (
            <Text style={styles.error}>{`Search didn't work: ${searchError} Check your connection and try again.`}</Text>
          )}

          {query.trim() === '' && (
            <>
              <SectionTitle>Popular services</SectionTitle>
              <ChipRow>
                {POPULAR_CATALOG.map((entry) => (
                  <Chip key={entry.name} label={entry.name} selected={false} onPress={() => setQuery(entry.query)} />
                ))}
              </ChipRow>

              <SectionTitle>On this device</SectionTitle>
              {installed.length === 0 ? (
                <Note>
                  {`This build can't see your installed apps (${appInventory.sourceLabel}). Search for them above instead.`}
                </Note>
              ) : (
                installed.map((app) => (
                  <Text key={app.packageName} style={styles.deviceApp}>
                    {app.label}
                  </Text>
                ))
              )}
            </>
          )}

          {results.length > 0 && <SectionTitle>{`${results.length} result${results.length === 1 ? '' : 's'}`}</SectionTitle>}
        </View>
      }
      renderItem={({ item, index }) => {
        const following = store.isFollowing(item.id);
        return (
          <View style={[listItemStyle(index, results.length), styles.row]}>
            <ServiceLogo name={item.name} uri={tosdrLogoUrl(item.id)} />
            <View style={styles.rowText}>
              <Text style={styles.rowName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.rowSub} numberOfLines={1}>
                {item.urls[0] ?? item.slug}
                {item.is_comprehensively_reviewed ? ' · fully reviewed' : ''}
              </Text>
            </View>
            <GradeBadge grade={item.rating} />
            <Button
              compact
              variant={following ? 'secondary' : 'primary'}
              label={following ? '✓ Following' : 'Follow'}
              onPress={() => toggleFollow(item)}
            />
          </View>
        );
      }}
      ListFooterComponent={
        <View style={styles.footer}>
          <Text style={styles.footerTitle}>Can't find an app?</Text>
          <Text style={styles.footerText}>
            We can read its privacy policy and terms directly and quote what they say.
          </Text>
          <Button
            label="Check it directly"
            variant="secondary"
            onPress={() => navigation.navigate('DirectCheck', {})}
          />
          <Text style={styles.attribution}>Grades and points: ToS;DR, CC BY-SA. See About.</Text>
        </View>
      }
      contentContainerStyle={styles.listContent}
    />
  );
}

const useStyles = makeStyles(({ c }) => ({
  attribution: {
    ...type.meta,
    color: c.inkMuted,
    marginTop: space[2],
  },
  deviceApp: {
    ...type.body,
    color: c.ink,
    paddingVertical: 2,
  },
  error: {
    ...type.bodySm,
    color: c.pointBad,
    marginTop: space[2],
  },
  footer: {
    gap: space[2],
    marginTop: space[6],
    paddingHorizontal: space[4],
  },
  footerText: {
    ...type.bodySm,
    color: c.inkMuted,
    marginBottom: space[1],
  },
  footerTitle: {
    ...type.headline,
    color: c.ink,
  },
  header: {
    paddingBottom: space[1],
    paddingHorizontal: space[4],
    paddingTop: space[3],
  },
  listContent: {
    paddingBottom: space[8],
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  rowName: {
    ...type.headline,
    color: c.ink,
  },
  rowSub: {
    ...type.meta,
    color: c.inkMuted,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  screen: {
    backgroundColor: c.ground,
  },
  spinner: {
    marginTop: space[3],
  },
}));
