// frontend/components/MemoryList.tsx
"use client";

import React, { useState } from "react";
import type { MemoryItem } from "@/lib/types";

type MemoryListProps = {
  memories: MemoryItem[];
  activeBundleName?: string | null;

  // 체크박스 선택 기능
  selectable?: boolean;
  selectedIds?: string[];
  onToggleSelect?: (id: string) => void;

  // 내용 편집/삭제
  onEditMemoryContent?: (
    id: string,
    patch: { title?: string; summary?: string; original_text?: string; bundle_id?: string },
  ) => Promise<MemoryItem | void> | void;
  onDeleteMemory?: (id: string) => void | Promise<void>;

  // 드래그로 번들 이동
  draggable?: boolean;
};

export const MemoryList: React.FC<MemoryListProps> = ({
  memories,
  activeBundleName,
  selectable = false,
  selectedIds = [],
  onToggleSelect,
  onEditMemoryContent,
  onDeleteMemory,
  draggable = false,
}) => {
  const [selectedMemory, setSelectedMemory] = useState<MemoryItem | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);

  const [editTitle, setEditTitle] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [editOriginal, setEditOriginal] = useState("");

  const handleOpen = (memory: MemoryItem) => {
    setSelectedMemory(memory);
    setShowOriginal(false);
    setEditTitle(memory.title ?? "");
    setEditSummary(memory.summary ?? "");
    setEditOriginal(memory.original_text ?? "");
  };

  const handleClose = () => {
    setSelectedMemory(null);
    setShowOriginal(false);
  };

  const formatDateTime = (iso?: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  };

  const isSelected = (id: string) => selectedIds.includes(id);

  const handleSaveEdit = async () => {
    if (!selectedMemory || !onEditMemoryContent) return;

    const patch: { title?: string; summary?: string; original_text?: string } =
      {};

    if (editTitle !== (selectedMemory.title ?? "")) {
      patch.title = editTitle;
    }
    if (editSummary !== (selectedMemory.summary ?? "")) {
      patch.summary = editSummary;
    }
    if (editOriginal !== (selectedMemory.original_text ?? "")) {
      patch.original_text = editOriginal;
    }

    if (Object.keys(patch).length === 0) {
      // 변경 사항 없음
      handleClose();
      return;
    }

    try {
      const updated = await onEditMemoryContent(selectedMemory.id, patch);
      if (updated) {
        setSelectedMemory(updated);
        setEditTitle(updated.title ?? "");
        setEditSummary(updated.summary ?? "");
        setEditOriginal(updated.original_text ?? "");
      }
      handleClose();
    } catch (e) {
      console.error("[MemoryList] save edit failed", e);
      window.alert("메모 수정 중 오류가 발생했습니다.");
    }
  };

  const handleDelete = async () => {
    if (!selectedMemory || !onDeleteMemory) return;
    if (!window.confirm("이 메모를 삭제할까요?")) return;

    try {
      await onDeleteMemory(selectedMemory.id);
      handleClose();
    } catch (e) {
      console.error("[MemoryList] delete failed", e);
      window.alert("메모 삭제 중 오류가 발생했습니다.");
    }
  };

  return (
    <div className="h-full flex flex-col border-l border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 px-2 py-1.5">
        <div>
          <h2 className="text-xs font-semibold text-gray-900">메모 리스트</h2>
          <p className="text-[11px] text-gray-500">
            {activeBundleName
              ? `현재 번들: ${activeBundleName}`
              : "번들을 선택하면 메모가 보입니다."}
          </p>
        </div>
        <span className="text-[11px] text-gray-400">{memories.length}개</span>
      </div>

      {/* 메모 리스트 영역 */}
      <div className="flex-1 space-y-1.5 overflow-y-auto px-2 py-1.5">
        {memories.length === 0 ? (
          <p className="mt-2 text-[11px] text-gray-400">
            아직 이 번들에 저장된 메모가 없습니다.
          </p>
        ) : (
          memories.map((memory) => (
            <div
              key={memory.id}
              className="flex items-start gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 hover:bg-gray-100"
              draggable={draggable}
              onDragStart={(e) => {
                if (!draggable) return;
                // 드래그 시 메모 id를 dataTransfer에 실어서 번들 row에서 꺼냄
                e.dataTransfer.setData("text/plain", memory.id);
              }}
            >
              {selectable && (
                <input
                  type="checkbox"
                  className="mt-0.5 h-3 w-3"
                  checked={isSelected(memory.id)}
                  onChange={() => onToggleSelect && onToggleSelect(memory.id)}
                />
              )}

              <button
                type="button"
                onClick={() => handleOpen(memory)}
                className="flex-1 text-left"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="truncate text-xs font-medium text-gray-900">
                    {memory.title || "제목 없음"}
                  </h3>
                  {typeof memory.usage_count === "number" && (
                    <span className="shrink-0 rounded-full bg-gray-200 px-2 py-0.5 text-[9px] text-gray-700">
                      사용 {memory.usage_count}회
                    </span>
                  )}
                </div>
                {memory.summary && (
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-gray-600">
                    {memory.summary}
                  </p>
                )}
                <div className="mt-0.5 flex items-center justify-between text-[10px] text-gray-400">
                  <span>{formatDateTime(memory.created_at)}</span>
                  {memory.original_text && (
                    <span className="italic">자세히 보기…</span>
                  )}
                </div>
              </button>
            </div>
          ))
        )}
      </div>

      {/* 모달: 보기 + 편집 */}
      {selectedMemory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-lg">
            {/* 헤더 */}
            <div className="flex items-start justify-between border-b px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">
                  메모 상세/편집
                </h3>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                  {selectedMemory.created_at && (
                    <span>
                      생성: {formatDateTime(selectedMemory.created_at)}
                    </span>
                  )}
                  {typeof selectedMemory.usage_count === "number" && (
                    <span>사용 {selectedMemory.usage_count}회</span>
                  )}
                  {activeBundleName && (
                    <span className="text-gray-400">
                      번들: {activeBundleName}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="ml-3 inline-flex h-7 w-7 items-center justify-center rounded-full hover:bg-gray-100"
              >
                <span className="text-lg leading-none">&times;</span>
              </button>
            </div>

            {/* 제목 편집 */}
            <div className="border-b px-4 py-2">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-gray-700">
                  제목
                </span>
                <input
                  type="text"
                  className="rounded border border-gray-300 px-2 py-1 text-xs"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                />
              </label>
            </div>

            {/* 요약 / 원문 토글 */}
            <div className="flex items-center justify-between border-b px-4 py-2">
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setShowOriginal(false)}
                  className={`rounded-full px-3 py-1 ${
                    !showOriginal
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  요약 편집
                </button>
                <button
                  type="button"
                  onClick={() => setShowOriginal(true)}
                  disabled={!selectedMemory.original_text}
                  className={`rounded-full px-3 py-1 ${
                    showOriginal
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 text-gray-700"
                  } ${
                    !selectedMemory.original_text
                      ? "cursor-not-allowed opacity-40"
                      : ""
                  }`}
                >
                  원문 편집
                </button>
              </div>
            </div>

            {/* 내용 편집 영역 */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {showOriginal ? (
                <textarea
                  className="h-64 w-full resize-none rounded border border-gray-300 px-2 py-1 text-xs text-gray-800"
                  value={editOriginal}
                  onChange={(e) => setEditOriginal(e.target.value)}
                  placeholder="원문이 없습니다."
                />
              ) : (
                <textarea
                  className="h-64 w-full resize-none rounded border border-gray-300 px-2 py-1 text-xs text-gray-800"
                  value={editSummary}
                  onChange={(e) => setEditSummary(e.target.value)}
                  placeholder="요약이 없습니다."
                />
              )}
            </div>

            {/* 푸터 버튼들 */}
            <div className="flex justify-between gap-2 border-t px-4 py-2">
              <button
                type="button"
                onClick={handleDelete}
                className="rounded-md border border-red-300 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
              >
                삭제
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs text-white hover:bg-indigo-700"
                >
                  변경 저장
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
