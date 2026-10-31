import { getService, type TosdrServiceDetail } from '../api/tosdr';
import type { ChangeEntry, FollowedService, ServiceSnapshot } from './storage';

// Change detection: re-fetch every followed ToS;DR service and compare
// against the stored snapshot (updated_at, grade, and a hash of the point
// list). Anything that moved becomes an in-app change entry. This
// standalone version shows changes in the Change Feed screen only — it
// sends no push notifications, which would need a backend and APNs/FCM.

export function pointSignature(service: TosdrServiceDetail): string {
  const parts = service.points
    .map((p) => `${p.id}:${p.title}`)
    .sort()
    .join('|');
  let hash = 5381;
  for (let i = 0; i < parts.length; i++) {
    hash = ((hash << 5) + hash + parts.charCodeAt(i)) >>> 0;
  }
  return `${service.points.length}:${hash.toString(36)}`;
}

export function snapshotOf(service: TosdrServiceDetail): ServiceSnapshot {
  return { updatedAt: service.updated_at, grade: service.rating, pointSignature: pointSignature(service) };
}

export interface RefreshOutcome {
  changes: ChangeEntry[];
  snapshots: Record<string, ServiceSnapshot>;
  failures: { serviceName: string; error: string }[];
}

export async function refreshFollowed(
  follows: FollowedService[],
  snapshots: Record<string, ServiceSnapshot>,
): Promise<RefreshOutcome> {
  const changes: ChangeEntry[] = [];
  const nextSnapshots: Record<string, ServiceSnapshot> = { ...snapshots };
  const failures: RefreshOutcome['failures'] = [];
  const now = new Date().toISOString();

  for (const follow of follows) {
    if (follow.source !== 'tosdr' || follow.serviceId === null) {
      continue; // Direct checks have no ToS;DR snapshot to compare.
    }
    try {
      const detail = await getService(follow.serviceId);
      const previous = snapshots[String(follow.serviceId)];
      const next = snapshotOf(detail);
      if (!previous) {
        nextSnapshots[String(follow.serviceId)] = next;
        continue; // First snapshot is a baseline, not a change.
      }
      const detected: ChangeEntry[] = [];
      if (previous.grade !== next.grade) {
        detected.push({
          id: `${follow.serviceId}-grade-${Date.now()}`,
          serviceId: follow.serviceId,
          serviceName: follow.name,
          detectedAt: now,
          kind: 'grade-changed',
          summary: `Grade changed from ${previous.grade} to ${next.grade}.`,
        });
      }
      if (previous.pointSignature !== next.pointSignature) {
        const beforeCount = Number(previous.pointSignature.split(':')[0] ?? 0);
        const afterCount = detail.points.length;
        detected.push({
          id: `${follow.serviceId}-points-${Date.now()}`,
          serviceId: follow.serviceId,
          serviceName: follow.name,
          detectedAt: now,
          kind: afterCount > beforeCount ? 'points-added' : 'points-removed',
          summary:
            afterCount > beforeCount
              ? `${afterCount - beforeCount} new rated point(s) appeared.`
              : `${beforeCount - afterCount} rated point(s) were removed.`,
        });
      }
      if (previous.updatedAt !== next.updatedAt && detected.length === 0) {
        detected.push({
          id: `${follow.serviceId}-updated-${Date.now()}`,
          serviceId: follow.serviceId,
          serviceName: follow.name,
          detectedAt: now,
          kind: 'terms-updated',
          summary: 'ToS;DR updated this service, but its grade and point list look unchanged.',
        });
      }
      changes.push(...detected);
      nextSnapshots[String(follow.serviceId)] = next;
    } catch (err) {
      failures.push({
        serviceName: follow.name,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return { changes, snapshots: nextSnapshots, failures };
}
