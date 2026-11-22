import type { FollowedService } from '../services/storage';
import type { DirectCheckResult } from '../api/directCheck';

// Where a service's logo comes from. See src/components/ServiceLogo.tsx
// for the fallback rules and why third-party favicon services are not used.

/** ToS;DR hosts a logo for every service it lists, keyed by service id. */
export function tosdrLogoUrl(serviceId: number): string {
  return `https://logos.tosdr.org/${serviceId}.png`;
}

/** Logo URL for a followed service, or undefined to show the lettered tile. */
export function logoForFollow(
  follow: FollowedService,
  directChecks: Record<string, DirectCheckResult>,
): string | undefined {
  if (follow.source === 'tosdr' && follow.serviceId !== null) {
    return tosdrLogoUrl(follow.serviceId);
  }
  if (follow.directCheckId) {
    return directChecks[follow.directCheckId]?.iconUrl;
  }
  return undefined;
}
