import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
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
import { approvedPoints, type TosdrServiceDetail } from '../api/tosdr';
import { answerQuestion, SUGGESTED_QUESTIONS, type ChatAnswer } from '../services/chat';
import { askLlmChat, isLlmChatConfigured } from '../services/llmChat';
import { useStore } from '../state/store';
import { Chip, Note } from '../components/ui';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'Chat'>;

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  answer?: ChatAnswer;
}

export default function ChatScreen(): React.JSX.Element {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const store = useStore();
  const [serviceId, setServiceId] = useState<number | undefined>(route.params.serviceId);
  const [detail, setDetail] = useState<TosdrServiceDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const backendConfigured = isLlmChatConfigured();
  const [fallbackNote, setFallbackNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const tosdrFollows = useMemo(
    () => store.follows.filter((f) => f.source === 'tosdr' && f.serviceId !== null),
    [store.follows],
  );

  useEffect(() => {
    if (serviceId === undefined && tosdrFollows.length > 0) {
      setServiceId(tosdrFollows[0].serviceId ?? undefined);
    }
  }, [serviceId, tosdrFollows]);

  useEffect(() => {
    if (serviceId === undefined) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void store.getServiceDetail(serviceId).then((d) => {
      if (!cancelled) {
        setDetail(d);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [serviceId, store]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (trimmed === '' || detail === null || busy) {
      return;
    }
    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: 'user', text: trimmed }]);
    setQuestion('');
    setFallbackNote(null);
    if (backendConfigured) {
      setBusy(true);
      try {
        const result = await askLlmChat(trimmed, detail.name, approvedPoints(detail));
        const quotes = result.citations.map((c) => ({
          pointTitle: c.pointTitle,
          caseTitle: 'Cited from rated points',
          analysis: c.quote,
          source: c.source,
          classification: '',
        }));
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            text: result.answer,
            answer: { verdict: 'answered', text: result.answer, quotes },
          },
        ]);
      } catch {
        // Backend unreachable or errored: fall back to on-device matching
        // and say so, rather than failing the question outright.
        const answer = answerQuestion(trimmed, approvedPoints(detail));
        setFallbackNote('Chat backend unreachable — answered on-device from rated points.');
        setMessages((prev) => [
          ...prev,
          { id: `a-${Date.now()}`, role: 'assistant', text: answer.text, answer },
        ]);
      } finally {
        setBusy(false);
      }
      return;
    }
    const answer = answerQuestion(trimmed, approvedPoints(detail));
    setMessages((prev) => [
      ...prev,
      { id: `a-${Date.now()}`, role: 'assistant', text: answer.text, answer },
    ]);
  };

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.picker}>
        {tosdrFollows.map((follow) => (
          <Chip
            key={follow.serviceId}
            label={follow.name}
            selected={serviceId === follow.serviceId}
            onPress={() => {
              setServiceId(follow.serviceId ?? undefined);
              setMessages([]);
            }}
          />
        ))}
      </ScrollView>

      {tosdrFollows.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Follow a service first.</Text>
          <Text style={styles.emptySub}>The chat answers from a service&apos;s rated ToS;DR points, so it needs one to talk about.</Text>
          <TouchableOpacity style={styles.addButton} onPress={() => navigation.navigate('AddApps')}>
            <Text style={styles.addButtonText}>+ Add apps</Text>
          </TouchableOpacity>
        </View>
      ) : loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
        </View>
      ) : detail === null ? (
        <View style={styles.center}>
          <Text style={styles.error}>Could not load this service&apos;s points.</Text>
        </View>
      ) : (
        <>
          <Note>
            Answers come only from this service&apos;s rated ToS;DR points, quoted below. Information only — not legal advice.
          </Note>
          <Text style={styles.modeLine}>
            {backendConfigured
              ? 'Chat backend connected — answers are grounded in the rated points.'
              : 'No chat backend configured — answering on-device from rated points.'}
          </Text>
          {fallbackNote !== null && <Text style={styles.fallbackNote}>{fallbackNote}</Text>}
          <FlatList
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messages}
            renderItem={({ item }) =>
              item.role === 'user' ? (
                <View style={styles.userBubble}>
                  <Text style={styles.userText}>{item.text}</Text>
                </View>
              ) : (
                <View style={styles.assistantBubble}>
                  <Text style={styles.assistantText}>{item.text}</Text>
                  {item.answer?.quotes.map((quote, i) => (
                    <View key={`${quote.pointTitle}-${i}`} style={styles.quote}>
                      <Text style={styles.quoteTitle}>{quote.pointTitle}</Text>
                      <Text style={styles.quoteCase}>{quote.caseTitle}</Text>
                      {quote.analysis !== '' && <Text style={styles.quoteAnalysis}>{quote.analysis}</Text>}
                      {quote.source !== '' && (
                        <TouchableOpacity onPress={() => void Linking.openURL(quote.source)}>
                          <Text style={styles.sourceLink}>Source ↗</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                </View>
              )
            }
          />
          <View style={styles.suggestions}>
            {SUGGESTED_QUESTIONS.map((q) => (
              <TouchableOpacity key={q} style={styles.suggestion} onPress={() => void send(q)}>
                <Text style={styles.suggestionText}>{q}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Ask about this service…"
              value={question}
              onChangeText={setQuestion}
              onSubmitEditing={() => void send(question)}
              returnKeyType="send"
            />
            <TouchableOpacity
              style={[styles.sendButton, busy ? styles.sendButtonBusy : undefined]}
              onPress={() => void send(question)}
              disabled={busy}
            >
              <Text style={styles.sendText}>{busy ? '…' : 'Send'}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  addButton: {
    alignItems: 'center',
    backgroundColor: '#101828',
    borderRadius: 10,
    marginTop: 12,
    paddingVertical: 12,
    width: '100%',
  },
  addButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  assistantBubble: {
    alignSelf: 'stretch',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    marginBottom: 10,
    padding: 12,
  },
  assistantText: {
    fontSize: 14,
    lineHeight: 20,
  },
  center: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  container: {
    flex: 1,
    padding: 16,
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
    fontSize: 18,
    fontWeight: '700',
  },
  error: {
    color: '#dc2626',
    fontSize: 14,
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inputRow: {
    flexDirection: 'row',
    marginTop: 8,
  },
  messages: {
    paddingBottom: 8,
  },
  picker: {
    flexGrow: 0,
    marginBottom: 8,
  },
  quote: {
    borderTopColor: '#e2e8f0',
    borderTopWidth: 1,
    marginTop: 8,
    paddingTop: 8,
  },
  quoteAnalysis: {
    color: '#475569',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  quoteCase: {
    color: '#64748b',
    fontSize: 12,
  },
  quoteTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  sendButton: {
    backgroundColor: '#101828',
    borderRadius: 10,
    justifyContent: 'center',
    marginLeft: 8,
    paddingHorizontal: 16,
  },
  sendText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  sendButtonBusy: {
    opacity: 0.6,
  },
  modeLine: {
    color: '#64748b',
    fontSize: 12,
    marginBottom: 4,
  },
  fallbackNote: {
    color: '#b45309',
    fontSize: 12,
    marginBottom: 4,
  },
  sourceLink: {
    color: '#1d4ed8',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  suggestion: {
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 6,
    marginRight: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  suggestionText: {
    fontSize: 12,
  },
  suggestions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#101828',
    borderRadius: 12,
    marginBottom: 10,
    maxWidth: '85%',
    padding: 12,
  },
  userText: {
    color: '#ffffff',
    fontSize: 14,
  },
});
