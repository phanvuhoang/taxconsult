import { useState } from 'react'

/**
 * PeriodSelector — chọn giai đoạn thuế
 * Props: value (string), onChange (fn)
 * Trả về string dạng: "hiện_nay" | "truoc:2020" | "sau:2022" | "khoang:2020:2024"
 */
export default function PeriodSelector({ value, onChange }) {
  const [mode, setMode] = useState('hiện_nay')  // hiện_nay | trước | sau | khoảng
  const [year1, setYear1] = useState('2020')
  const [year2, setYear2] = useState('2024')

  function emit(m, y1, y2) {
    if (m === 'hiện_nay') onChange('hiện_nay')
    else if (m === 'trước') onChange(`truoc:${y1}`)
    else if (m === 'sau')   onChange(`sau:${y1}`)
    else                    onChange(`khoang:${y1}:${y2}`)
  }

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-gray-600 mb-1">Giai đoạn</label>
      <div className="flex flex-wrap gap-3 text-sm">
        {['hiện_nay', 'trước', 'sau', 'khoảng'].map(m => (
          <label key={m} className="flex items-center gap-1 cursor-pointer">
            <input type="radio" name="period_mode" value={m}
              checked={mode === m}
              onChange={() => { setMode(m); emit(m, year1, year2) }}
              className="accent-brand"
            />
            <span className="capitalize">
              {m === 'hiện_nay' ? '📅 Hiện nay' : m === 'trước' ? 'Trước năm' : m === 'sau' ? 'Sau năm' : 'Khoảng'}
            </span>
          </label>
        ))}
      </div>

      {mode !== 'hiện_nay' && (
        <div className="flex items-center gap-2 mt-1">
          <input type="number" min="2000" max="2030" value={year1}
            onChange={e => { setYear1(e.target.value); emit(mode, e.target.value, year2) }}
            className="w-24 border border-gray-300 rounded px-2 py-1 text-sm"
          />
          {mode === 'khoảng' && (
            <>
              <span className="text-gray-500">–</span>
              <input type="number" min="2000" max="2030" value={year2}
                onChange={e => { setYear2(e.target.value); emit(mode, year1, e.target.value) }}
                className="w-24 border border-gray-300 rounded px-2 py-1 text-sm"
              />
            </>
          )}
        </div>
      )}
    </div>
  )
}
