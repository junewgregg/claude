// Game mode configuration and match/tournament setup.

const GAME_MODES = {
  ffa8: { id: 'ffa8', name: '8-Player Free-for-All', teamSize: 1, teamCount: 8, zone: false, duration: 120, respawnDelay: 5, desc: 'Every fighter for themself. Whoever has the most kills when the 2-minute clock runs out wins. Fall in battle and you respawn a few seconds later.' },
  br4v4: { id: 'br4v4', name: '4v4 Battle Royale', teamSize: 4, teamCount: 2, zone: true, duration: 120, respawnDelay: 5, desc: 'Two squads of four. The storm closes in — the team with the most kills after 2 minutes wins. Fallen fighters respawn a few seconds later.' },
  br2222: { id: 'br2222', name: '2v2v2v2 Battle Royale', teamSize: 2, teamCount: 4, zone: true, duration: 120, respawnDelay: 5, desc: 'Four duos fight it out as the storm shrinks the arena. Most team kills when the 2-minute clock hits zero takes it. You respawn a few seconds after going down.' },
  tournament: { id: 'tournament', name: '4v4 16-Team Tournament', teamSize: 4, teamCount: 2, zone: true, duration: 120, respawnDelay: 5, desc: 'A single-elimination bracket of sixteen 4-player teams. Each round is a 2-minute, most-kills-wins match with respawns. Keep your squad together all the way to the final.' }
};

// Builds the list of character sheets (with team ids assigned) for a single match.
function buildMatchRoster(mode, playerSheet, opponentTeams = null) {
  playerSheet.team = 0;
  const roster = [playerSheet];
  for (let i = 1; i < mode.teamSize; i++) {
    roster.push(randomCharacterSheet(`Ally ${i}`, true, 0));
  }
  if (opponentTeams) {
    // opponentTeams: array (teamCount-1) of arrays of pre-built sheets (tournament mode)
    opponentTeams.forEach((team, ti) => {
      team.forEach(sheet => { sheet.team = ti + 1; roster.push(sheet); });
    });
  } else {
    for (let t = 1; t < mode.teamCount; t++) {
      for (let i = 0; i < mode.teamSize; i++) {
        // In a free-for-all there are no squads, so rivals go by their own
        // affinity/teknik name (the default) instead of a squad label.
        const name = mode.teamSize === 1 ? null : `${teamLabel(t)} ${i + 1}`;
        roster.push(randomCharacterSheet(name, true, t));
      }
    }
  }
  // FFA: everyone is their own team so "allies" collapses to self.
  if (mode.teamSize === 1) {
    roster.forEach((s, i) => { s.team = i; });
    dedupeNames(roster);
  }
  return roster;
}

// Two "Faerie Archer"s in one free-for-all are confusing on the scoreboard.
function dedupeNames(roster) {
  const seen = {};
  for (const sheet of roster) {
    const base = sheet.displayName;
    seen[base] = (seen[base] || 0) + 1;
    if (seen[base] > 1) sheet.displayName = `${base} ${seen[base]}`;
  }
}

function teamLabel(t) {
  const names = ['', 'Crimson Squad', 'Azure Squad', 'Golden Squad', 'Violet Squad', 'Jade Squad', 'Silver Squad', 'Amber Squad'];
  return names[t] || `Squad ${t}`;
}

function assignSpawnPositions(entities, map, mode) {
  const pts = map.spawnPoints;
  const perTeam = Math.ceil(pts.length / mode.teamCount);
  const byTeam = {};
  entities.forEach(e => { (byTeam[e.team] = byTeam[e.team] || []).push(e); });
  Object.keys(byTeam).forEach((teamId, ti) => {
    const base = ti * perTeam;
    byTeam[teamId].forEach((e, i) => {
      const p = pts[(base + i) % pts.length];
      e.x = p.x + (Math.random() - 0.5) * 40;
      e.y = p.y + (Math.random() - 0.5) * 40;
    });
  });
}

// ---------------- Tournament (16 teams of 4, single elimination) ----------------
function generatePower(sheet) {
  const s = sheet.stats;
  return s.maxHp * 0.6 + s.attackDamage * 12 + (1 / s.attackCooldown) * 30 + s.speed * 0.3;
}
function teamPower(team) { return team.reduce((sum, s) => sum + generatePower(s), 0); }

function simulateMatch(teamA, teamB) {
  const pa = teamPower(teamA) * (0.8 + Math.random() * 0.4);
  const pb = teamPower(teamB) * (0.8 + Math.random() * 0.4);
  return pa >= pb ? 0 : 1;
}

function createTournament(playerSheet) {
  playerSheet.team = 0;
  const playerTeam = [playerSheet, randomCharacterSheet('Ally 1', true, 0), randomCharacterSheet('Ally 2', true, 0), randomCharacterSheet('Ally 3', true, 0)];
  const teams = [playerTeam];
  for (let i = 1; i < 16; i++) {
    teams.push([0, 1, 2, 3].map(j => randomCharacterSheet(`${teamLabel((i % 7) + 1)} ${j + 1}`, true, 0)));
  }
  const round1 = [];
  for (let i = 0; i < 16; i += 2) round1.push({ teamIds: [i, i + 1], winner: null });
  return {
    teams, // fixed roster per team index; index 0 is always the player's team
    playerTeamId: 0,
    rounds: [round1],
    currentRound: 0,
    roundSimulated: false,
    eliminated: false,
    champion: null
  };
}

// Advances every match in the current round except the one containing the
// player's team (that one is resolved by actually playing it, via
// resolvePlayerMatch). Returns the matchup object the player must play.
function advanceTournamentRound(tourney) {
  const round = tourney.rounds[tourney.currentRound];
  let playerMatch = null;
  for (const m of round) {
    if (m.teamIds.includes(tourney.playerTeamId)) { playerMatch = m; continue; }
    m.winner = m.teamIds[simulateMatch(tourney.teams[m.teamIds[0]], tourney.teams[m.teamIds[1]])] === 0 ? m.teamIds[0] : m.teamIds[1];
  }
  tourney.roundSimulated = true;
  return playerMatch;
}

function resolvePlayerMatchAndAdvance(tourney, playerWon) {
  const round = tourney.rounds[tourney.currentRound];
  const playerMatch = round.find(m => m.teamIds.includes(tourney.playerTeamId));
  const opponentId = playerMatch.teamIds.find(id => id !== tourney.playerTeamId);
  playerMatch.winner = playerWon ? tourney.playerTeamId : opponentId;

  if (!playerWon) { tourney.eliminated = true; return; }

  if (round.length === 1) { tourney.champion = tourney.playerTeamId; return; }

  const winners = round.map(m => m.winner);
  const nextRound = [];
  for (let i = 0; i < winners.length; i += 2) nextRound.push({ teamIds: [winners[i], winners[i + 1]], winner: null });
  tourney.rounds.push(nextRound);
  tourney.currentRound++;
  tourney.roundSimulated = false;
}
