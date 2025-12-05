// frontend/components/BundlePanel.tsx
"use client";

import React, { useState } from "react";
import type { Bundle, ChatMessage, MemoryItem } from "@/lib/types";
import { MemoryList } from "@/components/MemoryList";

type Props = {
  bundles: Bundle[];
  expandedBundleIds: string[]; // 여러 개 펼쳐진 번들 id

  // 번들 행 클릭 → 펼치기/접기
  onExpandBundle: (bundleId: string) => void;
  // 번들 체크 → 이 번들 메모 전체 선택/해제
  onToggleBundleSelectAll: (bundleId: string) => void;
  // 번들 체크 상태 (모든 메모 선택 시 true)
  isBundleFullySelected: (bundleId: string) => boolean;

  // 번들별 메모/로딩 상태를 외부에서 조회
  getMemoriesForBundle: (bundleId: string) => MemoryItem[];
  isLoadingBundle: (bundleId: string) => boolean;

  selectedMemoryIds: string[];
  onToggleMemorySelect: (memoryId: string) => void;

  onCreateBundle: (payload: {
    name: string;
    parentId?: string | null;
  }) => void | Promise<void>;
  onEditBundle: (bundleId: string) => void | Promise<void>;
  onDeleteBundle: (bundleId: string) => void | Promise<void>;

  onUpdateMemoryContent: (
    memoryId: string,
    patch: {
      title?: string;
      summary?: string;
      original_text?: string;
      bundle_id?: string; // 번들 이동용
    },
  ) => Promise<MemoryItem | void> | void;
  onDeleteMemory: (memoryId: string) => void | Promise<void>;

  chatMessages: ChatMessage[];
};

export function BundlePanel({
  bundles,
  expandedBundleIds,
  onExpandBundle,
  onToggleBundleSelectAll,
  isBundleFullySelected,
  getMemoriesForBundle,
  isLoadingBundle,
  selectedMemoryIds,
  onToggleMemorySelect,
  onCreateBundle,
  onEditBundle,
  onDeleteBundle,
  onUpdateMemoryContent,
  onDeleteMemory,
}: Props) {
  const [newBundleName, setNewBundleName] = useState("");
  const [moveTargetBundleId, setMoveTargetBundleId] = useState<string>("");

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

  // 공통 드래그 오버 핸들러 (이 번들을 드롭 타깃으로 인식)
  const handleBundleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.types.includes("text/plain")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    }
  };

  // 공통 드롭 핸들러 (메모를 이 번들로 이동)
  const handleBundleDrop = async (
    e: React.DragEvent<HTMLDivElement>,
    bundleId: string,
  ) => {
    e.preventDefault();
    const memoryId = e.dataTransfer.getData("text/plain");
    if (!memoryId) return;

    try {
      await onUpdateMemoryContent(memoryId, { bundle_id: bundleId });
    } catch (err) {
      console.error("[BundlePanel] onDrop move failed", err);
      window.alert("메모 이동 중 오류가 발생했습니다.");
    }
  };

  const handleMoveSelectedMemories = async (fromBundleId: string) => {
    if (!onUpdateMemoryContent) return;

    const memsInBundle = getMemoriesForBundle(fromBundleId);
    const selectedInThisBundle = memsInBundle.filter((m) =>
      selectedMemoryIds.includes(m.id),
    );
    if (selectedInThisBundle.length === 0) {
      window.alert("이 번들에서 이동할 메모를 먼저 선택해주세요.");
      return;
    }

    const availableTargets = bundles.filter((b) => b.id !== fromBundleId);
    if (availableTargets.length === 0) {
      window.alert("이동할 수 있는 다른 번들이 없습니다.");
      return;
    }

    const targetId =
      moveTargetBundleId && moveTargetBundleId !== fromBundleId
        ? moveTargetBundleId
        : availableTargets[0].id;

    if (!targetId || targetId === fromBundleId) {
      window.alert("유효한 대상 번들을 선택해주세요.");
      return;
    }

    if (
      !window.confirm(
        `선택된 메모 ${selectedInThisBundle.length}개를 이 번들에서 다른 번들로 이동할까요?`,
      )
    ) {
      return;
    }

    try {
      for (const m of selectedInThisBundle) {
        await onUpdateMemoryContent(m.id, { bundle_id: targetId });
      }
      setMoveTargetBundleId("");
    } catch (e) {
      console.error("[BundlePanel] moveSelectedMemories failed", e);
      window.alert("메모 이동 중 오류가 발생했습니다.");
    }
  };

  return (
    <div className="flex h-full flex-col text-xs">
      <div className="mb-2 text-[11px] text-gray-600">
        번들을 여러 개 펼쳐서 각 번들의 메모를 동시에 볼 수 있습니다.
        <br />
        메모 카드를 드래그해서 번들 이름 줄이나 펼쳐진 영역 전체에 드롭하면
        번들 간 이동이 됩니다.
      </div>

      <div className="flex-1 overflow-y-auto bg-white">
        {bundles.length === 0 ? (
          <div className="p-2 text-[11px] text-gray-400">
            아직 번들이 없습니다. 아래에서 새 번들을 만들어 보세요.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {bundles.map((b) => {
              const isExpanded = expandedBundleIds.includes(b.id);
              const bundleChecked = isBundleFullySelected(b.id);

              const mems = getMemoriesForBundle(b.id);
              const targetBundles = bundles.filter((x) => x.id !== b.id);
              const selectedInThisBundle = mems.filter((m) =>
                selectedMemoryIds.includes(m.id),
              );

              return (
                <li key={b.id} className="px-2 py-1.5">
                  {/* 번들 한 줄 (드롭 타깃) */}
                  <div
                    className="flex items-center gap-2 rounded px-1 py-1 hover:bg-gray-50"
                    onDragOver={handleBundleDragOver}
                    onDrop={(e) => handleBundleDrop(e, b.id)}
                  >
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

                  {/* 펼쳐진 번들은 각각 자신의 메모 리스트를 가짐 (여기도 드롭 타깃) */}
                  {isExpanded && (
                    <div
                      className="mt-2 pl-5"
                      onDragOver={handleBundleDragOver}
                      onDrop={(e) => handleBundleDrop(e, b.id)}
                    >
                      {isLoadingBundle(b.id) ? (
                        <div className="text-[11px] text-gray-400">
                          메모 불러오는 중...
                        </div>
                      ) : (
                        <>
                          <MemoryList
                            memories={mems}
                            activeBundleName={b.name}
                            selectable
                            selectedIds={selectedMemoryIds}
                            onToggleSelect={onToggleMemorySelect}
                            onEditMemoryContent={onUpdateMemoryContent}
                            onDeleteMemory={onDeleteMemory}
                            draggable
                          />

                          {mems.length > 0 && (
                            <div className="mt-2 flex items-center justify-between rounded border border-dashed border-gray-300 bg-gray-50 px-2 py-1.5">
                              <div className="text-[11px] text-gray-600">
                                이 번들에서 선택된 메모:{" "}
                                <span className="font-semibold">
                                  {selectedInThisBundle.length}
                                </span>{" "}
                                개
                              </div>
                              <div className="flex items-center gap-2">
                                <select
                                  className="rounded border border-gray-300 px-1.5 py-0.5 text-[11px]"
                                  value={moveTargetBundleId}
                                  onChange={(e) =>
                                    setMoveTargetBundleId(e.target.value)
                                  }
                                >
                                  <option value="">
                                    이동할 번들 선택
                                  </option>
                                  {targetBundles.map((tb) => (
                                    <option key={tb.id} value={tb.id}>
                                      {tb.name}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  disabled={
                                    selectedInThisBundle.length === 0 ||
                                    targetBundles.length === 0
                                  }
                                  onClick={() =>
                                    handleMoveSelectedMemories(b.id)
                                  }
                                  className="rounded bg-indigo-500 px-2.5 py-0.5 text-[11px] text-white disabled:cursor-not-allowed disabled:opacity-50 hover:bg-indigo-600"
                                >
                                  선택 메모 이동
                                </button>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* 새 번들 생성 */}
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
