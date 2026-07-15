import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { DialogProvider } from './context/DialogContext'
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
import ProfileMyData from './pages/ProfileMyData'
import ProfileNotifications from './pages/ProfileNotifications'
import ProfileHelp from './pages/ProfileHelp'
import ProfileChangePassword from './pages/ProfileChangePassword'
import Admin from './pages/Admin'
import AdminServices from './pages/AdminServices'
import CommunityAdmin from './pages/CommunityAdmin'
import CommunityServicesOverview from './pages/CommunityServicesOverview'
import CommunityResidents from './pages/CommunityResidents'
import CompanyAdminDashboard from './pages/CompanyAdminDashboard'
import RequireAdminPanel from './components/RequireAdminPanel'
import RequireRole from './components/RequireRole'
import RequirePiso from './components/RequirePiso'
import RequireCommunityNavTab from './components/RequireCommunityNavTab'
import RequirePaqueteriaSpecialDelivery from './components/RequirePaqueteriaSpecialDelivery'
import RequirePaqueteriaKeyLoans from './components/RequirePaqueteriaKeyLoans'
import CompletePiso from './pages/CompletePiso'
import OpenAppLanding from './pages/OpenAppLanding'
import PrivacyPolicyPage from './pages/PrivacyPolicyPage'
import AccountDeletionPage from './pages/AccountDeletionPage'
import AppBootstrap from './bootstrap/AppBootstrap'
import PWAUpdateBanner from './components/PWAUpdateBanner'
import { getSignInPath } from './utils/signInWebPath'
import PoolAccessPage from './pages/PoolAccessPage'
import PoolSelfCheckinPage from './pages/PoolSelfCheckinPage'
import PoolValidatePage from './pages/PoolValidatePage'
import PaqueteriaListPage from './pages/paqueteria/PaqueteriaListPage'
import PaqueteriaNewPage from './pages/paqueteria/PaqueteriaNewPage'
import PaqueteriaDetailPage from './pages/paqueteria/PaqueteriaDetailPage'
import KeyLoansListPage from './pages/paqueteria/KeyLoansListPage'
import KeyLoanNewPage from './pages/paqueteria/KeyLoanNewPage'
import CuadernoDiarioPage from './pages/cuaderno-diario/CuadernoDiarioPage'
import './App.css'

const routerBasename =
  import.meta.env.BASE_URL === '/' ? undefined : import.meta.env.BASE_URL.replace(/\/$/, '')

function App() {
  return (
    <BrowserRouter basename={routerBasename}>
      <AuthProvider>
        <DialogProvider>
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
          <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/delete-account" element={<AccountDeletionPage />} />
        <Route path="/delete-data" element={<AccountDeletionPage />} />
          <Route path="/solicitar-oferta" element={<QuoteRequestPage />} />
          <Route path="/register" element={<Navigate to="/solicitar-oferta" replace />} />
          <Route path="/completar-piso" element={<CompletePiso />} />
          <Route path="/admin" element={<RequireAdminPanel><Admin /></RequireAdminPanel>} />
          <Route
            path="/admin/communities/:communityId/vecinos"
            element={
              <RequireAdminPanel>
                <CommunityResidents superAdminScope />
              </RequireAdminPanel>
            }
          />
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
              <RequireRole role={['community_admin', 'president', 'concierge', 'company_admin']}>
                <RequirePiso>
                  <CommunityAdmin />
                </RequirePiso>
              </RequireRole>
            }
          />
          <Route
            path="/community-admin/vecinos"
            element={
              <RequireRole role={['community_admin', 'president', 'concierge', 'company_admin']}>
                <RequirePiso>
                  <CommunityResidents />
                </RequirePiso>
              </RequireRole>
            }
          />
          <Route
            path="/community-admin/servicios"
            element={
              <RequireRole role={['community_admin', 'president', 'concierge', 'company_admin']}>
                <RequirePiso>
                  <RequireCommunityNavTab tab="services">
                    <CommunityServicesOverview />
                  </RequireCommunityNavTab>
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
            <Route path="profile/mis-datos" element={<ProfileMyData />} />
            <Route path="profile/cambiar-contrasena" element={<ProfileChangePassword />} />
            <Route path="profile/notificaciones" element={<ProfileNotifications />} />
            <Route path="profile/ayuda" element={<ProfileHelp />} />
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
            <Route
              path="paqueteria"
              element={
                <RequireCommunityNavTab tab="paqueteria">
                  <PaqueteriaListPage />
                </RequireCommunityNavTab>
              }
            />
            <Route
              path="paqueteria/llaves"
              element={
                <RequireCommunityNavTab tab="paqueteria">
                  <RequirePaqueteriaKeyLoans>
                    <KeyLoansListPage />
                  </RequirePaqueteriaKeyLoans>
                </RequireCommunityNavTab>
              }
            />
            <Route
              path="paqueteria/llaves/nuevo"
              element={
                <RequireCommunityNavTab tab="paqueteria">
                  <RequirePaqueteriaKeyLoans>
                    <KeyLoanNewPage />
                  </RequirePaqueteriaKeyLoans>
                </RequireCommunityNavTab>
              }
            />
            <Route
              path="paqueteria/entrega-especial/nuevo"
              element={
                <RequireCommunityNavTab tab="paqueteria">
                  <RequirePaqueteriaSpecialDelivery>
                    <PaqueteriaNewPage deliveryKind="special" />
                  </RequirePaqueteriaSpecialDelivery>
                </RequireCommunityNavTab>
              }
            />
            <Route
              path="paqueteria/nuevo"
              element={
                <RequireCommunityNavTab tab="paqueteria">
                  <PaqueteriaNewPage />
                </RequireCommunityNavTab>
              }
            />
            <Route
              path="paqueteria/:id"
              element={
                <RequireCommunityNavTab tab="paqueteria">
                  <PaqueteriaDetailPage />
                </RequireCommunityNavTab>
              }
            />
            <Route
              path="cuaderno-diario"
              element={
                <RequireCommunityNavTab tab="cuadernoDiario">
                  <CuadernoDiarioPage />
                </RequireCommunityNavTab>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
        </ActivityProvider>
        </NotificationsProvider>
        </DialogProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
