import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { BadRequestError } from '../middleware/errorHandler.js';
import { appointmentService } from '../services/appointmentService.js';
import { scheduleRepository } from '../services/scheduleService.js';
import type { CalendarAppointmentItemDto, CalendarResponseDto } from '@suoxi/shared-types';

export const calendarRouter = Router();

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// -----------------------------------------------------------------------------
// GET /calendar (Unified Calendar Schedule & Appointments)
// Capped at 42 days window (6 weeks) for performance and UI clarity
// -----------------------------------------------------------------------------
calendarRouter.get(
  '/',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const from = req.query.from as string;
      const to = req.query.to as string;
      const providerId = req.query.providerId as string | undefined;
      const resourceId = req.query.resourceId as string | undefined;
      const rawBranchId = (req.query.branchId as string) || req.accessContext?.primaryBranchId || 'br-dhanmondi';
      const branchId = rawBranchId === 'SKC-01' || rawBranchId === '1' ? 'br-dhanmondi' : rawBranchId;

      // 1. Mandatory Date Format Verification
      if (!from || !DATE_REGEX.test(from)) {
        throw new BadRequestError('Invalid or missing "from" query parameter. Format must be YYYY-MM-DD');
      }
      if (!to || !DATE_REGEX.test(to)) {
        throw new BadRequestError('Invalid or missing "to" query parameter. Format must be YYYY-MM-DD');
      }

      // 2. Date Range Verification (Range Capped at 42 days)
      const fromDate = new Date(`${from}T00:00:00Z`);
      const toDate = new Date(`${to}T23:59:59Z`);

      if (toDate.getTime() < fromDate.getTime()) {
        throw new BadRequestError('"from" date cannot be after "to" date');
      }

      const diffDays = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays > 42) {
        throw new BadRequestError('Date range exceeds maximum allowed window of 42 days');
      }

      // 3. Branch Scoping Check
      if (
        req.accessContext &&
        !req.accessContext.allBranches &&
        !req.accessContext.canAccessBranch(branchId) &&
        !req.accessContext.canAccessBranch(rawBranchId)
      ) {
        res.status(200).json({
          data: {
            from,
            to,
            appointments: [],
            schedules: [],
            timeOffs: [],
            settings: {
              drag_reschedule_enabled: true,
              operating_start_time: '09:00',
              operating_end_time: '20:00',
            },
          },
          meta: {
            totalAppointments: 0,
            requestId: req.id,
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      // 4. Role-aware DTO serialization: Call-Center role excludes sensitive clinical details
      const isCallCenterOnly =
        req.accessContext?.roles.length === 1 && req.accessContext.roles[0] === 'call_center';

      // 5. Query Appointments in Range
      const appointmentsResult = appointmentService.listAppointments({
        branchId,
        providerId: providerId !== 'all' ? providerId : undefined,
        startDate: from,
        endDate: to,
        limit: 1000,
      });

      let filteredAppointments = appointmentsResult.items;
      if (resourceId && resourceId !== 'all') {
        filteredAppointments = filteredAppointments.filter((a) => a.resource_id === resourceId);
      }

      const calendarAppointments: CalendarAppointmentItemDto[] = filteredAppointments.map((apt) => ({
        id: apt.id,
        appointment_code: apt.appointment_code,
        branch_id: apt.branch_id,
        patient_id: apt.patient_id,
        patient_name: apt.patient_name,
        patient_mobile: isCallCenterOnly ? undefined : apt.patient_mobile,
        provider_id: apt.provider_id,
        provider_name: apt.provider_name,
        resource_id: apt.resource_id,
        resource_name: apt.resource_name,
        service_name: apt.service_name,
        service_category: apt.service_category,
        appointment_date: apt.appointment_date,
        start_time: apt.start_time,
        end_time: apt.end_time,
        duration_minutes: apt.duration_minutes,
        status: apt.status,
        set_by_clinician: apt.set_by_clinician,
        is_walk_in: apt.is_walk_in,
        // Call-center DTO excludes clinical notes
        notes: isCallCenterOnly ? null : apt.notes,
      }));

      // 6. Query Provider Weekly Schedules for Shading Working Hours
      const schedules = scheduleRepository.getAllSchedules(
        branchId,
        providerId !== 'all' ? providerId : undefined
      );

      // 7. Query Time-Off Blocks for Hatched Rendering
      const timeOffs = scheduleRepository.getAllTimeOffs(
        from,
        to,
        providerId !== 'all' ? providerId : undefined
      );

      const responsePayload: CalendarResponseDto = {
        from,
        to,
        appointments: calendarAppointments,
        schedules: schedules.map((s) => ({
          id: s.id,
          provider_id: s.provider_id,
          branch_id: s.branch_id,
          day_of_week: s.day_of_week,
          start_time: s.start_time,
          end_time: s.end_time,
          slot_duration_minutes: s.slot_duration_minutes,
        })),
        timeOffs: timeOffs.map((t) => ({
          id: t.id,
          provider_id: t.provider_id,
          start_datetime: t.start_datetime,
          end_datetime: t.end_datetime,
          reason: t.reason,
        })),
        settings: {
          drag_reschedule_enabled: true,
          operating_start_time: '09:00',
          operating_end_time: '20:00',
        },
      };

      res.status(200).json({
        data: responsePayload,
        meta: {
          totalAppointments: calendarAppointments.length,
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);
