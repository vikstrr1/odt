import React, { useEffect, useState } from 'react'
import { io, Socket } from 'socket.io-client'

type Summary = any

export default function App() {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)

  useEffect(() => {
    fetch('/api/summary')
      .then((r) => r.json())
      .then((d) => setSummary(d.summary))

    const s = io(undefined, { path: '/socket.io' })
    s.on('connect', () => console.log('socket connected'))
    s.on('update', (payload: any) => {
      if (payload.summary) setSummary(payload.summary)
    })
    s.on('participant_created', (payload: any) => {
      if (payload.summary) setSummary(payload.summary)
    })
    s.on('drink_logged', (payload: any) => {
      if (payload.summary) setSummary(payload.summary)
    })
    setSocket(s)
    return () => {
      s.disconnect()
    }
  }, [])

  return (
    <div className="app">
      <header>
        <h1>ÖDT Tracker</h1>
      </header>
      <main>
        <section className="summary">
          <h2>Summary</h2>
          <pre>{JSON.stringify(summary, null, 2)}</pre>
        </section>
      </main>
    </div>
  )
}
