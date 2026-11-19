import { api } from './client.js';
import type {
  PackageDto,
  PatientPackageDto,
  PackageSessionLedgerEntryDto,
  CreatePackageInput,
  UpdatePackageInput,
  AssignPackageInput,
  CancelPackageInput,
  RenewPackageInput,
  ReverseDeductionInput,
} from '@suoxi/shared-types';

export const packagesApi = {
  // Catalog Packages
  async listPackages(params?: { activeOnly?: boolean; search?: string }): Promise<PackageDto[]> {
    const searchParams = new URLSearchParams();
    if (params?.activeOnly) searchParams.append('activeOnly', 'true');
    if (params?.search) searchParams.append('search', params.search);

    const query = searchParams.toString();
    const url = query ? `/packages?${query}` : '/packages';
    return api.get<PackageDto[]>(url);
  },

  async getPackage(id: string): Promise<PackageDto> {
    return api.get<PackageDto>(`/packages/${id}`);
  },

  async createPackage(input: CreatePackageInput): Promise<PackageDto> {
    return api.post<PackageDto>('/packages', input);
  },

  async updatePackage(id: string, input: UpdatePackageInput): Promise<PackageDto> {
    return api.patch<PackageDto>(`/packages/${id}`, input);
  },

  async listExpiringPackages(withinDays: number = 30): Promise<PatientPackageDto[]> {
    return api.get<PatientPackageDto[]>(`/packages/expiring?withinDays=${withinDays}`);
  },

  // Patient Assigned Packages (Snapshots)
  async assignPackage(input: AssignPackageInput): Promise<PatientPackageDto> {
    return api.post<PatientPackageDto>('/packages/assign', input);
  },

  async listPatientPackages(patientId: string): Promise<PatientPackageDto[]> {
    return api.get<PatientPackageDto[]>(`/packages/patient/${patientId}`);
  },

  async getPatientPackage(id: string): Promise<PatientPackageDto> {
    return api.get<PatientPackageDto>(`/packages/patient-packages/${id}`);
  },

  async renewPackage(id: string, input: RenewPackageInput): Promise<PatientPackageDto> {
    return api.post<PatientPackageDto>(`/packages/patient-packages/${id}/renew`, input);
  },

  async cancelPackage(id: string, input: CancelPackageInput): Promise<PatientPackageDto> {
    return api.post<PatientPackageDto>(`/packages/patient-packages/${id}/cancel`, input);
  },

  // Reversals
  async reverseDeduction(ledgerId: string, input: ReverseDeductionInput): Promise<PackageSessionLedgerEntryDto> {
    return api.post<PackageSessionLedgerEntryDto>(
      `/packages/ledger/${ledgerId}/reverse`,
      input
    );
  },
};
