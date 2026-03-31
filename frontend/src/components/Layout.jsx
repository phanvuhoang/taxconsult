import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { api } from '../api.js'

function useTheme() {
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark')
  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }, [dark])
  return [dark, setDark]
}

const NAV = [
  { to: '/', label: 'Dashboard', icon: '🏠', exact: true },
  { to: '/quick-research', label: 'Quick Research', icon: '🔍' },
  { to: '/full-report', label: 'Full Report', icon: '📊' },
  { to: '/reports', label: 'Lịch sử', icon: '📁' },
  { to: '/tax-docs', label: 'Văn bản', icon: '📚', adminOnly: true },
  { to: '/settings', label: 'Cài đặt', icon: '⚙️' },
]

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false)
  const [user, setUser] = useState(null)
  const navigate = useNavigate()
  const [dark, setDark] = useTheme()

  useEffect(() => {
    api.me().then(setUser).catch(() => {})
  }, [])

  useEffect(() => {
    function handleScroll() {
      const el = document.getElementById('report-content')
      if (!el) return
      const scrolled = window.scrollY
      const total = el.offsetHeight - window.innerHeight
      const pct = Math.min(100, total > 0 ? (scrolled / total) * 100 : 0)
      const bar = document.getElementById('reading-bar')
      if (bar) bar.style.width = pct + '%'
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  function logout() {
    localStorage.removeItem('token')
    navigate('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Reading progress bar */}
      <div
        id="reading-bar"
        className="fixed top-0 left-0 h-1 bg-brand z-50 transition-all duration-150"
        style={{ width: '0%' }}
      />
      {/* Sidebar */}
      <aside
        className={`flex flex-col bg-gray-900 text-white transition-all duration-200 ${
          collapsed ? 'w-14' : 'w-56'
        }`}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 px-3 py-4 border-b border-gray-700">
          <span className="text-2xl">📊</span>
          {!collapsed && (
            <span className="font-bold text-brand-light text-lg leading-tight">TaxConsult</span>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="ml-auto text-gray-400 hover:text-white"
            title={collapsed ? 'Mở rộng' : 'Thu gọn'}
          >
            {collapsed ? '»' : '«'}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-2 overflow-y-auto">
          {NAV.map((item) => {
            if (item.adminOnly && user?.role !== 'admin') return null
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.exact}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 mx-1 rounded-lg transition-colors text-sm ${
                    isActive
                      ? 'bg-brand text-white'
                      : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                  }`
                }
              >
                <span className="text-base">{item.icon}</span>
                {!collapsed && <span>{item.label}</span>}
              </NavLink>
            )
          })}
        </nav>

        {/* User */}
        <div className="border-t border-gray-700 p-3">
          {!collapsed && user && (
            <div className="text-xs text-gray-400 mb-2 truncate">
              {user.email}
              {user.role === 'admin' && (
                <span className="ml-1 bg-brand rounded px-1 text-white">admin</span>
              )}
            </div>
          )}
          <button
            onClick={() => setDark(!dark)}
            className="w-full flex items-center gap-2 text-gray-400 hover:text-white text-sm py-1 mb-1"
            title="Đổi giao diện sáng/tối"
          >
            <span>{dark ? '☀️' : '🌙'}</span>
            {!collapsed && (dark ? 'Sáng' : 'Tối')}
          </button>
          <button
            onClick={logout}
            className="w-full flex items-center gap-2 text-gray-400 hover:text-white text-sm py-1"
          >
            <span>🚪</span>
            {!collapsed && 'Đăng xuất'}
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <Outlet context={{ user }} />
      </main>
    </div>
  )
}
