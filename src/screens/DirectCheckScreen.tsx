import React, { useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/types';
import { searchServices, type TosdrSearchService } from '../api/tosdr';
import { normalizeSiteUrl, type DirectCheckResult } from '../api/directCheck';
import { useStore } from '../state/store';
import { Button, ClauseQuote, GradeBadge, Link, Note, SectionTitle, TextField } from '../components/ui';
import { ServiceLogo } from '../components/ServiceLogo';
import { Breakdown, RiskHero } from '../components/risk';
import { BreachCard } from '../components/breaches';
import { findingsFromDirect } from '../utils/findings';
import { tosdrLogoUrl } from '../utils/logos';
import { makeStyles, radius, space, type, useTheme } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'DirectCheck'>;

type Phase =
  | { kind: 'form' }
  | { kind: 'searching' }
  | { kind: 'rated'; results: TosdrSearchService[]; site: string }
  | { kind: 'check'; id: string } // a running or finished direct check
  | { kind: 'error'; message: string };

const bareSite = (url: string) => url.replace(/^https?:\/\//, '');

/** True when none of the ToS;DR matches has a letter grade (all "N/A"). */
const isUngraded = (results: TosdrSearchService[]) =>
  results.every((r) => !['A', 'B', 'C', 'D', 'E'].includes(r.rating.toUpperCase()));

/** "https://www.Example.com/path" → "example.com". */
const hostOf = (url: string) =>
  url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[/?#].*$/, '');

/**
 * ToS;DR's search only matches close spellings ("duck duck go" finds
 * nothing, "duckduckgo" finds DuckDuckGo). Try the typed name, the website,
 * and the name without spaces; a service whose listed sites include the
 * website wins over loose name matches. Stops at the first site match, so
 * usually 1–2 requests. Search errors never block the direct check.
 */
async function findOnTosdr(name: string, site: string): Promise<TosdrSearchService[]> {
  const host = hostOf(site);
  const queries = [...new Set([name.trim(), host, name.replace(/\s+/g, ''), host.split('.')[0]])].filter(
    (q) => q.length >= 2,
  );
  let nameMatches: TosdrSearchService[] = [];
  for (const query of queries) {
    let results: TosdrSearchService[];
    try {
      results = await searchServices(query);
    } catch {
      continue;
    }
    const sameSite = results.filter((r) =>
      r.urls.some((u) => {
        const h = hostOf(u);
        return h === host || h.endsWith(`.${host}`) || host.endsWith(`.${h}`);
      }),
    );
    if (sameSite.length > 0) {
      return sameSite;
    }
    if (query === name.trim() && results.length > 0) {
      nameMatches = results; // keep the old behaviour as a fallback
    }
  }
  return nameMatches;
}

export default function DirectCheckScreen(): React.JSX.Element {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const store = useStore();
  const { c } = useTheme();
  const styles = useStyles();
  const routeId = route.params.directCheckId;
  const existing = routeId ? store.directChecks[routeId] : undefined;

  const [name, setName] = useState(existing?.name ?? '');
  const [siteUrl, setSiteUrl] = useState(existing?.siteUrl ?? '');
  const [phase, setPhase] = useState<Phase>(routeId ? { kind: 'check', id: routeId } : { kind: 'form' });

  const isFollowing = (id: string) => store.follows.some((f) => f.source === 'direct' && f.directCheckId === id);

  /** A check of this site on this device (running, or saved), newest first. */
  const knownCheckFor = (site: string): string | undefined => {
    const running = Object.values(store.pendingChecks).find((p) => p.siteUrl === site && !p.error);
    if (running) {
      return running.id;
    }
    return Object.values(store.directChecks)
      .filter((r) => r.siteUrl === site)
      .sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt))[0]?.id;
  };

  const start = async () => {
    if (name.trim() === '') {
      setPhase({ kind: 'error', message: 'Enter the service name first.' });
      return;
    }
    let site: string;
    try {
      site = normalizeSiteUrl(siteUrl);
    } catch (err) {
      setPhase({ kind: 'error', message: err instanceof Error ? err.message : 'Check the website address.' });
      return;
    }
    // Already checked (or checking) this site: show that instead of paying
    // to grade it again. "Check again" on the result runs a fresh check.
    const known = knownCheckFor(site);
    if (known) {
      setPhase({ kind: 'check', id: known });
      return;
    }
    // Always check ToS;DR first. If it rates the service, offer the rated
    // record instead of a (paid) direct check.
    setPhase({ kind: 'searching' });
    const rated = await findOnTosdr(name, site);
    if (rated.length > 0) {
      setPhase({ kind: 'rated', results: rated, site });
      return;
    }
    runDirectCheck(site);
  };

  // Show the app now and grade it in the background. It goes straight into
  // Your apps, so leaving this screen still leaves a row with progress (and
  // later the grade) on the dashboard.
  const runDirectCheck = (site: string) => {
    const id = store.startDirectCheck(name, site);
    addToMyApps(id, name.trim(), site);
    setPhase({ kind: 'check', id });
  };

  const addToMyApps = (id: string, appName: string, site: string, grade?: string) => {
    store.followService({
      serviceId: null,
      name: appName,
      slug: bareSite(site),
      rating: grade ?? 'UNRATED',
      source: 'direct',
      directCheckId: id,
    });
  };

  const renderIdentity = (appName: string, site: string, iconUrl: string | undefined, badge?: React.ReactNode) => (
    <View style={styles.identity}>
      <ServiceLogo name={appName} uri={iconUrl} size="lg" />
      <View style={styles.identityText}>
        <Text style={styles.name} accessibilityRole="header">
          {appName}
        </Text>
        <Text style={styles.meta}>{bareSite(site)}</Text>
      </View>
      {badge}
    </View>
  );

  const renderFollowButton = (id: string, appName: string, site: string, grade?: string) =>
    !isFollowing(id) ? (
      <Button
        label="Add to your apps"
        onPress={() => addToMyApps(id, appName, site, grade)}
        style={styles.primaryAction}
      />
    ) : (
      <View style={styles.followingRow}>
        <Text style={styles.following}>✓ In your apps</Text>
        <Button
          compact
          variant="quiet"
          label="Remove from your apps"
          onPress={() => store.unfollowService(`direct:${id}`)}
        />
      </View>
    );

  /** Shown the moment a check starts; the grade fills in when it's done. */
  const renderPending = (id: string, appName: string, site: string, error?: string) => (
    <View>
      {renderIdentity(appName, site, store.directChecks[id]?.iconUrl)}
      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Button
            label="Try again"
            variant="secondary"
            onPress={() => store.startDirectCheck(appName, site, { id, fresh: true })}
          />
        </View>
      ) : (
        <View style={styles.progress} accessibilityLiveRegion="polite">
          <ActivityIndicator color={c.tint} />
          <View style={styles.progressText}>
            <Text style={styles.progressTitle}>Reading the policies and grading…</Text>
            <Text style={styles.meta}>
              Usually 1–2 minutes. You can leave this screen: it keeps going, and the grade appears on Your apps when it's done.
            </Text>
          </View>
        </View>
      )}
      {renderFollowButton(id, appName, site)}
    </View>
  );

  const renderResult = (result: DirectCheckResult) => (
    <View>
      {renderIdentity(
        result.name,
        result.siteUrl,
        result.iconUrl,
        result.rating ? undefined : <GradeBadge grade="?" large />,
      )}
      {result.archivedAt && (
        <Note title="Read from an archived copy">
          {`${bareSite(result.siteUrl)} refused our server, so we read the Wayback Machine's copy of its policies from ${new Date(result.archivedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}. Quotes are word for word from that copy; the live pages may have changed since.`}
        </Note>
      )}
      <Text style={styles.resultMeta}>
        {`${result.rating ? 'Estimated grade · not reviewed by ToS;DR' : 'Unrated · direct check'} · ${new Date(result.fetchedAt).toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })} · ${result.fetchedUrls.length} page${result.fetchedUrls.length === 1 ? '' : 's'} read`}
      </Text>

      {renderFollowButton(result.id, result.name, result.siteUrl, result.rating?.grade)}

      {!result.rating && <BreachCard urls={[result.siteUrl]} />}

      {result.rating && (
        <View style={styles.breakdown}>
          <RiskHero grade={result.rating.grade} findings={findingsFromDirect(result.rating)} estimated />
          <BreachCard urls={[result.siteUrl]} />
          {result.rating.points.length === 0 ? (
            <Note>No ToS;DR cases could be matched to the pages we read, so there's no grade.</Note>
          ) : (
            <Breakdown findings={findingsFromDirect(result.rating)} />
          )}
          <Text style={styles.hint}>Graded with ToS;DR's formula; neutral cases don't count. Every quote is word for word from the page.</Text>
          {result.rating.incomplete && (
            <Note>The AI service was busy, so some ToS;DR cases weren't checked. Run the check again later for a fuller grade.</Note>
          )}
          {result.rating.textTruncated && (
            <Note>These policies are long, so only the first part of each page was checked. The grade may miss cases.</Note>
          )}
        </View>
      )}

      {!result.rating && result.ratingError === 'failed' && (
        <Note>We couldn't estimate a grade this time. The quotes below are still word for word from the pages.</Note>
      )}

      {!result.rating && <SectionTitle>What the pages say</SectionTitle>}
      {!result.rating && result.findings.length === 0 && (
        <Note>None of the checked topics came up in the pages we could read.</Note>
      )}
      {!result.rating &&
        result.findings.map((finding, i) => (
          <ClauseQuote
            key={`${finding.topic}-${i}`}
            title={finding.topic}
            body={finding.quote}
            verbatim
            sourceLabel={bareSite(finding.sourceUrl)}
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
          <Link key={url} label={`${bareSite(url)} ↗`} onPress={() => void Linking.openURL(url)} />
        ))}
      </View>
      {result.failedUrls.length > 0 && (
        <Text style={styles.failed}>{`Couldn't read: ${result.failedUrls.map(bareSite).join(', ')}`}</Text>
      )}

      <Button
        label="Check again"
        variant="secondary"
        onPress={() => store.startDirectCheck(result.name, result.siteUrl, { id: result.id, fresh: true })}
        style={styles.primaryAction}
      />

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

  /** A running check wins over an older saved result (that's "Check again"). */
  const renderCheck = (id: string) => {
    const pending = store.pendingChecks[id];
    if (pending) {
      return renderPending(id, pending.name, pending.siteUrl, pending.error);
    }
    const result = store.directChecks[id];
    if (result) {
      return renderResult(result);
    }
    // Followed, but the check never finished (the page was reloaded mid-check).
    const follow = store.follows.find((f) => f.directCheckId === id);
    if (follow) {
      const site = `https://${follow.slug}`;
      return renderPending(
        id,
        follow.name,
        site,
        "This check didn't finish, probably because the page was reloaded. Try again to grade it.",
      );
    }
    return <Note>This check isn't available anymore.</Note>;
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      {phase.kind !== 'check' && (
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
            label={phase.kind === 'searching' ? 'Checking ToS;DR…' : 'Check this app'}
            onPress={() => void start()}
            disabled={phase.kind === 'searching'}
            style={styles.primaryAction}
          />
        </View>
      )}

      {phase.kind === 'rated' && (
        <>
          {isUngraded(phase.results) ? (
            <>
              <SectionTitle>ToS;DR lists this but hasn't graded it</SectionTitle>
              <Text style={styles.hint}>
                There's no ToS;DR grade yet, so check it directly: we read its policies and estimate a grade.
              </Text>
              <Button
                label="Check it directly"
                onPress={() => runDirectCheck(phase.site)}
                style={[styles.primaryAction, { marginBottom: space[4] }]}
              />
            </>
          ) : (
            <>
              <SectionTitle>ToS;DR already rates this</SectionTitle>
              <Text style={styles.hint}>
                Follow the rated version instead. It has a community grade and reviewed points.
              </Text>
            </>
          )}
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
            {!isUngraded(phase.results) && (
              <Button
                label="Not the right app? Check it directly"
                variant="quiet"
                onPress={() => runDirectCheck(phase.site)}
              />
            )}
            <Button label="Check a different app" variant="secondary" onPress={() => setPhase({ kind: 'form' })} />
            <Button label="Back to your apps" variant="quiet" onPress={() => navigation.navigate('Dashboard')} />
          </View>
        </>
      )}

      {phase.kind === 'check' && renderCheck(phase.id)}

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
  breakdown: {
    gap: space[3] + 2,
    marginTop: space[6],
  },
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
  },
  followingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space[3],
    justifyContent: 'space-between',
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
  progress: {
    alignItems: 'center',
    backgroundColor: c.surface,
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: space[3],
    marginTop: space[4],
    padding: space[4],
  },
  progressText: {
    flex: 1,
    gap: 2,
  },
  progressTitle: {
    ...type.bodySmBold,
    color: c.ink,
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
  title: {
    ...type.title,
    color: c.ink,
  },
}));
