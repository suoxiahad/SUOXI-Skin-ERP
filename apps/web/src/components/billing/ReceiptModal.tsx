import React from 'react';
import {
  Printer,
  CheckCircle2,
  ShieldAlert,
  X,
  Building2,
  FileText,
  User,
  Calendar,
  CreditCard,
} from 'lucide-react';
import type { ReceiptDto } from '@suoxi/shared-types';
import { useI18n } from '../../i18n/I18nContext.js';

interface ReceiptModalProps {
  receipt: ReceiptDto;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({ receipt, onClose }) => {
  const { lang } = useI18n();
  const isBn = lang === 'bn';

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm print:p-0 print:bg-white">
      <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden print:border-none print:shadow-none">
        {/* Top Action Bar (hidden on print) */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4 print:hidden">
          <div className="flex items-center gap-2">
            <Printer className="h-5 w-5 text-emerald-600" />
            <h3 className="font-semibold text-slate-800">
              {isBn ? 'মানি রিসিট' : 'Official Money Receipt'}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition"
            >
              <Printer className="h-4 w-4" />
              {isBn ? 'প্রিন্ট করুন' : 'Print Receipt'}
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Printable Receipt Body */}
        <div className="p-8 space-y-6 text-slate-800" id="printable-receipt">
          {/* Clinic Header */}
          <div className="text-center border-b border-slate-200 pb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 mb-2">
              <Building2 className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              SUOXI Skin Care & Aesthetic Center
            </h1>
            <p className="text-sm text-slate-500 font-bengali">
              সুক্সি স্কিন কেয়ার অ্যান্ড এসথেটিক সেন্টার
            </p>
            <p className="text-xs text-slate-500 mt-1">
              House 42, Road 11, Dhanmondi, Dhaka-1209, Bangladesh • Hotline: +880 1700-000000
            </p>
            <div className="mt-3 inline-block rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-700 border border-emerald-200">
              {isBn ? 'অর্থ প্রাপ্তি রসিদ' : 'Official Money Receipt'}
            </div>
          </div>

          {/* Receipt & Patient Meta Grid */}
          <div className="grid grid-cols-2 gap-4 text-sm bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div>
              <p className="text-xs text-slate-500">{isBn ? 'রসিদ নম্বর' : 'Receipt No'}</p>
              <p className="font-mono font-semibold text-slate-900">{receipt.receiptNo}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">{isBn ? 'তারিখ ও সময়' : 'Date & Time'}</p>
              <p className="font-medium text-slate-800">
                {new Date(receipt.paymentDate).toLocaleString('en-GB', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">{isBn ? 'রোগীর নাম' : 'Patient Name'}</p>
              <p className="font-semibold text-slate-900">{receipt.patientName}</p>
              <p className="text-xs font-mono text-slate-500">{receipt.patientCode}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">{isBn ? 'শাখা' : 'Clinic Branch'}</p>
              <p className="font-medium text-slate-800">{receipt.branchName}</p>
            </div>
          </div>

          {/* Payment Method & TrxID */}
          <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-slate-100 text-slate-600">
                <CreditCard className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-slate-500">{isBn ? 'পেমেন্ট মাধ্যম' : 'Payment Method'}</p>
                <p className="font-semibold text-slate-900">{receipt.paymentMethodName}</p>
                {receipt.transactionReference && (
                  <p className="text-xs font-mono text-emerald-700">
                    TrxID: {receipt.transactionReference}
                  </p>
                )}
              </div>
            </div>

            {/* Staff Recorded Badge (Prominently displayed) */}
            <div className="text-right">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 border border-amber-300">
                <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />
                Staff recorded
              </span>
              <p className="text-[10px] text-slate-400 mt-1">Manual entry (No gateway check)</p>
            </div>
          </div>

          {/* Allocations Table */}
          {receipt.allocations && receipt.allocations.length > 0 ? (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                {isBn ? 'ইনভয়েস সমন্বয়' : 'Invoice Allocations'}
              </h4>
              <table className="w-full text-left text-sm border border-slate-200 rounded-lg overflow-hidden">
                <thead className="bg-slate-50 text-xs font-medium text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-3">Invoice No</th>
                    <th className="py-2 px-3 text-right">Total</th>
                    <th className="py-2 px-3 text-right">Allocated</th>
                    <th className="py-2 px-3 text-right">Remaining Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {receipt.allocations.map((a, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="py-2.5 px-3 font-mono font-medium">{a.invoiceNo}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums">৳ {Number(a.invoiceTotal).toLocaleString()}</td>
                      <td className="py-2.5 px-3 text-right font-semibold text-emerald-600 tabular-nums">
                        ৳ {Number(a.allocatedAmount).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-slate-600">
                        ৳ {Number(a.remainingDue).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
              {isBn
                ? 'অ্যাডভান্স পেমেন্ট: পরবর্তীতে রোগীর চিকিৎসা ইনভয়েসের সাথে সমন্বয় করা যাবে।'
                : 'Advance Payment: Held on patient account and can be allocated to future treatment invoices.'}
            </div>
          )}

          {/* Amount In Figures & Words */}
          <div className="rounded-xl bg-emerald-50/60 p-5 border border-emerald-200">
            <div className="flex items-center justify-between border-b border-emerald-200/80 pb-3">
              <span className="text-sm font-medium text-emerald-900">
                {isBn ? 'মোট গ্রহণকৃত অর্থ' : 'Total Amount Received'}
              </span>
              <span className="text-2xl font-bold text-emerald-700 tabular-nums font-mono">
                ৳ {Number(receipt.amount).toLocaleString()}
              </span>
            </div>
            <div className="pt-3">
              <p className="text-xs font-medium text-emerald-800 uppercase tracking-wide">
                {isBn ? 'কথায়' : 'In Words'}
              </p>
              <p className="text-sm font-semibold text-slate-800 italic mt-0.5">
                {receipt.amountInWords}
              </p>
            </div>
          </div>

          {/* Footer & Signatures */}
          <div className="pt-8 grid grid-cols-2 gap-8 text-xs text-slate-500 border-t border-slate-200">
            <div>
              <p className="text-slate-400">Recorded By:</p>
              <p className="font-semibold text-slate-700">{receipt.recordedByName}</p>
              <p className="text-[11px] text-slate-400">Authorized Accounts Desk</p>
            </div>
            <div className="text-right">
              <div className="inline-block border-b border-slate-300 w-36 mb-1"></div>
              <p className="text-slate-600 font-medium">Customer Signature</p>
              <p className="text-[10px] text-slate-400">Thank you for visiting SUOXI Center</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
