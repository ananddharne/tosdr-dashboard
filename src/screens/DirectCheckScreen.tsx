import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/types';
import { searchServices, type TosdrSearchService } from '../api/tosdr';
import { runDirectCheck, type DirectCheckResult } from '../api/directCheck';
import { useStore, followKey } from '../state/store';
import { Button, ClauseQuote, GradeBadge, Link, Note, SectionTitle, TextField } from '../components/ui';
import { ServiceLogo } from '../components/ServiceLogo';
import { tosdrLogoUrl } from '../utils/logos';
import { makeStyles, radius, space, type, useTheme } from '../theme';

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
  const { c } = useTheme();
  const styles = useStyles();
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
      rating: result.rating?.grade ?? 'UNRATED',
      source: 'direct',
      directCheckId: result.id,
    });
  };

  const busy = phase.kind === 'searching' || phase.kind === 'fetching';

  const renderResult = (result: DirectCheckResult) => (
    <View>
      <View style={styles.identity}>
        <ServiceLogo name={result.name} uri={result.iconUrl} size="lg" />
        <View style={styles.identityText}>
          <Text style={styles.name} accessibilityRole="header">
            {result.name}
          </Text>
          <Text style={styles.meta}>{result.siteUrl.replace(/^https?:\/\//, '')}</Text>
        </View>
        <GradeBadge grade={result.rating && result.rating.grade !== 'N/A' ? result.rating.grade : '?'} large />
      </View>
      <Text style={styles.resultMeta}>
        {`${result.rating ? 'Estimated grade · not reviewed by ToS;DR' : 'Unrated · direct check'} · ${new Date(result.fetchedAt).toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })} · ${result.fetchedUrls.length} page${result.fetchedUrls.length === 1 ? '' : 's'} read`}
      </Text>

      {!isFollowingDirect ? (
        <Button label="Add to your apps" onPress={() => addToMyApps(result)} style={styles.primaryAction} />
      ) : (
        <Text style={styles.following}>✓ In your apps</Text>
      )}

      {result.rating && (
        <>
          <SectionTitle>{`ToS;DR cases found (${result.rating.points.length})`}</SectionTitle>
          <Text style={styles.hint}>
            {`${result.rating.counts.good} good · ${result.rating.counts.bad} bad · ${result.rating.counts.blocker} blocker · ${result.rating.counts.neutral} neutral. Graded with ToS;DR's formula; neutral cases don't count.`}
          </Text>
          {result.rating.points.length === 0 && (
            <Note>No ToS;DR cases could be matched to the pages we read, so there's no grade.</Note>
          )}
          {result.rating.points.map((point) => (
            <ClauseQuote
              key={point.caseId}
              classification={point.classification}
              title={point.caseTitle}
              body={point.quote}
              verbatim
              sourceLabel={point.sourceUrl.replace(/^https?:\/\//, '')}
              onPressSource={() => void Linking.openURL(point.sourceUrl)}
            />
          ))}
          {result.rating.incomplete && (
            <Note>The AI service was busy, so some ToS;DR cases weren't checked. Run the check again later for a fuller grade.</Note>
          )}
          {result.rating.textTruncated && (
            <Note>These policies are long, so only the first part of each page was checked. The grade may miss cases.</Note>
          )}
        </>
      )}

      {!result.rating && result.ratingError === 'failed' && (
        <Note>We couldn't estimate a grade this time. The quotes below are still word for word from the pages.</Note>
      )}

      {!result.rating && <SectionTitle>What the pages say</SectionTitle>}
      {!result.rating && result.findings.length === 0 && (
        <Note>None of the checked topics came up in the pages we could read.</Note>
      )}
      {!result.rating && result.findings.map((finding, i) => (
        <ClauseQuote
          key={`${finding.topic}-${i}`}
          title={finding.topic}
          body={finding.quote}
          verbatim
          sourceLabel={finding.sourceUrl.replace(/^https?:\/\//, '')}
          onPressSource={() => void Linking.openURL(finding.sourceUrl)}
        />
      ))}

      {!result.rating && result.notStatedTopics.length > 0 && (
        <>
          <SectionTitle>Not stated</SectionTitle>
          <Note>
            {`Nothing in the pages mentions: ${result.notStatedTopics.join(', ')}. That means the pages don't say, not that it doesn't happen.`}
          </Note>
        </>
      )}

      <SectionTitle>Pages read</SectionTitle>
      <View style={styles.sources}>
        {result.fetchedUrls.map((url) => (
          <Link key={url} label={`${url.replace(/^https?:\/\//, '')} ↗`} onPress={() => void Linking.openURL(url)} />
        ))}
      </View>
      {result.failedUrls.length > 0 && (
        <Text style={styles.failed}>{`Couldn't read: ${result.failedUrls.map((u) => u.replace(/^https?:\/\//, '')).join(', ')}`}</Text>
      )}

      {result.rating ? (
        <Note title="About this grade">
          {`ToS;DR hasn't reviewed this app. An AI model (${result.rating.model}) matched the company's own pages to ToS;DR's list of cases, and we kept only matches whose quote appears word for word on the page. The letter comes from ToS;DR's grading formula, but ToS;DR's volunteers haven't checked these matches. Information only, not legal advice.`}
        </Note>
      ) : (
        <Note title="About direct checks">
          This isn't a ToS;DR grade. We only quote the company's own pages, word for word, and never make up a rating.
          Information only, not legal advice.
        </Note>
      )}
    </View>
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      {phase.kind !== 'done' && (
        <View style={styles.form}>
          <Text style={styles.title} accessibilityRole="header">
            Check an app directly
          </Text>
          <Text style={styles.hint}>
            If ToS;DR hasn't reviewed an app yet, we read its own privacy and terms pages, match them to ToS;DR's cases,
            and estimate a grade. Every finding quotes the page word for word.
          </Text>
          <Text style={styles.fieldLabel}>App or company name</Text>
          <TextField
            placeholder="e.g. Arc Browser"
            value={name}
            onChangeText={setName}
            autoCapitalize="none"
            accessibilityLabel="App or company name"
          />
          <Text style={styles.fieldLabel}>Website</Text>
          <TextField
            placeholder="e.g. arc.net"
            value={siteUrl}
            onChangeText={setSiteUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            accessibilityLabel="Website"
          />
          <Button
            label={phase.kind === 'searching' ? 'Checking ToS;DR…' : phase.kind === 'fetching' ? 'Reading and grading (up to 2 min)…' : 'Check this app'}
            onPress={() => void start()}
            disabled={busy}
            style={styles.primaryAction}
          />
          {busy && <ActivityIndicator style={styles.spinner} color={c.tint} />}
        </View>
      )}

      {phase.kind === 'rated' && (
        <>
          <SectionTitle>ToS;DR already rates this</SectionTitle>
          <Text style={styles.hint}>Follow the rated version instead. It has a community grade and reviewed points.</Text>
          <View style={styles.ratedList}>
            {phase.results.map((service, i) => {
              const following = store.isFollowing(service.id);
              return (
                <View key={service.id} style={[styles.ratedRow, i === phase.results.length - 1 && styles.ratedRowLast]}>
                  <ServiceLogo name={service.name} uri={tosdrLogoUrl(service.id)} size="sm" />
                  <View style={styles.identityText}>
                    <Text style={styles.ratedName} numberOfLines={1}>
                      {service.name}
                    </Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {service.urls[0] ?? service.slug}
                    </Text>
                  </View>
                  <GradeBadge grade={service.rating} />
                  <Button
                    compact
                    variant={following ? 'secondary' : 'primary'}
                    label={following ? '✓ Following' : 'Follow'}
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
                  />
                </View>
              );
            })}
          </View>
          <View style={styles.buttonRow}>
            <Button label="Check a different app" variant="secondary" onPress={() => setPhase({ kind: 'form' })} />
            <Button label="Back to your apps" variant="quiet" onPress={() => navigation.navigate('Dashboard')} />
          </View>
        </>
      )}

      {phase.kind === 'done' && renderResult(phase.result)}

      {phase.kind === 'error' && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{phase.message}</Text>
          <Button label="Try again" variant="secondary" onPress={() => setPhase({ kind: 'form' })} />
        </View>
      )}
    </ScrollView>
  );
}

const useStyles = makeStyles(({ c }) => ({
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[2],
    marginTop: space[4],
  },
  container: {
    padding: space[4],
    paddingBottom: space[8],
  },
  errorBox: {
    gap: space[3],
    marginTop: space[4],
  },
  errorText: {
    ...type.body,
    color: c.pointBad,
  },
  failed: {
    ...type.meta,
    color: c.inkMuted,
    marginTop: space[2],
  },
  fieldLabel: {
    ...type.bodySmBold,
    color: c.ink,
    marginTop: space[3],
  },
  following: {
    ...type.bodySmBold,
    color: c.ink,
    marginTop: space[4],
  },
  form: {
    gap: space[1],
  },
  hint: {
    ...type.bodySm,
    color: c.inkMuted,
    marginBottom: space[2],
  },
  identity: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space[3],
  },
  identityText: {
    flex: 1,
    gap: 2,
  },
  meta: {
    ...type.meta,
    color: c.inkMuted,
  },
  name: {
    ...type.title,
    color: c.ink,
  },
  primaryAction: {
    marginTop: space[4],
  },
  ratedList: {
    backgroundColor: c.surface,
    borderRadius: radius.md,
  },
  ratedName: {
    ...type.headline,
    color: c.ink,
  },
  ratedRow: {
    alignItems: 'center',
    borderBottomColor: c.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: space[3],
    paddingHorizontal: space[3],
    paddingVertical: space[3],
  },
  ratedRowLast: {
    borderBottomWidth: 0,
  },
  resultMeta: {
    ...type.meta,
    color: c.inkMuted,
    marginTop: space[3],
  },
  screen: {
    backgroundColor: c.ground,
  },
  sources: {
    gap: space[2],
  },
  spinner: {
    marginTop: space[3],
  },
  title: {
    ...type.title,
    color: c.ink,
  },
}));
