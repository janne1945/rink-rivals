import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const NHL_SEASON_ID = 20252026;
const NHL_ROSTER_SEASON = 20262027;
const PWHL_LEAGUE_ID = 1;
const PWHL_ROSTER_SEASON_ID = 10;
const PWHL_STATS_SEASON_ID = 8;
const PWHL_FEED_URL = 'https://lscluster.hockeytech.com/feed/index.php';
const PWHL_DRAFT_URL = 'https://www.thepwhl.com/en/draft';
const PWHL_STATS_PAGE_URL = 'https://www.thepwhl.com/en/stats/player-stats/0/8?sort=points';
const NHL_BOSTON_DEPTH_SEARCH_URL = 'https://search.d3.nhle.com/api/v1/search/player?culture=en-us&limit=20&q=Michael%20DiPietro';
const NHL_BOSTON_ROSTER_CHANGES_URL = 'https://www.nhl.com/news/topic/team-resets/boston-bruins-roster-changes-for-2026-27-season';
const DEFAULT_OUTPUT = 'data/content/official-content-snapshot.json';

let discoveredPwhlKey: string | undefined;

type JsonRecord = Record<string, unknown>;

interface SnapshotTeam {
  readonly league: 'NHL' | 'PWHL';
  readonly sourceTeamId: string;
  readonly name: string;
  readonly abbreviation: string;
  readonly rosterSeason: string;
  readonly sourceUrl: string;
}

interface SnapshotRosterPlayer {
  readonly league: 'NHL' | 'PWHL';
  readonly sourcePlayerId: string;
  readonly sourceTeamId: string;
  readonly teamName: string;
  readonly teamAbbreviation: string;
  readonly name: string;
  readonly officialPosition: string;
  readonly shootsCatches: string | null;
  readonly birthDate: string | null;
  readonly birthCountry: string | null;
  readonly nationality: string | null;
  readonly sourceRosterStatus: 'active-roster';
  readonly sourceUrl: string;
}

interface SnapshotRosterCandidate {
  readonly league: 'NHL';
  readonly sourcePlayerId: string;
  readonly sourceTeamId: string;
  readonly teamName: string;
  readonly teamAbbreviation: string;
  readonly name: string;
  readonly officialPosition: 'G';
  readonly shootsCatches: string | null;
  readonly nationality: null;
  readonly sourceRosterStatus: 'roster-candidate';
  readonly requiresManualReview: true;
  readonly sourceUrls: readonly string[];
}

interface SnapshotStatLine {
  readonly league: 'NHL' | 'PWHL';
  readonly sourcePlayerId: string;
  readonly role: 'skater' | 'goalie';
  readonly gamesPlayed: number;
  readonly goals: number;
  readonly assists: number;
  readonly points: number;
  readonly plusMinus: number;
  readonly shots: number;
  readonly blocks: number;
  readonly hits: number;
  readonly gameWinningGoals: number;
  readonly averageTimeOnIceSeconds: number;
  readonly faceoffPercentage: number;
  readonly savePercentage: number;
  readonly goalsAgainstAverage: number;
  readonly shutouts: number;
  readonly wins: number;
  readonly sourceUrl: string;
}

interface SnapshotDraftRight {
  readonly league: 'PWHL';
  readonly draftYear: 2026;
  readonly overallPick: number;
  readonly sourceTeamName: string;
  readonly name: string;
  readonly officialName: string;
  readonly officialPosition: 'F' | 'D' | 'G';
  readonly previousTeam: string;
  readonly nationality: string;
  readonly sourceRosterStatus: 'rights';
  readonly requiresManualReview: true;
  readonly sourceUrl: string;
}

interface SnapshotLegacyPlayer {
  readonly league: 'PWHL';
  readonly sourcePlayerId: string;
  readonly sourceTeamId: string;
  readonly teamName: string;
  readonly name: string;
  readonly officialPosition: 'F' | 'D';
  readonly nationality: null;
  readonly sourceRosterStatus: 'legacy-retained';
  readonly requiresManualReview: true;
  readonly sourceUrl: string;
}

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`Expected ${label} to be an object.`);
  }
  return value as JsonRecord;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`Expected ${label} to be an array.`);
  return value;
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`Expected ${label} to be non-empty text.`);
  }
  return value.trim();
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function fetchText(url: string, attempt = 1): Promise<string> {
  const response = await fetch(url, {
    headers: { accept: 'application/json,text/html;q=0.9,*/*;q=0.8' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    if (attempt < 3 && response.status >= 500) return fetchText(url, attempt + 1);
    throw new Error(`Official source request failed (${response.status}): ${url}`);
  }
  return response.text();
}

async function fetchJson(url: string): Promise<unknown> {
  return JSON.parse(await fetchText(url)) as unknown;
}

function parseJsonp(source: string): unknown {
  const trimmed = source.trim();
  const json = trimmed.startsWith('(')
    ? trimmed.slice(1, trimmed.endsWith(');') ? -2 : -1)
    : trimmed;
  return JSON.parse(json) as unknown;
}

function discoverPwhlFeedKey(html: string): string {
  const key = html.match(/\bvar\s+appKey\s*=\s*['"]([a-f0-9]{16,64})['"]\s*;/i)?.[1];
  const clientCode = html.match(/\bvar\s+clientCode\s*=\s*['"]([^'"]+)['"]\s*;/i)?.[1];
  const productionUrl = html.match(/\bvar\s+prodUrl\s*=\s*['"]([^'"]+)['"]\s*;/i)?.[1];
  if (!key || clientCode !== 'pwhl' || productionUrl !== 'https://lscluster.hockeytech.com') {
    throw new Error('Official PWHL Stats page feed configuration changed; refusing to reuse a stale appKey.');
  }
  return key;
}

async function configurePwhlFeed(): Promise<void> {
  const discovered = discoverPwhlFeedKey(await fetchText(PWHL_STATS_PAGE_URL));
  const override = process.env.PWHL_APP_KEY_OVERRIDE;
  if (override !== undefined && !/^[a-f0-9]{16,64}$/i.test(override)) {
    throw new Error('PWHL_APP_KEY_OVERRIDE must be an explicit 16-64 character hexadecimal key.');
  }
  discoveredPwhlKey = override ?? discovered;
}

function pwhlUrl(view: string, parameters: Readonly<Record<string, string | number>>): string {
  if (!discoveredPwhlKey) throw new Error('PWHL feed key has not been discovered from the official Stats page.');
  const url = new URL(PWHL_FEED_URL);
  const common = {
    feed: 'statviewfeed',
    view,
    league: PWHL_LEAGUE_ID,
    league_id: PWHL_LEAGUE_ID,
    key: discoveredPwhlKey,
    client_code: 'pwhl',
    site_id: 0,
    lang: 'en',
  };
  for (const [key, value] of Object.entries({ ...common, ...parameters })) {
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function publicPwhlSourceUrl(fetchUrl: string): string {
  const url = new URL(fetchUrl);
  url.searchParams.delete('key');
  return url.toString();
}

async function mapConcurrent<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const result = new Array<R>(values.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      result[index] = await mapper(values[index], index);
    }
  });
  await Promise.all(workers);
  return result;
}

function localizedDefault(value: unknown, label: string): string {
  return text(record(value, label).default, `${label}.default`);
}

async function importNhl(): Promise<{
  teams: SnapshotTeam[];
  rosterPlayers: SnapshotRosterPlayer[];
  rosterCandidates: SnapshotRosterCandidate[];
  stats: SnapshotStatLine[];
  sources: string[];
}> {
  const standingsUrl = 'https://api-web.nhle.com/v1/standings/now';
  const teamDirectoryUrl = 'https://api.nhle.com/stats/rest/en/team';
  const [standingsPayload, teamDirectoryPayload] = await Promise.all([
    fetchJson(standingsUrl),
    fetchJson(teamDirectoryUrl),
  ]);
  const standings = record(standingsPayload, 'NHL standings');
  const teamDirectory = array(record(teamDirectoryPayload, 'NHL team directory').data, 'NHL team directory data')
    .map((entry) => record(entry, 'NHL team directory entry'));
  const teamsByAbbreviation = new Map<string, SnapshotTeam>();
  for (const rawStanding of array(standings.standings, 'NHL standings.standings')) {
    const standing = record(rawStanding, 'NHL standing');
    const abbreviation = localizedDefault(standing.teamAbbrev, 'teamAbbrev');
    const name = localizedDefault(standing.teamName, 'teamName');
    const matchingDirectoryRows = teamDirectory.filter((row) => row.fullName === name);
    if (matchingDirectoryRows.length !== 1) {
      throw new Error(`Expected one exact NHL team-directory match for ${name}, received ${matchingDirectoryRows.length}.`);
    }
    const sourceTeamIdNumber = numberValue(matchingDirectoryRows[0].id);
    if (!Number.isSafeInteger(sourceTeamIdNumber) || sourceTeamIdNumber <= 0) {
      throw new Error(`Official NHL team id is missing or invalid for ${name}.`);
    }
    const sourceTeamId = String(sourceTeamIdNumber);
    teamsByAbbreviation.set(abbreviation, {
      league: 'NHL',
      sourceTeamId,
      name,
      abbreviation,
      rosterSeason: String(NHL_ROSTER_SEASON),
      sourceUrl: standingsUrl,
    });
  }
  const teams = [...teamsByAbbreviation.values()].sort((left, right) => left.name.localeCompare(right.name));
  if (teams.length === 0) throw new Error('The official NHL active standings returned no teams.');
  if (new Set(teams.map(({ sourceTeamId }) => sourceTeamId)).size !== teams.length) {
    throw new Error('Official NHL team ids must be unique across the active standings set.');
  }

  const rosterGroups = await mapConcurrent(teams, 8, async (team) => {
    const sourceUrl = `https://api-web.nhle.com/v1/roster/${team.abbreviation}/${NHL_ROSTER_SEASON}`;
    const roster = record(await fetchJson(sourceUrl), `${team.name} roster`);
    const rows = [
      ...array(roster.forwards, `${team.name} forwards`),
      ...array(roster.defensemen, `${team.name} defensemen`),
      ...array(roster.goalies, `${team.name} goalies`),
    ];
    return rows.map((rawPlayer): SnapshotRosterPlayer => {
      const player = record(rawPlayer, `${team.name} roster player`);
      const firstName = localizedDefault(player.firstName, 'firstName');
      const lastName = localizedDefault(player.lastName, 'lastName');
      return {
        league: 'NHL',
        sourcePlayerId: String(numberValue(player.id)),
        sourceTeamId: team.sourceTeamId,
        teamName: team.name,
        teamAbbreviation: team.abbreviation,
        name: `${firstName} ${lastName}`,
        officialPosition: text(player.positionCode, 'positionCode'),
        shootsCatches: optionalText(player.shootsCatches),
        birthDate: optionalText(player.birthDate),
        birthCountry: optionalText(player.birthCountry),
        nationality: null,
        sourceRosterStatus: 'active-roster',
        sourceUrl,
      };
    });
  });
  const rosterPlayers = rosterGroups.flat();

  const skaterStatsUrl = new URL('https://api.nhle.com/stats/rest/en/skater/summary');
  const goalieStatsUrl = new URL('https://api.nhle.com/stats/rest/en/goalie/summary');
  for (const url of [skaterStatsUrl, goalieStatsUrl]) {
    url.searchParams.set('isAggregate', 'false');
    url.searchParams.set('isGame', 'false');
    url.searchParams.set('start', '0');
    url.searchParams.set('limit', '-1');
    url.searchParams.set('cayenneExp', `seasonId=${NHL_SEASON_ID} and gameTypeId=2`);
  }
  const [rawSkaterStats, rawGoalieStats] = await Promise.all([
    fetchJson(skaterStatsUrl.toString()),
    fetchJson(goalieStatsUrl.toString()),
  ]);
  const rosterIds = new Set(rosterPlayers.map(({ sourcePlayerId }) => sourcePlayerId));
  const rawGoalieRows = array(record(rawGoalieStats, 'NHL goalie stats').data, 'NHL goalie data')
    .map((entry) => record(entry, 'NHL goalie stat'));
  const rosterCandidates: SnapshotRosterCandidate[] = [];
  if (!rosterIds.has('8480022')) {
    const [depthSearchPayload, rosterChangesHtml] = await Promise.all([
      fetchJson(NHL_BOSTON_DEPTH_SEARCH_URL),
      fetchText(NHL_BOSTON_ROSTER_CHANGES_URL),
    ]);
    const depthSearchRows = array(depthSearchPayload, 'NHL player search')
      .map((entry) => record(entry, 'NHL player search entry'));
    const depthSearch = depthSearchRows.find((entry) => String(entry.playerId) === '8480022');
    const depthStat = rawGoalieRows.find((entry) => String(entry.playerId) === '8480022');
    const boston = teams.find((team) => team.abbreviation === 'BOS');
    if (!depthSearch || !depthStat || !boston
      || depthSearch.name !== 'Michael DiPietro'
      || String(depthSearch.teamId) !== boston.sourceTeamId
      || depthSearch.teamAbbrev !== 'BOS'
      || depthSearch.positionCode !== 'G'
      || depthSearch.active !== true
      || !rosterChangesHtml.includes('Michael DiPietro')) {
      throw new Error('Official NHL Boston backup-goalie evidence changed; refusing to infer roster depth.');
    }
    rosterCandidates.push({
      league: 'NHL', sourcePlayerId: '8480022', sourceTeamId: boston.sourceTeamId,
      teamName: boston.name, teamAbbreviation: boston.abbreviation,
      name: 'Michael DiPietro', officialPosition: 'G',
      shootsCatches: optionalText(depthStat.shootsCatches), nationality: null,
      sourceRosterStatus: 'roster-candidate', requiresManualReview: true,
      sourceUrls: [NHL_BOSTON_DEPTH_SEARCH_URL, NHL_BOSTON_ROSTER_CHANGES_URL, goalieStatsUrl.toString()],
    });
  }
  const includedIds = new Set([...rosterIds, ...rosterCandidates.map(({ sourcePlayerId }) => sourcePlayerId)]);
  const stats: SnapshotStatLine[] = [];
  for (const rawStat of array(record(rawSkaterStats, 'NHL skater stats').data, 'NHL skater data')) {
    const stat = record(rawStat, 'NHL skater stat');
    const sourcePlayerId = String(numberValue(stat.playerId));
    if (!includedIds.has(sourcePlayerId)) continue;
    stats.push({
      league: 'NHL', sourcePlayerId, role: 'skater',
      gamesPlayed: numberValue(stat.gamesPlayed), goals: numberValue(stat.goals),
      assists: numberValue(stat.assists), points: numberValue(stat.points),
      plusMinus: numberValue(stat.plusMinus), shots: numberValue(stat.shots),
      blocks: 0, hits: 0, gameWinningGoals: numberValue(stat.gameWinningGoals),
      averageTimeOnIceSeconds: numberValue(stat.timeOnIcePerGame),
      faceoffPercentage: numberValue(stat.faceoffWinPct), savePercentage: 0,
      goalsAgainstAverage: 0, shutouts: 0, wins: 0,
      sourceUrl: skaterStatsUrl.toString(),
    });
  }
  for (const stat of rawGoalieRows) {
    const sourcePlayerId = String(numberValue(stat.playerId));
    if (!includedIds.has(sourcePlayerId)) continue;
    stats.push({
      league: 'NHL', sourcePlayerId, role: 'goalie',
      gamesPlayed: numberValue(stat.gamesPlayed), goals: 0, assists: numberValue(stat.assists),
      points: numberValue(stat.points), plusMinus: 0, shots: 0, blocks: 0, hits: 0,
      gameWinningGoals: 0, averageTimeOnIceSeconds: 0, faceoffPercentage: 0,
      savePercentage: numberValue(stat.savePct),
      goalsAgainstAverage: numberValue(stat.goalsAgainstAverage),
      shutouts: numberValue(stat.shutouts), wins: numberValue(stat.wins),
      sourceUrl: goalieStatsUrl.toString(),
    });
  }
  return {
    teams, rosterPlayers, rosterCandidates, stats,
    sources: [standingsUrl, teamDirectoryUrl, skaterStatsUrl.toString(), goalieStatsUrl.toString(), NHL_BOSTON_DEPTH_SEARCH_URL, NHL_BOSTON_ROSTER_CHANGES_URL],
  };
}

function pwhlRows(payload: unknown, label: string): JsonRecord[] {
  const root = Array.isArray(payload) ? record(payload[0], `${label}[0]`) : record(payload, label);
  const sectionsContainer = Array.isArray(root.roster) ? record(root.roster[0], `${label}.roster[0]`) : root;
  const sections = array(sectionsContainer.sections, `${label}.sections`);
  return sections.flatMap((rawSection) => {
    const section = record(rawSection, `${label} section`);
    return array(section.data, `${label} section data`).map((entry) => record(record(entry, 'PWHL entry').row, 'PWHL row'));
  });
}

function decodeHtml(value: string): string {
  const named: Readonly<Record<string, string>> = {
    amp: '&', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
    eacute: 'é', Eacute: 'É', auml: 'ä', ouml: 'ö', uuml: 'ü', Aring: 'Å', aring: 'å',
  };
  return value
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-zA-Z]+);/g, (match, entity: string) => named[entity] ?? match);
}

function cellText(value: string): string {
  return decodeHtml(value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function withoutNickname(name: string): string {
  return name.replace(/\s*["“][^"”]+["”]\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseDraftRights(html: string): SnapshotDraftRight[] {
  const heading = html.indexOf('FINAL 2026 PWHL DRAFT ORDER OF SELECTION');
  const tableEnd = html.indexOf('</table>', heading);
  if (heading < 0 || tableEnd < 0) throw new Error('Official PWHL draft results table was not found.');
  const table = html.slice(heading, tableEnd);
  const rows = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].slice(1);
  const rights = rows.flatMap((match): SnapshotDraftRight[] => {
    const cells = [...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => cellText(cell[1]));
    if (cells.length !== 6) return [];
    const overallPick = Number(cells[0].split('|').at(-1)?.trim());
    const officialPosition = cells[3];
    if (!Number.isSafeInteger(overallPick) || !['F', 'D', 'G'].includes(officialPosition)) return [];
    return [{
      league: 'PWHL', draftYear: 2026, overallPick,
      sourceTeamName: cells[1].replace(/\s+\(via [^)]+\)$/i, '').trim(),
      name: withoutNickname(cells[2]), officialName: cells[2],
      officialPosition: officialPosition as 'F' | 'D' | 'G',
      previousTeam: cells[4], nationality: cells[5],
      sourceRosterStatus: 'rights', requiresManualReview: true,
      sourceUrl: PWHL_DRAFT_URL,
    }];
  });
  if (rights.length === 0
    || rights.some((right, index) => right.overallPick !== index + 1)) {
    throw new Error('Official PWHL draft rights must form a non-empty, contiguous overall-pick sequence.');
  }
  return rights.sort((left, right) => left.overallPick - right.overallPick);
}

async function importPwhl(): Promise<{
  teams: SnapshotTeam[];
  rosterPlayers: SnapshotRosterPlayer[];
  stats: SnapshotStatLine[];
  draftRights: SnapshotDraftRight[];
  legacyPlayers: SnapshotLegacyPlayer[];
  sources: string[];
}> {
  const teamsUrl = pwhlUrl('teamsForSeason', { season: PWHL_ROSTER_SEASON_ID });
  const teamsPayload = record(parseJsonp(await fetchText(teamsUrl)), 'PWHL teams');
  const teams = array(teamsPayload.teamsNoAll, 'PWHL teamsNoAll').map((rawTeam): SnapshotTeam => {
    const team = record(rawTeam, 'PWHL team');
    const sourceTeamId = text(team.id, 'PWHL team id');
    const name = text(team.name, 'PWHL team name');
    const abbreviation = text(team.team_code, 'PWHL team code');
    return {
      league: 'PWHL', sourceTeamId, name, abbreviation,
      rosterSeason: '2026-27 Pre-Season',
      sourceUrl: publicPwhlSourceUrl(pwhlUrl('roster', { team_id: sourceTeamId, season_id: PWHL_ROSTER_SEASON_ID })),
    };
  }).sort((left, right) => left.name.localeCompare(right.name));
  if (teams.length === 0) throw new Error('The official PWHL season feed returned no active teams.');
  if (new Set(teams.map(({ sourceTeamId }) => sourceTeamId)).size !== teams.length) {
    throw new Error('Official PWHL team ids must be unique across the active season set.');
  }

  const rosterGroups = await mapConcurrent(teams, 6, async (team) => {
    const rosterFetchUrl = pwhlUrl('roster', {
      team_id: team.sourceTeamId,
      season_id: PWHL_ROSTER_SEASON_ID,
    });
    const payload = parseJsonp(await fetchText(rosterFetchUrl));
    return pwhlRows(payload, `${team.name} roster`).map((row): SnapshotRosterPlayer => ({
      league: 'PWHL',
      sourcePlayerId: text(row.player_id, 'PWHL player id'),
      sourceTeamId: team.sourceTeamId,
      teamName: team.name,
      teamAbbreviation: team.abbreviation,
      name: text(row.name, 'PWHL player name'),
      officialPosition: text(row.position, 'PWHL position'),
      shootsCatches: optionalText(row.shoots),
      birthDate: optionalText(row.birthdate),
      birthCountry: null,
      nationality: null,
      sourceRosterStatus: 'active-roster',
      sourceUrl: publicPwhlSourceUrl(rosterFetchUrl),
    }));
  });
  const rosterPlayers = rosterGroups.flat();

  const profileRows = await mapConcurrent(rosterPlayers, 8, async (player) => {
    const fetchUrl = pwhlUrl('player', {
      player_id: player.sourcePlayerId,
      season: PWHL_ROSTER_SEASON_ID,
    });
    const payload = record(parseJsonp(await fetchText(fetchUrl)), `${player.name} profile`);
    const info = record(payload.info, `${player.name} profile info`);
    const nationality = info.nationality && typeof info.nationality === 'object'
      ? optionalText(record(info.nationality, 'PWHL nationality').name)
      : null;
    return {
      playerId: player.sourcePlayerId,
      nationality,
      officialPosition: optionalText(info.position),
      shootsCatches: optionalText(info.shoots) ?? optionalText(info.catches),
      sourceUrl: publicPwhlSourceUrl(fetchUrl),
    };
  });
  const profileById = new Map(profileRows.map((profile) => [profile.playerId, profile]));
  const rosterWithProfiles = rosterPlayers.map((player): SnapshotRosterPlayer => {
    const profile = profileById.get(player.sourcePlayerId);
    return {
      ...player,
      nationality: profile?.nationality ?? null,
      officialPosition: profile?.officialPosition ?? player.officialPosition,
      shootsCatches: profile?.shootsCatches ?? player.shootsCatches,
      sourceUrl: profile ? `${player.sourceUrl} | ${profile.sourceUrl}` : player.sourceUrl,
    };
  });

  const skaterStatsFetchUrl = pwhlUrl('players', {
    season: PWHL_STATS_SEASON_ID, team: 'all', position: 'skaters', rookies: 'no',
    statsType: 'standard', sort: 'points', limit: 1000,
  });
  const goalieStatsFetchUrl = pwhlUrl('players', {
    season: PWHL_STATS_SEASON_ID, team: 'all', position: 'goalies', rookies: 'no',
    statsType: 'standard', sort: 'gaa', limit: 1000,
  });
  const [skaterPayload, goaliePayload] = await Promise.all([
    fetchText(skaterStatsFetchUrl).then(parseJsonp),
    fetchText(goalieStatsFetchUrl).then(parseJsonp),
  ]);
  const skaterStatsUrl = publicPwhlSourceUrl(skaterStatsFetchUrl);
  const goalieStatsUrl = publicPwhlSourceUrl(goalieStatsFetchUrl);
  const rosterIds = new Set(rosterWithProfiles.map(({ sourcePlayerId }) => sourcePlayerId));
  const stats: SnapshotStatLine[] = [];
  const legacyNames = new Set(['Kendall Coyne Schofield', 'Claire Thompson']);
  const legacyPlayers: SnapshotLegacyPlayer[] = [];
  for (const row of pwhlRows(skaterPayload, 'PWHL skater stats')) {
    const sourcePlayerId = text(row.player_id, 'PWHL stat player id');
    const name = text(row.name, 'PWHL stat player name');
    const isLegacyRetained = legacyNames.has(name);
    if (!rosterIds.has(sourcePlayerId) && !isLegacyRetained) continue;
    if (isLegacyRetained) {
      const teamCode = text(row.team_code, 'PWHL legacy team code');
      const team = teams.find((candidate) => candidate.abbreviation === teamCode);
      if (!team) throw new Error(`Legacy-retained player ${name} references unknown PWHL team code ${teamCode}.`);
      legacyPlayers.push({
        league: 'PWHL', sourcePlayerId, sourceTeamId: team.sourceTeamId,
        teamName: team.name, name,
        officialPosition: text(row.position, 'PWHL legacy position') as 'F' | 'D',
        nationality: null, sourceRosterStatus: 'legacy-retained',
        requiresManualReview: true, sourceUrl: skaterStatsUrl,
      });
    }
    const [minutes = '0', seconds = '0'] = String(row.ice_time_per_game_avg ?? '0:0').split(':');
    stats.push({
      league: 'PWHL', sourcePlayerId, role: 'skater',
      gamesPlayed: numberValue(row.games_played), goals: numberValue(row.goals),
      assists: numberValue(row.assists), points: numberValue(row.points),
      plusMinus: numberValue(row.plus_minus), shots: numberValue(row.shots),
      blocks: numberValue(row.shots_blocked_by_player), hits: numberValue(row.hits),
      gameWinningGoals: 0,
      averageTimeOnIceSeconds: numberValue(minutes) * 60 + numberValue(seconds),
      faceoffPercentage: numberValue(row.faceoff_pct) / 100,
      savePercentage: 0, goalsAgainstAverage: 0, shutouts: 0, wins: 0,
      sourceUrl: skaterStatsUrl,
    });
  }
  for (const row of pwhlRows(goaliePayload, 'PWHL goalie stats')) {
    const sourcePlayerId = text(row.player_id, 'PWHL goalie id');
    if (!rosterIds.has(sourcePlayerId)) continue;
    stats.push({
      league: 'PWHL', sourcePlayerId, role: 'goalie',
      gamesPlayed: numberValue(row.games_played), goals: 0, assists: numberValue(row.assists),
      points: numberValue(row.assists), plusMinus: 0, shots: 0, blocks: 0, hits: 0,
      gameWinningGoals: 0, averageTimeOnIceSeconds: 0, faceoffPercentage: 0,
      savePercentage: numberValue(row.save_percentage),
      goalsAgainstAverage: numberValue(row.goals_against_average),
      shutouts: numberValue(row.shutouts), wins: numberValue(row.wins),
      sourceUrl: goalieStatsUrl,
    });
  }

  const draftRights = parseDraftRights(await fetchText(PWHL_DRAFT_URL));
  if (legacyPlayers.length !== 2) {
    throw new Error(`Expected two official-stat legacy identities, received ${legacyPlayers.length}.`);
  }
  return {
    teams, rosterPlayers: rosterWithProfiles, stats, draftRights, legacyPlayers,
    sources: [publicPwhlSourceUrl(teamsUrl), skaterStatsUrl, goalieStatsUrl, PWHL_DRAFT_URL],
  };
}

async function atomicWrite(path: string, value: unknown): Promise<void> {
  const target = resolve(path);
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

function outputPath(args: readonly string[]): string {
  const index = args.indexOf('--output');
  if (index < 0) return DEFAULT_OUTPUT;
  const value = args[index + 1];
  if (!value) throw new Error('--output requires a path.');
  return value;
}

async function main(): Promise<void> {
  const output = outputPath(process.argv.slice(2));
  await configurePwhlFeed();
  const [nhl, pwhl] = await Promise.all([importNhl(), importPwhl()]);
  const snapshot = {
    metadata: {
      schemaVersion: 1,
      snapshotDate: new Date().toISOString().slice(0, 10),
      retrievedAt: new Date().toISOString(),
      nhlRosterSeason: String(NHL_ROSTER_SEASON),
      nhlStatsSeason: String(NHL_SEASON_ID),
      pwhlRosterSeason: '2026-27 Pre-Season',
      pwhlStatsSeason: '2025-26 Regular Season',
      disclaimer: 'Official-source development snapshot. PWHL draft rights are not active-roster claims and require manual review.',
      sources: [PWHL_STATS_PAGE_URL, ...nhl.sources, ...pwhl.sources],
    },
    teams: [...nhl.teams, ...pwhl.teams],
    rosterPlayers: [...nhl.rosterPlayers, ...pwhl.rosterPlayers],
    rosterCandidates: nhl.rosterCandidates,
    stats: [...nhl.stats, ...pwhl.stats],
    draftRights: pwhl.draftRights,
    legacyPlayers: pwhl.legacyPlayers,
  };
  await atomicWrite(output, snapshot);
  console.log(`Official snapshot written to ${resolve(output)}.`);
  console.log(`Teams: ${nhl.teams.length} NHL + ${pwhl.teams.length} PWHL.`);
  console.log(`Current roster rows: ${nhl.rosterPlayers.length} NHL + ${pwhl.rosterPlayers.length} PWHL; draft rights: ${pwhl.draftRights.length}.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
