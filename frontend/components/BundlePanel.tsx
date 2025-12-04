// frontend/components/BundlePanel.tsx
"use client";

import { useState } from "react";
import type { Bundle, ChatMessage, MemoryItem } from "@/lib/types";
import { MemoryList } from "@/components/MemoryList";

type Props = {
  bundles: Bundle[];
  activeBundleId: string | null;

  // 번들 행 클릭 → 펼치기/접기
  onExpandBundle: (bundleId: string) => void;
  // 번들 체크 → 이 번들 메모 전체 선택/해제
  onToggleBundleSelectAll: (bundleId: string) => void;
  // 번들 체크 상태 (모든 메모 선택 시 true)
  isBundleFullySelected: (bundleId: string) => boolean;

  memories: MemoryItem[];
  isLoadingMemories: boolean;
  selectedMemoryIds: string[];
  onToggleMemorySelect: (memoryId: string) => void;

  onCreateBundle: (payload: { name: string; parentId?: string | null }) => void | Promise<void>;
  onEditBundle: (bundleId: string) => void | Promise<void>;
  onDeleteBundle: (bundleId: string) => void | Promise<void>;

  onUpdateMemoryContent: (
    memoryId: string,
    patch: { title?: string; summary?: string; original_text?: string },
  ) => Promise<MemoryItem | void> | void;
  onDeleteMemory: (memoryId: string) => void | Promise<void>;

  chatMessages: ChatMessage[];
};

export function BundlePanel({
  bundles,
  activeBundleId,
  onExpandBundle,
  onToggleBundleSelectAll,
  isBundleFullySelected,
  memories,
  isLoadingMemories,
  selectedMemoryIds,
  onToggleMemorySelect,
  onCreateBundle,
  onEditBundle,
  onDeleteBundle,
  onUpdateMemoryContent,
  onDeleteMemory,
}: Props) {
  const [newBundleName, setNewBundleName] = useState("");

  const handleCreateClick = async () => {
    const name = newBundleName.trim();
    if (!name) {
      window.alert("번들 이름을 입력하세요.");
      return;
    }

    try {
      await onCreateBundle({ name, parentId: null });
      setNewBundleName("");
    } catch (e) {
      console.error("onCreateBundle failed", e);
      window.alert("번들 생성 중 오류가 발생했습니다.");
    }
  };

  return (
    <div className="flex h-full flex-col text-xs">
      {/* 설명 텍스트 */}
      <div className="mb-2 text-[11px] text-gray-600">
        이번 대화에서 사용할 메모를 번들별로 선택하세요.
      </div>

      {/* 번들 리스트 + 인라인 메모 리스트 */}
      <div className="flex-1 overflow-y-auto bg-white">
        {bundles.length === 0 ? (
          <div className="p-2 text-[11px] text-gray-400">
            아직 번들이 없습니다. 아래에서 새 번들을 만들어 보세요.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {bundles.map((b) => {
              const isExpanded = activeBundleId === b.id;
              const bundleChecked = isBundleFullySelected(b.id);

              return (
                <li key={b.id} className="px-2 py-1.5">
                  {/* 번들 한 줄 */}
                  <div className="flex items-center gap-2 rounded px-1 py-1 hover:bg-gray-50">
                    <input
                      type="checkbox"
                      className="h-3 w-3"
                      checked={bundleChecked}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => onToggleBundleSelectAll(b.id)}
                    />

                    <button
                      type="button"
                      className="flex flex-1 items-center gap-1 truncate text-left"
                      onClick={() => onExpandBundle(b.id)}
                    >
                      <span className="text-[11px]">
                        {isExpanded ? "▾" : "▸"}
                      </span>
                      {b.icon && (
                        <span className="text-[11px]">{b.icon}</span>
                      )}
                      <span className="truncate text-[12px]">{b.name}</span>
                    </button>

                    {/* 번들 수정/삭제 버튼 */}
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => onEditBundle(b.id)}
                        className="rounded border border-gray-200 px-1.5 py-0.5 text-[10px] text-gray-600 hover:bg-gray-100"
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteBundle(b.id)}
                        className="rounded border border-red-200 px-1.5 py-0.5 text-[10px] text-red-600 hover:bg-red-50"
                      >
                        삭제
                      </button>
                    </div>
                  </div>

                  {/* 이 번들이 펼쳐져 있으면, 아래에 메모 리스트 인라인으로 표시 */}
                  {isExpanded && (
                    <div className="mt-2 pl-5">
                      {isLoadingMemories ? (
                        <div className="text-[11px] text-gray-400">
                          메모 불러오는 중...
                        </div>
                      ) : (
                        <MemoryList
                          memories={memories}
                          activeBundleName={b.name}
                          selectable
                          selectedIds={selectedMemoryIds}
                          onToggleSelect={onToggleMemorySelect}
                          onEditMemoryContent={onUpdateMemoryContent}
                          onDeleteMemory={onDeleteMemory}
                        />
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* 새 번들 생성 영역 */}
      <div className="mt-4 pt-1">
        <div className="mb-1 text-[11px] font-semibold">새 번들 만들기</div>
        <div className="flex gap-2">
          <input
            type="text"
            className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs"
            placeholder="새 번들 이름"
            value={newBundleName}
            onChange={(e) => setNewBundleName(e.target.value)}
          />
          <button
            type="button"
            onClick={handleCreateClick}
            className="rounded bg-blue-500 px-3 py-1 text-xs text-white hover:bg-blue-600"
          >
            번들 생성
          </button>
        </div>
      </div>
    </div>
  );
}
