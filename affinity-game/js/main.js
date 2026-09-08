// Top-level state machine wiring every screen to the engine, input, and
// renderer. This is the only file that knows about screen transitions.

const SAVE_KEY = 'affinityGameCharacter';

let canvas, ctx, input;
let currentScreenId = 'screen-menu';
let lastFrameTime = 0;

let selectedAffinityId = null;
let selectedTeknikId = null;
let currentTeknikRole = 'tank';
let draftSheet = null;

let playerSheet = null; // the confirmed, active character
let hubEngine = null;
let matchEngine = null;

let pendingModeId = null;
let pendingMapId = null;
let tournamentOpponentId = null;
let activeTournament = null;
let lastMatchResult = null;
let lastMatchWasTournament = false;

function setScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  currentScreenId = id;
  canvas.classList.toggle('visible', id === 'screen-hub' || id === 'screen-match');
  if (id === 'screen-hub') input.setContext('hub');
  else if (id === 'screen-match') input.setContext('match');
  else input.setContext('hidden');
}

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

// ---------------- Character creation ----------------
function openAffinityScreen() {
  refreshAffinityScreen();
  setScreen('screen-affinity');
}
function refreshAffinityScreen() {
  renderAffinityGrid(document.getElementById('affinity-grid'), selectedAffinityId, id => {
    selectedAffinityId = id;
    refreshAffinityScreen();
  });
  renderAffinityDetail(document.getElementById('affinity-detail'), selectedAffinityId ? AFFINITY_BY_ID[selectedAffinityId] : null);
  document.getElementById('btn-affinity-next').disabled = !selectedAffinityId;
}

function openTeknikScreen() {
  refreshTeknikScreen();
  setScreen('screen-teknik');
}
function refreshTeknikScreen() {
  renderRoleTabs(document.getElementById('role-tabs'), currentTeknikRole, role => {
    currentTeknikRole = role; selectedTeknikId = null; refreshTeknikScreen();
  });
  renderTeknikGrid(document.getElementById('teknik-grid'), currentTeknikRole, selectedTeknikId, id => {
    selectedTeknikId = id; refreshTeknikScreen();
  });
  renderTeknikDetail(document.getElementById('teknik-detail'), selectedTeknikId ? TEKNIK_BY_ID[selectedTeknikId] : null);
  document.getElementById('btn-teknik-next').disabled = !selectedTeknikId;
}

function openSummaryScreen() {
  draftSheet = createCharacterSheet({ affinityId: selectedAffinityId, teknikId: selectedTeknikId, isAI: false });
  renderSummary(document.getElementById('summary-content'), draftSheet);
  document.getElementById('summary-name').value = '';
  setScreen('screen-summary');
}

function confirmCharacter() {
  const name = document.getElementById('summary-name').value.trim();
  if (name) draftSheet.displayName = name;
  playerSheet = draftSheet;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ affinityId: selectedAffinityId, teknikId: selectedTeknikId, name }));
  } catch (e) { /* storage unavailable, ignore */ }
  activeTournament = null;
  enterHub();
}

function enterHub() {
  document.getElementById('hub-player-tag').textContent =
    `${playerSheet.displayName} — ${ROLES.find(r => r.id === playerSheet.role).name}`;
  hubEngine = new HubEngine({ map: HUB_MAP, input, canvas, characterSheet: playerSheet, onPortalEnter: handlePortalEnter });
  setScreen('screen-hub');
}

function handlePortalEnter(portalId) {
  if (portalId === 'character') {
    selectedAffinityId = null; selectedTeknikId = null; currentTeknikRole = 'tank';
    openAffinityScreen();
    return;
  }
  if (portalId === 'tournament') { openTournamentScreen(); return; }
  pendingModeId = portalId;
  openModeSelect(GAME_MODES[portalId]);
}

// ---------------- Mode / map select ----------------
function refreshMapGrid() {
  renderMapGrid(document.getElementById('map-grid'), pendingMapId, id => {
    pendingMapId = id;
    refreshMapGrid();
    document.getElementById('btn-modeselect-start').disabled = false;
  });
}
function openModeSelect(mode) {
  pendingMapId = null;
  document.getElementById('modeselect-title').textContent = mode.name;
  document.getElementById('modeselect-desc').textContent = mode.desc;
  document.getElementById('btn-modeselect-start').disabled = true;
  refreshMapGrid();
  setScreen('screen-modeselect');
}

function startMatchFromSelection() {
  const mode = GAME_MODES[pendingModeId];
  const map = MAP_BY_ID[pendingMapId];
  if (pendingModeId === 'tournament') {
    const teamA = activeTournament.teams[activeTournament.playerTeamId];
    const teamB = activeTournament.teams[tournamentOpponentId];
    teamA.forEach(s => s.team = 0);
    teamB.forEach(s => s.team = 1);
    startMatch(mode, map, teamA.concat(teamB), true);
  } else {
    startMatch(mode, map, buildMatchRoster(mode, playerSheet), false);
  }
}

function startMatch(mode, map, roster, isTournamentMatch) {
  document.getElementById('hud-killfeed').innerHTML = '';
  lastMatchWasTournament = isTournamentMatch;
  matchEngine = new MatchEngine({
    map, mode, roster, playerSheet, input, canvas,
    onEnd: result => handleMatchEnd(result),
    onKillFeed: (victim, killer) => pushKillFeed(
      killer ? `${victim.sheet.displayName} was defeated by ${killer.sheet.displayName}` : `${victim.sheet.displayName} fell to the storm`
    )
  });
  setScreen('screen-match');
}

function handleMatchEnd(result) {
  lastMatchResult = result;
  setTimeout(() => showResults(result), 1000);
}

function plural(n, word) { return `${n} ${word}${n === 1 ? '' : 's'}`; }

function showResults(result) {
  document.getElementById('results-title').textContent = result.playerWon ? 'VICTORY' : 'DEFEAT';
  const tally = `${plural(result.playerKills, 'kill')} and ${plural(result.playerDeaths, 'death')}`;
  let sub;
  if (result.playerWon) {
    sub = result.wonOnTiebreak
      ? `Level on kills — you took it on the tiebreak. You finished on ${tally}.`
      : `Most kills when the clock ran out. You finished on ${tally}.`;
  } else {
    sub = result.lostOnTiebreak
      ? `Level on kills, but you lost the tiebreak on deaths. You finished on ${tally}.`
      : `Outscored this time. You finished on ${tally}.`;
  }
  document.getElementById('results-sub').textContent = sub;
  renderResultsStandings(document.getElementById('results-standings'), result, matchEngine.playerEntity.team);
  setScreen('screen-results');
}

function continueAfterResults() {
  if (lastMatchWasTournament && activeTournament) {
    resolvePlayerMatchAndAdvance(activeTournament, lastMatchResult.playerWon);
    openTournamentScreen();
  } else {
    setScreen('screen-hub');
  }
}

// ---------------- Tournament ----------------
function openTournamentScreen() {
  if (!activeTournament || activeTournament.champion !== null || activeTournament.eliminated) {
    activeTournament = createTournament(playerSheet);
  }
  let matchup;
  if (!activeTournament.roundSimulated) {
    matchup = advanceTournamentRound(activeTournament);
  } else {
    matchup = activeTournament.rounds[activeTournament.currentRound].find(m => m.teamIds.includes(activeTournament.playerTeamId));
  }
  renderTournament(document.getElementById('tournament-current'), activeTournament);

  const statusEl = document.getElementById('tournament-status');
  const playBtn = document.getElementById('btn-tournament-play');
  if (activeTournament.champion !== null) {
    statusEl.textContent = 'Champions! Your team took the whole bracket.';
    playBtn.style.display = 'none';
  } else if (activeTournament.eliminated) {
    statusEl.textContent = 'Eliminated. Leave to start a fresh run whenever you like.';
    playBtn.style.display = 'none';
  } else {
    statusEl.textContent = '';
    playBtn.style.display = '';
    playBtn.disabled = false;
    tournamentOpponentId = matchup.teamIds.find(id => id !== activeTournament.playerTeamId);
  }
  setScreen('screen-tournament');
}

// ---------------- Wiring ----------------
function wireUI() {
  document.getElementById('btn-new-game').addEventListener('click', () => {
    selectedAffinityId = null; selectedTeknikId = null; currentTeknikRole = 'tank';
    openAffinityScreen();
  });
  document.getElementById('btn-continue').addEventListener('click', () => {
    const saved = loadSavedCharacter();
    if (saved) { playerSheet = saved; enterHub(); }
  });

  document.getElementById('btn-affinity-next').addEventListener('click', openTeknikScreen);
  document.getElementById('btn-teknik-back').addEventListener('click', openAffinityScreen);
  document.getElementById('btn-teknik-next').addEventListener('click', openSummaryScreen);
  document.getElementById('btn-summary-back').addEventListener('click', openTeknikScreen);
  document.getElementById('btn-summary-confirm').addEventListener('click', confirmCharacter);

  document.getElementById('btn-hub-menu').addEventListener('click', () => setScreen('screen-menu'));

  document.getElementById('btn-modeselect-cancel').addEventListener('click', () => {
    if (pendingModeId === 'tournament') openTournamentScreen();
    else setScreen('screen-hub');
  });
  document.getElementById('btn-modeselect-start').addEventListener('click', startMatchFromSelection);

  document.getElementById('btn-tournament-leave').addEventListener('click', () => {
    activeTournament = null;
    setScreen('screen-hub');
  });
  document.getElementById('btn-tournament-play').addEventListener('click', () => {
    pendingModeId = 'tournament';
    openModeSelect(GAME_MODES.tournament);
  });

  document.getElementById('btn-results-continue').addEventListener('click', continueAfterResults);
}

function loadSavedCharacter() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!AFFINITY_BY_ID[data.affinityId] || !TEKNIK_BY_ID[data.teknikId]) return null;
    const sheet = createCharacterSheet({ affinityId: data.affinityId, teknikId: data.teknikId, isAI: false });
    if (data.name) sheet.displayName = data.name;
    return sheet;
  } catch (e) { return null; }
}

// ---------------- Boot & main loop ----------------
function loop(now) {
  const dt = Math.min(0.05, (now - lastFrameTime) / 1000 || 0.016);
  lastFrameTime = now;

  if (currentScreenId === 'screen-hub' && hubEngine) {
    hubEngine.update(dt);
    renderHub(ctx, canvas, hubEngine);
  } else if (currentScreenId === 'screen-match' && matchEngine) {
    matchEngine.update(dt);
    renderMatch(ctx, canvas, matchEngine);
    updateMatchHud(matchEngine);
  }
  requestAnimationFrame(loop);
}

function init() {
  canvas = document.getElementById('game-canvas');
  ctx = canvas.getContext('2d');
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  input = new InputController(canvas, document.getElementById('hud-mobile-root'));
  wireUI();

  if (loadSavedCharacter()) document.getElementById('btn-continue').style.display = '';

  setScreen('screen-menu');
  lastFrameTime = performance.now();
  requestAnimationFrame(loop);
}

document.addEventListener('DOMContentLoaded', init);

// Lightweight debug hook (harmless in production, handy for automated smoke tests).
window.__affinityDebug = {
  getHubPlayer: () => hubEngine && hubEngine.player,
  getNearPortal: () => hubEngine && hubEngine.nearPortal,
  getMatchEngine: () => matchEngine,
  getScreen: () => currentScreenId
};
