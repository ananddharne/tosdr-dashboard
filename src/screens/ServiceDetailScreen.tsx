import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/types';
import { approvedPoints, type TosdrPoint, type TosdrServiceDetail } from '../api/tosdr';
import { CONCERNS, filterPointsByConcerns } from '../utils/concerns';
import { deriveAiLens, type AiStatus } from '../utils/grades';
import { useStore } from '../state/store';
import { Button, Chip, ChipRow, ClauseQuote, GradeBadge, Note, SectionTitle } from '../components/ui';
import { ServiceLogo } from '../components/ServiceLogo';
import { tosdrLogoUrl } from '../utils/logos';
import { hairline, makeStyles, radius, size, space, type, useTheme } from '../theme';

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
  const [selectedConcerns, setSelectedConcerns] = useState<string[]>([]);

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

  const points = useMemo(() => {
    if (!detail) {
      return [];
    }
    return filterPointsByConcerns(approvedPoints(detail), selectedConcerns);
  }, [detail, selectedConcerns]);

  const lens = useMemo(() => (detail ? deriveAiLens(approvedPoints(detail)) : null), [detail]);

  const toggleConcern = (id: string) => {
    setSelectedConcerns((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  };

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

  const renderPoint = ({ item }: { item: TosdrPoint }) => (
    <View style={styles.pointWrap}>
      <ClauseQuote
        classification={item.case.classification}
        kicker={item.case.title.trim() !== item.title.trim() ? item.case.title : undefined}
        title={item.title}
        body={/^generated through the annotate view\.?$/i.test(item.analysis.trim()) ? undefined : item.analysis}
        sourceLabel={item.source !== '' ? 'Source' : undefined}
        onPressSource={item.source !== '' ? () => void Linking.openURL(item.source) : undefined}
      />
    </View>
  );

  return (
    <FlatList
      style={styles.screen}
      data={points}
      keyExtractor={(item) => String(item.id)}
      ListHeaderComponent={
        <View style={styles.header}>
          <View style={styles.identity}>
            <ServiceLogo name={detail.name} uri={detail.image ?? tosdrLogoUrl(detail.id)} size="lg" />
            <View style={styles.identityText}>
              <Text style={styles.name} accessibilityRole="header">
                {detail.name}
              </Text>
              {detail.urls[0] !== undefined && <Text style={styles.url}>{detail.urls[0]}</Text>}
            </View>
            <GradeBadge grade={detail.rating} large />
          </View>
          <Text style={styles.gradeLine}>
            {`ToS;DR grade ${detail.rating} · ${detail.is_comprehensively_reviewed ? 'fully reviewed' : 'partly reviewed'}`}
          </Text>

          <SectionTitle>AI practices</SectionTitle>
          {lens !== null && (
            <View style={styles.aiCard}>
              <AiRow label="Trains AI on your data" status={lens.trainsOnUserData} />
              <AiRow label="Makes automated decisions" status={lens.automatedDecisions} />
              <AiRow label="Uses third-party AI models" status={lens.thirdPartyModels} last />
            </View>
          )}
          {lens !== null && lens.evidence.length > 0 && (
            <View style={styles.evidence}>
              {[...new Set(lens.evidence.map((ev) => ev.pointTitle))].map((title) => (
                <Text key={title} style={styles.evidenceText}>
                  {`From: ${title}`}
                </Text>
              ))}
            </View>
          )}
          <Text style={styles.hint}>Based only on this service's rated points. Anything they don't cover shows as Not stated.</Text>

          <Button
            label="Ask about this service"
            onPress={() => navigation.navigate('Chat', { serviceId: detail.id })}
            style={styles.askButton}
          />

          <SectionTitle>{`What the terms say · ${points.length}`}</SectionTitle>
          <ChipRow>
            {CONCERNS.map((concern) => (
              <Chip
                key={concern.id}
                label={concern.label}
                selected={selectedConcerns.includes(concern.id)}
                onPress={() => toggleConcern(concern.id)}
              />
            ))}
          </ChipRow>
          <View style={styles.gap} />
          {points.length === 0 && <Note>No approved points match the concerns you picked.</Note>}
        </View>
      }
      renderItem={renderPoint}
      contentContainerStyle={styles.listContent}
    />
  );
}

const useStyles = makeStyles(({ c }) => ({
  aiCard: {
    backgroundColor: c.surface,
    borderRadius: radius.md,
    paddingLeft: space[4],
  },
  aiLabel: {
    ...type.body,
    color: c.ink,
    flex: 1,
  },
  aiRow: {
    alignItems: 'center',
    borderBottomColor: c.line,
    borderBottomWidth: hairline,
    flexDirection: 'row',
    gap: space[3],
    minHeight: size.tapMin,
    paddingRight: space[4],
    paddingVertical: space[2],
  },
  aiRowLast: {
    borderBottomWidth: 0,
  },
  aiStatus: {
    ...type.headline,
  },
  aiStatusPlain: {
    ...type.body,
  },
  askButton: {
    marginTop: space[6],
  },
  center: {
    alignItems: 'center',
    backgroundColor: c.ground,
    flex: 1,
    justifyContent: 'center',
    padding: space[6],
  },
  error: {
    ...type.body,
    color: c.ink,
    textAlign: 'center',
  },
  evidence: {
    gap: 2,
    marginLeft: space[4],
    marginTop: space[2],
  },
  evidenceText: {
    ...type.meta,
    color: c.inkMuted,
  },
  gap: {
    height: space[3],
  },
  gradeLine: {
    ...type.bodySm,
    color: c.inkMuted,
    marginTop: space[3],
  },
  header: {
    paddingHorizontal: space[4],
    paddingTop: space[2],
  },
  hint: {
    ...type.footnote,
    color: c.inkMuted,
    marginHorizontal: space[4],
    marginTop: space[2],
  },
  identity: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
  },
  identityText: {
    flex: 1,
    gap: 2,
  },
  listContent: {
    paddingBottom: space[8],
  },
  name: {
    ...type.title,
    color: c.ink,
  },
  pointWrap: {
    paddingHorizontal: space[4],
  },
  screen: {
    backgroundColor: c.ground,
  },
  url: {
    ...type.meta,
    color: c.inkMuted,
  },
}));
