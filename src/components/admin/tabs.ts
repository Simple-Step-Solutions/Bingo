/**
 * Admin navigation, named after the job rather than the subsystem.
 *
 * The old tabs were Admin Menu, Game Master, Chamber Manager, Seasons,
 * Analytics and Audit. Nobody setting the game up for the first time can guess
 * that prizes live in Game Master, businesses in Chamber Manager and dates in
 * Seasons. These are ordered the way the work actually happens.
 */
export type AdminTab =
  | 'setup'
  | 'businesses'
  | 'game'
  | 'people'
  | 'prizes'
  | 'reports'
  | 'activity';

export const ADMIN_TABS: { id: AdminTab; label: string; short: string; blurb: string }[] = [
  { id: 'setup', label: 'Setup', short: 'Setup', blurb: 'Branding, towns and categories. Start here.' },
  { id: 'businesses', label: 'Businesses', short: 'Shops', blurb: 'Add member businesses and print their posters.' },
  { id: 'game', label: 'Game', short: 'Game', blurb: 'The season, its dates, board size and prizes.' },
  { id: 'people', label: 'People', short: 'People', blurb: 'Accounts, roles and invite links.' },
  { id: 'prizes', label: 'Prizes', short: 'Prizes', blurb: 'Bingo winners, the raffle draw and who has collected.' },
  { id: 'reports', label: 'Reports', short: 'Reports', blurb: 'Players, visits and the numbers for your board.' },
  { id: 'activity', label: 'Activity', short: 'Activity', blurb: 'Who changed what, and anything that looks like cheating.' },
];

/**
 * Old `?tab=` values still arrive from the chamber tour, from bookmarks and
 * from links pasted into chamber email threads. Map them rather than dropping
 * people on a default tab with no explanation.
 */
const LEGACY_TABS: Record<string, AdminTab> = {
  admin: 'people',
  master: 'game',
  chamber: 'businesses',
  events: 'game',
  analytics: 'reports',
  audit: 'activity',
};

export const resolveTab = (raw: string | null): AdminTab | null => {
  if (!raw) return null;
  if (ADMIN_TABS.some(t => t.id === raw)) return raw as AdminTab;
  return LEGACY_TABS[raw] ?? null;
};
