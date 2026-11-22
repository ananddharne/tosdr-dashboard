import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/types';
import { approvedPoints, type TosdrServiceDetail } from '../api/tosdr';
import { answerQuestion, SUGGESTED_QUESTIONS, type ChatAnswer } from '../services/chat';
import { askLlmChat, isLlmChatConfigured } from '../services/llmChat';
import { useStore } from '../state/store';
import { Button, Chip, Note, TextField, webInteractive, type PressState } from '../components/ui';
import { makeStyles, radius, space, type, useTheme } from '../theme';

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
  const { c } = useTheme();
  const styles = useStyles();
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
      {tosdrFollows.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.picker}
          contentContainerStyle={styles.pickerContent}
        >
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
      )}

      {tosdrFollows.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Follow an app first</Text>
          <Text style={styles.emptyText}>
            Answers come from an app's rated ToS;DR points, so pick an app to ask about.
          </Text>
          <Button label="Add apps" onPress={() => navigation.navigate('AddApps')} />
        </View>
      ) : loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={c.tint} />
        </View>
      ) : detail === null ? (
        <View style={styles.center}>
          <Text style={styles.error}>Couldn't load this app's points. Check your connection and try again.</Text>
        </View>
      ) : (
        <>
          <View style={styles.inset}>
            <Text style={styles.modeLine}>
              {backendConfigured
                ? 'Answers are written from the rated points and cite them.'
                : 'Answers quote the closest rated points, matched on this phone.'}
            </Text>
            {fallbackNote !== null && <Text style={styles.fallbackNote}>{fallbackNote}</Text>}
          </View>
          <FlatList
            style={styles.messageList}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messages}
            ListEmptyComponent={
              <Note title={`Ask about ${detail.name}`}>
                Answers come only from its rated ToS;DR points, quoted in full. Information only, not legal advice.
              </Note>
            }
            renderItem={({ item }) =>
              item.role === 'user' ? (
                <View style={styles.userBubble}>
                  <Text style={styles.userText}>{item.text}</Text>
                </View>
              ) : (
                <View style={styles.answer}>
                  <Text style={styles.answerText}>{item.text}</Text>
                  {item.answer?.quotes.map((quote, i) => (
                    <View key={`${quote.pointTitle}-${i}`} style={styles.quote}>
                      <Text style={styles.quoteTitle}>{quote.pointTitle}</Text>
                      <Text style={styles.quoteCase}>{quote.caseTitle}</Text>
                      {quote.analysis !== '' && <Text style={styles.quoteAnalysis}>{quote.analysis}</Text>}
                      {quote.source !== '' && (
                        <Pressable
                          onPress={() => void Linking.openURL(quote.source)}
                          accessibilityRole="link"
                          style={webInteractive}
                        >
                          {(state) => (
                            <Text style={[styles.sourceLink, (state as PressState).hovered && styles.sourceLinkHovered]}>
                              Source ↗
                            </Text>
                          )}
                        </Pressable>
                      )}
                    </View>
                  ))}
                  {!item.text.includes('not legal advice') && (
                    <Text style={styles.disclaimer}>Information only, not legal advice.</Text>
                  )}
                </View>
              )
            }
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.suggestions}
            contentContainerStyle={styles.pickerContent}
          >
            {SUGGESTED_QUESTIONS.map((q) => (
              <Chip key={q} label={q} selected={false} onPress={() => void send(q)} />
            ))}
          </ScrollView>
          <View style={styles.inputRow}>
            <TextField
              style={styles.input}
              placeholder={`Ask about ${detail.name}`}
              value={question}
              onChangeText={setQuestion}
              onSubmitEditing={() => void send(question)}
              returnKeyType="send"
              accessibilityLabel="Your question"
            />
            <Button label={busy ? 'Asking…' : 'Ask'} onPress={() => void send(question)} disabled={busy} />
          </View>
        </>
      )}
    </View>
  );
}

const useStyles = makeStyles(({ c }) => ({
  answer: {
    alignSelf: 'stretch',
    backgroundColor: c.surface,
    borderRadius: radius.md,
    gap: space[2],
    marginBottom: space[3],
    padding: space[4],
  },
  answerText: {
    ...type.body,
    color: c.ink,
  },
  center: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: space[6],
  },
  container: {
    backgroundColor: c.ground,
    flex: 1,
    paddingTop: space[3],
  },
  disclaimer: {
    ...type.meta,
    color: c.inkMuted,
  },
  empty: {
    backgroundColor: c.surfaceSunk,
    borderRadius: radius.lg,
    gap: space[3],
    margin: space[4],
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
  error: {
    ...type.body,
    color: c.ink,
    textAlign: 'center',
  },
  fallbackNote: {
    ...type.bodySmBold,
    color: c.pointBad,
  },
  input: {
    flex: 1,
  },
  inputRow: {
    backgroundColor: c.ground,
    borderTopColor: c.line,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: space[2],
    padding: space[4],
  },
  inset: {
    paddingHorizontal: space[4],
    paddingTop: space[2],
  },
  messageList: {
    flex: 1,
  },
  messages: {
    padding: space[4],
  },
  modeLine: {
    ...type.meta,
    color: c.inkMuted,
  },
  picker: {
    flexGrow: 0,
  },
  pickerContent: {
    gap: space[2],
    paddingHorizontal: space[4],
  },
  quote: {
    backgroundColor: c.surfaceSunk,
    borderRadius: radius.md,
    gap: 2,
    padding: space[3],
  },
  quoteAnalysis: {
    ...type.bodySm,
    color: c.ink,
  },
  quoteCase: {
    ...type.meta,
    color: c.inkMuted,
  },
  quoteTitle: {
    ...type.bodySmBold,
    color: c.ink,
  },
  sourceLinkHovered: {
    color: c.tintHover,
  },
  sourceLink: {
    ...type.meta,
    color: c.link,
    marginTop: space[1],
    textDecorationLine: 'underline',
  },
  suggestions: {
    flexGrow: 0,
    paddingBottom: space[2],
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: c.tint,
    borderRadius: radius.xl,
    borderBottomRightRadius: radius.sm,
    marginBottom: space[3],
    maxWidth: '85%',
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  userText: {
    ...type.body,
    color: c.onTint,
  },
}));
