import React, { useEffect, useState } from 'react';
import {
  FileText,
  Download,
  Calendar,
  Image,
  AlertCircle,
  FileCheck,
  ExternalLink,
} from 'lucide-react';
import type { PortalDocumentDto } from '@suoxi/shared-types';
import { portalApi } from '../api/portalClient.js';
import { usePortalAuth } from '../context/PortalAuthContext.js';

export const PortalDocumentsView: React.FC = () => {
  const { language } = usePortalAuth();
  const [docs, setDocs] = useState<PortalDocumentDto[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setIsLoading(true);
        const list = await portalApi.getDocuments();
        if (mounted) setDocs(list);
      } catch (err: any) {
        if (mounted) setError(err.message || 'Failed to load documents');
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-4 pb-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-slate-800">
          {language === 'bn' ? 'চিকিৎসা নথি ও ছবি' : 'Clinical Documents & Photos'}
        </h2>
        <p className="text-xs text-slate-500">
          {language === 'bn'
            ? 'আপনার নিরাপদ মেডিকেল রিপোর্ট এবং অনুমোদিত ক্লিনিক্যাল ছবি'
            : 'Access clinical reports and patient-visible treatment photographs'}
        </p>
      </div>

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="space-y-3">
          <div className="h-24 bg-white rounded-2xl animate-pulse border border-slate-100" />
          <div className="h-24 bg-white rounded-2xl animate-pulse border border-slate-100" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-100 text-rose-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && docs.length === 0 && (
        <div className="p-8 text-center bg-white rounded-2xl border border-slate-100 shadow-2xs space-y-2">
          <FileCheck className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="font-semibold text-xs text-slate-700">
            {language === 'bn' ? 'কোনো নথি সংরক্ষিত নেই' : 'No patient documents found'}
          </p>
          <p className="text-[11px] text-slate-400">
            {language === 'bn'
              ? 'ডাক্তার দ্বারা অনুমোদিত ফাইলসমূহ এখানে স্বয়ংক্রিয়ভাবে প্রদর্শিত হবে।'
              : 'Verified files and lab reports shared by your clinician will appear here.'}
          </p>
        </div>
      )}

      {/* Documents List */}
      {!isLoading &&
        !error &&
        docs.map((d) => (
          <div
            key={d.id}
            className="p-4 rounded-2xl bg-white border border-slate-100 shadow-2xs flex items-center justify-between gap-3 text-xs"
          >
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-10 h-10 rounded-xl bg-teal-50 text-emerald-800 flex items-center justify-center shrink-0">
                {d.mimeType.startsWith('image/') ? (
                  <Image className="w-5 h-5 text-emerald-700" />
                ) : (
                  <FileText className="w-5 h-5 text-emerald-700" />
                )}
              </div>
              <div className="min-w-0">
                <h4 className="font-bold text-slate-800 truncate text-xs">{d.fileName}</h4>
                <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                  <span className="capitalize">{d.fileCategory}</span>
                  <span>•</span>
                  <span>{formatSize(d.fileSize)}</span>
                  {d.captureDate && (
                    <>
                      <span>•</span>
                      <span>{d.captureDate}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <a
              href={d.downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[44px] min-w-[44px] p-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 transition-colors cursor-pointer"
              title={language === 'bn' ? 'নথি দেখুন' : 'View file'}
            >
              <ExternalLink className="w-4 h-4 text-emerald-700" />
            </a>
          </div>
        ))}
    </div>
  );
};
