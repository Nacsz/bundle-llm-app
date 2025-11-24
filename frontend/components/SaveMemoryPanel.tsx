// components/SaveMemoryPanel.tsx
'use client';

import { useState } from 'react';
import type { Bundle } from '@/lib/types';

type Props = {
  bundles: Bundle[];
  text: string;
  onTextChange: (text: string) => void;
  onSave: (bundleId: string, title: string) => void;
};

export function SaveMemoryPanel({
  bundles,
  text,
  onTextChange,
  onSave,
}: Props) {
  const [selectedBundleId, setSelectedBundleId] = useState('');
  const [title, setTitle] = useState('');

  function handleClickSave() {
    if (!selectedBundleId || !title.trim() || !text.trim()) return;
    onSave(selectedBundleId, title.trim());
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs text-gray-600">
        이 텍스트를 번들 메모로 저장 (original_text)
      </div>

      <textarea
        className="w-full border rounded px-2 py-1 text-xs resize-y h-16"
        placeholder="이 대화 중 기억해두고 싶은 내용을 정리해서 적어주세요..."
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
      />

      <div className="flex gap-2 items-center">
        <select
          className="border rounded px-2 py-1 text-sm"
          value={selectedBundleId}
          onChange={(e) => setSelectedBundleId(e.target.value)}
        >
          <option value="">번들 선택</option>
          {bundles.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>

        <input
          className="flex-1 border rounded px-2 py-1 text-sm"
          placeholder="메모 제목 (title)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <button
          className="px-3 py-1 text-sm border rounded"
          onClick={handleClickSave}
          disabled={!selectedBundleId || !title.trim() || !text.trim()}
        >
          저장
        </button>
      </div>
    </div>
  );
}
