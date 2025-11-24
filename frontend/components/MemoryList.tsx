// components/MemoryList.tsx
'use client';

import type { MemoryItem } from '@/lib/types';

type Props = {
  memories: MemoryItem[];
};

export function MemoryList({ memories }: Props) {
  if (memories.length === 0) {
    return (
      <div className="text-xs text-gray-400">
        이 번들에는 아직 메모가 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-2 text-sm">
      {memories.map((m) => (
        <div
          key={m.id}
          className="border rounded p-2 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.02)]"
        >
          <div className="font-semibold text-xs mb-1">{m.title}</div>
          <div className="text-xs text-gray-600 whitespace-pre-wrap">
            {m.summary || m.original_text}
          </div>
          <div className="text-[10px] text-gray-400 mt-1">
            {new Date(m.created_at).toLocaleString()}
            {m.usage_count > 0 && ` · 사용횟수 ${m.usage_count}`}
          </div>
        </div>
      ))}
    </div>
  );
}
