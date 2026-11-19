import React, { useState, useEffect } from 'react';
import { X, Lock, ShieldCheck, User, Users, DollarSign, Calendar, Clock, CreditCard, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { api } from '../../../api/client.ts';
import { useApp } from '../../../context/AppContext.tsx';
import type { ReferrerDetailSummaryDto } from '@suoxi/shared-types';
import { formatBDT, formatDateDhaka } from '../../../utils/format.ts';

interface ReferrerDetailModalProps {
  referrerId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenPayout?: (referrerId: string) => void;
}

export const ReferrerDetailModal: React.FC<ReferrerDetailModalProps> = ({
  referrerId,
  isOpen,
  onClose,
  onOpenPayout,
}) => {
  const { language, addToast } = useApp();
  const [data, setData] = useState<ReferrerDetailSummaryDto | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'patients' | 'commissions' | 'payouts'>('patients');

  const loadDetail = async () => {
    if (!referrerId) return;
    setIsLoading(true);
    try {
      const res = await api.referrals.getDetail(referrerId);
      setData(res);
    } catch (err: any) {
      addToast({
        type: 'error',
        title: language === 'bn' ? 'তথ্য লোড করতে ব্যর্থ' : 'Failed to load details',
        description: err.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && referrerId) {
      loadDetail();
    }
  }, [isOpen, referrerId]);

  if (!isOpen || !referrerId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden border border-slate-100 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-emerald-50/70 via-slate-50 to-white border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-sm">
              {data?.referrer.fullName ? data.referrer.fullName.charAt(0).toUpperCase() : 'R'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  {data?.referrer.fullName || 'Loading...'}
                </h2>
                {data?.referrer.fullNameBn && (
                  <span className="text-xs text-slate-500 font-normal">
                    ({data.referrer.fullNameBn})
                  </span>
                )}
                <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-md bg-emerald-100 text-[#0DA54F]">
                  {data?.referrer.referrerCode}
                </span>
                <span className="px-2 py-0.5 text-[10px] font-semibold capitalize rounded-md bg-slate-100 text-slate-600">
                  {data?.referrer.referrerType}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                <span>{data?.referrer.mobile}</span>
                {data?.referrer.organizationName && (
                  <>
                    <span>•</span>
                    <span>{data.referrer.organizationName}</span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadDetail}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-[#0DA54F]' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {isLoading && !data ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400">
              <div className="w-8 h-8 border-3 border-emerald-500/20 border-t-emerald-600 rounded-full animate-spin mb-3" />
              <p className="text-xs">{language === 'bn' ? 'তথ্য লোড হচ্ছে...' : 'Loading referrer summary...'}</p>
            </div>
          ) : data ? (
            <>
              {/* Financial KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-amber-50/60 border border-amber-200/60">
                  <span className="text-[11px] font-semibold text-amber-700 block">
                    {language === 'bn' ? 'অমীমাংসিত কমিশন' : 'Pending Commission'}
                  </span>
                  <span className="text-lg font-bold text-amber-900 mt-1 block tabular-nums">
                    {formatBDT(data.summary.totalPending)}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-blue-50/60 border border-blue-200/60">
                  <span className="text-[11px] font-semibold text-blue-700 block">
                    {language === 'bn' ? 'অনুমোদিত (পে-আউট যোগ্য)' : 'Approved for Payout'}
                  </span>
                  <span className="text-lg font-bold text-blue-900 mt-1 block tabular-nums">
                    {formatBDT(data.summary.totalApproved)}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-200/60">
                  <span className="text-[11px] font-semibold text-emerald-700 block">
                    {language === 'bn' ? 'মোট পরিশোধিত কমিশন' : 'Total Paid Out'}
                  </span>
                  <span className="text-lg font-bold text-emerald-900 mt-1 block tabular-nums">
                    {formatBDT(data.summary.totalPaid)}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70">
                  <span className="text-[11px] font-semibold text-slate-600 block">
                    {language === 'bn' ? 'সংযুক্ত রোগী সংখ্যা' : 'Referred Patients'}
                  </span>
                  <span className="text-lg font-bold text-slate-800 mt-1 block tabular-nums">
                    {data.summary.patientCount}
                  </span>
                </div>
              </div>

              {/* Payout & Banking Info Banner */}
              <div className="p-3 rounded-xl bg-slate-50/90 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-100 text-[#0DA54F] flex items-center justify-center">
                    <CreditCard className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-semibold text-slate-700">
                      {language === 'bn' ? 'পে-আউট মেথড:' : 'Payout Method:'}{' '}
                      <span className="capitalize text-slate-900 font-bold">{data.referrer.payoutMethod}</span>
                    </span>
                    <span className="mx-2 text-slate-300">|</span>
                    <span className="text-slate-600 font-mono text-[11px]">
                      {data.referrer.payoutDetailsMasked || 'No bank/wallet details specified'}
                    </span>
                  </div>
                </div>

                {data.summary.totalApproved > 0 && onOpenPayout && (
                  <button
                    onClick={() => {
                      onClose();
                      onOpenPayout(referrerId);
                    }}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-[#0DA54F] hover:bg-[#0b8a42] rounded-lg transition-colors shadow-2xs self-start sm:self-auto"
                  >
                    {language === 'bn' ? 'পে-আউট তৈরি করুন' : 'Create Payout'}
                  </button>
                )}
              </div>

              {/* Tabs */}
              <div className="border-b border-slate-200 flex items-center gap-6">
                <button
                  onClick={() => setActiveTab('patients')}
                  className={`pb-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                    activeTab === 'patients'
                      ? 'border-[#0DA54F] text-[#0DA54F]'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>{language === 'bn' ? 'রেফারকৃত রোগী' : 'Referred Patients'} ({data.attributions.length})</span>
                </button>

                <button
                  onClick={() => setActiveTab('commissions')}
                  className={`pb-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                    activeTab === 'commissions'
                      ? 'border-[#0DA54F] text-[#0DA54F]'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  <span>{language === 'bn' ? 'কমিশন লেজার' : 'Commissions'} ({data.commissions.length})</span>
                </button>

                <button
                  onClick={() => setActiveTab('payouts')}
                  className={`pb-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                    activeTab === 'payouts'
                      ? 'border-[#0DA54F] text-[#0DA54F]'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>{language === 'bn' ? 'পে-আউট ইতিহাস' : 'Payout History'} ({data.payouts.length})</span>
                </button>
              </div>

              {/* Tab 1: Referred Patients */}
              {activeTab === 'patients' && (
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50/90 text-slate-600 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-2.5">Patient ID</th>
                        <th className="px-4 py-2.5">Status</th>
                        <th className="px-4 py-2.5">Effective Date</th>
                        <th className="px-4 py-2.5">Attribution Reason</th>
                        <th className="px-4 py-2.5">Assigned By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.attributions.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                            {language === 'bn' ? 'কোন রোগী সংযুক্ত নেই' : 'No patients currently attributed to this referrer'}
                          </td>
                        </tr>
                      ) : (
                        data.attributions.map((attr) => (
                          <tr key={attr.id} className="hover:bg-slate-50/60">
                            <td className="px-4 py-2.5 font-semibold text-slate-800">
                              {attr.patientId}
                            </td>
                            <td className="px-4 py-2.5">
                              {attr.isCurrent ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-800 rounded-full">
                                  <CheckCircle className="w-2.5 h-2.5" /> Current
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-500 rounded-full">
                                  Historical
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-slate-500 tabular-nums">
                              {formatDateDhaka(attr.effectiveFrom)}
                            </td>
                            <td className="px-4 py-2.5 text-slate-700 max-w-xs truncate" title={attr.attributionReason}>
                              {attr.attributionReason}
                            </td>
                            <td className="px-4 py-2.5 text-slate-500">
                              {attr.assignedByName || attr.assignedBy}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Tab 2: Commissions */}
              {activeTab === 'commissions' && (
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50/90 text-slate-600 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="px-3.5 py-2.5">Commission Code</th>
                        <th className="px-3.5 py-2.5">Date</th>
                        <th className="px-3.5 py-2.5">Patient</th>
                        <th className="px-3.5 py-2.5 text-right">Base Amount</th>
                        <th className="px-3.5 py-2.5 text-right">Rate</th>
                        <th className="px-3.5 py-2.5 text-right">Net Amount</th>
                        <th className="px-3.5 py-2.5 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.commissions.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                            {language === 'bn' ? 'কোন কমিশন রেকর্ড নেই' : 'No commission records accrued yet'}
                          </td>
                        </tr>
                      ) : (
                        data.commissions.map((comm) => (
                          <tr key={comm.id} className="hover:bg-slate-50/60">
                            <td className="px-3.5 py-2.5 font-semibold text-slate-800">
                              <span className="font-mono">{comm.commissionCode}</span>
                              {comm.kind === 'reversal' && (
                                <span className="ml-1.5 px-1.5 py-0.2 text-[9px] font-bold uppercase rounded bg-rose-100 text-rose-700">
                                  Reversal
                                </span>
                              )}
                            </td>
                            <td className="px-3.5 py-2.5 text-slate-500 tabular-nums">
                              {formatDateDhaka(comm.createdAt)}
                            </td>
                            <td className="px-3.5 py-2.5 text-slate-700">
                              {comm.patientName}
                            </td>
                            <td className="px-3.5 py-2.5 text-right font-mono tabular-nums text-slate-600">
                              {formatBDT(comm.baseAmount)}
                            </td>
                            <td className="px-3.5 py-2.5 text-right text-slate-600">
                              {comm.appliedCalculationType === 'percentage'
                                ? `${comm.appliedRate}%`
                                : `৳ ${comm.appliedRate}`}
                            </td>
                            <td className={`px-3.5 py-2.5 text-right font-mono font-bold tabular-nums ${
                              comm.netAmount < 0 ? 'text-rose-600' : 'text-emerald-700'
                            }`}>
                              {formatBDT(comm.netAmount)}
                            </td>
                            <td className="px-3.5 py-2.5 text-center">
                              <span className={`inline-flex px-2 py-0.5 text-[10px] font-semibold rounded-full capitalize ${
                                comm.status === 'paid'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : comm.status === 'approved'
                                  ? 'bg-blue-100 text-blue-800'
                                  : comm.status === 'adjusted'
                                  ? 'bg-purple-100 text-purple-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}>
                                {comm.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Tab 3: Payouts */}
              {activeTab === 'payouts' && (
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50/90 text-slate-600 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="px-3.5 py-2.5">Payout No</th>
                        <th className="px-3.5 py-2.5">Paid Date</th>
                        <th className="px-3.5 py-2.5">Method</th>
                        <th className="px-3.5 py-2.5">Trx Reference</th>
                        <th className="px-3.5 py-2.5 text-right">Gross</th>
                        <th className="px-3.5 py-2.5 text-right">Withholding</th>
                        <th className="px-3.5 py-2.5 text-right">Net Paid</th>
                        <th className="px-3.5 py-2.5">Authorized By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.payouts.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                            {language === 'bn' ? 'কোন পে-আউট সম্পন্ন হয়নি' : 'No payout settlements created yet'}
                          </td>
                        </tr>
                      ) : (
                        data.payouts.map((p) => (
                          <tr key={p.id} className="hover:bg-slate-50/60">
                            <td className="px-3.5 py-2.5 font-bold font-mono text-slate-800">
                              {p.payoutNumber}
                            </td>
                            <td className="px-3.5 py-2.5 text-slate-500 tabular-nums">
                              {p.paidDate}
                            </td>
                            <td className="px-3.5 py-2.5 capitalize text-slate-700">
                              {p.payoutMethod}
                            </td>
                            <td className="px-3.5 py-2.5 font-mono text-slate-600">
                              {p.paymentReference}
                            </td>
                            <td className="px-3.5 py-2.5 text-right font-mono tabular-nums text-slate-600">
                              {formatBDT(p.grossAmount)}
                            </td>
                            <td className="px-3.5 py-2.5 text-right font-mono tabular-nums text-amber-700">
                              {formatBDT(p.withholdingAmount)}
                            </td>
                            <td className="px-3.5 py-2.5 text-right font-mono font-bold tabular-nums text-emerald-700">
                              {formatBDT(p.netPayoutAmount)}
                            </td>
                            <td className="px-3.5 py-2.5 text-slate-500">
                              {p.authorizedByName}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
