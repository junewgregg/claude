// DOM rendering helpers for every non-canvas screen: character creation,
// summaries, mode/map pickers, the tournament bracket, and the match HUD.

function pct(v) { return Math.round(v * 100) + '%'; }

const ABILITY_DESCRIPTIONS = {
  shield_self: a => `Shields self for ${pct(a.value)} of max HP.${a.taunt ? ' Also draws enemy attention.' : ''}`,
  melee_strike: a => `Strikes for ${Math.round(a.damage)} damage.${a.stun ? ` Stuns for ${a.stun}s.` : ''}${a.executeBonus ? ' Extra damage vs. healthy targets.' : ''}`,
  projectile: a => `Fires a bolt for ${Math.round(a.damage)} damage.${a.pierce ? ' Pierces through enemies.' : ''}`,
  projectile_slow: a => `Fires a bolt for ${Math.round(a.damage)} damage that slows the target.`,
  aoe_damage: a => `Blasts a wide area for ${Math.round(a.damage)} damage.${a.slow ? ' Slows survivors.' : ''}${a.knockback ? ' Knocks them back.' : ''}${a.stun ? ' Stuns briefly.' : ''}`,
  aoe_damage_selfheal: a => `Unleashes a flurry for ${Math.round(a.damage)} damage around self and heals for ${pct(a.healPct)} of max HP.`,
  aoe_damage_summon: a => `Blasts nearby foes for ${Math.round(a.damage)} damage and deploys ${a.turrets} turret(s).`,
  dash: a => `Dashes ${a.backward ? 'away from' : 'toward'} the fight.${a.damage ? ` Deals ${Math.round(a.damage)} damage on arrival.` : ''}${a.stun ? ' Stuns on landing.' : ''}`,
  dash_aoe: a => `Dashes forward and slams down for ${Math.round(a.damage)} damage in a wide radius.`,
  stealth: a => `Turns invisible to enemies for ${a.duration}s.`,
  summon_turret: a => `Deploys an automated turret that fires at nearby enemies for ${a.duration}s.`,
  buff_self: a => `Empowers self: +${pct(a.amount)} ${a.stat} for ${a.duration}s.`,
  buff_team: a => `Empowers nearby allies: +${pct(a.amount)} ${a.stat} for ${a.duration}s.`,
  buff_ally: a => `Empowers the ally who needs it most for ${a.duration}s.`,
  buff_team_shield: a => `Shields and empowers all nearby allies.`,
  heal_ally: a => `Heals the ally with the lowest health for ${pct(a.value)} of their max HP.`,
  heal_ally_shield: a => `Heavily heals and shields the ally with the lowest health.`,
  shield_ally: a => `Shields the ally with the lowest health for ${pct(a.value)} of max HP.`,
  cleanse_ally: a => `Cleanses debuffs from and heals the weakest ally.`,
  heal_aoe: a => `Heals all nearby allies for ${pct(a.value)} of max HP.${a.cleanse ? ' Also cleanses debuffs.' : ''}`,
  mark: a => `Marks an enemy, increasing damage they take by ${pct(a.amount)} for ${a.duration}s.`,
  mark_and_strike: a => `Marks an enemy and strikes them for ${Math.round(a.damage)} damage.`,
  debuff_area: a => `Weakens enemies in an area, reducing their damage for ${a.duration}s.`
};

function describeAbility(ability) {
  const fn = ABILITY_DESCRIPTIONS[ability.type];
  return fn ? fn(ability) : 'A unique effect.';
}

function cooldownLabel(ability) { return `${ability.cooldown}s cooldown`; }

// ---------------- Affinity select ----------------
function renderAffinityGrid(container, selectedId, onSelect) {
  container.innerHTML = '';
  for (const a of AFFINITIES) {
    const card = document.createElement('div');
    card.className = 'pick-card' + (a.id === selectedId ? ' selected' : '');
    card.style.setProperty('--accent', a.color);
    card.innerHTML = `<span class="glyph" style="color:${a.color}">${a.glyph}</span><div class="pname">${a.name}</div>`;
    card.addEventListener('click', () => onSelect(a.id));
    container.appendChild(card);
  }
}
function renderAffinityDetail(container, affinity) {
  if (!affinity) { container.textContent = 'Select an affinity to see its trait.'; return; }
  container.innerHTML = `<b style="color:${affinity.color}">${affinity.name}</b> — ${affinity.tagline}<br><br>
    <b>Passive: ${affinity.passive.name}</b> — ${affinity.passive.desc}`;
}

// ---------------- Teknik select ----------------
function renderRoleTabs(container, activeRole, onSelect) {
  container.innerHTML = '';
  for (const r of ROLES) {
    const tab = document.createElement('div');
    tab.className = 'role-tab' + (r.id === activeRole ? ' active' : '');
    tab.textContent = r.name;
    tab.addEventListener('click', () => onSelect(r.id));
    container.appendChild(tab);
  }
}
function renderTeknikGrid(container, role, selectedId, onSelect) {
  container.innerHTML = '';
  for (const t of TEKNIKS.filter(t => t.role === role)) {
    const card = document.createElement('div');
    card.className = 'pick-card' + (t.id === selectedId ? ' selected' : '');
    card.style.setProperty('--accent', '#4fd1ff');
    card.innerHTML = `<span class="glyph">${t.weaponGlyph}</span><div class="pname">${t.name}</div><div class="prole">${ROLES.find(r => r.id === t.role).name}</div>`;
    card.addEventListener('click', () => onSelect(t.id));
    container.appendChild(card);
  }
}
function renderTeknikDetail(container, teknik) {
  if (!teknik) { container.textContent = 'Select a teknik to see its role.'; return; }
  const role = ROLES.find(r => r.id === teknik.role);
  container.innerHTML = `<b>${teknik.name}</b> — ${role.desc}<br><br>
    HP ${teknik.baseStats.hp} · Armor ${teknik.baseStats.armor} · Speed ${teknik.baseStats.speed} ·
    ${teknik.attackType === 'melee' ? 'Melee' : 'Ranged'} attack (${teknik.baseStats.attackDamage} dmg)`;
}

// ---------------- Summary ----------------
function renderSummary(container, sheet) {
  const abilityCards = sheet.abilities.map(a => `
    <div class="ability-card">
      <div class="aname">${a.name}</div>
      <div class="adesc">${describeAbility(a)} (${cooldownLabel(a)})</div>
    </div>`).join('');
  container.innerHTML = `
    <div class="summary-header">
      <div class="summary-avatar" style="background:${sheet.color}22;border-color:${sheet.color}">${sheet.glyph}</div>
      <div>
        <div style="font-size:1.3rem;font-weight:700">${sheet.affinity.name} ${sheet.teknik.name}</div>
        <div style="color:#9aa">${ROLES.find(r => r.id === sheet.role).name} · Passive: ${sheet.passive.name}</div>
      </div>
    </div>
    <div class="summary-stats">
      <div>HP: ${sheet.stats.maxHp}</div>
      <div>Armor: ${sheet.stats.armor}</div>
      <div>Speed: ${sheet.stats.speed}</div>
      <div>Attack: ${sheet.stats.attackDamage} dmg (${sheet.attackType})</div>
    </div>
    <p style="color:#9aa;font-size:0.85rem">${sheet.passive.desc}</p>
    <div class="ability-list">
      ${abilityCards}
      <div class="ability-card ult">
        <div class="aname">★ ${sheet.ultimate.name} (Ultimate)</div>
        <div class="adesc">${describeAbility(sheet.ultimate)} (${cooldownLabel(sheet.ultimate)})</div>
      </div>
    </div>`;
}

// ---------------- Mode / map select ----------------
function renderMapGrid(container, selectedId, onSelect) {
  container.innerHTML = '';
  for (const m of MAPS) {
    const card = document.createElement('div');
    card.className = 'pick-card' + (m.id === selectedId ? ' selected' : '');
    card.style.setProperty('--accent', m.accent);
    card.innerHTML = `<div class="map-card-img" style="background:${m.bg};border:1px solid ${m.accent}"></div><div class="pname">${m.name}</div>`;
    card.addEventListener('click', () => onSelect(m.id));
    container.appendChild(card);
  }
}

// ---------------- Match HUD ----------------
function updateMatchHud(engine, elapsed) {
  const pe = engine.playerEntity;
  const hpFill = document.getElementById('hud-hp-fill');
  const shieldFill = document.getElementById('hud-shield-fill');
  const hpText = document.getElementById('hud-hp-text');
  hpFill.style.width = Math.max(0, (pe.hp / pe.maxHp) * 100) + '%';
  shieldFill.style.width = Math.min(100, (pe.shield / pe.maxShield) * 100) + '%';
  hpText.textContent = `${Math.max(0, Math.round(pe.hp))} / ${pe.maxHp} HP${pe.shield > 0 ? ` (+${Math.round(pe.shield)} shield)` : ''}`;

  // Match clock
  const timerEl = document.getElementById('hud-timer');
  const secs = Math.ceil(engine.timeRemaining);
  timerEl.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  timerEl.classList.toggle('urgent', secs <= 30);

  document.getElementById('hud-topinfo').textContent =
    `${engine.mode.name} · most kills wins · you: ${pe.kills} K / ${pe.deaths} D`;

  // Live scoreboard: the player's team always shows, plus the top rivals.
  const standings = engine.getStandings();
  const mine = standings.find(s => s.team === pe.team);
  const shown = standings.slice(0, 4);
  if (mine && !shown.includes(mine)) { shown.pop(); shown.push(mine); }
  document.getElementById('hud-scores').innerHTML = shown.map(s =>
    `<div class="score-chip${s.team === pe.team ? ' mine' : ''}" style="--team:${TEAM_COLORS[s.team % TEAM_COLORS.length]}">
       <span>${s.name}</span><span class="sc">${s.kills}</span>
     </div>`).join('');

  // Respawn countdown while the player is down
  const respawnEl = document.getElementById('hud-respawn');
  if (!pe.alive && pe.respawnAt !== null) {
    const left = Math.max(0, Math.ceil(pe.respawnAt - engine.world.time));
    respawnEl.hidden = false;
    respawnEl.innerHTML = `You were taken down<div class="rs-count">${left}</div>Respawning...`;
  } else {
    respawnEl.hidden = true;
  }

  const abRoot = document.getElementById('hud-abilities');
  if (abRoot.childElementCount !== pe.sheet.abilities.length + 1) {
    abRoot.innerHTML = '';
    pe.sheet.abilities.forEach((a, i) => {
      const el = document.createElement('div');
      el.className = 'hud-ab'; el.dataset.idx = i;
      el.innerHTML = `<span>${i + 1}<br>${a.name.split(' ').pop()}</span><div class="cd-overlay" style="display:none"></div>`;
      abRoot.appendChild(el);
    });
    const ultEl = document.createElement('div');
    ultEl.className = 'hud-ab ult'; ultEl.dataset.idx = 'ult';
    ultEl.innerHTML = `<span>ULT<br>${pe.sheet.ultimate.name.split(' ').pop()}</span><div class="cd-overlay" style="display:none"></div>`;
    abRoot.appendChild(ultEl);
  }
  pe.cooldowns.forEach((cd, i) => {
    const overlay = abRoot.children[i].querySelector('.cd-overlay');
    if (cd.remaining > 0.05) { overlay.style.display = 'flex'; overlay.textContent = Math.ceil(cd.remaining); }
    else overlay.style.display = 'none';
  });
  const ultOverlay = abRoot.children[pe.cooldowns.length].querySelector('.cd-overlay');
  if (pe.ultCooldown.remaining > 0.05) { ultOverlay.style.display = 'flex'; ultOverlay.textContent = Math.ceil(pe.ultCooldown.remaining); }
  else ultOverlay.style.display = 'none';
}

function renderResultsStandings(container, result, playerTeam) {
  container.innerHTML = result.standings.map((s, i) =>
    `<div class="results-row${s.team === playerTeam ? ' mine' : ''}" style="--team:${TEAM_COLORS[s.team % TEAM_COLORS.length]}">
       <span>${i + 1}. ${s.name}</span>
       <span class="rk">${s.kills} kills · ${s.deaths} deaths</span>
     </div>`).join('');
}

function pushKillFeed(text) {
  const feed = document.getElementById('hud-killfeed');
  const row = document.createElement('div');
  row.textContent = text;
  feed.appendChild(row);
  setTimeout(() => row.remove(), 4500);
  while (feed.childElementCount > 5) feed.removeChild(feed.firstChild);
}

// ---------------- Tournament bracket ----------------
function teamDisplayName(tourney, teamId) {
  if (teamId === tourney.playerTeamId) return 'Your Team';
  const t = tourney.teams[teamId];
  return t[0].displayName.split(' ').slice(0, 2).join(' ') || `Team ${teamId + 1}`;
}
function renderTournament(container, tourney) {
  container.innerHTML = '';
  tourney.rounds.forEach((round, ri) => {
    const wrap = document.createElement('div');
    wrap.className = 'bracket-round';
    const roundNames = ['Round of 16', 'Quarterfinals', 'Semifinals', 'Final'];
    wrap.innerHTML = `<h4>${roundNames[ri] || `Round ${ri + 1}`}</h4>`;
    round.forEach(m => {
      const row = document.createElement('div');
      const isPlayer = m.teamIds.includes(tourney.playerTeamId);
      row.className = 'matchup' + (isPlayer ? ' player' : '') + (m.winner !== null ? ' done' : '');
      const [a, b] = m.teamIds;
      const nameA = teamDisplayName(tourney, a), nameB = teamDisplayName(tourney, b);
      const result = m.winner !== null ? ` — winner: ${teamDisplayName(tourney, m.winner)}` : (isPlayer ? ' (your match)' : ' (pending)');
      row.textContent = `${nameA} vs ${nameB}${result}`;
      wrap.appendChild(row);
    });
    container.appendChild(wrap);
  });
}
