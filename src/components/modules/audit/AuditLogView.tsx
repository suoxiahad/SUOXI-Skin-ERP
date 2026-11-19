import React, { useState, useEffect } from 'react';
import { ShieldCheck, Lock, RefreshCw, Search } from 'lucide-react';
import { useApp } from '../../../context/AppContext.tsx';
import { api } from '../../../api/client.ts';
import type { AuditEvent } from '../../../types/index.ts';
import { formatDateDhaka } from '../../../utils/format.ts';
import { TableSkeleton } from '../../common/Skeleton.tsx';
import { EmptyState } from '../../common/EmptyState.tsx';

export const AuditLogView: React.FC = () => {
  const { addToast } = useApp();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchAuditEvents = async () => {
    setIsLoading(true);
    try {
      const list = await api.auditEvents.list();
      setEvents(list);
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Failed to load audit logs',
        description: (err as Error).message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditEvents();
  }, []);

  const filteredEvents = events.filter((ev) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      ev.action.toLowerCase().includes(q) ||
      ev.userName.toLowerCase().includes(q) ||
      ev.details.toLowerCase().includes(q) ||
      ev.resourceType.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Privileged Audit Log</h1>
            <span className="flex items-center gap-1 text-[11px] font-bold text-slate-600 bg-slate-200 px-2 py-0.5 rounded-md">
              <Lock className="w-3 h-3" />
              SOC-2 / HIPAA Aligned
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Immutable clinical, financial, and access security records (Hard Rule #7 & #10: Secrets strictly masked)
          </p>
        </div>

        <button
          onClick={fetchAuditEvents}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#0DA54F]' : ''}`} />
          Refresh Logs
        </button>
      </div>

      {/* Search */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 flex items-center justify-between shadow-2xs">
        <div className="relative w-full max-w-sm">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search action, user, or details..."
            className="pl-8 pr-3 py-1 text-xs rounded-lg border border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#0DA54F] w-full"
          />
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <TableSkeleton rows={4} cols={5} />
      ) : filteredEvents.length === 0 ? (
        <EmptyState
          title="No audit events found"
          description="There are currently no privileged audit events recorded."
        />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/90 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Timestamp (UTC / Dhaka)</th>
                  <th className="py-3 px-4">Operator & Role</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Target Resource</th>
                  <th className="py-3 px-4">Audit Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEvents.map((ev) => (
                  <tr key={ev.id} className="h-12 hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-4 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                      {ev.timestamp.replace('T', ' ').substring(0, 19)}
                    </td>

                    <td className="py-2.5 px-4">
                      <div className="font-semibold text-slate-800">{ev.userName}</div>
                      <span className="text-[10px] uppercase font-bold text-[#0DA54F]">
                        {ev.userRole}
                      </span>
                    </td>

                    <td className="py-2.5 px-4">
                      <span className="font-mono text-[11px] font-bold text-slate-700 px-2 py-0.5 rounded bg-slate-100 border border-slate-200">
                        {ev.action}
                      </span>
                    </td>

                    <td className="py-2.5 px-4 text-slate-600 font-mono text-[11px]">
                      {ev.resourceType} : {ev.resourceId}
                    </td>

                    <td className="py-2.5 px-4 text-slate-700 max-w-md truncate">
                      {ev.details}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
