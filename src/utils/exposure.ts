import { isRedFlag, type Finding } from './findings';

// "What your apps can do to you": plain-language groups of ToS;DR cases,
// shown as bars on the dashboard and topics on an app's page. Like
// concerns.ts, matching is transparent keyword matching against the case
// title and point title (lowercase, case-insensitive), and only red flags
// (bad or blocker) count. A finding can match more than one item.

export interface ExposureItem {
  id: string;
  label: string;
  keywords: string[];
}

export interface ExposureGroup {
  id: string;
  title: string;
  items: ExposureItem[];
}

export const EXPOSURE_GROUPS: ExposureGroup[] = [
  {
    id: 'data',
    title: 'Your data',
    items: [
      { id: 'share', label: 'Sell or share your data', keywords: ['sell', 'sold', 'third part', 'share your', 'shares your', 'shared with', 'broker'] },
      { id: 'track', label: 'Track you on other sites', keywords: ['track', 'fingerprint', 'cookie', 'beacon', 'pixel'] },
      { id: 'ai', label: 'Train AI on your data', keywords: ['ai training', 'artificial intelligence', 'machine learning', 'ai model', 'train'] },
      { id: 'location', label: 'Collect your location', keywords: ['location', 'gps'] },
      { id: 'biometric', label: 'Collect biometrics', keywords: ['biometric', 'facial', 'face recogn', 'voiceprint', 'faceprint'] },
      { id: 'messages', label: 'Read your messages', keywords: ['private message', 'read your', 'your messages', 'your communications'] },
    ],
  },
  {
    id: 'account',
    title: 'Your content and account',
    items: [
      { id: 'licence', label: 'Use your content as they like', keywords: ['licen', 'copyright', 'rights to your content', 'your content', 'intellectual property'] },
      { id: 'retain', label: 'Keep data after you leave', keywords: ['retain', 'retention', 'not really deleted', 'after deletion', 'undefined period', 'kept', 'keeps'] },
      { id: 'terminate', label: 'Close your account at will', keywords: ['delete your account', 'terminat', 'suspend', 'without prior notice'] },
      { id: 'identity', label: 'Demand your real identity', keywords: ['real name', 'legal name', 'identity', 'government id', 'phone number'] },
    ],
  },
  {
    id: 'rights',
    title: 'Your rights',
    items: [
      { id: 'changes', label: 'Change terms without telling you', keywords: ['changed any time', 'without notice', 'terms may be changed', 'change the terms', 'modify the terms', 'amend'] },
      { id: 'classaction', label: 'Block class actions', keywords: ['class action'] },
      { id: 'arbitration', label: 'Force private arbitration', keywords: ['arbitration'] },
      { id: 'liability', label: 'Dodge responsibility', keywords: ['liabil', 'indemnif', 'hold harmless', 'as is', 'warrant'] },
    ],
  },
];

export const EXPOSURE_ITEMS: ExposureItem[] = EXPOSURE_GROUPS.flatMap((g) => g.items);

export function findingMatches(finding: Finding, item: ExposureItem): boolean {
  const haystack = `${finding.caseTitle} ${finding.title}`.toLowerCase();
  return item.keywords.some((kw) => haystack.includes(kw));
}

/** The red flags among `findings` that match `item`. */
export function redFlagsFor(findings: Finding[], item: ExposureItem): Finding[] {
  return findings.filter((f) => isRedFlag(f) && findingMatches(f, item));
}
