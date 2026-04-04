import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import QuickResearch from './pages/QuickResearch.jsx'
import FullReport from './pages/FullReport.jsx'
import Reports from './pages/Reports.jsx'
import TaxDocs from './pages/TaxDocs.jsx'
import Settings from './pages/Settings.jsx'
import Scenario from './pages/Scenario.jsx'
import Analysis from './pages/Analysis.jsx'
import PressArticle from './pages/PressArticle.jsx'
import TaxAdvice from './pages/TaxAdvice.jsx'
import References from './pages/References.jsx'

function RequireAuth({ children }) {
  const token = localStorage.getItem('token')
  if (!token) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="quick-research" element={<QuickResearch />} />
          <Route path="full-report" element={<FullReport />} />
          <Route path="reports" element={<Reports />} />
          <Route path="tax-docs" element={<TaxDocs />} />
          <Route path="settings" element={<Settings />} />
          <Route path="scenario" element={<Scenario />} />
          <Route path="analysis" element={<Analysis />} />
          <Route path="press-article" element={<PressArticle />} />
          <Route path="tax-advice" element={<TaxAdvice />} />
          <Route path="references" element={<References />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
