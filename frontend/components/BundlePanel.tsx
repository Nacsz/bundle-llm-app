// components/BundlePanel.tsx
"use client";

import { useState, FormEvent } from "react";
import type { Bundle } from "@/lib/types";

type Props = {
  bundles: Bundle[];
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onCreateBundle: (name: string) => Promise<void> | void;
};

export function BundlePanel({
  bundles,
  selectedIds,
  onToggleSelect,
  onCreateBundle,
}: Props) {
  const [newName, setNewName] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;

    try {
      await onCreateBundle(name);
      setNewName("");
    } catch (err) {
      console.error("[BundlePanel] create bundle error", err);
      // 필요하면 alert 추가 가능
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex-1 overflow-auto border rounded p-2">
        {bundles.length === 0 ? (
          <div className="text-xs text-gray-400">
            아직 번들이 없습니다. 아래에서 새 번들을 만들어 보세요.
          </div>
        ) : (
          <ul className="space-y-1">
            {bundles.map((b) => {
              const checked = selectedIds.includes(b.id);
              return (
                <li
                  key={b.id}
                  className="flex items-center justify-between text-xs"
                >
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggleSelect(b.id)}
                    />
                    <span>{b.name}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* 새 번들 생성 폼 */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          className="flex-1 border rounded px-2 py-1 text-xs"
          placeholder="새 번들 이름"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button
          type="submit"
          className="px-2 py-1 text-xs bg-blue-600 text-white rounded"
        >
          추가
        </button>
      </form>
    </div>
  );
}
