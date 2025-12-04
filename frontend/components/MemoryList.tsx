// frontend/components/MemoryList.tsx
"use client";

import React, { useState } from "react";
import type { MemoryItem } from "../lib/api";

type MemoryListProps = {
  memories: MemoryItem[];
  activeBundleName?: string | null;
};

export const MemoryList: React.FC<MemoryListProps> = ({
  memories,
  activeBundleName,
}) => {
  const [selectedMemory, setSelectedMemory] = useState<MemoryItem | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);

  const handleOpen = (memory: MemoryItem) => {
    setSelectedMemory(memory);
    setShowOriginal(false); // 모달 열 때는 summary부터 보여주기
  };

  const handleClose = () => {
    setSelectedMemory(null);
    setShowOriginal(false);
  };

  const formatDateTime = (iso?: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(); // 브라우저 로케일 기준
  };

  return (
    <div className="h-full flex flex-col border-l border-gray-200 bg-white">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">메모 리스트</h2>
          <p className="text-xs text-gray-500">
            {activeBundleName
              ? `현재 번들: ${activeBundleName}`
              : "번들을 선택하면 메모가 보입니다."}
          </p>
        </div>
        <span className="text-xs text-gray-400">{memories.length}개</span>
      </div>

      {/* 메모 리스트 영역 */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {memories.length === 0 ? (
          <p className="text-xs text-gray-400 mt-2">
            아직 이 번들에 저장된 메모가 없습니다.
          </p>
        ) : (
          memories.map((memory) => (
            <button
              key={memory.id}
              type="button"
              onClick={() => handleOpen(memory)}
              className="w-full text-left rounded-md border border-gray-200 bg-gray-50 px-3 py-2 hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium text-gray-900 truncate">
                  {memory.title || "제목 없음"}
                </h3>
                {typeof memory.usage_count === "number" && (
                  <span className="shrink-0 rounded-full bg-gray-200 px-2 py-0.5 text-[10px] text-gray-700">
                    사용 {memory.usage_count}회
                  </span>
                )}
              </div>
              {memory.summary && (
                <p className="mt-1 text-xs text-gray-600 line-clamp-2">
                  {memory.summary}
                </p>
              )}
              <div className="mt-1 flex items-center justify-between text-[10px] text-gray-400">
                <span>{formatDateTime(memory.created_at)}</span>
                {memory.original_text && (
                  <span className="italic">자세히 보기…</span>
                )}
              </div>
            </button>
          ))
        )}
      </div>

      {/* 모달 */}
      {selectedMemory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="max-h-[80vh] w-full max-w-2xl rounded-lg bg-white shadow-lg flex flex-col">
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

            {/* 토글 버튼 */}
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
                      ? "opacity-40 cursor-not-allowed"
                      : ""
                  }`}
                >
                  원문 보기
                </button>
              </div>
              {activeBundleName && (
                <span className="text-[11px] text-gray-400">
                  번들: {activeBundleName}
                </span>
              )}
            </div>

            {/* 내용 */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {showOriginal ? (
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
              <button
                type="button"
                onClick={handleClose}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
