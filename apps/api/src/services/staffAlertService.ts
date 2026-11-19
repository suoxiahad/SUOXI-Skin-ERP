import crypto from 'node:crypto';
import type { StaffAlertDto, StaffAlertType } from '@suoxi/shared-types';
import { NotFoundError } from '../middleware/errorHandler.js';

export class StaffAlertService {
  private alerts = new Map<string, StaffAlertDto>();
  private seq = 1;

  constructor() {
    this.seedInitialAlerts();
  }

  private seedInitialAlerts() {
    const now = new Date();
    const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

    const sample1: StaffAlertDto = {
      id: 'alt-1',
      branch_id: 'br-dhk-01',
      alert_type: 'upcoming_session',
      title: 'Upcoming Session Tomorrow',
      message: 'Sumaiya Rahman has a Hydrafacial session scheduled tomorrow at 10:30 AM.',
      link_path: '/appointments',
      is_read: false,
      metadata: { appointmentId: 'apt-1', patientName: 'Sumaiya Rahman' },
      created_at: tenMinAgo,
    };

    const sample2: StaffAlertDto = {
      id: 'alt-2',
      branch_id: 'br-dhk-01',
      alert_type: 'low_stock',
      title: 'Consumable Reorder Level Alert',
      message: 'Hyaluronic Acid 2% Serum stock is below reorder threshold (3 units remaining).',
      link_path: '/inventory',
      is_read: false,
      metadata: { productId: 'prod-ha-01', stockOnHand: 3, reorderLevel: 5 },
      created_at: oneHourAgo,
    };

    this.alerts.set(sample1.id, sample1);
    this.alerts.set(sample2.id, sample2);
    this.seq = 3;
  }

  public resetData() {
    this.alerts.clear();
    this.seq = 1;
    this.seedInitialAlerts();
  }

  public async createAlert(data: {
    userId?: string;
    branchId: string;
    alertType: StaffAlertType;
    title: string;
    message: string;
    linkPath?: string;
    metadata?: Record<string, unknown>;
  }): Promise<StaffAlertDto> {
    const id = `alt-${this.seq++}`;
    const alert: StaffAlertDto = {
      id,
      user_id: data.userId,
      branch_id: data.branchId,
      alert_type: data.alertType,
      title: data.title,
      message: data.message,
      link_path: data.linkPath,
      is_read: false,
      metadata: data.metadata,
      created_at: new Date().toISOString(),
    };

    this.alerts.set(id, alert);
    return alert;
  }

  public async listAlerts(params: {
    userId?: string;
    branchId?: string;
    isRead?: boolean;
    limit?: number;
  }): Promise<{ alerts: StaffAlertDto[]; unreadCount: number }> {
    let list = Array.from(this.alerts.values());

    // Branch filter: if provided, match branch or alerts without branch restriction
    if (params.branchId) {
      list = list.filter((a) => a.branch_id === params.branchId);
    }

    // User filter: user specific or broadcast alerts (userId is null)
    if (params.userId) {
      list = list.filter((a) => !a.user_id || a.user_id === params.userId);
    }

    const totalUnread = list.filter((a) => !a.is_read).length;

    if (params.isRead !== undefined) {
      list = list.filter((a) => a.is_read === params.isRead);
    }

    // Sort descending by created_at
    list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    if (params.limit && params.limit > 0) {
      list = list.slice(0, params.limit);
    }

    return { alerts: list, unreadCount: totalUnread };
  }

  public async markAsRead(alertId: string, userId?: string): Promise<StaffAlertDto> {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      throw new NotFoundError(`Staff alert '${alertId}' not found`);
    }

    alert.is_read = true;
    alert.read_at = new Date().toISOString();
    return alert;
  }

  public async markAllAsRead(userId?: string, branchId?: string): Promise<number> {
    let count = 0;
    const now = new Date().toISOString();

    for (const alert of this.alerts.values()) {
      if (alert.is_read) continue;
      if (branchId && alert.branch_id !== branchId) continue;
      if (userId && alert.user_id && alert.user_id !== userId) continue;

      alert.is_read = true;
      alert.read_at = now;
      count++;
    }

    return count;
  }
}

export const staffAlertService = new StaffAlertService();
