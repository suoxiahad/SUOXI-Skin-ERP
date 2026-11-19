import React, { useState, useEffect } from 'react';
import {
  Printer,
  X,
  Phone,
  User,
  Calendar,
  Sparkles,
  Download,
} from 'lucide-react';
import type { Invoice } from '../../../types/index.ts';
import { api } from '../../../api/client.ts';

interface A4InvoiceModalProps {
  invoice: Invoice | null;
  onClose: () => void;
}

// Convert numbers to English words (e.g. 12750 -> Twelve Thousand Seven Hundred Fifty Only)
function numberToWordsBD(num: number | undefined | null): string {
  if (!num || isNaN(num) || num <= 0) return 'Zero Only';

  const a = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
  ];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertChunk(n: number): string {
    if (n === 0) return '';
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : '');
    if (n < 1000) return a[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' ' + convertChunk(n % 100) : '');
    if (n < 100000) return convertChunk(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 !== 0 ? ' ' + convertChunk(n % 1000) : '');
    if (n < 10000000) return convertChunk(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 !== 0 ? ' ' + convertChunk(n % 100000) : '');
    return convertChunk(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 !== 0 ? ' ' + convertChunk(n % 10000000) : '');
  }

  const integerPart = Math.floor(Math.abs(num));
  const words = convertChunk(integerPart).trim();
  return words ? `${words} Only` : 'Zero Only';
}

function formatInvoiceDate(dateStr?: string): string {
  if (!dateStr) return 'May 30, 2025';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  } catch {
    return dateStr;
  }
}

function formatDecimals(val?: number): string {
  if (val === undefined || val === null || isNaN(val)) return '0.00';
  return val.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatNumber(val?: number): string {
  if (val === undefined || val === null || isNaN(val)) return '0';
  return val.toLocaleString('en-US');
}

export const A4InvoiceModal: React.FC<A4InvoiceModalProps> = ({ invoice, onClose }) => {
  const [patientData, setPatientData] = useState<any>(null);

  // Fetch full patient data if needed for phone, gender, age, patient ID code
  useEffect(() => {
    if (invoice?.patientId) {
      api.patients.getById(invoice.patientId)
        .then((res) => {
          if (res?.patient) setPatientData(res.patient);
        })
        .catch(() => {
          // ignore
        });
    }
  }, [invoice?.patientId]);

  if (!invoice) return null;

  const handlePrint = () => {
    window.print();
  };

  const logoUrl = 'https://i0.wp.com/suoxiskincare.com/wp-content/uploads/2025/01/suoxi-hospital-skin-care-logo-1.png';

  // Derived patient information
  const patientName = (invoice.patientName || patientData?.name || 'MD AHAD ALI').toUpperCase();
  const patientPhone = invoice.patientPhone || patientData?.phone || '+8801314113066';
  const patientGender =
    invoice.patientGender ||
    (patientData?.gender === 'female' ? 'Female' : 'Male');
  const patientAge = invoice.patientAge || patientData?.age || 31;
  const patientIdCode =
    invoice.patientCode ||
    patientData?.patientIdCode ||
    (invoice.patientId ? invoice.patientId.replace(/^pat-/, '') : '5465465');

  // Derived payment method details
  const primaryPayment = invoice.payments && invoice.payments.length > 0 ? invoice.payments[0] : null;
  const paymentMethodName = primaryPayment
    ? primaryPayment.method === 'bkash'
      ? 'bKash'
      : primaryPayment.method === 'card'
      ? 'City Bank POS Card'
      : primaryPayment.method === 'nagad'
      ? 'Nagad'
      : primaryPayment.method === 'bank_transfer'
      ? 'BRAC Bank'
      : 'Cash Counter'
    : invoice.bankName || 'bKash';

  const paymentAccountNumber =
    primaryPayment?.transactionRef ||
    primaryPayment?.receiptNumber ||
    invoice.accountNumber ||
    '0123 4567 8901';

  const preparedBy = invoice.createdBy || 'H.M. Zakir Hossain';

  // Fallback demo items if none exist
  const displayItems =
    invoice.items && invoice.items.length > 0
      ? invoice.items
      : [
          { id: '1', description: 'HydraFacial', quantity: 2, unitPriceBDT: 3000, discountBDT: 0, totalBDT: 6000 },
          { id: '2', description: 'Fractional CO2 Laser', quantity: 1, unitPriceBDT: 2000, discountBDT: 0, totalBDT: 2000 },
          { id: '3', description: 'Chemical Peel', quantity: 1, unitPriceBDT: 3000, discountBDT: 0, totalBDT: 3000 },
          { id: '4', description: 'Mineral Sunscreen SPF 50+ PA++++', quantity: 1, unitPriceBDT: 1200, discountBDT: 0, totalBDT: 1200 },
          { id: '5', description: 'Acid 20% DermaCream (30g)', quantity: 2, unitPriceBDT: 500, discountBDT: 0, totalBDT: 1000 },
        ];

  const subtotal = invoice.subtotalBDT || displayItems.reduce((acc, it) => acc + (it.unitPriceBDT * it.quantity), 0);
  const discount = invoice.discountBDT || 450;
  const netPayable = invoice.totalAmountBDT || (subtotal - discount);
  const totalPayment = invoice.paidAmountBDT > 0 ? invoice.paidAmountBDT : netPayable;
  const dueAmount = invoice.dueAmountBDT ?? Math.max(0, netPayable - totalPayment);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-150 print:p-0 print:m-0 print:bg-white print:static print:block print:overflow-visible a4-modal-overlay">
      {/* Modal Container */}
      <div className="bg-white rounded-2xl max-w-4xl w-full border border-slate-200 shadow-2xl overflow-hidden my-4 sm:my-8 flex flex-col max-h-[95vh] print:max-h-none print:m-0 print:border-none print:shadow-none print:w-full print:rounded-none a4-modal-card">
        
        {/* Print Styling Enforcer - Isolates ONLY the invoice sheet and hides the CRM website */}
        <style>{`
          @media print {
            @page {
              size: A4 portrait;
              margin: 10mm 12mm 10mm 12mm;
            }
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              background: #ffffff !important;
              color: #000000 !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              overflow: visible !important;
              height: 100% !important;
            }
            /* 1. Hide everything on the page */
            body * {
              visibility: hidden !important;
            }
            /* 2. Show ONLY the invoice sheet and its inner contents */
            #printable-a4-invoice,
            #printable-a4-invoice * {
              visibility: visible !important;
            }
            /* 3. Strip overlay background, shadows, borders and position cleanly */
            .a4-modal-overlay,
            .a4-modal-card {
              position: static !important;
              background: transparent !important;
              background-color: transparent !important;
              backdrop-filter: none !important;
              -webkit-backdrop-filter: none !important;
              box-shadow: none !important;
              border: none !important;
              border-radius: 0 !important;
              margin: 0 !important;
              padding: 0 !important;
              width: 100% !important;
              max-width: 100% !important;
              height: 100% !important;
              overflow: visible !important;
            }
            #printable-a4-invoice {
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              width: 100% !important;
              min-height: calc(297mm - 20mm) !important;
              height: calc(297mm - 20mm) !important;
              display: flex !important;
              flex-direction: column !important;
              justify-content: space-between !important;
              box-sizing: border-box !important;
              margin: 0 !important;
              padding: 0 !important;
              background: #ffffff !important;
              box-shadow: none !important;
              border: none !important;
              border-radius: 0 !important;
              overflow: visible !important;
            }
            .print-invoice-footer {
              margin-top: auto !important;
              width: 100% !important;
            }
            .print-footer-line {
              display: block !important;
              width: 100% !important;
              height: 1.5px !important;
              background-color: #334155 !important;
              border-bottom: 1.5px solid #334155 !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .no-print {
              display: none !important;
              visibility: hidden !important;
            }
            .print-straight-line {
              display: block !important;
              height: 2.5px !important;
              background-color: #E5007D !important;
              border-bottom: 2.5px solid #E5007D !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .print-pink-text {
              color: #E5007D !important;
              -webkit-text-fill-color: #E5007D !important;
            }
            .print-patient-icon {
              display: inline-block !important;
              visibility: visible !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
          }
        `}</style>

        {/* Top Control Bar (Hidden when printing) */}
        <div className="no-print px-6 py-3.5 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#E5007D] animate-pulse" />
            <h3 className="font-bold text-xs uppercase tracking-wider text-slate-200">
              Official Invoice • #{invoice.invoiceNumber}
            </h3>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
              SUO XI Hospital Standard
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-1.5 bg-[#E5007D] hover:bg-[#c9006e] text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Invoice</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Invoice Page Body */}
        <div
          id="printable-a4-invoice"
          className="flex-1 overflow-y-auto p-6 sm:p-12 bg-white text-slate-800 print:p-0 print:overflow-visible print:m-0 relative printable-invoice-sheet flex flex-col justify-between min-h-[960px] sm:min-h-[1050px]"
        >
          
          {/* ======================================================== */}
          {/* 1. TOP HEADER & LOGO                                     */}
          {/* ======================================================== */}
          <div className="flex items-center justify-between gap-4 pb-2">
            {/* Logo */}
            <div className="w-24 sm:w-28 shrink-0">
              <img
                src={logoUrl}
                alt="SUO XI Hospital Logo"
                className="w-full h-auto object-contain max-h-24"
                crossOrigin="anonymous"
              />
            </div>

            {/* Title & Address */}
            <div className="flex-1 text-center pr-4 sm:pr-8">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
                SUO XI Hospital (Skin Care)
              </h1>
              <p className="text-xs sm:text-sm font-medium text-slate-800 mt-1">
                Phone: +8809613002003, www.suoxiskincare.com
              </p>
              <p className="text-[11px] sm:text-xs text-slate-700 font-medium mt-0.5">
                122 Priyangon Faizunnessa Business Center, 3rd Floor (Lift-2), Kakrail Road, Dhaka-1217
              </p>
            </div>
          </div>

          {/* ======================================================== */}
          {/* 2. INVOICE HEADER LINE (STRAIGHT PINK/MAGENTA LINE)      */}
          {/* ======================================================== */}
          <div className="w-full my-4">
            <div
              className="w-full h-[2.5px] bg-[#E5007D] print-straight-line"
              style={{
                backgroundColor: '#E5007D',
                height: '2.5px',
                borderBottom: '2.5px solid #E5007D',
              }}
            />
          </div>

          {/* ======================================================== */}
          {/* 3. BILL TO & INVOICE META                                */}
          {/* ======================================================== */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 mb-8">
            {/* Bill To Info */}
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-700">Bill To:</p>
              <h2
                className="text-xl sm:text-2xl font-black text-[#E5007D] print-pink-text tracking-tight"
                style={{ color: '#E5007D' }}
              >
                {patientName}
              </h2>

              <div className="space-y-1.5 pt-1 text-xs sm:text-sm text-slate-800 font-medium">
                {/* Phone */}
                <div className="flex items-center gap-2">
                  <svg
                    viewBox="0 0 24 24"
                    width="18"
                    height="18"
                    className="w-4 h-4 shrink-0 inline-block align-middle print-patient-icon"
                    style={{ minWidth: '16px', minHeight: '16px' }}
                  >
                    <circle cx="12" cy="12" r="11" fill="#E5007D" stroke="#E5007D" strokeWidth="1" />
                    <path
                      d="M8.5 9.5c.8 1.6 2 2.8 3.6 3.6l1.2-1.2c.2-.2.5-.2.7-.1.8.3 1.6.4 2.5.4.4 0 .7.3.7.7v2.4c0 .4-.3.7-.7.7-6 0-10.8-4.8-10.8-10.8 0-.4.3-.7.7-.7h2.4c.4 0 .7.3.7.7 0 .9.1 1.7.4 2.5.1.2 0 .5-.1.7L8.5 9.5z"
                      fill="#FFFFFF"
                    />
                  </svg>
                  <span>{patientPhone}</span>
                </div>

                {/* Gender */}
                <div className="flex items-center gap-2">
                  <svg
                    viewBox="0 0 24 24"
                    width="18"
                    height="18"
                    className="w-4 h-4 shrink-0 inline-block align-middle print-patient-icon"
                    style={{ minWidth: '16px', minHeight: '16px' }}
                  >
                    <circle cx="12" cy="12" r="11" fill="#E5007D" stroke="#E5007D" strokeWidth="1" />
                    <path
                      d="M12 6.5a3 3 0 100 6 3 3 0 000-6zM7.2 17.5c.9-2.2 2.8-3.5 4.8-3.5s3.9 1.3 4.8 3.5c.2.4-.1.8-.5.8H7.7c-.4 0-.7-.4-.5-.8z"
                      fill="#FFFFFF"
                    />
                  </svg>
                  <span className="capitalize">{patientGender}</span>
                </div>

                {/* Age */}
                <div className="flex items-center gap-2">
                  <svg
                    viewBox="0 0 24 24"
                    width="18"
                    height="18"
                    className="w-4 h-4 shrink-0 inline-block align-middle print-patient-icon"
                    style={{ minWidth: '16px', minHeight: '16px' }}
                  >
                    <circle cx="12" cy="12" r="11" fill="#E5007D" stroke="#E5007D" strokeWidth="1" />
                    <path
                      d="M7 10h10M7 13h6M9 7v2M15 7v2M6.5 9h11a1 1 0 011 1v7a1 1 0 01-1 1h-11a1 1 0 01-1-1v-7a1 1 0 011-1z"
                      stroke="#FFFFFF"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  </svg>
                  <span>{patientAge}Y</span>
                </div>
              </div>
            </div>

            {/* Invoice Meta & Patient ID */}
            <div className="text-left sm:text-right space-y-1">
              <p className="text-xs sm:text-sm font-medium text-slate-700">
                Invoice No : <span className="font-semibold text-slate-900">{invoice.invoiceNumber}</span>
              </p>
              <p className="text-xs sm:text-sm font-medium text-slate-700">
                Invoice Date : <span className="font-semibold text-slate-900">{formatInvoiceDate(invoice.createdAt)}</span>
              </p>

              {/* Bold separator dash under date */}
              <div className="w-8 h-1 bg-slate-800 rounded-full my-2 sm:ml-auto" />

              <div className="text-base sm:text-lg text-slate-800 font-bold pt-1">
                <span className="text-slate-700">Patient ID: </span>
                <span className="font-black text-slate-900">{patientIdCode}</span>
              </div>
            </div>
          </div>

          {/* ======================================================== */}
          {/* 4. SERVICE ITEMS TABLE                                   */}
          {/* ======================================================== */}
          <div className="mb-4">
            {/* Table Header (Capsule Pill Box) */}
            <div className="border border-slate-900 rounded-full px-6 py-2.5 flex items-center justify-between text-xs sm:text-sm font-semibold text-slate-900 mb-3 shadow-2xs">
              <div className="flex-1 text-left">Service Name</div>
              <div className="w-16 sm:w-20 text-center">Qty</div>
              <div className="w-24 sm:w-28 text-right">Unit Price</div>
              <div className="w-24 sm:w-28 text-right">Total</div>
            </div>

            {/* Table Rows */}
            <div className="px-6 space-y-2.5 text-xs sm:text-sm">
              {displayItems.map((item, idx) => {
                const itemTotal = item.totalBDT !== undefined ? item.totalBDT : (item.quantity * item.unitPriceBDT);
                return (
                  <div key={idx} className="flex items-center justify-between py-1 text-slate-800 font-medium">
                    <div className="flex-1 text-left text-slate-900 font-normal">{item.description}</div>
                    <div className="w-16 sm:w-20 text-center font-normal">{item.quantity}</div>
                    <div className="w-24 sm:w-28 text-right font-normal">{formatNumber(item.unitPriceBDT)}</div>
                    <div className="w-24 sm:w-28 text-right font-normal">{formatDecimals(itemTotal)}</div>
                  </div>
                );
              })}
            </div>

            {/* Dotted divider line below table items */}
            <div className="border-b-2 border-dotted border-slate-800 my-5 w-full" />
          </div>

          {/* ======================================================== */}
          {/* 5. TOTALS & IN WORD SECTION                              */}
          {/* ======================================================== */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 mb-6">
            {/* Left: In Word */}
            <div className="text-xs sm:text-sm text-slate-800 font-medium pt-2">
              <span>In Ward: </span>
              <span className="font-normal">{numberToWordsBD(netPayable)}</span>
            </div>

            {/* Right: Subtotal, Discount, Net Payable & Total Payment Pill */}
            <div className="w-full sm:w-72 space-y-2 text-xs sm:text-sm">
              <div className="flex items-center justify-between text-slate-700">
                <span>Sub-total :</span>
                <span className="font-medium text-slate-900">{formatDecimals(subtotal)}</span>
              </div>

              <div className="flex items-center justify-between text-slate-700">
                <span>Discount :</span>
                <span className="font-medium text-slate-900">{formatDecimals(discount)}</span>
              </div>

              <div className="flex items-center justify-between text-slate-700">
                <span>Net Payable :</span>
                <span className="font-medium text-slate-900">{formatDecimals(netPayable)}</span>
              </div>

              {/* Total Payment Pill Box */}
              <div className="border border-slate-900 rounded-full px-5 py-2 flex items-center justify-between text-sm sm:text-base font-black text-slate-900 my-2.5 shadow-2xs">
                <span>Total Payment:</span>
                <span>{formatDecimals(totalPayment)}</span>
              </div>

              {/* Due Row */}
              <div className="flex items-center justify-between text-sm sm:text-base font-black text-slate-900 pr-2">
                <span>Due:</span>
                <span>{dueAmount === 0 ? '0' : formatDecimals(dueAmount)}</span>
              </div>
            </div>
          </div>

          {/* ======================================================== */}
          {/* 6. PAYMENT METHOD, WATERMARK, PREPARED BY & BOTTOM FOOTER*/}
          {/* ======================================================== */}
          <div className="mt-auto pt-6 w-full flex flex-col justify-end relative print-invoice-footer">
            {/* Payment Method, Watermark & Prepared By */}
            <div className="relative min-h-[130px] flex flex-col sm:flex-row sm:items-end justify-between gap-6 pb-6">
              {/* Left: Payment Method */}
              <div className="space-y-1 text-xs sm:text-sm text-slate-800 z-10">
                <p className="font-black text-sm sm:text-base text-slate-900 mb-1">Payment Method :</p>
                <p className="font-medium text-slate-700">Bank Name : {paymentMethodName}</p>
                <p className="font-medium text-slate-700">Account Number : {paymentAccountNumber}</p>
              </div>

              {/* Center Background Watermark - safely contained above footer line */}
              <div className="absolute inset-x-0 bottom-0 top-0 flex items-center justify-center pointer-events-none opacity-20 z-0">
                <img
                  src={logoUrl}
                  alt="SUOXI Watermark"
                  className="w-40 h-40 sm:w-44 sm:h-44 object-contain"
                  crossOrigin="anonymous"
                />
              </div>

              {/* Right: Prepared By */}
              <div className="text-left sm:text-right text-xs sm:text-sm text-slate-800 z-10 sm:pb-1">
                <p className="font-bold text-slate-900">
                  Prepared By: <span className="font-normal text-slate-800">{preparedBy}</span>
                </p>
              </div>
            </div>

            {/* 7. BOTTOM FOOTER LINE & BRANDING (ALWAYS AT THE VERY BOTTOM OF THE INVOICE) */}
            <div className="w-full pt-2 pb-1 z-10">
              <div
                className="w-full h-[1.5px] bg-slate-700 print-footer-line"
                style={{
                  height: '1.5px',
                  backgroundColor: '#334155',
                  borderBottom: '1.5px solid #334155',
                }}
              />
              <p className="font-bold text-xs sm:text-sm text-slate-900 tracking-wide text-center pt-2">
                Developed & Designed By SUOXI IT
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
