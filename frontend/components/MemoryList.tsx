// frontend/components/MemoryList.tsx
"use client";

import React, { useState } from "react";
import type { MemoryItem, Bundle } from "@/lib/types";

type Props = {
  bundleId: string;
  memories: MemoryItem[];
  activeBundleName: string;
  selectable?: boolean;
  selectedIds?: string[];
  onToggleSelect?: (id: string) => void;
  onEditMemoryContent?: (
    memoryId: string,
    patch: {
      title?: string;
      summary?: string;
      original_text?: string;
      bundle_id?: string;
    },
  ) => void | Promise<void>;
  onDeleteMemory?: (memoryId: string) => void | Promise<void>;
  draggable?: boolean;
  // 이동 대상 번들 리스트 (현재 번들 제외해서 사용)
  availableBundles?: Pick<Bundle, "id" | "name">[];
};

export function MemoryList({
  bundleId,
  memories,
  activeBundleName,
  selectable,
  selectedIds = [],
  onToggleSelect,
  onEditMemoryContent,
  onDeleteMemory,
  draggable,
  availableBundles = [],
}: Props) {
  const [movingMemoryId, setMovingMemoryId] = useState<string | null>(null);
  const [moveTargetId, setMoveTargetId] = useState<string>("");

  const handleDragStart = (
    e: React.DragEvent<HTMLDivElement>,
    memoryId: string,
  ) => {
    if (!draggable) return;
    e.dataTransfer.setData("text/plain", memoryId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleClickEdit = (m: MemoryItem) => {
    if (!onEditMemoryContent) return;
    const newTitle = window.prompt("메모 제목을 수정하세요.", m.title || "");
    if (newTitle == null) return;
    onEditMemoryContent(m.id, { title: newTitle.trim() || undefined });
  };

  const handleClickDelete = async (m: MemoryItem) => {
    if (!onDeleteMemory) return;
    if (!window.confirm("이 메모를 삭제할까요?")) return;
    await onDeleteMemory(m.id);
  };

  const handleClickMove = (m: MemoryItem) => {
    // 같은 카드 다시 누르면 닫기
    if (movingMemoryId === m.id) {
      setMovingMemoryId(null);
      setMoveTargetId("");
      return;
    }
    setMovingMemoryId(m.id);
    setMoveTargetId("");
  };

  const handleConfirmMove = async () => {
    if (!movingMemoryId || !moveTargetId) return;
    if (!onEditMemoryContent) return;

    if (!window.confirm("이 메모를 선택한 번들로 이동할까요?")) return;

    await onEditMemoryContent(movingMemoryId, { bundle_id: moveTargetId });

    setMovingMemoryId(null);
    setMoveTargetId("");
  };

  const filteredTargets = availableBundles.filter(
    (b) => b.id !== bundleId,
  );

  return (
    <div className="space-y-2">
      {memories.map((m) => {
        const selected = selectable && selectedIds.includes(m.id);
        const showMoveRow = movingMemoryId === m.id;

        const summary =
          m.summary && m.summary.trim().length > 0
            ? m.summary
            : m.original_text || "";

        const shortSummary =
          summary.length > 160 ? summary.slice(0, 160) + "…" : summary;

        return (
          <div
            key={m.id}
            className="rounded border border-gray-200 bg-white p-2 shadow-sm"
            draggable={draggable}
            onDragStart={(e) => handleDragStart(e, m.id)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                {selectable && onToggleSelect && (
                  <input
                    type="checkbox"
                    className="mt-1 h-3 w-3"
                    checked={!!selected}
                    onChange={() => onToggleSelect(m.id)}
                  />
                )}
                <div>
                  {m.title && (
                    <div className="text-[11px] font-semibold text-gray-800">
                      {m.title}
                    </div>
                  )}
                  <div className="mt-0.5 text-[11px] text-gray-700">
                    {shortSummary || "(내용 없음)"}
                  </div>
                  <div className="mt-0.5 text-[10px] text-gray-400">
                    현재 번들: {activeBundleName}
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-end gap-1">
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => handleClickEdit(m)}
                    className="rounded border border-gray-200 px-1.5 py-0.5 text-[10px] text-gray-600 hover:bg-gray-100"
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    onClick={() => handleClickDelete(m)}
                    className="rounded border border-red-200 px-1.5 py-0.5 text-[10px] text-red-600 hover:bg-red-50"
                  >
                    삭제
                  </button>
                  <button
                    type="button"
                    onClick={() => handleClickMove(m)}
                    className="rounded border border-indigo-200 px-1.5 py-0.5 text-[10px] text-indigo-600 hover:bg-indigo-50"
                  >
                    이동
                  </button>
                </div>
              </div>
            </div>

            {/* 이동 UI: 이동 버튼 눌렀을 때만 노출 */}
            {showMoveRow && (
              <div className="mt-2 flex items-center justify-end gap-2 border-t border-dashed border-gray-200 pt-1.5">
                <select
                  className="rounded border border-gray-300 px-1.5 py-0.5 text-[11px]"
                  value={moveTargetId}
                  onChange={(e) => setMoveTargetId(e.target.value)}
                >
                  <option value="">이동할 번들 선택</option>
                  {filteredTargets.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!moveTargetId}
                  onClick={handleConfirmMove}
                  className="rounded bg-indigo-500 px-2 py-0.5 text-[11px] text-white disabled:cursor-not-allowed disabled:opacity-50 hover:bg-indigo-600"
                >
                  이동 적용
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
