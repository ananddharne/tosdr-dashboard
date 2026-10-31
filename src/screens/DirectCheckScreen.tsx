import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/types';
import { searchServices, type TosdrSearchService } from '../api/tosdr';
import { runDirectCheck, type DirectCheckResult } from '../api/directCheck';
import { useStore, followKey } from '../state/store';
import { GradeBadge, Note, SectionTitle } from '../components/ui';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'DirectCheck'>;

type Phase =
  | { kind: 'form' }
  | { kind: 'searching' }
  | { kind: 'rated'; results: TosdrSearchService[] }
  | { kind: 'fetching' }
  | { kind: 'done'; result: DirectCheckResult }
  | { kind: 'error'; message: string };

export default function DirectCheckScreen(): React.JSX.Element {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const store = useStore();
  const existing = route.params.directCheckId ? store.directChecks[route.params.directCheckId] : undefined;

  const [name, setName] = useState(existing?.name ?? '');
  const [siteUrl, setSiteUrl] = useState(existing?.siteUrl ?? '');
  const [phase, setPhase] = useState<Phase>(
    existing ? { kind: 'done', result: existing } : { kind: 'form' },
  );

  const isFollowingDirect = useMemo(() => {
    if (phase.kind !== 'done') {
      return false;
    }
    return store.follows.some((f) => f.source === 'direct' && f.directCheckId === phase.result.id);
  }, [phase, store.follows]);

  const start = async () => {
    if (name.trim() === '') {
      setPhase({ kind: 'error', message: 'Enter the service name first.' });
      return;
    }
    // Step 1: always check ToS;DR first. If it rates the service, offer
    // the rated record instead of duplicating it with a direct check.
    setPhase({ kind: 'searching' });
    try {
      const results = await searchServices(name);
      if (results.length > 0) {
        setPhase({ kind: 'rated', results });
        return;
      }
    } catch {
      // Search failure must not block the direct fetch; fall through.
    }
    // Step 2: not rated (or search unreachable) — fetch the site itself.
    setPhase({ kind: 'fetching' });
    try {
      const result = await runDirectCheck(name, siteUrl);
      store.saveDirectCheck(result);
      setPhase({ kind: 'done', result });
    } catch (err) {
      setPhase({ kind: 'error', message: err instanceof Error ? err.message : 'Direct check failed.' });
    }
  };

  const addToMyApps = (result: DirectCheckResult) => {
    store.followService({
      serviceId: null,
      name: result.name,
      slug: result.siteUrl.replace(/^https?:\/\//, ''),
      rating: 'UNRATED',
      source: 'direct',
      directCheckId: result.id,
    });
  };

  const renderResult = (result: DirectCheckResult) => (
    <View>
      <View style={styles.unratedBanner}>
        <Text style={styles.unratedText}>Unrated · direct check</Text>
      </View>
      <Text style={styles.resultName}>{result.name}</Text>
      <Text style={styles.resultMeta}>
        Checked {new Date(result.fetchedAt).toLocaleString()} · {result.fetchedUrls.length} page(s) fetched
      </Text>

      <SectionTitle>Findings (verbatim quotes)</SectionTitle>
      {result.findings.length === 0 && (
        <Note>No findings matched the checked topics in the fetched pages.</Note>
      )}
      {result.findings.map((finding, i) => (
        <View key={`${finding.topic}-${i}`} style={styles.finding}>
          <Text style={styles.findingTopic}>{finding.topic}</Text>
          <Text style={styles.quote}>&ldquo;{finding.quote}&rdquo;</Text>
          <TouchableOpacity onPress={() => void Linking.openURL(finding.sourceUrl)}>
            <Text style={styles.sourceLink}>{finding.sourceUrl} ↗</Text>
          </TouchableOpacity>
        </View>
      ))}

      {result.notStatedTopics.length > 0 && (
        <>
          <SectionTitle>Not stated</SectionTitle>
          <Text style={styles.notStated}>
            No matching sentence was found for: {result.notStatedTopics.join(', ')}. That means the fetched pages do not
            state it — not that the practice does not happen.
          </Text>
        </>
      )}

      <SectionTitle>Sources fetched</SectionTitle>
      {result.fetchedUrls.map((url) => (
        <TouchableOpacity key={url} onPress={() => void Linking.openURL(url)}>
          <Text style={styles.sourceLink}>{url} ↗</Text>
        </TouchableOpacity>
      ))}
      {result.failedUrls.length > 0 && (
        <Text style={styles.failed}>Could not fetch: {result.failedUrls.join(', ')}</Text>
      )}

      {!isFollowingDirect && (
        <TouchableOpacity style={styles.addButton} onPress={() => addToMyApps(result)}>
          <Text style={styles.addButtonText}>+ Add to My Apps</Text>
        </TouchableOpacity>
      )}
      {isFollowingDirect && <Note>This direct check is already in Your Apps.</Note>}
      <Note>
        This is not a ToS;DR grade. Direct checks only quote what the service&apos;s own pages say; they never invent a
        rating.
      </Note>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {phase.kind !== 'done' && (
        <>
          <Text style={styles.title}>Not rated? Fetch it directly</Text>
          <Text style={styles.hint}>
            If ToS;DR does not rate a service yet, this fetches the service&apos;s own terms and privacy pages and extracts
            findings only from verbatim quotes.
          </Text>
          <Text style={styles.label}>Service name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Arc Browser"
            value={name}
            onChangeText={setName}
            autoCapitalize="none"
          />
          <Text style={styles.label}>Service website (for the direct fetch)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. arc.net"
            value={siteUrl}
            onChangeText={setSiteUrl}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => void start()}
            disabled={phase.kind === 'searching' || phase.kind === 'fetching'}
          >
            <Text style={styles.addButtonText}>
              {phase.kind === 'searching' || phase.kind === 'fetching' ? 'Working…' : 'Check this service'}
            </Text>
          </TouchableOpacity>
          {(phase.kind === 'searching' || phase.kind === 'fetching') && (
            <ActivityIndicator style={styles.spinner} />
          )}
        </>
      )}

      {phase.kind === 'rated' && (
        <>
          <SectionTitle>ToS;DR rates this service</SectionTitle>
          <Text style={styles.hint}>
            Follow the rated record instead — it carries the community grade and points.
          </Text>
          {phase.results.map((service) => {
            const following = store.isFollowing(service.id);
            return (
              <View key={service.id} style={styles.ratedRow}>
                <GradeBadge grade={service.rating} />
                <View style={styles.ratedText}>
                  <Text style={styles.ratedName}>{service.name}</Text>
                  <Text style={styles.ratedSub}>{service.urls[0] ?? service.slug}</Text>
                </View>
                <TouchableOpacity
                  style={styles.smallButton}
                  onPress={() => {
                    if (following) {
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
                  }}
                >
                  <Text style={styles.smallButtonText}>{following ? 'Following' : 'Follow'}</Text>
                </TouchableOpacity>
              </View>
            );
          })}
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => setPhase({ kind: 'form' })}
          >
            <Text style={styles.secondaryButtonText}>Check a different service</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => navigation.navigate('Dashboard')}
          >
            <Text style={styles.secondaryButtonText}>Back to Your Apps</Text>
          </TouchableOpacity>
        </>
      )}

      {phase.kind === 'done' && renderResult(phase.result)}

      {phase.kind === 'error' && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{phase.message}</Text>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => setPhase({ kind: 'form' })}>
            <Text style={styles.secondaryButtonText}>Try again</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  addButton: {
    alignItems: 'center',
    backgroundColor: '#101828',
    borderRadius: 10,
    marginTop: 12,
    paddingVertical: 12,
  },
  addButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  container: {
    padding: 16,
    paddingBottom: 32,
  },
  errorBox: {
    marginTop: 16,
  },
  errorText: {
    color: '#dc2626',
    fontSize: 14,
    marginBottom: 8,
  },
  failed: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 8,
  },
  finding: {
    backgroundColor: '#ffffff',
    borderBottomColor: '#e2e8f0',
    borderBottomWidth: 1,
    paddingVertical: 10,
  },
  findingTopic: {
    fontSize: 13,
    fontWeight: '800',
  },
  hint: {
    color: '#64748b',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 15,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  notStated: {
    color: '#475569',
    fontSize: 13,
    lineHeight: 19,
  },
  quote: {
    color: '#334155',
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 19,
    marginTop: 2,
  },
  ratedName: {
    fontSize: 15,
    fontWeight: '600',
  },
  ratedRow: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderBottomColor: '#e2e8f0',
    borderBottomWidth: 1,
    flexDirection: 'row',
    paddingVertical: 10,
  },
  ratedSub: {
    color: '#64748b',
    fontSize: 12,
  },
  ratedText: {
    flex: 1,
    marginLeft: 10,
  },
  resultMeta: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 2,
  },
  resultName: {
    fontSize: 20,
    fontWeight: '800',
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: '#101828',
    borderRadius: 10,
    borderWidth: 1.5,
    marginTop: 10,
    paddingVertical: 10,
  },
  secondaryButtonText: {
    color: '#101828',
    fontSize: 14,
    fontWeight: '700',
  },
  sourceLink: {
    color: '#1d4ed8',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  spinner: {
    marginTop: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
  },
  unratedBanner: {
    alignSelf: 'flex-start',
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  unratedText: {
    color: '#92400e',
    fontSize: 13,
    fontWeight: '800',
  },
});
