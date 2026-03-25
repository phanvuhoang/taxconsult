import { useEffect, useState } from 'react'
import { api } from '../api.js'

export default function Settings() {
  const [user, setUser] = useState(null)
  const [cpForm, setCpForm] = useState({ current: '', new: '', confirm: '' })
  const [cpMsg, setCpMsg] = useState('')

  // Admin: users list
  const [users, setUsers] = useState([])
  const [newUser, setNewUser] = useState({ email: '', password: '', full_name: '', role: 'user' })
  const [userMsg, setUserMsg] = useState('')

  useEffect(() => {
    api.me().then(setUser).catch(() => {})
  }, [])

  useEffect(() => {
    if (user?.role === 'admin') {
      api.listUsers().then(setUsers).catch(() => {})
    }
  }, [user])

  async function changePassword(e) {
    e.preventDefault()
    setCpMsg('')
    if (cpForm.new !== cpForm.confirm) {
      setCpMsg('❌ Mật khẩu mới không khớp')
      return
    }
    try {
      await api.changePassword(cpForm.current, cpForm.new)
      setCpMsg('✅ Đổi mật khẩu thành công')
      setCpForm({ current: '', new: '', confirm: '' })
    } catch (err) {
      setCpMsg(`❌ ${err.message}`)
    }
  }

  async function toggleUser(id) {
    try {
      const res = await api.toggleUserActive(id)
      setUsers((p) => p.map((u) => (u.id === id ? { ...u, is_active: res.is_active } : u)))
    } catch {}
  }

  async function createUser(e) {
    e.preventDefault()
    setUserMsg('')
    try {
      await api.createUser(newUser)
      setUserMsg('✅ Tạo user thành công')
      setNewUser({ email: '', password: '', full_name: '', role: 'user' })
      api.listUsers().then(setUsers)
    } catch (err) {
      setUserMsg(`❌ ${err.message}`)
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">⚙️ Cài đặt</h1>

      {/* Change password */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="font-semibold text-gray-800 mb-4">Đổi mật khẩu</h2>
        <form onSubmit={changePassword} className="space-y-3 max-w-sm">
          {['current', 'new', 'confirm'].map((f) => (
            <div key={f}>
              <label className="block text-sm text-gray-600 mb-1">
                {f === 'current' ? 'Mật khẩu hiện tại' : f === 'new' ? 'Mật khẩu mới' : 'Xác nhận mật khẩu mới'}
              </label>
              <input
                type="password"
                value={cpForm[f]}
                onChange={(e) => setCpForm((p) => ({ ...p, [f]: e.target.value }))}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>
          ))}
          {cpMsg && (
            <div
              className={`text-sm px-3 py-2 rounded-lg ${
                cpMsg.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}
            >
              {cpMsg}
            </div>
          )}
          <button
            type="submit"
            className="bg-brand text-white px-4 py-2 rounded-lg text-sm hover:bg-brand-dark transition-colors"
          >
            Lưu mật khẩu
          </button>
        </form>
      </div>

      {/* Admin: User management */}
      {user?.role === 'admin' && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Quản lý người dùng</h2>

          {/* Create user form */}
          <form onSubmit={createUser} className="grid grid-cols-2 gap-3 mb-4 pb-4 border-b border-gray-100">
            <input
              type="email"
              placeholder="Email"
              value={newUser.email}
              onChange={(e) => setNewUser((p) => ({ ...p, email: e.target.value }))}
              required
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
            />
            <input
              type="password"
              placeholder="Mật khẩu"
              value={newUser.password}
              onChange={(e) => setNewUser((p) => ({ ...p, password: e.target.value }))}
              required
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
            />
            <input
              type="text"
              placeholder="Họ tên"
              value={newUser.full_name}
              onChange={(e) => setNewUser((p) => ({ ...p, full_name: e.target.value }))}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
            />
            <select
              value={newUser.role}
              onChange={(e) => setNewUser((p) => ({ ...p, role: e.target.value }))}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
            <button
              type="submit"
              className="col-span-2 bg-brand text-white py-1.5 rounded-lg text-sm hover:bg-brand-dark transition-colors"
            >
              Tạo user mới
            </button>
          </form>

          {userMsg && (
            <div
              className={`text-sm px-3 py-2 rounded-lg mb-3 ${
                userMsg.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}
            >
              {userMsg}
            </div>
          )}

          {/* Users table */}
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-100">
                <th className="text-left py-2">Email</th>
                <th className="text-left py-2">Họ tên</th>
                <th className="text-left py-2">Role</th>
                <th className="text-left py-2">Trạng thái</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="py-2">{u.email}</td>
                  <td className="py-2 text-gray-500">{u.full_name || '—'}</td>
                  <td className="py-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        u.role === 'admin' ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="py-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {u.is_active ? 'Hoạt động' : 'Tắt'}
                    </span>
                  </td>
                  <td className="py-2">
                    <button
                      onClick={() => toggleUser(u.id)}
                      className="text-xs text-gray-500 hover:text-gray-800 underline"
                    >
                      {u.is_active ? 'Tắt' : 'Bật'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
