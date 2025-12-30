// frontend/components/BundlePanel.tsx
"use client";

import React, { useState } from "react";
import type { Bundle, ChatMessage, MemoryItem } from "@/lib/types";
import { MemoryList } from "@/components/MemoryList";
import { previewAutoGroup, applyAutoGroup } from "@/lib/api";

type Props = {
  bundles: Bundle[];
  expandedBundleIds: string[]; // 여러 개 펼쳐진 번들 id

  // 번들 행 클릭 → 펼치기/접기
  onExpandBundle: (bundleId: string) => void;
  // 번들 체크 → 이 번들(및 하위 번들)의 메모 전체 선택/해제
  onToggleBundleSelectAll: (bundleId: string) => void;
  // 모든 번들의 메모 전체 선택/해제
  onToggleSelectAllBundles: () => void;
  // 번들 체크 상태 (모든 관련 메모 선택 시 true)
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

  // 번들 이동 (드래그 & 드롭)
  onMoveBundle: (bundleId: string, newParentId: string) => void | Promise<void>;

  // ✅ 이 번들의 메모를 한 번이라도 로딩했는지 여부
  isBundleMemoriesLoaded: (bundleId: string) => boolean;

  chatMessages: ChatMessage[];
};

type AutoGroupPreview = {
  parent_name: string;
  child_bundle_ids: string[];
};

export function BundlePanel({
  bundles,
  expandedBundleIds,
  onExpandBundle,
  onToggleBundleSelectAll,
  onToggleSelectAllBundles,
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
  onMoveBundle,
  isBundleMemoriesLoaded,
}: Props) {
  const [newBundleName, setNewBundleName] = useState("");
  const [autoGroupPreview, setAutoGroupPreview] =
    useState<AutoGroupPreview[] | null>(null);
  const [isGrouping, setIsGrouping] = useState(false);

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

  // 번들 자동 정리 미리보기
  const handleAutoGroupClick = async () => {
    setIsGrouping(true);
    try {
      const groups = await previewAutoGroup();
      console.log("[handleAutoGroupClick] groups =", groups);
      setAutoGroupPreview(groups || []);

      if (!groups || groups.length === 0) {
        window.alert("정리할 그룹을 찾지 못했습니다.");
      }
    } catch (e) {
      console.error("previewAutoGroup failed", e);
      window.alert("번들 정리 미리보기에 실패했습니다.");
    } finally {
      setIsGrouping(false);
    }
  };

  // 미리보기 적용
  const handleApplyAutoGroup = async () => {
    if (!autoGroupPreview || autoGroupPreview.length === 0) {
      window.alert("적용할 정리 결과가 없습니다.");
      return;
    }
    if (!window.confirm("이렇게 정리하시겠습니까?")) return;

    try {
      await applyAutoGroup(autoGroupPreview);
      window.alert("번들 정리가 완료되었습니다.\n화면을 새로고침합니다.");
      window.location.reload();
    } catch (e) {
      console.error("applyAutoGroup failed", e);
      window.alert("정리 적용에 실패했습니다.");
    }
  };

  // 메모 드래그 / 번들 드래그 모두 허용
  const handleBundleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    const hasBundle = e.dataTransfer.types.includes("application/x-bundle-id");
    const hasMemory = e.dataTransfer.types.includes("text/plain");
    if (hasBundle || hasMemory) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    }
  };

  // 번들 한 줄 드래그 시작 → 번들 id 저장
  const handleBundleDragStart = (
    e: React.DragEvent<HTMLDivElement>,
    bundleId: string,
  ) => {
    e.dataTransfer.setData("application/x-bundle-id", bundleId);
    e.dataTransfer.effectAllowed = "move";
  };

  // 번들 행/영역 드롭 처리
  const handleBundleDrop = async (
    e: React.DragEvent<HTMLDivElement>,
    targetBundleId: string,
  ) => {
    e.preventDefault();

    // 1) 번들을 끌어다 놓은 경우 → 번들 이동
    const draggedBundleId = e.dataTransfer.getData("application/x-bundle-id");
    if (draggedBundleId) {
      if (draggedBundleId === targetBundleId) return;

      try {
        await onMoveBundle(draggedBundleId, targetBundleId);
      } catch (err) {
        console.error("[BundlePanel] move bundle failed", err);
        window.alert("번들 이동 중 오류가 발생했습니다.");
      }
      return;
    }

    // 2) 메모를 끌어다 놓은 경우 → 기존 메모 이동 로직
    const memoryId = e.dataTransfer.getData("text/plain");
    if (!memoryId) return;

    try {
      await onUpdateMemoryContent(memoryId, { bundle_id: targetBundleId });
    } catch (err) {
      console.error("[BundlePanel] onDrop move memory failed", err);
      window.alert("메모 이동 중 오류가 발생했습니다.");
    }
  };

  // 특정 번들의 '직접적인' 자식 번들 목록
  const getChildBundles = (parentId: string | null): Bundle[] => {
    return bundles.filter((b) => (b.parent_id ?? null) === parentId);
  };

  // 재귀적으로 번들 트리를 그려서 평탄한 <li> 배열로 반환
  const renderBundleTree = (
    parentId: string | null,
    level: number,
  ): JSX.Element[] => {
    const nodes = getChildBundles(parentId);
    const elements: JSX.Element[] = [];

    nodes.forEach((b) => {
      const isExpanded = expandedBundleIds.includes(b.id);

      const mems = getMemoriesForBundle(b.id);
      const loaded = isBundleMemoriesLoaded(b.id); // ✅ 로딩 여부
      const hasMemories = loaded && mems.length > 0;

      const childBundles = getChildBundles(b.id);
      const hasChildBundles = childBundles.length > 0;

      // ✅ 메모를 실제로 로딩해서 0개라는 걸 확인했고,
      // 자식 번들도 없을 때만 비활성화 (회색)
      const checkboxDisabled = loaded && !hasMemories && !hasChildBundles;
      const bundleChecked =
        !checkboxDisabled && isBundleFullySelected(b.id);

      const selectedInThisBundle = mems.filter((m) =>
        selectedMemoryIds.includes(m.id),
      );

      elements.push(
        <li key={b.id} className="px-2 py-1.5">
          {/* 번들 한 줄 (번들도 드래그 가능, 드롭 타깃) */}
          <div
            className="flex items-center gap-2 rounded px-1 py-1 hover:bg-gray-50"
            style={{ paddingLeft: 4 + level * 12 }}
            draggable
            onDragStart={(e) => handleBundleDragStart(e, b.id)}
            onDragOver={handleBundleDragOver}
            onDrop={(e) => handleBundleDrop(e, b.id)}
          >
            <input
              type="checkbox"
              className="h-3 w-3"
              checked={bundleChecked}
              disabled={checkboxDisabled}
              onClick={(e) => e.stopPropagation()}
              onChange={() => {
                if (!checkboxDisabled) onToggleBundleSelectAll(b.id);
              }}
            />

            <button
              type="button"
              className="flex flex-1 items-center gap-1 truncate text-left"
              onClick={() => onExpandBundle(b.id)}
            >
              <span className="text-[11px]">
                {hasMemories || hasChildBundles
                  ? isExpanded
                    ? "▾"
                    : "▸"
                  : "·"}
              </span>
              {b.icon && <span className="text-[11px]">{b.icon}</span>}
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

          {/* 메모 리스트 (이 번들이 펼쳐져 있고, 메모가 있을 때만 표시) */}
          {isExpanded && hasMemories && (
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
              )}

              {mems.length > 0 && (
                <div className="mt-1 text-[11px] text-gray-500">
                  이 번들에서 선택된 메모:{" "}
                  <span className="font-semibold">
                    {selectedInThisBundle.length}
                  </span>{" "}
                  개
                </div>
              )}
            </div>
          )}
        </li>,
      );

      // 이 번들이 펼쳐져 있을 때만, 그 하위 번들을 이어서 렌더링
      if (isExpanded && hasChildBundles) {
        elements.push(...renderBundleTree(b.id, level + 1));
      }
    });

    return elements;
  };
  
  return (
    <div className="flex h-full flex-col text-xs text-gray-800">
      {/* 안내 + 정리 버튼 + 전체 선택 버튼 */}
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[11px] text-gray-600">
          번들을 트리 구조로 관리할 수 있습니다.
          <br />
          번들명을 클릭해 펼쳐서 점검할 수 있고, 메모와 번들을 드래그해서 다른 번들로 이동할 수 있습니다.
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleSelectAllBundles}
            className="rounded border border-gray-300 px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-100"
          >
            전체 선택/해제
          </button>
          <button
            type="button"
            onClick={handleAutoGroupClick}
            disabled={isGrouping}
            className="rounded border border-indigo-400 px-2 py-1 text-[11px] text-indigo-600 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isGrouping ? "정리 중..." : "정리하기"}
          </button>
        </div>
      </div>

      {/* 정리 미리보기 영역 */}
      {autoGroupPreview && autoGroupPreview.length > 0 && (
        <div className="mb-2 rounded border border-indigo-200 bg-indigo-50 p-2 text-[11px] text-gray-700">
          <div className="mb-1 font-semibold">정리 미리보기</div>
          <ul className="space-y-1">
            {autoGroupPreview.map((g, idx) => {
              const childNames = bundles
                .filter((b) => g.child_bundle_ids.includes(b.id))
                .map((b) => b.name)
                .join(", ");
              return (
                <li key={idx}>
                  <span className="font-semibold">{g.parent_name}</span> ←{" "}
                  {childNames || g.child_bundle_ids.length + "개 번들"}
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            onClick={handleApplyAutoGroup}
            className="mt-2 rounded bg-indigo-600 px-2 py-1 text-[11px] text-white hover:bg-indigo-700"
          >
            이렇게 정리하시겠습니까?
          </button>
        </div>
      )}

      {/* 번들 리스트 (트리 렌더링) */}
      <div className="flex-1 overflow-y-auto bg-white">
        {bundles.length === 0 ? (
          <div className="p-2 text-[11px] text-gray-400">
            아직 번들이 없습니다. 아래에서 새 번들을 만들어 보세요.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {renderBundleTree(null, 0)}
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
