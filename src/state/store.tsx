import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getService, type TosdrServiceDetail } from '../api/tosdr';
import { normalizeSiteUrl, runDirectCheck, type DirectCheckResult } from '../api/directCheck';
import { refreshFollowed } from '../services/changeFeed';
import {
  storage,
  type ChangeEntry,
  type FollowedService,
  type ServiceSnapshot,
  type Settings,
} from '../services/storage';

interface StoreValue {
  ready: boolean;
  follows: FollowedService[];
  concerns: string[];
  settings: Settings;
  changes: ChangeEntry[];
  unreadChanges: number;
  directChecks: Record<string, DirectCheckResult>;
  // Direct checks running in the background (memory only: a reload drops them).
  pendingChecks: Record<string, PendingCheck>;
  serviceCache: Record<number, TosdrServiceDetail>;
  followService: (service: Omit<FollowedService, 'addedAt'>) => void;
  unfollowService: (key: string) => void;
  isFollowing: (serviceId: number) => boolean;
  toggleConcern: (concernId: string) => void;
  setAlertsEnabled: (enabled: boolean) => void;
  getServiceDetail: (serviceId: number) => Promise<TosdrServiceDetail | null>;
  refreshAll: () => Promise<{ newChanges: number; failures: string[] }>;
  saveDirectCheck: (result: DirectCheckResult) => void;
  /**
   * Start a direct check in the background and return its id right away.
   * Pass `id` to re-check an existing entry in place (keeps follows linked).
   */
  startDirectCheck: (name: string, siteUrl: string, opts?: { id?: string; fresh?: boolean }) => string;
  markChangesRead: () => void;
}

export interface PendingCheck {
  id: string;
  name: string;
  siteUrl: string; // normalized, e.g. https://example.com
  startedAt: string;
  error?: string; // set when the check failed; the entry stays until retried
}

const StoreContext = createContext<StoreValue | null>(null);

export function followKey(follow: FollowedService): string {
  return follow.source === 'tosdr' ? `tosdr:${follow.serviceId}` : `direct:${follow.directCheckId}`;
}

export function StoreProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [ready, setReady] = useState(false);
  const [follows, setFollows] = useState<FollowedService[]>([]);
  const [concerns, setConcerns] = useState<string[]>([]);
  const [settings, setSettings] = useState<Settings>({ alertsEnabled: true });
  const [changes, setChanges] = useState<ChangeEntry[]>([]);
  const [unreadChanges, setUnreadChanges] = useState(0);
  const [directChecks, setDirectChecks] = useState<Record<string, DirectCheckResult>>({});
  const [pendingChecks, setPendingChecks] = useState<Record<string, PendingCheck>>({});
  const [serviceCache, setServiceCache] = useState<Record<number, TosdrServiceDetail>>({});

  useEffect(() => {
    (async () => {
      const [f, c, s, ch, dc] = await Promise.all([
        storage.loadFollows(),
        storage.loadConcerns(),
        storage.loadSettings(),
        storage.loadChanges(),
        storage.loadDirectChecks(),
      ]);
      setFollows(f);
      setConcerns(c);
      setSettings(s);
      setChanges(ch);
      setDirectChecks(dc);
      setReady(true);
    })();
  }, []);

  const followService = useCallback((service: Omit<FollowedService, 'addedAt'>) => {
    setFollows((prev) => {
      const key = service.source === 'tosdr' ? `tosdr:${service.serviceId}` : `direct:${service.directCheckId}`;
      if (prev.some((f) => followKey(f) === key)) {
        return prev;
      }
      const next = [...prev, { ...service, addedAt: new Date().toISOString() }];
      void storage.saveFollows(next);
      return next;
    });
  }, []);

  const unfollowService = useCallback((key: string) => {
    setFollows((prev) => {
      const next = prev.filter((f) => followKey(f) !== key);
      void storage.saveFollows(next);
      return next;
    });
  }, []);

  const isFollowing = useCallback(
    (serviceId: number) => follows.some((f) => f.source === 'tosdr' && f.serviceId === serviceId),
    [follows],
  );

  const toggleConcern = useCallback((concernId: string) => {
    setConcerns((prev) => {
      const next = prev.includes(concernId) ? prev.filter((c) => c !== concernId) : [...prev, concernId];
      void storage.saveConcerns(next);
      return next;
    });
  }, []);

  const setAlertsEnabled = useCallback((enabled: boolean) => {
    setSettings((prev) => {
      const next = { ...prev, alertsEnabled: enabled };
      void storage.saveSettings(next);
      return next;
    });
  }, []);

  const getServiceDetail = useCallback(
    async (serviceId: number): Promise<TosdrServiceDetail | null> => {
      if (serviceCache[serviceId]) {
        return serviceCache[serviceId];
      }
      try {
        const detail = await getService(serviceId);
        setServiceCache((prev) => ({ ...prev, [serviceId]: detail }));
        return detail;
      } catch {
        return null;
      }
    },
    [serviceCache],
  );

  const refreshAll = useCallback(async () => {
    const snapshots: Record<string, ServiceSnapshot> = await storage.loadSnapshots();
    const outcome = await refreshFollowed(follows, snapshots);
    await storage.saveSnapshots(outcome.snapshots);
    if (outcome.changes.length > 0) {
      setChanges((prev) => {
        const next = [...outcome.changes, ...prev].slice(0, 200);
        void storage.saveChanges(next);
        return next;
      });
      setUnreadChanges((n) => n + outcome.changes.length);
    }
    return {
      newChanges: outcome.changes.length,
      failures: outcome.failures.map((f) => `${f.serviceName}: ${f.error}`),
    };
  }, [follows]);

  const saveDirectCheck = useCallback((result: DirectCheckResult) => {
    setDirectChecks((prev) => {
      const next = { ...prev, [result.id]: result };
      void storage.saveDirectChecks(next);
      return next;
    });
  }, []);

  const startDirectCheck = useCallback(
    (name: string, siteUrlInput: string, opts: { id?: string; fresh?: boolean } = {}): string => {
      const siteUrl = normalizeSiteUrl(siteUrlInput); // throws on a bad address
      const id = opts.id ?? `direct-${Date.now()}`;
      setPendingChecks((prev) => ({
        ...prev,
        [id]: { id, name: name.trim(), siteUrl, startedAt: new Date().toISOString() },
      }));
      void (async () => {
        try {
          const result = { ...(await runDirectCheck(name, siteUrl, { fresh: opts.fresh })), id };
          setDirectChecks((prev) => {
            const next = { ...prev, [id]: result };
            void storage.saveDirectChecks(next);
            return next;
          });
          // A followed entry shows the new grade on the dashboard.
          setFollows((prev) => {
            if (!prev.some((f) => f.directCheckId === id)) {
              return prev;
            }
            const next = prev.map((f) =>
              f.directCheckId === id ? { ...f, rating: result.rating?.grade ?? 'UNRATED' } : f,
            );
            void storage.saveFollows(next);
            return next;
          });
          setPendingChecks((prev) => {
            const { [id]: _done, ...rest } = prev;
            return rest;
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Direct check failed.';
          setPendingChecks((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], error: message } } : prev));
        }
      })();
      return id;
    },
    [],
  );

  const markChangesRead = useCallback(() => setUnreadChanges(0), []);

  const value = useMemo<StoreValue>(
    () => ({
      ready,
      follows,
      concerns,
      settings,
      changes,
      unreadChanges,
      directChecks,
      pendingChecks,
      serviceCache,
      followService,
      unfollowService,
      isFollowing,
      toggleConcern,
      setAlertsEnabled,
      getServiceDetail,
      refreshAll,
      saveDirectCheck,
      startDirectCheck,
      markChangesRead,
    }),
    [
      ready,
      follows,
      concerns,
      settings,
      changes,
      unreadChanges,
      directChecks,
      pendingChecks,
      serviceCache,
      followService,
      unfollowService,
      isFollowing,
      toggleConcern,
      setAlertsEnabled,
      getServiceDetail,
      refreshAll,
      saveDirectCheck,
      startDirectCheck,
      markChangesRead,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) {
    throw new Error('useStore must be used inside StoreProvider');
  }
  return ctx;
}
