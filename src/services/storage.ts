import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DirectCheckResult } from '../api/directCheck';

// Local persistence. Everything is stored on-device with AsyncStorage;
// nothing about the user's followed apps ever leaves the phone except the
// ToS;DR API requests for the services themselves (and direct checks,
// which fetch the service's own public pages).

export interface FollowedService {
  serviceId: number | null; // null for direct-check entries
  name: string;
  slug: string;
  rating: string; // grade letter, "N/A", or "UNRATED" for direct checks
  source: 'tosdr' | 'direct';
  addedAt: string; // ISO timestamp
  directCheckId?: string;
}

export interface Settings {
  alertsEnabled: boolean;
}

export interface ServiceSnapshot {
  updatedAt: string;
  grade: string;
  pointSignature: string; // hash of sorted point ids + titles
}

export interface ChangeEntry {
  id: string;
  serviceId: number;
  serviceName: string;
  detectedAt: string; // ISO timestamp
  kind: 'grade-changed' | 'points-added' | 'points-removed' | 'terms-updated';
  summary: string;
}

const KEYS = {
  follows: '@tosdr/follows',
  concerns: '@tosdr/concerns',
  settings: '@tosdr/settings',
  snapshots: '@tosdr/snapshots',
  changes: '@tosdr/changes',
  directChecks: '@tosdr/directChecks',
};

async function loadJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function saveJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage failures must not crash the app; the in-memory state survives.
  }
}

export const storage = {
  loadFollows: () => loadJson<FollowedService[]>(KEYS.follows, []),
  saveFollows: (v: FollowedService[]) => saveJson(KEYS.follows, v),
  loadConcerns: () => loadJson<string[]>(KEYS.concerns, []),
  saveConcerns: (v: string[]) => saveJson(KEYS.concerns, v),
  loadSettings: () => loadJson<Settings>(KEYS.settings, { alertsEnabled: true }),
  saveSettings: (v: Settings) => saveJson(KEYS.settings, v),
  loadSnapshots: () => loadJson<Record<string, ServiceSnapshot>>(KEYS.snapshots, {}),
  saveSnapshots: (v: Record<string, ServiceSnapshot>) => saveJson(KEYS.snapshots, v),
  loadChanges: () => loadJson<ChangeEntry[]>(KEYS.changes, []),
  saveChanges: (v: ChangeEntry[]) => saveJson(KEYS.changes, v),
  loadDirectChecks: () => loadJson<Record<string, DirectCheckResult>>(KEYS.directChecks, {}),
  saveDirectChecks: (v: Record<string, DirectCheckResult>) => saveJson(KEYS.directChecks, v),
};
