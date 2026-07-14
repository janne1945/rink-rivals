import { useMemo, useState } from "react";

import { gameCatalog, starterSquads } from "../../data/generated/gameCatalog";
import type { League } from "../../domain/cards";
import styles from "./AccountFlow.module.css";

interface StarterTeamScreenProps {
  readonly busy: boolean;
  readonly errorMessage: string;
  readonly displayName: string | null;
  readonly onClaim: (selectedTeamId: string) => Promise<void>;
  readonly onLogout: () => Promise<void>;
}

const LINEUP_SLOTS = ["LW", "C", "RW", "LD", "RD", "G"] as const;

const teamsById = new Map(gameCatalog.teams.map((team) => [team.id, team]));
const cardsById = new Map(gameCatalog.cards.map((card) => [card.id, card]));
const playersById = new Map(gameCatalog.players.map((player) => [player.id, player]));

const starterTeamOptions = starterSquads.flatMap((squad) => {
  const team = teamsById.get(squad.teamId);
  if (!team || !team.active) return [];
  const slots = LINEUP_SLOTS.flatMap((slot) => {
    const cardId = squad.lineup[slot];
    const card = cardsById.get(cardId);
    const player = card ? playersById.get(card.playerId) : undefined;
    return card && player ? [{ slot, card, player }] : [];
  });
  return slots.length === LINEUP_SLOTS.length
    ? [{ team, squad, slots }]
    : [];
}).sort((left, right) => left.team.name.localeCompare(right.team.name));

export function StarterTeamScreen({ busy, errorMessage, displayName, onClaim, onLogout }: StarterTeamScreenProps) {
  const [league, setLeague] = useState<League>("NHL");
  const [query, setQuery] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState(
    () => starterTeamOptions.find((option) => option.team.league === "NHL")?.team.id ?? starterTeamOptions[0]?.team.id ?? "",
  );

  const visibleTeams = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return starterTeamOptions.filter(({ team }) => (
      team.league === league
      && (!normalizedQuery || `${team.name} ${team.abbreviation}`.toLocaleLowerCase().includes(normalizedQuery))
    ));
  }, [league, query]);

  const selected = starterTeamOptions.find(({ team }) => team.id === selectedTeamId)
    ?? starterTeamOptions.find(({ team }) => team.league === league)
    ?? starterTeamOptions[0];

  function chooseLeague(nextLeague: League): void {
    setLeague(nextLeague);
    setQuery("");
    const nextTeam = starterTeamOptions.find(({ team }) => team.league === nextLeague);
    if (nextTeam) setSelectedTeamId(nextTeam.team.id);
  }

  return (
    <main className={styles.onboardingPage}>
      <header className={styles.onboardingHeader}>
        <div className={styles.brandLockup}><span className={styles.brandMark} aria-hidden="true">RR</span><span>Rink Rivals</span></div>
        <button className={styles.textButton} type="button" disabled={busy} onClick={() => void onLogout()}>Sign out</button>
      </header>

      <section className={styles.starterFlow} aria-labelledby="starter-heading">
        <div className={styles.starterIntro}>
          <p className={styles.eyebrow}>Welcome{displayName ? `, ${displayName}` : ""}</p>
          <h1 id="starter-heading">Choose your club</h1>
          <p className={styles.intro}>Pick any NHL or PWHL team. You’ll receive six balanced Starter cards and 1,000 Credits.</p>
          <div className={styles.starterExplanation}>
            <strong>Starter cards are entry editions</strong>
            <p>They are entry editions tuned below the full Base profiles. Floor cases may share 68 OVR, but their attributes remain weaker; the Base Market still gives you clear upgrades to chase.</p>
          </div>
        </div>

        <div className={styles.teamChooser}>
          <div className={styles.leagueTabs} role="group" aria-label="Choose a league">
            {(["NHL", "PWHL"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={league === value}
                disabled={busy}
                onClick={() => chooseLeague(value)}
              >
                {value}
              </button>
            ))}
          </div>

          <label className={styles.teamSearch}>
            <span>Search {league} teams</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search city or team"
            />
          </label>

          <div className={styles.teamList} role="list" aria-label={`${league} teams`}>
            {visibleTeams.map(({ team }) => (
              <div key={team.id} role="listitem">
                <button
                  className={styles.teamOption}
                  type="button"
                  aria-pressed={selected?.team.id === team.id}
                  disabled={busy}
                  onClick={() => setSelectedTeamId(team.id)}
                >
                  <span className={styles.teamMonogram} aria-hidden="true">{team.abbreviation}</span>
                  <span><strong>{team.name}</strong><small>{team.league} starter</small></span>
                  <span className={styles.teamOptionState}>{selected?.team.id === team.id ? "Selected" : "Preview"}</span>
                </button>
              </div>
            ))}
            {visibleTeams.length === 0 ? <p className={styles.noTeams}>No {league} teams match “{query}”.</p> : null}
          </div>
        </div>

        {selected ? (
          <article className={styles.teamPreview} aria-label={`${selected.team.name} starter preview`}>
            <div className={styles.teamHeading}>
              <span className={styles.teamMonogram} aria-hidden="true">{selected.team.abbreviation}</span>
              <div><h2>{selected.team.name}</h2><p>{selected.team.league} Circuit starter</p></div>
              <span className={styles.overallBadge}><strong>{selected.squad.averageOverall.toFixed(1)}</strong> AVG OVR</span>
            </div>

            <ul className={styles.starterRoster} aria-label="Six starter slots">
              {selected.slots.map(({ slot, card, player }) => (
                <li key={slot}>
                  <span className={styles.slotBadge}>{slot}</span>
                  <span><strong>{player.name}</strong><small>Starter edition · {player.primaryPosition}</small></span>
                  <span className={styles.slotOverall}>{card.overall}<small>OVR</small></span>
                </li>
              ))}
            </ul>

            <div className={styles.claimSummary}><strong>6 Starter Cards</strong><strong>1,000 Credits</strong></div>
            {errorMessage ? <p className={styles.error} role="alert">{errorMessage}</p> : null}
            <button
              className={styles.primaryButton}
              type="button"
              disabled={busy || !selected.team.id}
              onClick={() => void onClaim(selected.team.id)}
            >
              {busy ? "Building your club…" : `Choose ${selected.team.name}`}
            </button>
          </article>
        ) : (
          <p className={styles.error} role="alert">Starter team data is unavailable. Please try again later.</p>
        )}
      </section>
    </main>
  );
}
