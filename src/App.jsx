import { useState, createContext, useContext } from 'react'
import { BrowserRouter, Routes, Route, NavLink, useNavigate } from 'react-router-dom'
import TippingPage from './pages/TippingPage'
import LeaderboardPage from './pages/LeaderboardPage'
import HistoryPage from './pages/HistoryPage'
import AdminPage from './pages/AdminPage'

// ─── Auth context ─────────────────────────────────────────────────────────────
export const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

const PARTICIPANTS = ['Swan', 'Mignon', 'Mr K', 'Uncle', 'Rave', 'Guido', 'Jurgen', 'Stickman']
const ADMIN_PIN = 'afl2026'

// ─── Login screen ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [selected, setSelected] = useState('')
  const [pin, setPin] = useState('')
  const [mode, setMode] = useState('tipper') // 'tipper' | 'admin'
  const [error, setError] = useState('')

  function handleSubmit() {
    if (mode === 'admin') {
      if (pin === ADMIN_PIN) {
        onLogin({ name: 'Admin', isAdmin: true })
      } else {
        setError('Incorrect PIN.')
      }
    } else {
      if (!selected) { setError('Please select your name.'); return }
      onLogin({ name: selected, isAdmin: false })
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🏉</div>
          <h1 className="text-3xl font-extrabold text-afl-gold tracking-tight">AFL Tipping</h1>
          <p className="text-gray-400 mt-1">2026 Season · Handicap Competition</p>
        </div>

        <div className="card p-6 space-y-5">
          {/* Mode toggle */}
          <div className="flex rounded-lg overflow-hidden border border-gray-700">
            <button
              onClick={() => { setMode('tipper'); setError('') }}
              className={`flex-1 py-2 text-sm font-semibold transition-colors ${mode === 'tipper' ? 'bg-afl-green text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
            >Tipper</button>
            <button
              onClick={() => { setMode('admin'); setError('') }}
              className={`flex-1 py-2 text-sm font-semibold transition-colors ${mode === 'admin' ? 'bg-afl-gold text-gray-900' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
            >Admin</button>
          </div>

          {mode === 'tipper' ? (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Who are you?</label>
              <select
                value={selected}
                onChange={e => { setSelected(e.target.value); setError('') }}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-3 text-white text-base focus:outline-none focus:ring-2 focus:ring-afl-green"
              >
                <option value="">Select your name…</option>
                {PARTICIPANTS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Admin PIN</label>
              <input
                type="password"
                value={pin}
                onChange={e => { setPin(e.target.value); setError('') }}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                placeholder="Enter PIN"
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-3 text-white focus:outline-none focus:ring-2 focus:ring-afl-gold"
              />
            </div>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button onClick={handleSubmit} className={mode === 'admin' ? 'btn-gold w-full py-3' : 'btn-primary w-full py-3'}>
            {mode === 'admin' ? '🔐 Enter Admin' : '🏉 Enter Tipping'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Nav ──────────────────────────────────────────────────────────────────────
function Nav({ user, onLogout }) {
  const navClass = ({ isActive }) =>
    `px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${isActive ? 'bg-afl-green text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`

  return (
    <nav className="bg-gray-900 border-b border-gray-800 sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 flex items-center justify-between h-14">
        <div className="flex items-center gap-1">
          <span className="text-lg mr-2">🏉</span>
          <NavLink to="/" className={navClass}>Tips</NavLink>
          <NavLink to="/leaderboard" className={navClass}>Ladder</NavLink>
          <NavLink to="/history" className={navClass}>History</NavLink>
          {user?.isAdmin && <NavLink to="/admin" className={({ isActive }) => `px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${isActive ? 'bg-afl-gold text-gray-900' : 'text-afl-gold hover:bg-gray-800'}`}>Admin</NavLink>}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400 hidden sm:block">{user?.isAdmin ? '🔐 Admin' : `👤 ${user?.name}`}</span>
          <button onClick={onLogout} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">Sign out</button>
        </div>
      </div>
    </nav>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null)

  if (!user) return <LoginScreen onLogin={setUser} />

  return (
    <AuthContext.Provider value={user}>
      <BrowserRouter>
        <Nav user={user} onLogout={() => setUser(null)} />
        <main className="max-w-5xl mx-auto px-4 py-6">
          <Routes>
            <Route path="/" element={<TippingPage />} />
            <Route path="/leaderboard" element={<LeaderboardPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/admin" element={user.isAdmin ? <AdminPage /> : <div className="text-center py-20 text-gray-400">Admin only.</div>} />
          </Routes>
        </main>
      </BrowserRouter>
    </AuthContext.Provider>
  )
}
