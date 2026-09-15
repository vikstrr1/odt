const statusBadge = document.getElementById('statusBadge');
const summaryCards = document.getElementById('summaryCards');
const rankingBody = document.getElementById('rankingBody');
const teamBody = document.getElementById('teamBody');
const gameHistoryList = document.getElementById('gameHistoryList');

async function apiGet(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}

async function apiPost(url, data) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.detail || 'Request failed');
  }
  return payload;
}

function renderSummary(summary) {
  const cards = [
    { label: 'Leader', value: summary.leader || '—', sub: 'Current front-runner' },
    { label: 'Top volume', value: `${(summary.top_total_volume_l || 0).toFixed(2)} L`, sub: 'Highest volume' },
    { label: 'Top alcohol', value: `${(summary.top_alcohol_l || 0).toFixed(2)} L`, sub: 'Pure alcohol' },
    { label: 'Participants', value: String(summary.participant_count || 0), sub: 'Active tracked users' },
  ];

  summaryCards.innerHTML = cards
    .map(
      (card) => `
        <article class="summary-card">
          <div class="label">${card.label}</div>
          <div class="value">${card.value}</div>
          <div class="sub">${card.sub}</div>
        </article>
      `,
    )
    .join('');
}

function renderRanking(participants) {
  rankingBody.innerHTML = participants
    .map(
      (participant, index) => `
        <tr>
          <td><span class="rank-badge">${index + 1}</span></td>
          <td>${participant.name}</td>
          <td>${participant.team}</td>
          <td>${participant.total_volume_l.toFixed(2)}</td>
          <td>${participant.alcohol_amount_l.toFixed(2)}</td>
          <td>${participant.alcohol_per_kg.toFixed(3)}</td>
        </tr>
      `,
    )
    .join('');
}

function renderTeams(teamStandings) {
  teamBody.innerHTML = teamStandings
    .map(
      (team) => `
        <tr>
          <td>${team.team}</td>
          <td>${team.members.join(', ')}</td>
          <td>${team.total_volume_l.toFixed(2)} L</td>
          <td>${team.total_alcohol_l.toFixed(2)} L</td>
        </tr>
      `,
    )
    .join('');
}

function renderTimeline(timeline) {
  if (!timeline.length) {
    return;
  }

  const labels = timeline.map((entry) => entry.timestamp);
  const participantNames = Object.keys(timeline[0]).filter((key) => key !== 'timestamp');

  const datasets = participantNames.map((name, idx) => ({
    label: name,
    data: timeline.map((entry) => Number(entry[name] || 0)),
    borderColor: ['#7dd3fc', '#a78bfa', '#34d399', '#fbbf24', '#f87171', '#60a5fa'][idx % 6],
    backgroundColor: 'transparent',
    pointRadius: 0,
    borderWidth: 2,
    tension: 0.2,
  }));

  const canvas = document.getElementById('timelineChart');
  if (window.__odtChart) {
    window.__odtChart.destroy();
  }

  window.__odtChart = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets },
    options: {
      maintainAspectRatio: false,
      responsive: true,
      interaction: { mode: 'nearest', intersect: false },
      plugins: {
        legend: { labels: { color: '#e5e7eb' } },
      },
      scales: {
        x: {
          ticks: { color: '#cbd5e1' },
          grid: { color: 'rgba(148,163,184,0.12)' },
        },
        y: {
          ticks: { color: '#cbd5e1' },
          grid: { color: 'rgba(148,163,184,0.12)' },
        },
      },
    },
  });
}

function renderGames(games) {
  if (!gameHistoryList) {
    return;
  }

  gameHistoryList.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Game</th>
          <th>Created</th>
          <th>Players</th>
          <th>Drinks</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${games
          .map(
            (game) => `
              <tr>
                <td>${game.name}</td>
                <td>${game.created_at}</td>
                <td>${game.participant_count || 0}</td>
                <td>${game.drink_count || 0}</td>
                <td>
                  ${game.is_current ? '<span class="status-pill" style="padding: 4px 8px;">Active</span>' : `<button type="button" data-game-id="${game.id}">Open</button>`}
                </td>
              </tr>
            `,
          )
          .join('')}
      </tbody>
    </table>
  `;

  const openButtons = gameHistoryList.querySelectorAll('button[data-game-id]');
  openButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      const gameId = Number(button.dataset.gameId || 0);
      if (!gameId) {
        return;
      }
      try {
        await apiPost('/api/game/select', { game_id: gameId });
        await loadDashboard();
      } catch (error) {
        console.error(error);
      }
    });
  });
}

async function loadDashboard() {
  try {
    const payload = await apiGet('/api/summary');
    statusBadge.textContent = 'Tracker active';
    renderSummary(payload.summary);
    renderRanking(payload.participants);
    renderTeams(payload.team_standings);
    renderTimeline(payload.timeline);
    renderParticipantOptions(payload.participants || []);
    await loadGameHistory();
  } catch (error) {
    statusBadge.textContent = 'Tracker unavailable';
    console.error(error);
  }
}

async function loadGameHistory() {
  try {
    const games = await apiGet('/api/games');
    renderGames(games);
  } catch (error) {
    console.error(error);
  }
}

const participantSelect = document.querySelector('select[name="participant_name"]');

function renderParticipantOptions(participants) {
  const participantInput = document.querySelector('select[name="participant_name"]');
  if (!participantInput) {
    return;
  }

  participantInput.innerHTML = ['<option value="">Select participant</option>']
    .concat(participants.map((participant) => `<option value="${participant.name}">${participant.name}</option>`))
    .join('');
}

async function refreshParticipantOptions() {
  try {
    const payload = await apiGet('/api/summary');
    renderParticipantOptions(payload.participants || []);
  } catch (error) {
    console.error(error);
  }
}

document.getElementById('participantForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(event.target);
  const payload = Object.fromEntries(formData.entries());
  if (!payload.name) {
    return;
  }
  payload.weight_kg = Number(payload.weight_kg || 0);
  if (!payload.arrival_time) {
    payload.arrival_time = new Date().toISOString();
  } else {
    payload.arrival_time = new Date(payload.arrival_time).toISOString();
  }
  await apiPost('/api/participants', payload);
  event.target.reset();
  loadDashboard();
});

document.getElementById('drinkForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(event.target);
  const payload = Object.fromEntries(formData.entries());
  if (!payload.participant_name || !payload.beverage) {
    return;
  }
  payload.volume_ml = Number(payload.volume_ml || 0);
  payload.abv_percent = Number(payload.abv_percent || 0);
  if (!payload.timestamp) {
    payload.timestamp = new Date().toISOString();
  } else {
    payload.timestamp = new Date(payload.timestamp).toISOString();
  }
  await apiPost('/api/drinks', payload);
  event.target.reset();
  loadDashboard();
});

document.getElementById('resetGameButton').addEventListener('click', resetGame);

async function resetGame() {
  const confirmed = window.confirm('Start a new game? This will clear all players, drinks, and team standings.');
  if (!confirmed) {
    return;
  }

  try {
    await apiPost('/api/game/reset', {});
    statusBadge.textContent = 'New game started';
    loadDashboard();
  } catch (error) {
    statusBadge.textContent = 'Reset failed';
    console.error(error);
  }
}

function formatLocalDateTimeInput(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function applyDefaultTimes() {
  const participantArrival = document.querySelector('input[name="arrival_time"]');
  const drinkTimestamp = document.querySelector('input[name="timestamp"]');
  if (participantArrival && !participantArrival.value) {
    participantArrival.value = formatLocalDateTimeInput();
  }
  if (drinkTimestamp && !drinkTimestamp.value) {
    drinkTimestamp.value = formatLocalDateTimeInput();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  applyDefaultTimes();
  loadDashboard();
  loadGameHistory();
  refreshParticipantOptions();
});

document.querySelectorAll('.tab-button').forEach((button) => {
  button.addEventListener('click', () => {
    const target = button.dataset.tab;
    document.querySelectorAll('.tab-button').forEach((tabButton) => {
      tabButton.classList.toggle('active', tabButton === button);
    });
    document.querySelectorAll('.tab-panel').forEach((panel) => {
      panel.classList.toggle('active', panel.id === target);
    });
  });
});
