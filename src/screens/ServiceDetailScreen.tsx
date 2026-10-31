import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/types';
import { approvedPoints, type TosdrPoint, type TosdrServiceDetail } from '../api/tosdr';
import { CONCERNS, filterPointsByConcerns } from '../utils/concerns';
import { classificationColor, deriveAiLens, type AiStatus } from '../utils/grades';
import { useStore } from '../state/store';
import { Chip, GradeBadge, Note, SectionTitle } from '../components/ui';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'ServiceDetail'>;

function AiRow({ label, status }: { label: string; status: AiStatus }): React.JSX.Element {
  const text = status === 'yes' ? 'Yes' : status === 'no' ? 'No' : 'Not stated';
  const color = status === 'yes' ? '#dc2626' : status === 'no' ? '#15803d' : '#64748b';
  return (
    <View style={styles.aiRow}>
      <Text style={styles.aiLabel}>{label}</Text>
      <Text style={[styles.aiStatus, { color }]}>{text}</Text>
    </View>
  );
}

export default function ServiceDetailScreen(): React.JSX.Element {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const store = useStore();
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
        <ActivityIndicator size="large" />
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
    <View style={styles.pointCard}>
      <View style={styles.pointHeader}>
        <Text style={[styles.classification, { color: classificationColor(item.case.classification) }]}>
          {item.case.classification.toUpperCase()}
        </Text>
        <Text style={styles.caseTitle}>{item.case.title}</Text>
      </View>
      <Text style={styles.pointTitle}>{item.title}</Text>
      {item.analysis !== '' && <Text style={styles.analysis}>{item.analysis}</Text>}
      {item.source !== '' && (
        <TouchableOpacity onPress={() => void Linking.openURL(item.source)}>
          <Text style={styles.sourceLink}>Source ↗</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <FlatList
      data={points}
      keyExtractor={(item) => String(item.id)}
      ListHeaderComponent={
        <View style={styles.header}>
          <View style={styles.gradeRow}>
            <GradeBadge grade={detail.rating} large />
            <View style={styles.gradeTextWrap}>
              <Text style={styles.gradeLabel}>ToS;DR grade</Text>
              <Text style={styles.gradeValue}>{detail.rating}</Text>
            </View>
            <View style={styles.gradeTextWrap}>
              <Text style={styles.gradeLabel}>Reviewed</Text>
              <Text style={styles.gradeValue}>{detail.is_comprehensively_reviewed ? 'Full' : 'Partial'}</Text>
            </View>
          </View>
          {detail.urls[0] !== undefined && <Text style={styles.url}>{detail.urls[0]}</Text>}

          <SectionTitle>AI lens</SectionTitle>
          <Text style={styles.hint}>
            Derived only from this service&apos;s rated points. Anything not covered by a point shows as “Not stated”.
          </Text>
          {lens !== null && (
            <View style={styles.aiCard}>
              <AiRow label="Trains on your data" status={lens.trainsOnUserData} />
              <AiRow label="Automated decisions" status={lens.automatedDecisions} />
              <AiRow label="Third-party AI models" status={lens.thirdPartyModels} />
              {lens.evidence.map((ev, i) => (
                <Text key={`${ev.field}-${i}`} style={styles.evidence}>
                  • {ev.pointTitle} ({ev.caseTitle})
                </Text>
              ))}
            </View>
          )}

          <TouchableOpacity
            style={styles.chatButton}
            onPress={() => navigation.navigate('Chat', { serviceId: detail.id })}
          >
            <Text style={styles.chatButtonText}>Ask about this service</Text>
          </TouchableOpacity>

          <SectionTitle>Points ({points.length})</SectionTitle>
          <Text style={styles.hint}>Filter by concern. No selection shows all approved points.</Text>
          <View style={styles.chipRow}>
            {CONCERNS.map((concern) => (
              <Chip
                key={concern.id}
                label={concern.label}
                selected={selectedConcerns.includes(concern.id)}
                onPress={() => toggleConcern(concern.id)}
              />
            ))}
          </View>
          {points.length === 0 && (
            <Note>No approved points match the selected concerns for this service.</Note>
          )}
        </View>
      }
      renderItem={renderPoint}
      contentContainerStyle={styles.listContent}
    />
  );
}

const styles = StyleSheet.create({
  aiCard: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
  },
  aiLabel: {
    fontSize: 14,
  },
  aiRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  aiStatus: {
    fontSize: 14,
    fontWeight: '700',
  },
  analysis: {
    color: '#475569',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  caseTitle: {
    color: '#64748b',
    flex: 1,
    fontSize: 12,
  },
  center: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  chatButton: {
    alignItems: 'center',
    backgroundColor: '#101828',
    borderRadius: 10,
    marginTop: 12,
    paddingVertical: 12,
  },
  chatButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  classification: {
    fontSize: 12,
    fontWeight: '800',
    marginRight: 8,
  },
  error: {
    color: '#dc2626',
    fontSize: 14,
    textAlign: 'center',
  },
  evidence: {
    color: '#475569',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  gradeLabel: {
    color: '#64748b',
    fontSize: 12,
  },
  gradeRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  gradeTextWrap: {
    marginLeft: 12,
  },
  gradeValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  header: {
    padding: 16,
  },
  hint: {
    color: '#64748b',
    fontSize: 12,
    marginBottom: 8,
  },
  listContent: {
    paddingBottom: 24,
  },
  pointCard: {
    backgroundColor: '#ffffff',
    borderBottomColor: '#e2e8f0',
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  pointHeader: {
    flexDirection: 'row',
  },
  pointTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 4,
  },
  sourceLink: {
    color: '#1d4ed8',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 6,
  },
  url: {
    color: '#64748b',
    fontSize: 13,
    marginTop: 8,
  },
});
