import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/types';
import { approvedPoints, type TosdrServiceDetail } from '../api/tosdr';
import { findingsFromTosdr } from '../utils/findings';
import { deriveAiLens, type AiStatus } from '../utils/grades';
import { useStore } from '../state/store';
import { Button } from '../components/ui';
import { Breakdown, Card, CardTitle, RiskHero } from '../components/risk';
import { ServiceLogo } from '../components/ServiceLogo';
import { BreachCard } from '../components/breaches';
import { tosdrLogoUrl } from '../utils/logos';
import { hairline, makeStyles, size, space, type, useTheme } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'ServiceDetail'>;

function AiRow({ label, status, last }: { label: string; status: AiStatus; last?: boolean }): React.JSX.Element {
  const { c } = useTheme();
  const styles = useStyles();
  // A glyph as well as colour, so the value never depends on colour alone.
  const text = status === 'yes' ? '− Yes' : status === 'no' ? '+ No' : 'Not stated';
  const color = status === 'yes' ? c.pointBad : status === 'no' ? c.pointGood : c.inkMuted;
  return (
    <View style={[styles.aiRow, last && styles.aiRowLast]}>
      <Text style={styles.aiLabel}>{label}</Text>
      <Text style={[status === 'not-stated' ? styles.aiStatusPlain : styles.aiStatus, { color }]}>{text}</Text>
    </View>
  );
}

export default function ServiceDetailScreen(): React.JSX.Element {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const store = useStore();
  const { c } = useTheme();
  const styles = useStyles();
  const { serviceId } = route.params;
  const [detail, setDetail] = useState<TosdrServiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    store
      .getServiceDetail(serviceId)
      .then((d) => {
        if (!cancelled) {
          setDetail(d);
          setError(d === null ? 'Could not load this service. Check your connection and retry.' : null);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('Could not load this service. Check your connection and retry.');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [serviceId, store]);

  const findings = useMemo(() => (detail ? findingsFromTosdr(approvedPoints(detail)) : []), [detail]);
  const lens = useMemo(() => (detail ? deriveAiLens(approvedPoints(detail)) : null), [detail]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={c.tint} />
      </View>
    );
  }

  if (error !== null || detail === null) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error ?? 'Service not found.'}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.identity}>
        <ServiceLogo name={detail.name} uri={detail.image ?? tosdrLogoUrl(detail.id)} size="md" />
        <View style={styles.identityText}>
          <Text style={styles.name} accessibilityRole="header" numberOfLines={1}>
            {detail.name}
          </Text>
          {detail.urls[0] !== undefined && <Text style={styles.url}>{detail.urls[0]}</Text>}
        </View>
      </View>

      <RiskHero grade={detail.rating} findings={findings} />

      <BreachCard urls={detail.urls} />

      <Breakdown
        findings={findings}
        afterTopics={
          lens !== null && (
            <Card>
              <CardTitle>AI</CardTitle>
              <View>
                <AiRow label="Trains AI on your data" status={lens.trainsOnUserData} />
                <AiRow label="Makes automated decisions" status={lens.automatedDecisions} />
                <AiRow label="Uses third-party AI models" status={lens.thirdPartyModels} last />
              </View>
              {lens.evidence.length > 0 && (
                <View style={styles.evidence}>
                  {[...new Set(lens.evidence.map((ev) => ev.pointTitle))].map((title) => (
                    <Text key={title} style={styles.evidenceText}>
                      {`From: ${title}`}
                    </Text>
                  ))}
                </View>
              )}
              <Text style={styles.hint}>Based only on this service's rated points. Anything they don't cover shows as Not stated.</Text>
            </Card>
          )
        }
      />

      <Button label={`Ask about ${detail.name}`} onPress={() => navigation.navigate('Chat', { serviceId: detail.id })} />
      <Text style={styles.credit}>
        {`Grade and points from ToS;DR · ${detail.is_comprehensively_reviewed ? 'fully reviewed' : 'partly reviewed'}`}
      </Text>
    </ScrollView>
  );
}

const useStyles = makeStyles(({ c }) => ({
  aiLabel: {
    ...type.bodySm,
    color: c.ink,
    flex: 1,
  },
  aiRow: {
    alignItems: 'center',
    borderBottomColor: c.line,
    borderBottomWidth: hairline,
    flexDirection: 'row',
    gap: space[3],
    minHeight: size.tapMin - 4,
  },
  aiRowLast: {
    borderBottomWidth: 0,
  },
  aiStatus: {
    ...type.bodySmBold,
  },
  aiStatusPlain: {
    ...type.bodySm,
  },
  center: {
    alignItems: 'center',
    backgroundColor: c.ground,
    flex: 1,
    justifyContent: 'center',
    padding: space[6],
  },
  content: {
    gap: space[3] + 2,
    paddingBottom: space[8],
    paddingHorizontal: space[3],
    paddingTop: space[2],
  },
  credit: {
    ...type.footnote,
    color: c.inkMuted,
    textAlign: 'center',
  },
  error: {
    ...type.body,
    color: c.ink,
    textAlign: 'center',
  },
  evidence: {
    gap: 2,
  },
  evidenceText: {
    ...type.meta,
    color: c.inkMuted,
  },
  hint: {
    ...type.footnote,
    color: c.inkMuted,
  },
  identity: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space[3],
    paddingHorizontal: space[1],
  },
  identityText: {
    flex: 1,
  },
  name: {
    ...type.title,
    color: c.ink,
  },
  screen: {
    backgroundColor: c.ground,
  },
  url: {
    ...type.meta,
    color: c.inkMuted,
  },
}));
