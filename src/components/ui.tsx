import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { gradeColor } from '../utils/grades';

export function GradeBadge({ grade, large = false }: { grade: string; large?: boolean }): React.JSX.Element {
  return (
    <View
      style={[
        styles.gradeBadge,
        { backgroundColor: gradeColor(grade), width: large ? 44 : 32, height: large ? 44 : 32 },
      ]}
    >
      <Text style={[styles.gradeText, { fontSize: large ? 20 : 15 }]}>{grade.toUpperCase()}</Text>
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.chip, selected ? styles.chipSelected : styles.chipPlain]}
    >
      <Text style={[styles.chipText, selected ? styles.chipTextSelected : undefined]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function Note({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <View style={styles.note}>
      <Text style={styles.noteText}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 8,
    marginRight: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipPlain: {
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
  },
  chipSelected: {
    backgroundColor: '#101828',
    borderColor: '#101828',
  },
  chipText: {
    color: '#334155',
    fontSize: 13,
  },
  chipTextSelected: {
    color: '#ffffff',
  },
  gradeBadge: {
    alignItems: 'center',
    borderRadius: 8,
    justifyContent: 'center',
  },
  gradeText: {
    color: '#ffffff',
    fontWeight: '800',
  },
  note: {
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    marginVertical: 8,
    padding: 12,
  },
  noteText: {
    color: '#475569',
    fontSize: 13,
    lineHeight: 19,
  },
  sectionTitle: {
    color: '#101828',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 16,
  },
});
