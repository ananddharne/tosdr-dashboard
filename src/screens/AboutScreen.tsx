import React from 'react';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { TOSDR_API_BASE, TOSDR_SITE } from '../api/tosdr';
import { appInventory } from '../services/appInventory';
import { SectionTitle } from '../components/ui';

// About screen. Carries the attribution the ToS;DR licence requires:
// grades and points are ToS;DR data (CC BY-SA 3.0), and this app is an
// independent client, not affiliated with ToS;DR.

export default function AboutScreen(): React.JSX.Element {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>ToS;DR Dashboard</Text>
      <Text style={styles.body}>
        A personalized dashboard for the terms of the apps and sites you actually use. Follow services, see their grades
        worst-first, filter by the concerns you care about, check each service&apos;s AI practices, ask questions grounded
        in its rated points, and watch for changes.
      </Text>

      <SectionTitle>Data &amp; attribution</SectionTitle>
      <Text style={styles.body}>
        Service grades and points come from Terms of Service; Didn&apos;t Read (ToS;DR), fetched live from its public API.
        ToS;DR data is published under CC BY-SA 3.0. This app is an independent client and is not affiliated with,
        endorsed by, or connected to ToS;DR.
      </Text>
      <TouchableOpacity onPress={() => void Linking.openURL(TOSDR_SITE)}>
        <Text style={styles.link}>{TOSDR_SITE} ↗</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => void Linking.openURL(TOSDR_API_BASE)}>
        <Text style={styles.link}>{TOSDR_API_BASE} ↗</Text>
      </TouchableOpacity>

      <SectionTitle>Direct checks</SectionTitle>
      <Text style={styles.body}>
        Services ToS;DR does not rate yet can be fetched directly: the app reads the service&apos;s own terms and privacy
        pages and quotes them verbatim. Direct-check results are labelled “Unrated · direct check” and are not ToS;DR
        grades.
      </Text>

      <SectionTitle>Your apps on this device</SectionTitle>
      <Text style={styles.body}>{`Current source: ${appInventory.sourceLabel}. iOS cannot list installed apps, so iOS always uses manual adding. On Android, a native build can plug automatic detection into src/services/appInventory.ts (QUERY_ALL_PACKAGES, which needs a Google Play Permissions Declaration Form).`}</Text>

      <SectionTitle>Important notes</SectionTitle>
      <Text style={styles.body}>
        Everything here is information only, not legal advice, and reading it is not a replacement for reading the terms
        themselves. Grades can lag the latest terms: the change feed shows when ToS;DR&apos;s record for a followed service
        moves.
      </Text>

      <Text style={styles.version}>Version 0.1.0 · Standalone starter</Text>
      <View style={styles.spacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: {
    color: '#334155',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 8,
  },
  container: {
    padding: 16,
    paddingBottom: 32,
  },
  link: {
    color: '#1d4ed8',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  spacer: {
    height: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 8,
  },
  version: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 16,
  },
});
