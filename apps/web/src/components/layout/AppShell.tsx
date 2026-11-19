import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar.js';
import { TopBar } from './TopBar.js';
import { GlobalPatientSearchModal } from '../search/GlobalPatientSearchModal.js';
import { ModulePlaceholderView } from '../views/ModulePlaceholderView.js';
import { PatientListView } from '../patients/PatientListView.js';
import { AppointmentListView } from '../appointments/AppointmentListView.js';
import { CalendarView } from '../calendar/CalendarView.js';
import { TreatmentsListView } from '../catalog/TreatmentsListView.js';
import { GuidanceLibraryView } from '../catalog/GuidanceLibraryView.js';
import { ConsultationView } from '../consultations/ConsultationView.js';
import { PrescriptionEditor } from '../prescriptions/PrescriptionEditor.js';
import { SessionListView } from '../sessions/SessionListView.js';
import { SessionRecordView } from '../sessions/SessionRecordView.js';
import { PackageCatalogView } from '../packages/PackageCatalogView.js';
import { InvoicesListView } from '../billing/InvoicesListView.js';
import { RefundsListView } from '../billing/RefundsListView.js';
import { DailyCollectionsView } from '../billing/DailyCollectionsView.js';
import { ProductsListView } from '../inventory/ProductsListView.js';
import { SuppliersListView } from '../inventory/SuppliersListView.js';
import { PurchasesListView } from '../inventory/PurchasesListView.js';
import { StockOverviewView } from '../inventory/StockOverviewView.js';
import { IntegrationsView } from '../admin/IntegrationsView.js';
import { TemplatesView } from '../admin/TemplatesView.js';
import { NotificationsReportView } from '../reports/NotificationsReportView.js';
import { ReportsHubView } from '../modules/reports/ReportsHubView.js';
import { CallCenterDashboardView } from '../callcenter/CallCenterDashboardView.js';
import { FollowUpTasksListView } from '../callcenter/FollowUpTasksListView.js';
import { ALL_NAV_ITEMS, NAV_GROUPS, NavItem } from '../../navigation/navItems.js';
import { useI18n } from '../../i18n/I18nContext.js';
import { useAuth } from '../../context/AuthContext.js';
import { usePermissions } from '../../hooks/usePermissions.js';

export const AppShell: React.FC = () => {
  const { t } = useI18n();
  const { user } = useAuth();
  const { has } = usePermissions();

  // Navigation state
  const [collapsed, setCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [activePath, setActivePath] = useState('/dashboard');
  const [guidanceServiceId, setGuidanceServiceId] = useState<string | undefined>(undefined);
  const [activePrescriptionId, setActivePrescriptionId] = useState<string>('rx-sample-01');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [quickNotification, setQuickNotification] = useState<string | null>(null);

  // Active navigation item lookup
  const activeItem: NavItem =
    ALL_NAV_ITEMS.find((item) => item.path === activePath) || ALL_NAV_ITEMS[0];

  // Active group lookup for breadcrumb
  const activeGroup = NAV_GROUPS.find((group) =>
    group.items.some((item) => item.path === activePath)
  );

  const groupTitle = activeGroup ? t.nav[activeGroup.titleKey] || activeGroup.id : 'Overview';
  const itemTitle = t.nav[activeItem.labelKey] || activeItem.labelKey;

  // Global Keyboard Shortcuts (⌘K, /, Alt+N, Alt+P)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Search shortcut: ⌘K, Ctrl+K or /
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      } else if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault();
        setIsSearchOpen(true);
      }

      // Quick appointment shortcut (Alt+N)
      if (e.altKey && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        handleQuickNewAppointment();
      }

      // Quick patient registration (Alt+P)
      if (e.altKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        handleQuickRegisterPatient();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleQuickNewAppointment = () => {
    setActivePath('/appointments');
    setQuickNotification('Quick Action: New Appointment Booking modal triggered (Under 60s workflow).');
    setTimeout(() => setQuickNotification(null), 4000);
  };

  const handleQuickRegisterPatient = () => {
    setActivePath('/patients');
    setQuickNotification('Quick Action: Register New Patient with mandatory duplicate check.');
    setTimeout(() => setQuickNotification(null), 4000);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-brand-page text-brand-text">
      {/* Sidebar Navigation */}
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(!collapsed)}
        activePath={activePath}
        onNavigate={(path) => setActivePath(path)}
        isMobileOpen={isMobileOpen}
        onMobileClose={() => setIsMobileOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header Bar */}
        <TopBar
          onOpenMobileSidebar={() => setIsMobileOpen(true)}
          onOpenSearch={() => setIsSearchOpen(true)}
          breadcrumbs={{
            group: groupTitle,
            label: itemTitle,
          }}
          onQuickNewAppointment={handleQuickNewAppointment}
          onQuickRegisterPatient={handleQuickRegisterPatient}
          onNavigate={(p) => setActivePath(p)}
        />

        {/* Transient Notification Toast */}
        {quickNotification && (
          <div className="bg-emerald-600 text-white px-4 py-2 text-xs font-semibold flex items-center justify-between shadow-md animate-fade-in">
            <span>{quickNotification}</span>
            <button
              onClick={() => setQuickNotification(null)}
              className="text-white hover:text-emerald-100 font-bold ml-4"
            >
              ✕
            </button>
          </div>
        )}

        {/* Scrollable Viewport */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">
            {activePath === '/patients' || activePath === '/patients/duplicates' ? (
              <PatientListView />
            ) : activePath === '/appointments' ? (
              <AppointmentListView />
            ) : activePath === '/calendar' ? (
              <CalendarView />
            ) : activePath === '/catalog/treatments' ? (
              <TreatmentsListView
                onNavigateToGuidance={(sid) => {
                  setGuidanceServiceId(sid);
                  setActivePath('/catalog/guidance');
                }}
              />
            ) : activePath === '/catalog/guidance' || activePath === '/catalog/lifestyle' ? (
              <GuidanceLibraryView initialServiceId={guidanceServiceId} />
            ) : activePath === '/catalog/packages' ? (
              <PackageCatalogView onAssignToPatient={(pkgId) => setActivePath('/patients')} />
            ) : activePath === '/consultations' ? (
              <ConsultationView
                onOpenPrescription={(cnsId, ptId) => {
                  setActivePrescriptionId('rx-sample-01');
                  setActivePath('/prescriptions');
                }}
              />
            ) : activePath === '/prescriptions' ? (
              <PrescriptionEditor
                prescriptionId={activePrescriptionId}
                onBack={() => setActivePath('/consultations')}
              />
            ) : activePath === '/sessions' ? (
              selectedSessionId ? (
                <SessionRecordView
                  sessionId={selectedSessionId}
                  onBack={() => setSelectedSessionId(null)}
                />
              ) : (
                <SessionListView
                  onSelectSession={(id) => setSelectedSessionId(id)}
                />
              )
            ) : activePath === '/billing/invoices' || activePath === '/billing/payments' ? (
              <InvoicesListView />
            ) : activePath === '/billing/refunds' ? (
              <RefundsListView />
            ) : activePath === '/reports' ? (
              <ReportsHubView />
            ) : activePath === '/inventory/products' ? (
              <ProductsListView />
            ) : activePath === '/inventory/suppliers' ? (
              <SuppliersListView />
            ) : activePath === '/inventory/purchases' ? (
              <PurchasesListView />
            ) : activePath === '/inventory/stock' ? (
              <StockOverviewView />
            ) : activePath === '/admin/integrations' ? (
              <IntegrationsView />
            ) : activePath === '/admin/templates' ? (
              <TemplatesView />
            ) : activePath === '/reports/notifications' ? (
              <NotificationsReportView />
            ) : activePath === '/call-center' ? (
              <CallCenterDashboardView />
            ) : activePath === '/tasks' || activePath === '/follow-ups' || activePath === '/follow-up/tasks' ? (
              <FollowUpTasksListView />
            ) : (
              <ModulePlaceholderView
                item={activeItem}
                groupTitle={groupTitle}
                onOpenSearch={() => setIsSearchOpen(true)}
                onNewAppointment={handleQuickNewAppointment}
              />
            )}
          </div>
        </main>
      </div>

      {/* Global Patient Search Modal */}
      <GlobalPatientSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectPatient={(patientId) => {
          setActivePath('/patients');
          setQuickNotification(`Selected Patient: ${patientId}. Loaded patient records.`);
          setTimeout(() => setQuickNotification(null), 4000);
        }}
        onQuickBookAppointment={handleQuickNewAppointment}
      />
    </div>
  );
};
