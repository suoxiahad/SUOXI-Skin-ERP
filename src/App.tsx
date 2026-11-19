/**
 * SUOXI Skin Care & Aesthetic Center CRM (Dhaka, Bangladesh)
 * Main Application Component
 */

import React from 'react';
import { AppProvider, useApp } from './context/AppContext.tsx';
import { I18nProvider } from '../apps/web/src/i18n/I18nContext.js';
import { Sidebar } from './components/layout/Sidebar.tsx';
import { Topbar } from './components/layout/Topbar.tsx';
import { GlobalSearchModal } from './components/common/GlobalSearchModal.tsx';
import { QuickBookModal } from './components/modules/appointments/QuickBookModal.tsx';
import { PatientRegistrationModal } from './components/modules/patients/PatientRegistrationModal.tsx';
import { AppointmentList } from './components/modules/appointments/AppointmentList.tsx';
import { CalendarView } from '../apps/web/src/components/calendar/CalendarView.js';
import { TreatmentsListView } from '../apps/web/src/components/catalog/TreatmentsListView.js';
import { GuidanceLibraryView } from '../apps/web/src/components/catalog/GuidanceLibraryView.js';
import { ConsultationView } from '../apps/web/src/components/consultations/ConsultationView.js';
import { PrescriptionEditor } from '../apps/web/src/components/prescriptions/PrescriptionEditor.js';
import { DoctorConsultationView } from './components/modules/doctor/DoctorConsultationView.tsx';
import { RxProtocolsView } from './components/modules/doctor/RxProtocolsView.tsx';
import { PrescriptionListView } from './components/modules/consultation/PrescriptionListView.tsx';
import { MedicalDocumentsView } from './components/modules/consultation/MedicalDocumentsView.tsx';
import { PrescriptionPrintView } from './components/modules/doctor/PrescriptionPrintView.tsx';
import { TomorrowsCallList } from './components/modules/callcenter/TomorrowsCallList.tsx';
import { InvoiceList } from './components/modules/billing/InvoiceList.tsx';
import { POSBillingCounterView } from './components/modules/billing/POSBillingCounterView.tsx';
import { DailyClosingView } from './components/modules/billing/DailyClosingView.tsx';
import { SalesReportView } from './components/modules/billing/SalesReportView.tsx';
import { ReceptionCheckInView } from './components/modules/reception/ReceptionCheckInView.tsx';
import { PackageManagement } from './components/modules/packages/PackageManagement.tsx';
import { StockOverviewView } from './components/modules/inventory/StockOverviewView.tsx';
import { ProductCatalogView } from './components/modules/inventory/ProductCatalogView.tsx';
import { PurchaseOrdersView } from './components/modules/inventory/PurchaseOrdersView.tsx';
import { StockMovementLogsView } from './components/modules/inventory/StockMovementLogsView.tsx';
import { SuppliersDirectoryView } from './components/modules/inventory/SuppliersDirectoryView.tsx';
import { PatientListView } from './components/modules/patients/PatientListView.tsx';
import { ReferralCommissionsView } from './components/modules/referrals/ReferralCommissionsView.tsx';
import { AuditLogView } from './components/modules/audit/AuditLogView.tsx';
import { PatientPortalView } from './components/modules/portal/PatientPortalView.tsx';
import { PatientPortalApp } from '../apps/web/src/portal/PatientPortalApp.js';
import { SMSGatewayView } from './components/modules/integration/SMSGatewayView.tsx';
import { EmailGatewayView } from './components/modules/integration/EmailGatewayView.tsx';
import { UserManagementView } from './components/modules/users/UserManagementView.tsx';
import { SecuritySettingsView } from './components/modules/settings/SecuritySettingsView.tsx';
import { ExecutiveDashboardView } from './components/modules/dashboard/ExecutiveDashboardView.tsx';
import { StaffLoginView } from './components/auth/StaffLoginView.tsx';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

const AppContent: React.FC = () => {
  const {
    currentView,
    isQuickBookOpen,
    setIsQuickBookOpen,
    isPatientRegistrationOpen,
    setIsPatientRegistrationOpen,
    activePrescriptionPrintId,
    toasts,
    removeToast,
    isAddTreatmentOpen,
    setIsAddTreatmentOpen,
    isAddCategoryOpen,
    setIsAddCategoryOpen,
    navigate,
    authRequired,
  } = useApp();

  const isPortalRoute =
    typeof window !== 'undefined' &&
    (window.location.pathname.startsWith('/portal') || currentView === 'portal');

  if (isPortalRoute) {
    return <PatientPortalApp />;
  }

  if (authRequired) {
    return <StaffLoginView />;
  }

  const renderActiveView = () => {
    switch (currentView) {
      case 'dashboard':
        return <ExecutiveDashboardView />;
      case 'appointments':
        return <AppointmentList />;
      case 'calendar':
        return <CalendarView />;
      case 'treatments':
        return (
          <TreatmentsListView
            isAddTreatmentOpen={isAddTreatmentOpen}
            onCloseAddTreatment={() => {
              setIsAddTreatmentOpen(false);
              navigate('/treatments');
            }}
            isAddCategoryOpen={isAddCategoryOpen}
            onCloseAddCategory={() => {
              setIsAddCategoryOpen(false);
              navigate('/treatments');
            }}
          />
        );
      case 'guidance':
      case 'lifestyle':
        return <GuidanceLibraryView />;
      case 'consultation-desk':
      case 'doctor':
      case 'consultations':
        return <DoctorConsultationView />;
      case 'prescription-list':
      case 'prescriptions':
        return <PrescriptionListView />;
      case 'medical-documents':
      case 'documents':
        return <MedicalDocumentsView />;
      case 'rx-protocols':
        return <RxProtocolsView />;
      case 'reception-checkin':
      case 'reception':
        return <ReceptionCheckInView />;
      case 'call-center':
        return <TomorrowsCallList />;
      case 'billing-counter':
      case 'billing':
        return <POSBillingCounterView />;
      case 'billing-invoices':
      case 'invoices':
        return <InvoiceList />;
      case 'billing-closing':
        return <DailyClosingView />;
      case 'billing-sales-report':
      case 'sales-report':
        return <SalesReportView />;
      case 'sessions':
        return <PackageManagement />;
      case 'inventory-stock':
      case 'inventory':
        return <StockOverviewView />;
      case 'inventory-products':
        return <ProductCatalogView />;
      case 'inventory-purchases':
        return <PurchaseOrdersView />;
      case 'inventory-adjustments':
        return <StockMovementLogsView />;
      case 'inventory-suppliers':
        return <SuppliersDirectoryView />;
      case 'referrals-directory':
      case 'referrals-commissions':
      case 'referrals-rules':
      case 'referrals-payouts':
      case 'referrals':
        return <ReferralCommissionsView />;
      case 'integration-sms':
        return <SMSGatewayView />;
      case 'integration-email':
        return <EmailGatewayView />;
      case 'patients':
        return <PatientListView />;
      case 'portal':
        return <PatientPortalView />;
      case 'audit':
        return <AuditLogView />;
      case 'users-staff':
      case 'users-roles':
      case 'users-doctors':
      case 'users-roster':
      case 'users-security':
      case 'users':
        return <UserManagementView />;
      case 'settings-general':
      case 'settings-access-control':
      case 'settings-security':
      case 'settings-scheduling':
      case 'settings-backup':
      case 'settings':
        return <SecuritySettingsView />;
      default:
        return <AppointmentList />;
    }
  };

  return (
    <>
      <div
        className={`flex h-screen w-screen overflow-hidden bg-[#F5F7FA] ${
          activePrescriptionPrintId ? 'no-print' : ''
        }`}
      >
        {/* Sidebar Navigation */}
        <Sidebar />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          <Topbar />

          <main className="flex-1 overflow-y-auto p-4 sm:p-6">
            <div className="w-full">
              {renderActiveView()}
            </div>
          </main>
        </div>

        {/* Global Modals */}
        <GlobalSearchModal />
        <PatientRegistrationModal
          isOpen={isPatientRegistrationOpen}
          onClose={() => setIsPatientRegistrationOpen(false)}
        />
        <QuickBookModal
          isOpen={isQuickBookOpen}
          onClose={() => setIsQuickBookOpen(false)}
          onSuccess={(newApt) => {
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('appointments-updated', { detail: newApt }));
            }
          }}
        />

        {/* Toast Notification Container */}
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`pointer-events-auto p-3.5 rounded-xl border shadow-lg flex items-start gap-3 transition-all animate-in slide-in-from-bottom duration-200 ${
                toast.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : toast.type === 'error'
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : toast.type === 'warning'
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : 'bg-white border-slate-200 text-slate-800'
              }`}
            >
              {toast.type === 'success' && <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />}
              {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />}
              {toast.type === 'warning' && <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />}
              {toast.type === 'info' && <Info className="w-4 h-4 text-[#0DA54F] shrink-0 mt-0.5" />}

              <div className="flex-1 text-xs">
                <p className="font-bold">{toast.title}</p>
                {toast.description && <p className="text-[11px] opacity-90 mt-0.5">{toast.description}</p>}
              </div>

              <button
                onClick={() => removeToast(toast.id)}
                className="text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <PrescriptionPrintView />
    </>
  );
};

export default function App() {
  return (
    <I18nProvider>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </I18nProvider>
  );
}
