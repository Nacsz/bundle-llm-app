// frontend/app/page.tsx
"use client";
import { debugApiBase } from "@/lib/api";
import { useState, useEffect } from "react";
import type { Bundle, ChatMessage, MemoryItem } from "@/lib/types";
import { ChatWindow } from "@/components/ChatWindow";
import { BundlePanel } from "@/components/BundlePanel";
import { SaveMemoryPanel } from "@/components/SaveMemoryPanel";
import {
  fetchBundles,
  createBundle,
  sendChat,
  fetchMemoriesForBundle,
  saveMemoryToBundle,
  updateBundle,
  deleteBundle,
  updateMemoryInBundle,
  deleteMemoryInBundle,
} from "@/lib/api";

const MOCK_USER_ID = "11111111-1111-1111-1111-111111111111";

export default function HomePage() {
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [showMemoryContext, setShowMemoryContext] = useState(false);
  const [lastMemoryContext, setLastMemoryContext] = useState<string | null>(
    null,
  );

  const [textToSave, setTextToSave] = useState("");

  // 여러 번들을 동시에 펼치기
  const [expandedBundleIds, setExpandedBundleIds] = useState<string[]>([]);
  const [bundleMemories, setBundleMemories] = useState<
    Record<string, MemoryItem[]>
  >({});
  const [loadingBundles, setLoadingBundles] = useState<
    Record<string, boolean>
  >({});

  // 선택된 메모 id들 (번들 상관없이 전역)
  const [selectedMemoryIds, setSelectedMemoryIds] = useState<string[]>([]);

  // 왼쪽 번들/메모 패널 접기/펼치기
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // 자동 메모 저장 ON/OFF
  const [autoSaveToBundle, setAutoSaveToBundle] = useState(false);

  // "현재 번들"은 마지막으로 펼친 번들 기준
  const currentBundleId =
    expandedBundleIds.length > 0
      ? expandedBundleIds[expandedBundleIds.length - 1]
      : null;

  // 초기 번들 로드
  useEffect(() => {
    debugApiBase();
    const load = async () => {
      try {
        const data = await fetchBundles(MOCK_USER_ID);
        setBundles(data);
      } catch (err) {
        console.error("Failed to fetch bundles", err);
      }
    };
    load();
  }, []);

  // 특정 번들의 메모 로드
  const loadBundleMemories = async (bundleId: string) => {
    try {
      setLoadingBundles((prev) => ({ ...prev, [bundleId]: true }));
      const items = await fetchMemoriesForBundle(bundleId);
      setBundleMemories((prev) => ({
        ...prev,
        [bundleId]: items,
      }));
    } catch (err) {
      console.error("fetchMemoriesForBundle failed", err);
    } finally {
      setLoadingBundles((prev) => ({ ...prev, [bundleId]: false }));
    }
  };

  // 번들 행 클릭 → 펼치기 / 접기 (여러 개 동시에 가능)
  const handleExpandBundle = (bundleId: string) => {
    const isAlreadyExpanded = expandedBundleIds.includes(bundleId);

    if (isAlreadyExpanded) {
      setExpandedBundleIds((prev) => prev.filter((id) => id !== bundleId));
      return;
    }

    // 새로 펼칠 때는 메모 로드 + expanded 목록에 추가
    setExpandedBundleIds((prev) => [...prev, bundleId]);
    void loadBundleMemories(bundleId);
  };

  // 번들 체크박스: 이 번들의 메모 전체 선택/해제 + 펼치기
  const handleToggleBundleSelectAll = (bundleId: string) => {
    // 일단 펼쳐진 목록에 포함되도록 보장
    setExpandedBundleIds((prev) =>
      prev.includes(bundleId) ? prev : [...prev, bundleId],
    );

    const mems = bundleMemories[bundleId];
    if (!mems || mems.length === 0) {
      // 아직 메모를 안 불러온 경우 → 불러온 뒤 선택 처리
      void (async () => {
        const items = await fetchMemoriesForBundle(bundleId);
        setBundleMemories((prev) => ({ ...prev, [bundleId]: items }));
        if (items.length === 0) return;

        setSelectedMemoryIds((prev) => {
          const idsInBundle = items.map((m) => m.id);
          const allSelected = idsInBundle.every((id) => prev.includes(id));
          if (allSelected) {
            // 모두 선택되어 있었다면 → 이 번들의 메모만 해제
            return prev.filter((id) => !idsInBundle.includes(id));
          }
          // 일부 또는 아무것도 선택 안 되어 있으면 → 모두 추가
          const set = new Set(prev);
          idsInBundle.forEach((id) => set.add(id));
          return Array.from(set);
        });
      })();
      return;
    }

    // 이미 메모를 알고 있는 경우 바로 전체 선택/해제
    setSelectedMemoryIds((prev) => {
      const idsInBundle = mems.map((m) => m.id);
      const allSelected = idsInBundle.every((id) => prev.includes(id));
      if (allSelected) {
        return prev.filter((id) => !idsInBundle.includes(id));
      }
      const set = new Set(prev);
      idsInBundle.forEach((id) => set.add(id));
      return Array.from(set);
    });
  };

  // 번들 체크박스 상태: 이 번들의 메모가 모두 선택되어 있을 때만 true
  const isBundleFullySelected = (bundleId: string): boolean => {
    const mems = bundleMemories[bundleId] ?? [];
    if (mems.length === 0) return false;
    return mems.every((m) => selectedMemoryIds.includes(m.id));
  };

  const getMemoriesForBundle = (bundleId: string): MemoryItem[] => {
    return bundleMemories[bundleId] ?? [];
  };

  const isLoadingBundle = (bundleId: string): boolean => {
    return loadingBundles[bundleId] ?? false;
  };

  // 메모 개별 체크/해제
  const handleToggleMemorySelect = (memoryId: string) => {
    setSelectedMemoryIds((prev) =>
      prev.includes(memoryId)
        ? prev.filter((id) => id !== memoryId)
        : [...prev, memoryId],
    );
  };

  // 채팅 보내기 (/chat에 선택된 메모 id만 보냄 + 자동 메모 저장)
  const handleSendMessage = async (message: string) => {
    if (!message.trim()) return;

    const newUserMsg: ChatMessage = {
      role: "user",
      content: message,
    };
    const newMessages = [...messages, newUserMsg];
    const historySlice = newMessages.slice(-10);

    setMessages(newMessages);
    setIsSending(true);

    try {
      const res = await sendChat({
        user_id: MOCK_USER_ID,
        message,
        history: historySlice,
        selected_bundle_ids: [], // 이제는 사용하지 않지만 스키마 맞추기용
        selected_memory_ids: selectedMemoryIds,
      });

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: res.answer,
      };

      const updatedMessages = [...newMessages, assistantMsg];
      setMessages(updatedMessages);
      setLastMemoryContext(res.memory_context);

      // ----- 자동 메모 저장 -----
      if (autoSaveToBundle && currentBundleId) {
        try {
          const titleBase = message.trim();
          const title =
            titleBase.length > 30
              ? titleBase.slice(0, 30) + "…"
              : titleBase || "자동 저장 메모";

          const autoText = `사용자: ${message}\n\nLLM: ${res.answer}`;

          const memory = await saveMemoryToBundle(currentBundleId, {
            user_id: MOCK_USER_ID,
            original_text: autoText,
            title,
            metadata: { from_ui: "auto_chat_save" },
          });

          setBundleMemories((prev) => ({
            ...prev,
            [currentBundleId]: [memory, ...(prev[currentBundleId] ?? [])],
          }));
        } catch (err) {
          console.error("[auto-save] saveMemoryToBundle failed", err);
        }
      }
      // -------------------------
    } catch (err) {
      console.error("sendChat failed", err);
      window.alert("채팅 전송 실패");
    } finally {
      setIsSending(false);
    }
  };

  // 번들 생성
  const handleCreateBundle = async (payload: {
    name: string;
    parentId?: string | null;
  }) => {
    const { name, parentId } = payload;

    if (!name.trim()) {
      window.alert("번들 이름을 입력해주세요.");
      return;
    }

    try {
      const newBundle = await createBundle({
        user_id: MOCK_USER_ID,
        name: name.trim(),
        description: "",
        color: "#4F46E5",
        icon: "�",
        parent_id: parentId ?? null,
      });

      setBundles((prev) => [newBundle, ...prev]);
    } catch (err) {
      console.error("createBundle failed", err);
      window.alert("번들 생성 실패");
    }
  };

  // 번들 수정
  const handleEditBundle = async (bundleId: string) => {
    const target = bundles.find((b) => b.id === bundleId);
    const currentName = target?.name ?? "";
    const newName = window.prompt("번들 이름을 수정하세요.", currentName);
    if (!newName || newName.trim() === currentName) return;

    try {
      const updated = await updateBundle(bundleId, { name: newName.trim() });
      setBundles((prev) =>
        prev.map((b) => (b.id === bundleId ? updated : b)),
      );
    } catch (err) {
      console.error("updateBundle failed", err);
      window.alert("번들 수정 실패");
    }
  };

  // 번들 삭제
  const handleDeleteBundle = async (bundleId: string) => {
    const target = bundles.find((b) => b.id === bundleId);
    const name = target?.name ?? "";
    if (
      !window.confirm(
        `"${name}" 번들을 삭제할까요? (이 번들의 메모도 함께 삭제됩니다)`,
      )
    ) {
      return;
    }

    try {
      await deleteBundle(bundleId);

      // 번들 목록에서 제거
      setBundles((prev) => prev.filter((b) => b.id !== bundleId));

      // 펼쳐진 목록에서 제거
      setExpandedBundleIds((prev) => prev.filter((id) => id !== bundleId));

      // 메모 캐시에서 제거
      setBundleMemories((prev) => {
        const next = { ...prev };
        delete next[bundleId];
        return next;
      });

      // 선택된 메모들 중, 이 번들에 속한 것들 제거
      setSelectedMemoryIds((prev) => {
        const mems = bundleMemories[bundleId] ?? [];
        const idsInBundle = new Set(mems.map((m) => m.id));
        return prev.filter((id) => !idsInBundle.has(id));
      });
    } catch (err) {
      console.error("deleteBundle failed", err);
      window.alert("번들 삭제 실패");
    }
  };

  // 메모 저장 (수동 패널)
  const handleSaveMemory = async (bundleId: string, title: string) => {
    if (!textToSave.trim()) {
      window.alert("저장할 텍스트가 비어 있습니다.");
      return;
    }

    try {
      const memory = await saveMemoryToBundle(bundleId, {
        user_id: MOCK_USER_ID,
        original_text: textToSave,
        title: title || undefined,
        metadata: { from_ui: "manual_save_panel" },
      });

      setBundleMemories((prev) => ({
        ...prev,
        [bundleId]: [memory, ...(prev[bundleId] ?? [])],
      }));

      setTextToSave("");
    } catch (err) {
      console.error("saveMemoryToBundle failed", err);
      window.alert("메모 저장 실패");
    }
  };

  // 메모 내용(제목/요약/원문/번들) 편집
  const handleUpdateMemoryContent = async (
    memoryId: string,
    patch: {
      title?: string;
      summary?: string;
      original_text?: string;
      bundle_id?: string;
    },
  ) => {
    // 이 메모가 속한 번들을 찾아야 함
    let fromBundleId: string | null = null;

    for (const [bId, mems] of Object.entries(bundleMemories)) {
      if (mems.some((m) => m.id === memoryId)) {
        fromBundleId = bId;
        break;
      }
    }

    if (!fromBundleId) {
      console.warn(
        "[handleUpdateMemoryContent] memory not found in any bundle",
        memoryId,
      );
      return;
    }

    try {
      const updated = await updateMemoryInBundle(fromBundleId, memoryId, patch);
      if (!updated) return;

      const toBundleId = updated.bundle_id || fromBundleId;

      setBundleMemories((prev) => {
        const next: Record<string, MemoryItem[]> = {};

        // 먼저 모든 번들의 리스트에서 해당 메모 제거
        for (const [bId, mems] of Object.entries(prev)) {
          next[bId] = mems.filter((m) => m.id !== memoryId);
        }

        // 새 번들에 추가
        const targetList = next[toBundleId] ?? [];
        next[toBundleId] = [updated, ...targetList];

        return next;
      });

      // 선택 상태 업데이트
      setSelectedMemoryIds((prev) => {
        if (!prev.includes(memoryId)) return prev;
        if (toBundleId !== fromBundleId) {
          // 번들이 바뀐 경우, 선택 목록에서 제거
          return prev.filter((id) => id !== memoryId);
        }
        // 같은 번들 내 수정인 경우 그대로 유지
        return prev;
      });

      return updated;
    } catch (err) {
      console.error("updateMemoryInBundle failed", err);
      window.alert("메모 편집 실패");
    }
  };

  // 메모 삭제
  const handleDeleteMemory = async (memoryId: string) => {
    // 이 메모가 속한 번들을 찾기
    let bundleId: string | null = null;

    for (const [bId, mems] of Object.entries(bundleMemories)) {
      if (mems.some((m) => m.id === memoryId)) {
        bundleId = bId;
        break;
      }
    }

    if (!bundleId) {
      console.warn(
        "[handleDeleteMemory] memory not found in any bundle",
        memoryId,
      );
      return;
    }

    if (!window.confirm("이 메모를 삭제할까요?")) return;

    try {
      await deleteMemoryInBundle(bundleId, memoryId);

      setBundleMemories((prev) => {
        const next = { ...prev };
        next[bundleId!] = (next[bundleId!] ?? []).filter(
          (m) => m.id !== memoryId,
        );
        return next;
      });

      setSelectedMemoryIds((prev) =>
        prev.filter((id) => id !== memoryId),
      );
    } catch (err) {
      console.error("deleteMemoryInBundle failed", err);
      window.alert("메모 삭제 실패");
    }
  };

  // 현재 채팅 10개 → 저장 패널
  const handleFillCurrentChatToSavePanel = () => {
    if (messages.length === 0) return;
    const last10 = messages.slice(-10);
    const joined = last10
      .map((m) =>
        m.role === "user" ? `사용자: ${m.content}` : `LLM: ${m.content}`,
      )
      .join("\n");
    setTextToSave(joined);
  };

  return (
    <div className="h-screen w-screen overflow-hidden">
      <div className="flex h-full">
        {/* 왼쪽: 번들 + 메모 관리 */}
        {isSidebarOpen && (
          <aside className="flex h-full w-1/2 flex-col border-r border-gray-200 bg-white">
            <div className="p-3">
              <h2 className="mb-2 text-sm font-semibold">Bundles</h2>
              <BundlePanel
                bundles={bundles}
                expandedBundleIds={expandedBundleIds}
                onExpandBundle={handleExpandBundle}
                onToggleBundleSelectAll={handleToggleBundleSelectAll}
                isBundleFullySelected={isBundleFullySelected}
                getMemoriesForBundle={getMemoriesForBundle}
                isLoadingBundle={isLoadingBundle}
                selectedMemoryIds={selectedMemoryIds}
                onToggleMemorySelect={handleToggleMemorySelect}
                onCreateBundle={handleCreateBundle}
                onEditBundle={handleEditBundle}
                onDeleteBundle={handleDeleteBundle}
                onUpdateMemoryContent={handleUpdateMemoryContent}
                onDeleteMemory={handleDeleteMemory}
                chatMessages={messages}
              />
            </div>

            {/* 아래: 메모 저장 패널 */}
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
              <div className="mt-2">
                <div className="mb-1 text-xs font-semibold">메모 저장</div>
                <SaveMemoryPanel
                  bundles={bundles}
                  text={textToSave}
                  onTextChange={setTextToSave}
                  onSave={handleSaveMemory}
                  onFillFromCurrentChat={handleFillCurrentChatToSavePanel}
                />
              </div>
            </div>
          </aside>
        )}

        {/* 오른쪽: 채팅 영역 */}
        <main
          className={`flex h-full flex-col bg-white ${
            isSidebarOpen ? "w-1/2" : "w-full"
          }`}
        >
          <header className="flex items-center justify-between border-b border-gray-200 p-3">
            <h1 className="text-sm font-semibold">LLM Chat</h1>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={showMemoryContext}
                  onChange={(e) => setShowMemoryContext(e.target.checked)}
                />
                show memory_context
              </label>
              <label className="flex items-center gap-1 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={autoSaveToBundle}
                  onChange={(e) => setAutoSaveToBundle(e.target.checked)}
                />
                자동 메모 저장 (현재 번들)
              </label>
              <button
                type="button"
                onClick={() => setIsSidebarOpen((prev) => !prev)}
                className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-100"
              >
                {isSidebarOpen ? "번들 패널 숨기기" : "번들 패널 열기"}
              </button>
            </div>
          </header>

          <section className="min-h-0 flex-1 overflow-y-auto p-3">
            <ChatWindow
              messages={messages}
              onSendMessage={handleSendMessage}
              isSending={isSending}
              memoryContext={showMemoryContext ? lastMemoryContext ?? "" : ""}
            />
          </section>
        </main>
      </div>
    </div>
  );
}
