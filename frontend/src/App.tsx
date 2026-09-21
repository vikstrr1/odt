import React, { useEffect, useMemo, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import Chart from 'chart.js/auto'
import { auth, googleProvider } from './firebase'
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth'

type Summary = {
  title?: string
  leader?: string | null
  team_leader?: string | null
  participant_count?: number
  team_count?: number
  top_total_volume_l?: number
  top_alcohol_l?: number
}

type Participant = {
  id?: number
  name: string
  team: string
  total_volume_l: number
  alcohol_amount_l: number
  alcohol_per_kg: number
}

type TeamStanding = {
  team: string
  members: string[]
  total_volume_l: number
  total_alcohol_l: number
}

type TimelineEntry = {
  timestamp: string
  [key: string]: string | number
}

type Game = {
  id: number
  name: string
  created_at: string
  participant_count?: number
  drink_count?: number
  is_current?: boolean
}

const getAuthHeaders = async () => {
  const user = auth.currentUser
  if (user) {
    const token = await user.getIdToken()
    return { Authorization: `Bearer ${token}` }
  }
  return {}
}

const apiGet = async (url: string) => {
  const headers = await getAuthHeaders()
  const response = await fetch(url, { headers })
  const payload = await response.json()
  if (!response.ok) {
    throw new Error(payload.detail || 'Request failed')
  }
  return payload
}

const apiPost = async (url: string, data: Record<string, unknown>) => {
  const headers = await getAuthHeaders()
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(data),
  })

  const payload = await response.json()
  if (!response.ok) {
    throw new Error(payload.detail || 'Request failed')
  }
  return payload
}

const formatLocalDateTimeInput = (date = new Date()) => {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const formatLiters = (value: number | undefined) => `${Number(value || 0).toFixed(2)} L`
const formatMlPerKg = (value: number | undefined) => `${Number(value || 0).toFixed(2)} ml/kg`

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [teamStandings, setTeamStandings] = useState<TeamStanding[]>([])
  const [timeline, setTimeline] = useState<TimelineEntry[]>([])
  const [games, setGames] = useState<Game[]>([])
  const [participantOptions, setParticipantOptions] = useState<Participant[]>([])
  const [statusBadge, setStatusBadge] = useState('Loading tracker…')
  const [selectedGameId, setSelectedGameId] = useState<number | ''>('')
  const [view, setView] = useState<'dashboard' | 'player' | 'drink'>('dashboard')
  const [toast, setToast] = useState<{ message: string; isError: boolean } | null>(null)
  const chartRef = useRef<HTMLCanvasElement | null>(null)

  const showToast = (msg: string, isError = false) => {
    setToast({ message: msg, isError })
    setTimeout(() => setToast(null), 3000)
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser)
      setAuthLoading(false)
    })
    return () => unsubscribe()
  }, [])

  const loadDashboard = async () => {
    try {
      const payload = await apiGet('/api/summary')
      setSummary(payload.summary || null)
      setParticipants(payload.participants || [])
      setTeamStandings(payload.team_standings || [])
      setTimeline(payload.timeline || [])
      setStatusBadge('Tracker active')
    } catch (error) {
      console.error(error)
      setStatusBadge('Tracker unavailable')
    }
  }

  const loadGameHistory = async () => {
    try {
      const payload = await apiGet('/api/games')
      setGames(Array.isArray(payload) ? payload : [])
    } catch (error) {
      console.error(error)
    }
  }

  const refreshParticipantOptions = async () => {
    try {
      const payload = await apiGet('/api/summary')
      setParticipantOptions(payload.participants || [])
    } catch (error) {
      console.error(error)
    }
  }

  const applyDefaultTimes = () => {
    const participantArrival = document.querySelector<HTMLInputElement>('input[name="arrival_time"]')
    const drinkTimestamp = document.querySelector<HTMLInputElement>('input[name="timestamp"]')

    if (participantArrival && !participantArrival.value) {
      participantArrival.value = formatLocalDateTimeInput()
    }
    if (drinkTimestamp && !drinkTimestamp.value) {
      drinkTimestamp.value = formatLocalDateTimeInput()
    }
  }

  const selectPastGame = async (gameId: number) => {
    try {
      setSelectedGameId(gameId)
      await apiPost('/api/game/select', { game_id: gameId })
      await loadDashboard()
      await loadGameHistory()
      await refreshParticipantOptions()
      setStatusBadge('Game selected')
    } catch (error) {
      console.error(error)
      setStatusBadge('Game selection failed')
    }
  }

  const resetGame = async () => {
    const confirmed = window.confirm('Start a new game? This will clear all players, drinks, and team standings.')
    if (!confirmed) return

    try {
      await apiPost('/api/game/reset', {})
      setSelectedGameId('')
      setStatusBadge('New game started')
      await loadDashboard()
      await loadGameHistory()
      await refreshParticipantOptions()
    } catch (error) {
      console.error(error)
      setStatusBadge('Reset failed')
    }
  }

  useEffect(() => {
    applyDefaultTimes()
    loadDashboard()
    loadGameHistory()
    refreshParticipantOptions()

    const socket: Socket = io(undefined, { path: '/socket.io' })
    socket.on('connect', () => console.log('socket connected'))
    socket.on('update', () => {
      void loadDashboard()
      void refreshParticipantOptions()
    })
    socket.on('participant_created', () => {
      void loadDashboard()
      void refreshParticipantOptions()
    })
    socket.on('drink_logged', () => {
      void loadDashboard()
      void refreshParticipantOptions()
    })
    socket.on('game_selected', () => {
      void loadDashboard()
      void refreshParticipantOptions()
    })
    socket.on('game_reset', () => {
      void loadDashboard()
      void refreshParticipantOptions()
    })

    return () => {
      socket.disconnect()
    }
  }, [])

  const participantNames = useMemo(() => {
    const names = new Set<string>()
    timeline.forEach((entry) => {
      Object.keys(entry).forEach((key) => {
        if (key !== 'timestamp') names.add(key)
      })
    })
    return Array.from(names)
  }, [timeline])

  useEffect(() => {
    if (!chartRef.current || participantNames.length === 0 || timeline.length === 0) {
      return
    }

    const chart = new Chart(chartRef.current, {
      type: 'line',
      data: {
        labels: timeline.map((entry) => entry.timestamp),
        datasets: participantNames.map((name, index) => ({
          label: name,
          data: timeline.map((entry) => Number(entry[name] || 0)),
          borderColor: ['#7dd3fc', '#a78bfa', '#34d399', '#fbbf24', '#f87171', '#60a5fa'][index % 6],
          backgroundColor: 'transparent',
          pointRadius: 0,
          borderWidth: 2,
          tension: 0.2,
        })),
      },
      options: {
        maintainAspectRatio: false,
        responsive: true,
        interaction: { mode: 'nearest', intersect: false },
        plugins: {
          legend: {
            labels: { color: '#e5e7eb' },
          },
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
    })

    return () => chart.destroy()
  }, [participantNames, timeline])

  const handleParticipantSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const payload = Object.fromEntries(formData.entries()) as Record<string, string>

    if (!payload.name) return

    payload.weight_kg = String(Number(payload.weight_kg || 0))
    if (!payload.arrival_time) {
      payload.arrival_time = new Date().toISOString()
    } else {
      payload.arrival_time = new Date(payload.arrival_time).toISOString()
    }

    try {
      await apiPost('/api/participants', payload)
      event.currentTarget.reset()
      applyDefaultTimes()
      await loadDashboard()
      await refreshParticipantOptions()
      showToast(`${payload.name} added!`)
    } catch {
      showToast('Failed to add participant', true)
    }
  }

  const handleDrinkSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const payload = Object.fromEntries(formData.entries()) as Record<string, string>

    if (!payload.participant_name || !payload.beverage) return

    payload.volume_ml = String(Number(payload.volume_ml || 0))
    payload.abv_percent = String(Number(payload.abv_percent || 0))
    if (!payload.timestamp) {
      payload.timestamp = new Date().toISOString()
    } else {
      payload.timestamp = new Date(payload.timestamp).toISOString()
    }

    try {
      await apiPost('/api/drinks', payload)
      event.currentTarget.reset()
      applyDefaultTimes()
      await loadDashboard()
      await refreshParticipantOptions()
      showToast(`${payload.beverage} logged for ${payload.participant_name}!`)
    } catch {
      showToast('Failed to log drink', true)
    }
  }

  const summaryCards = [
    { label: 'Leader', value: summary?.leader || '—', sub: 'Current front-runner' },
    { label: 'Top volume', value: formatLiters(summary?.top_total_volume_l), sub: 'Highest volume' },
    { label: 'Top alcohol', value: `${Number(summary?.top_alcohol_l || 0).toFixed(2)} L`, sub: 'Pure alcohol' },
    { label: 'Participants', value: String(summary?.participant_count || 0), sub: 'Active tracked users' },
  ]

  if (authLoading) {
    return (
      <div className="app-shell login-shell">
        <div className="login-card">
          <p className="eyebrow">ÖDT Tracker</p>
          <h1>Loading…</h1>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="app-shell login-shell">
        <div className="login-card">
          <p className="eyebrow">ÖDT Tracker</p>
          <h1>ÖDT Tracker 2025</h1>
          <p className="login-sub">Sign in to manage participants and drinks</p>
          <button
            type="button"
            className="submit-button login-button"
            onClick={() => signInWithPopup(auth, googleProvider)}
          >
            Sign in with Google
          </button>
        </div>
      </div>
    )
  }

  const handleLogout = async () => {
    await signOut(auth)
    setView('dashboard')
  }

  if (view === 'player') {
    return (
      <div className="app-shell">
        {toast && <div className={`toast ${toast.isError ? 'toast-error' : ''}`}>{toast.message}</div>}
        <header className="topbar">
          <div>
            <p className="eyebrow">ÖDT Tracker</p>
            <h1>{summary?.title || '2025 dashboard'}</h1>
          </div>
          <div className="header-actions">
            <button
              type="button"
              className="header-action"
              onClick={() => setView('dashboard')}
            >
              &larr; Dashboard
            </button>
            <label className="past-games-select">
              <span>Past games</span>
              <select
                value={selectedGameId}
                onChange={(event) => {
                  const value = Number(event.target.value)
                  if (value) {
                    void selectPastGame(value)
                  }
                }}
              >
                <option value="">Current game</option>
                {games.map((game) => (
                  <option key={game.id} value={game.id}>
                    {game.name}
                  </option>
                ))}
              </select>
            </label>
            <button id="resetGameButton" type="button" onClick={resetGame}>
              New game
            </button>
            <div id="statusBadge" className="status-pill">
              {statusBadge}
            </div>
            <button type="button" className="header-action" onClick={handleLogout}>
              Sign out
            </button>
          </div>
        </header>

        <section className="view-shell panel">
          <div className="view-header">
            <h2>Add participant</h2>
          </div>
          <form
            id="participantForm"
            className="stacked-form single-form"
            onSubmit={handleParticipantSubmit}
          >
            <div className="form-group">
              <label htmlFor="participantName">Name</label>
              <input
                id="participantName"
                name="name"
                type="text"
                required
                placeholder="Enter participant name"
              />
            </div>
            <div className="form-group">
              <label htmlFor="participantTeam">Team</label>
              <input
                id="participantTeam"
                name="team_name"
                type="text"
                required
                defaultValue="Team 1"
                placeholder="Enter participant team"
              />
            </div>
            <div className="form-group">
              <label htmlFor="participantWeight">Weight (kg)</label>
              <input
                id="participantWeight"
                name="weight_kg"
                type="number"
                step="0.1"
                required
                defaultValue={75}
                placeholder="Enter participant weight"
              />
            </div>
            <div className="form-group">
              <label htmlFor="arrivalTime">Arrival time</label>
              <input
                id="arrivalTime"
                name="arrival_time"
                type="datetime-local"
              />
            </div>
            <button type="submit" className="submit-button">
              Save participant
            </button>
          </form>
        </section>
      </div>
    )
  }

  if (view === 'drink') {
    return (
      <div className="app-shell">
        {toast && <div className={`toast ${toast.isError ? 'toast-error' : ''}`}>{toast.message}</div>}
        <header className="topbar">
          <div>
            <p className="eyebrow">ÖDT Tracker</p>
            <h1>{summary?.title || '2025 dashboard'}</h1>
          </div>
          <div className="header-actions">
            <button
              type="button"
              className="header-action"
              onClick={() => setView('dashboard')}
            >
              &larr; Dashboard
            </button>
            <label className="past-games-select">
              <span>Past games</span>
              <select
                value={selectedGameId}
                onChange={(event) => {
                  const value = Number(event.target.value)
                  if (value) {
                    void selectPastGame(value)
                  }
                }}
              >
                <option value="">Current game</option>
                {games.map((game) => (
                  <option key={game.id} value={game.id}>
                    {game.name}
                  </option>
                ))}
              </select>
            </label>
            <button id="resetGameButton" type="button" onClick={resetGame}>
              New game
            </button>
            <div id="statusBadge" className="status-pill">
              {statusBadge}
            </div>
            <button type="button" className="header-action" onClick={handleLogout}>
              Sign out
            </button>
          </div>
        </header>

        <section className="view-shell panel">
          <div className="view-header">
            <h2>Add drink</h2>
          </div>
          <form
            id="drinkForm"
            className="stacked-form single-form"
            onSubmit={handleDrinkSubmit}
          >
            <div className="form-group">
              <label htmlFor="participantSelect">Participant</label>
              <select
                id="participantSelect"
                name="participant_name"
                required
              >
                <option value="">Select a participant</option>
                {participantOptions.map((participant) => (
                  <option key={participant.id} value={participant.name}>
                    {participant.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="beverage">Beverage</label>
              <input
                id="beverage"
                name="beverage"
                type="text"
                required
                placeholder="Enter beverage name"
              />
            </div>
            <div className="form-group">
              <label htmlFor="volumeMl">Volume (mL)</label>
              <input
                id="volumeMl"
                name="volume_ml"
                type="number"
                step="1"
                defaultValue={500}
                required
                placeholder="Enter drink volume"
              />
            </div>
            <div className="form-group">
              <label htmlFor="abvPercent">ABV (%)</label>
              <input
                id="abvPercent"
                name="abv_percent"
                type="number"
                step="0.1"
                defaultValue={5.2}
                required
                placeholder="Enter alcohol by volume"
              />
            </div>
            <div className="form-group">
              <label htmlFor="timestamp">Timestamp</label>
              <input
                id="timestamp"
                name="timestamp"
                type="datetime-local"
              />
            </div>
            <button type="submit" className="submit-button">
              Save drink
            </button>
          </form>
        </section>
      </div>
    )
  }

  return (
    <div className="app-shell">
      {toast && <div className="toast">{toast}</div>}
      <header className="topbar">
        <div>
          <p className="eyebrow">ÖDT Tracker</p>
          <h1>{summary?.title || '2025 dashboard'}</h1>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className={`header-action ${view === 'player' ? 'active' : ''}`}
            onClick={() => setView('player')}
          >
            Add player
          </button>
          <button
            type="button"
            className={`header-action ${view === 'drink' ? 'active' : ''}`}
            onClick={() => setView('drink')}
          >
            Add drink
          </button>
          <label className="past-games-select">
            <span>Past games</span>
            <select
              value={selectedGameId}
              onChange={(event) => {
                const value = Number(event.target.value)
                if (value) {
                  void selectPastGame(value)
                }
              }}
            >
              <option value="">Current game</option>
              {games.map((game) => (
                <option key={game.id} value={game.id}>
                  {game.name}
                </option>
              ))}
            </select>
          </label>
          <button id="resetGameButton" type="button" onClick={resetGame}>
            New game
          </button>
          <div id="statusBadge" className="status-pill">
            {statusBadge}
          </div>
          <button type="button" className="header-action" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </header>

      <section id="summaryCards" className="summary-grid">
            {summaryCards.map((card) => (
              <article key={card.label} className="summary-card">
                <div className="label">{card.label}</div>
                <div className="value">{card.value}</div>
                <div className="sub">{card.sub}</div>
              </article>
            ))}
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2>Participant ranking</h2>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Participant</th>
                    <th>Team</th>
                    <th>Total volume (L)</th>
                    <th>Alcohol (L)</th>
                    <th>Alcohol / kg</th>
                  </tr>
                </thead>
                <tbody id="rankingBody">
                  {participants.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="empty-state">
                        No participants yet
                      </td>
                    </tr>
                  ) : (
                    participants.map((participant, index) => (
                      <tr key={`${participant.name}-${index}`}>
                        <td>
                          <span className="rank-badge">{index + 1}</span>
                        </td>
                        <td>{participant.name}</td>
                        <td>{participant.team}</td>
                        <td>{formatLiters(participant.total_volume_l)}</td>
                        <td>{formatLiters(participant.alcohol_amount_l)}</td>
                        <td>{formatMlPerKg(participant.alcohol_per_kg)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="two-col">
            <div className="panel">
              <div className="panel-header">
                <h2>Team standings</h2>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Team</th>
                      <th>Members</th>
                      <th>Total volume</th>
                      <th>Total alcohol</th>
                    </tr>
                  </thead>
                  <tbody id="teamBody">
                    {teamStandings.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="empty-state">
                          No team data yet
                        </td>
                      </tr>
                    ) : (
                      teamStandings.map((team) => (
                        <tr key={team.team}>
                          <td>{team.team}</td>
                          <td>{team.members.join(', ')}</td>
                          <td>{formatLiters(team.total_volume_l)}</td>
                          <td>{formatLiters(team.total_alcohol_l)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="panel">
              <div className="panel-header">
                <h2>Usage trend</h2>
              </div>
              <div style={{ height: 280 }}>
                {timeline.length === 0 ? (
                  <div className="empty-state">No drink data yet</div>
                ) : (
                  <canvas ref={chartRef} id="timelineChart" />
                )}
              </div>
            </div>
          </section>
      </div>
  )
}
