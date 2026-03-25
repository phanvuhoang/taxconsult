import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { api } from '../api.js'

const NAV = [
  { to: '/', label: 'Dashboard', icon: '🏠', exact: true },
  { to: '/quick-research', label: 'Quick Research', icon: '🔍' },
  { to: '/full-report', label: 'Full Report', icon: '📊' },
  { to: '/reports', label: 'Lịch sử', icon: '📁' },
  { to: '/tax-docs', label: 'Tax Docs', icon: '📚', adminOnly: true },
  { to: '/settings', label: 'Cài đặt', icon: '⚙️' },
]

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false)
  const [user, setUser] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    api.me().then(setUser).catch(() => {})
  }, [])

  function logout() {
    localStorage.removeItem('token')
    navigate('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
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
