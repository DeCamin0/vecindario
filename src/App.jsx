import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { NotificationsProvider } from './context/NotificationsContext'
import { ActivityProvider } from './context/ActivityContext'
import AppLayout from './layouts/AppLayout'
import Login from './pages/Login'
import QuoteRequestPage from './pages/QuoteRequestPage'
import AdminQuoteRequests from './pages/AdminQuoteRequests'
import Home from './pages/Home'
import ServicesListPage from './pages/services/ServicesListPage'
import ServiceRequestNewPage from './pages/services/ServiceRequestNewPage'
import ServiceRequestDetailPage from './pages/services/ServiceRequestDetailPage'
import Incidents from './pages/Incidents'
import Bookings from './pages/Bookings'
import Activity from './pages/Activity'
import Profile from './pages/Profile'
import Admin from './pages/Admin'
import AdminServices from './pages/AdminServices'
import CommunityAdmin from './pages/CommunityAdmin'
import CommunityResidents from './pages/CommunityResidents'
import CompanyAdminDashboard from './pages/CompanyAdminDashboard'
import RequireRole from './components/RequireRole'
import RequirePiso from './components/RequirePiso'
import RequireCommunityNavTab from './components/RequireCommunityNavTab'
import CompletePiso from './pages/CompletePiso'
import OpenAppLanding from './pages/OpenAppLanding'
import AppBootstrap from './bootstrap/AppBootstrap'
import PWAUpdateBanner from './components/PWAUpdateBanner'
import { getSignInPath } from './utils/signInWebPath'
import PoolAccessPage from './pages/PoolAccessPage'
import PoolSelfCheckinPage from './pages/PoolSelfCheckinPage'
import PoolValidatePage from './pages/PoolValidatePage'
import './App.css'

const routerBasename =
  import.meta.env.BASE_URL === '/' ? undefined : import.meta.env.BASE_URL.replace(/\/$/, '')

function App() {
  return (
    <BrowserRouter basename={routerBasename}>
      <AuthProvider>
        <NotificationsProvider>
        <ActivityProvider>
        {/* Registro SW en todas las rutas (/admin, /login, …), no solo dentro de AppLayout */}
        <PWAUpdateBanner />
        <Routes>
          <Route path="/app" element={<AppBootstrap />} />
          <Route path="/access" element={<Navigate to={getSignInPath()} replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/c/:loginSlug/login" element={<Login />} />
          <Route path="/open-app" element={<OpenAppLanding />} />
          <Route path="/solicitar-oferta" element={<QuoteRequestPage />} />
          <Route path="/register" element={<Navigate to="/solicitar-oferta" replace />} />
          <Route path="/completar-piso" element={<CompletePiso />} />
          <Route path="/admin" element={<RequireRole role="super_admin"><Admin /></RequireRole>} />
          <Route
            path="/company-admin"
            element={
              <RequireRole role="company_admin">
                <CompanyAdminDashboard />
              </RequireRole>
            }
          />
          <Route
            path="/admin/services"
            element={
              <RequireRole role="super_admin">
                <AdminServices />
              </RequireRole>
            }
          />
          <Route
            path="/admin/solicitudes-oferta"
            element={
              <RequireRole role="super_admin">
                <AdminQuoteRequests />
              </RequireRole>
            }
          />
          <Route
            path="/community-admin"
            element={
              <RequireRole role={['community_admin', 'president', 'concierge']}>
                <RequirePiso>
                  <CommunityAdmin />
                </RequirePiso>
              </RequireRole>
            }
          />
          <Route
            path="/community-admin/vecinos"
            element={
              <RequireRole role={['community_admin', 'president', 'concierge']}>
                <RequirePiso>
                  <CommunityResidents />
                </RequirePiso>
              </RequireRole>
            }
          />
          <Route path="/" element={<RequirePiso><AppLayout /></RequirePiso>}>
            <Route index element={<Home />} />
            <Route
              path="services/new"
              element={
                <RequireCommunityNavTab tab="services">
                  <ServiceRequestNewPage />
                </RequireCommunityNavTab>
              }
            />
            <Route
              path="services/:serviceId"
              element={
                <RequireCommunityNavTab tab="services">
                  <ServiceRequestDetailPage />
                </RequireCommunityNavTab>
              }
            />
            <Route
              path="services"
              element={
                <RequireCommunityNavTab tab="services">
                  <ServicesListPage />
                </RequireCommunityNavTab>
              }
            />
            <Route
              path="incidents"
              element={
                <RequireCommunityNavTab tab="incidents">
                  <Incidents />
                </RequireCommunityNavTab>
              }
            />
            <Route
              path="bookings"
              element={
                <RequireCommunityNavTab tab="bookings">
                  <Bookings />
                </RequireCommunityNavTab>
              }
            />
            <Route path="activity" element={<Activity />} />
            <Route path="profile" element={<Profile />} />
            <Route
              path="pool"
              element={
                <RequireCommunityNavTab tab="poolAccess">
                  <PoolAccessPage />
                </RequireCommunityNavTab>
              }
            />
            <Route
              path="pool-self-checkin"
              element={
                <RequireCommunityNavTab tab="poolAccess">
                  <PoolSelfCheckinPage />
                </RequireCommunityNavTab>
              }
            />
            <Route path="pool-validate" element={<PoolValidatePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
        </ActivityProvider>
        </NotificationsProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
