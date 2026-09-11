import { describe, expect, it } from 'vitest';
import type { CardRow } from '@/db/schema';
import { matchCard, normalizeAccountName } from '@/lib/cards';

const card = (over: Partial<CardRow> = {}): CardRow => ({
  id: 1,
  slug: 'amex-bcp',
  name: 'Blue Cash Preferred',
  issuer: 'American Express',
  type: 'cashback',
  plaidAccountNames: ['Blue Cash Preferred®'],
  ratesVerifiedOn: '2026-09-07',
  ratesVerifiedSource: 'issuer terms',
  retiredAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

describe('normalizeAccountName', () => {
  it('lowercases, trims, and collapses whitespace', () => {
    expect(normalizeAccountName('  Blue  Cash   Preferred ')).toBe('blue cash preferred');
  });

  it('drops trademark glyphs and punctuation', () => {
    expect(normalizeAccountName('Blue Cash Preferred®')).toBe('blue cash preferred');
    expect(normalizeAccountName('Blue-Cash (Preferred)™')).toBe('blue cash preferred');
  });
});

describe('matchCard', () => {
  it('matches on name regardless of case, spacing, and glyphs', () => {
    const target = card();
    expect(matchCard([target], { name: 'blue cash preferred' })).toBe(target);
    expect(matchCard([target], { name: ' BLUE CASH  PREFERRED® ' })).toBe(target);
  });

  it('falls back to officialName when the display name drifted', () => {
    const target = card();
    expect(
      matchCard([target], { name: 'My Renamed Card', officialName: 'Blue Cash Preferred' }),
    ).toBe(target);
  });

  it('prefers a name match over an officialName match', () => {
    const byName = card({ id: 1, plaidAccountNames: ['Card A'] });
    const byOfficial = card({ id: 2, slug: 'other', name: 'Other', plaidAccountNames: ['Card B'] });
    expect(matchCard([byName, byOfficial], { name: 'Card A', officialName: 'Card B' })).toBe(
      byName,
    );
  });

  it('never matches a retired card', () => {
    expect(matchCard([card({ retiredAt: new Date() })], { name: 'Blue Cash Preferred®' })).toBe(
      null,
    );
  });

  it('returns null with no name, no candidates, or no match', () => {
    expect(matchCard([card()], { name: null })).toBe(null);
    expect(matchCard([card()], { name: '®' })).toBe(null);
    expect(matchCard([card()], { name: 'Sapphire Reserve' })).toBe(null);
  });
});
