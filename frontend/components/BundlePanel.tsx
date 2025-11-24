// components/BundlePanel.tsx
'use client';

import type { Bundle } from '@/lib/types';

type Props = {
  bundles: Bundle[];
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
};

export function BundlePanel({ bundles, selectedIds, onToggleSelect }: Props) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto space-y-1">
        {bundles.length === 0 && (
          <div className="text-sm text-gray-400">아직 번들이 없습니다.</div>
        )}

        {bundles.map((b) => (
          <label
            key={b.id}
            className="flex items-center gap-2 text-sm cursor-pointer"
          >
            <input
              type="checkbox"
              checked={selectedIds.includes(b.id)}
              onChange={() => onToggleSelect(b.id)}
            />
            <span>{b.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
