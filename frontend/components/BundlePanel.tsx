// components/BundlePanel.tsx
"use client";

import { useState } from "react";
import type { Bundle, ChatMessage } from "@/lib/types";

type Props = {
  bundles: Bundle[];
  selectedIds: string[];  // 체크된 번들 id 배열
  onToggleSelect: (bundleId: string) => void;
  onCreateBundle: (name: string, parentId?: string | null) => void | Promise<void>;
  // 앞으로 자동 번들 생성 같은 기능에 쓸 수 있어서 남겨둠
  chatMessages: ChatMessage[];
};

export function BundlePanel({
  bundles,
  selectedIds,
  onToggleSelect,
  onCreateBundle,
}: Props) {
  const [newBundleName, setNewBundleName] = useState("");

  const handleCreateClick = async () => {
    const name = newBundleName.trim();
    if (!name) {
      window.alert("번들 이름을 입력하세요.");
      return;
    }

    try {
      // 현재는 parentId 안 쓰니까 null 고정
      await onCreateBundle(name, null);
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
        이번 대화에서 사용할 번들을 선택하세요.
      </div>

      {/* 번들 리스트 영역 */}
      <div className="flex-1 overflow-y-auto rounded border border-gray-200 bg-white">
        {bundles.length === 0 ? (
          <div className="p-2 text-[11px] text-gray-400">
            아직 번들이 없습니다. 아래에서 새 번들을 만들어 보세요.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {bundles.map((b) => {
              const checked = selectedIds.includes(b.id);
              return (
                <li
                  key={b.id}
                  className="flex cursor-pointer items-center gap-2 px-2 py-1.5 hover:bg-gray-50"
                  onClick={() => onToggleSelect(b.id)}
                >
                  <input
                    type="checkbox"
                    className="h-3 w-3"
                    checked={checked}
                    // li 클릭과 중복 호출 막기
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => onToggleSelect(b.id)}
                  />
                  <div className="flex-1 truncate">
                    <div className="flex items-center gap-1">
                      {b.icon && <span className="text-[11px]">{b.icon}</span>}
                      <span className="truncate text-[12px]">{b.name}</span>
                    </div>
                    {b.description && (
                      <div className="truncate text-[11px] text-gray-500">
                        {b.description}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* 새 번들 생성 영역 */}
      <div className="mt-3 border-t border-gray-200 pt-2">
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
