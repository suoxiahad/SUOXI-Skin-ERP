import React from 'react';

export interface TableSkeletonProps {
  cols: number;
  rows?: number;
}

export const TableSkeleton: React.FC<TableSkeletonProps> = ({ cols, rows = 6 }) => {
  return (
    <div className="w-full animate-pulse p-4">
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, rIdx) => (
          <div key={rIdx} className="flex gap-4 items-center">
            {Array.from({ length: cols }).map((_, cIdx) => (
              <div
                key={cIdx}
                className="h-7 bg-slate-100 rounded-md"
                style={{ flex: cIdx === 0 ? 1.8 : 1 }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
