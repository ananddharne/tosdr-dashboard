import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { searchServices, type TosdrSearchService } from '../api/tosdr';
import { appInventory, type InstalledApp } from '../services/appInventory';
import { useStore } from '../state/store';
import { GradeBadge, Note, SectionTitle } from '../components/ui';

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
      data={results}
      keyExtractor={(item) => String(item.id)}
      ListHeaderComponent={
        <View style={styles.header}>
          <TextInput
            style={styles.search}
            placeholder="Search services, e.g. Spotify"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {searching && <ActivityIndicator style={styles.spinner} />}
          {searchError !== null && <Text style={styles.error}>{searchError}</Text>}

          <SectionTitle>On this device</SectionTitle>
          {installed.length === 0 ? (
            <Note>
              {`Automatic detection is not active in this build (${appInventory.sourceLabel}). Add apps manually below — on Android, a native build can populate this list automatically (see src/services/appInventory.ts).`}
            </Note>
          ) : (
            installed.map((app) => (
              <Text key={app.packageName} style={styles.deviceApp}>
                • {app.label}
              </Text>
            ))
          )}

          {query.trim() === '' && (
            <>
              <SectionTitle>Popular services</SectionTitle>
              {POPULAR_CATALOG.map((entry) => (
                <TouchableOpacity key={entry.name} style={styles.catalogRow} onPress={() => setQuery(entry.query)}>
                  <Text style={styles.catalogName}>{entry.name}</Text>
                  <Text style={styles.catalogAction}>Search ›</Text>
                </TouchableOpacity>
              ))}
            </>
          )}

          <TouchableOpacity style={styles.directButton} onPress={() => navigation.navigate('DirectCheck', {})}>
            <Text style={styles.directButtonText}>Not rated? Fetch it directly</Text>
          </TouchableOpacity>
          <Text style={styles.footer}>Grades and points: ToS;DR (CC BY-SA). See About for attribution.</Text>
        </View>
      }
      renderItem={({ item }) => {
        const following = store.isFollowing(item.id);
        return (
          <View style={styles.row}>
            <GradeBadge grade={item.rating} />
            <View style={styles.rowText}>
              <Text style={styles.rowName}>{item.name}</Text>
              <Text style={styles.rowSub}>
                {item.urls[0] ?? item.slug}
                {item.is_comprehensively_reviewed ? ' · fully reviewed' : ''}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.followButton, following ? styles.followingButton : undefined]}
              onPress={() => toggleFollow(item)}
            >
              <Text style={[styles.followText, following ? styles.followingText : undefined]}>
                {following ? 'Following' : 'Follow'}
              </Text>
            </TouchableOpacity>
          </View>
        );
      }}
      contentContainerStyle={styles.listContent}
    />
  );
}

const styles = StyleSheet.create({
  catalogAction: {
    color: '#1d4ed8',
    fontSize: 14,
    fontWeight: '600',
  },
  catalogName: {
    fontSize: 15,
  },
  catalogRow: {
    borderBottomColor: '#e2e8f0',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  deviceApp: {
    fontSize: 14,
    paddingVertical: 2,
  },
  directButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#101828',
    borderRadius: 10,
    borderWidth: 1.5,
    marginTop: 16,
    paddingVertical: 12,
  },
  directButtonText: {
    color: '#101828',
    fontSize: 15,
    fontWeight: '700',
  },
  error: {
    color: '#dc2626',
    fontSize: 13,
    marginTop: 8,
  },
  followButton: {
    backgroundColor: '#101828',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  followText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  followingButton: {
    backgroundColor: '#e2e8f0',
  },
  followingText: {
    color: '#334155',
  },
  footer: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 16,
    textAlign: 'center',
  },
  header: {
    padding: 16,
  },
  listContent: {
    paddingBottom: 24,
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
    fontSize: 15,
    fontWeight: '600',
  },
  rowSub: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 2,
  },
  rowText: {
    flex: 1,
    marginLeft: 12,
  },
  search: {
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  spinner: {
    marginTop: 12,
  },
});
