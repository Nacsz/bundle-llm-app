// frontend/components/MemoryList.tsx
"use client";

import React, { useState } from "react";
import type { MemoryItem } from "../lib/api";

type MemoryListProps = {
  memories: MemoryItem[];
  activeBundleName?: string | null;

  selectable?: boolean;
  selectedIds?: string[];
  onToggleSelect?: (memoryId: string) => void;

  // 내용 편집 (제목/요약/원문)
  onEditMemoryContent?: (
    memoryId: string,
    patch: { title?: string; summary?: string; original_text?: string },
  ) => Promise<MemoryItem | void> | void;

  onDeleteMemory?: (memoryId: string) => void;
};

export const MemoryList: React.FC<MemoryListProps> = ({
  memories,
  activeBundleName,
  selectable = false,
  selectedIds = [],
  onToggleSelect,
  onEditMemoryContent,
  onDeleteMemory,
}) => {
  const [selectedMemory, setSelectedMemory] = useState<MemoryItem | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [editOriginal, setEditOriginal] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleOpen = (memory: MemoryItem) => {
    setSelectedMemory(memory);
    setShowOriginal(false);
    setIsEditing(false);
  };

  const handleClose = () => {
    setSelectedMemory(null);
    setShowOriginal(false);
    setIsEditing(false);
    setIsSaving(false);
  };

  const formatDateTime = (iso?: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  };

  const isSelected = (id: string) => selectedIds.includes(id);

  const handleStartEdit = () => {
    if (!selectedMemory) return;
    setEditTitle(selectedMemory.title ?? "");
    setEditSummary(selectedMemory.summary ?? "");
    setEditOriginal(selectedMemory.original_text ?? "");
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setIsSaving(false);
  };

  const handleSaveEdit = async () => {
    if (!selectedMemory || !onEditMemoryContent) {
      setIsEditing(false);
      return;
    }

    const patch: {
      title?: string;
      summary?: string;
      original_text?: string;
    } = {};

    if (editTitle !== (selectedMemory.title ?? "")) {
      patch.title = editTitle.trim();
    }
    if (editSummary !== (selectedMemory.summary ?? "")) {
      patch.summary = editSummary;
    }
    if (editOriginal !== (selectedMemory.original_text ?? "")) {
      patch.original_text = editOriginal;
    }

    // 변경 사항이 없으면 그냥 나가기
    if (Object.keys(patch).length === 0) {
      setIsEditing(false);
      return;
    }

    try {
      setIsSaving(true);
      const updated = await onEditMemoryContent(selectedMemory.id, patch);

      if (updated) {
        setSelectedMemory(updated);
      } else {
        // 부모에서 업데이트된 객체를 안 돌려준 경우 로컬 patch만 적용
        setSelectedMemory((prev) =>
          prev ? ({ ...prev, ...patch } as MemoryItem) : prev,
        );
      }

      setIsEditing(false);
    } catch (err) {
      console.error("[MemoryList] save edit failed", err);
      window.alert("메모 편집 중 오류가 발생했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-1 text-xs">
      {memories.length === 0 ? (
        <p className="mt-1 text-[11px] text-gray-400">
          아직 이 번들에 저장된 메모가 없습니다.
        </p>
      ) : (
        memories.map((memory) => (
          <div
            key={memory.id}
            className="flex items-start gap-2 rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5"
          >
            {selectable && onToggleSelect && (
              <input
                type="checkbox"
                className="mt-1 h-3 w-3"
                checked={isSelected(memory.id)}
                onChange={() => onToggleSelect(memory.id)}
              />
            )}

            <button
              type="button"
              onClick={() => handleOpen(memory)}
              className="flex-1 text-left"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="truncate text-[12px] font-medium text-gray-900">
                  {memory.title || "제목 없음"}
                </h3>
                {typeof memory.usage_count === "number" && (
                  <span className="shrink-0 rounded-full bg-gray-200 px-2 py-0.5 text-[10px] text-gray-700">
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
                {memory.original_text && <span className="italic">자세히…</span>}
              </div>
            </button>

            {/* 삭제 버튼 (리스트에서 바로 삭제) */}
            {onDeleteMemory && (
              <button
                type="button"
                onClick={() => onDeleteMemory(memory.id)}
                className="mt-1 rounded border border-red-200 px-1.5 py-0.5 text-[10px] text-red-600 hover:bg-red-50"
              >
                삭제
              </button>
            )}
          </div>
        ))
      )}

      {/* 모달 */}
      {selectedMemory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-lg">
            {/* 헤더 */}
            <div className="flex items-start justify-between border-b px-4 py-3">
              <div>
                <h3 className="text-base font-semibold text-gray-900">
                  {selectedMemory.title || "제목 없음"}
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
              <div className="flex items-center gap-2">
                {onEditMemoryContent && !isEditing && (
                  <button
                    type="button"
                    onClick={handleStartEdit}
                    className="rounded border border-gray-300 px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50"
                  >
                    편집
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleClose}
                  className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded-full hover:bg-gray-100"
                >
                  <span className="text-lg leading-none">&times;</span>
                </button>
              </div>
            </div>

            {/* 편집 모드 아닐 때: 요약/원문 토글 */}
            {!isEditing && (
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
                    요약 보기
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
                    원문 보기
                  </button>
                </div>
              </div>
            )}

            {/* 내용 영역 */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {isEditing ? (
                // 편집 모드
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-gray-700">
                      제목
                    </label>
                    <input
                      type="text"
                      className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-gray-700">
                      요약
                    </label>
                    <textarea
                      className="h-28 w-full resize-none rounded border border-gray-300 px-2 py-1 text-xs"
                      value={editSummary}
                      onChange={(e) => setEditSummary(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-gray-700">
                      원문
                    </label>
                    <textarea
                      className="h-40 w-full resize-none rounded border border-gray-300 px-2 py-1 text-xs"
                      value={editOriginal}
                      onChange={(e) => setEditOriginal(e.target.value)}
                    />
                  </div>
                </div>
              ) : showOriginal ? (
                selectedMemory.original_text ? (
                  <pre className="whitespace-pre-wrap break-words text-xs text-gray-800">
                    {selectedMemory.original_text}
                  </pre>
                ) : (
                  <p className="text-xs text-gray-400">
                    저장된 원문이 없습니다. (summary만 존재)
                  </p>
                )
              ) : selectedMemory.summary ? (
                <p className="whitespace-pre-wrap break-words text-sm text-gray-800">
                  {selectedMemory.summary}
                </p>
              ) : (
                <p className="text-xs text-gray-400">
                  저장된 요약이 없습니다. 원문을 확인해 주세요.
                </p>
              )}
            </div>

            {/* 푸터 */}
            <div className="flex justify-end gap-2 border-t px-4 py-2">
              {isEditing ? (
                <>
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                    disabled={isSaving}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    className="rounded-md bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
                    disabled={isSaving}
                  >
                    {isSaving ? "저장 중..." : "저장"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                >
                  닫기
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
