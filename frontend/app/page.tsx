// frontend/app/page.tsx
"use client";

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
  const [lastMemoryContext, setLastMemoryContext] = useState<string | null>(null);

  const [textToSave, setTextToSave] = useState("");
  const [activeBundleId, setActiveBundleId] = useState<string | null>(null);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [isLoadingMemories, setIsLoadingMemories] = useState(false);

  // 번들 상관없이, 선택된 메모 전체를 id → MemoryItem으로 저장
  const [selectedMemories, setSelectedMemories] = useState<
    Record<string, MemoryItem>
  >({});

  // "번들 체크 → 메모 전체 선택"을 위해, 비동기 로딩 이후 한 번 실행할 플래그
  const [pendingSelectAllBundleId, setPendingSelectAllBundleId] = useState<
    string | null
  >(null);

  // 왼쪽 번들/메모 패널 접기/펼치기
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // 자동 메모 저장 ON/OFF
  const [autoSaveToBundle, setAutoSaveToBundle] = useState(false);

  const activeBundleName =
    bundles.find((b) => b.id === activeBundleId)?.name ?? null;

  // 초기 번들 로드
  useEffect(() => {
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

  // 번들 행 클릭 → 펼치기 / 접기
  const handleExpandBundle = (bundleId: string) => {
    setActiveBundleId((prev) => (prev === bundleId ? null : bundleId));
  };

  // activeBundleId 변경 시 해당 번들의 메모 로드
  useEffect(() => {
    const loadMemoriesForActive = async () => {
      if (!activeBundleId) {
        setMemories([]);
        return;
      }
      setIsLoadingMemories(true);

      try {
        const items = await fetchMemoriesForBundle(activeBundleId);
        setMemories(items);
      } catch (err) {
        console.error("fetchMemoriesForBundle failed", err);
      } finally {
        setIsLoadingMemories(false);
      }
    };
    loadMemoriesForActive();
  }, [activeBundleId]);

  // 번들 체크박스: 이 번들의 메모 전체 선택/해제 + 펼치기
  const handleToggleBundleSelectAll = (bundleId: string) => {
    // 다른 번들을 누른 경우: 먼저 그 번들을 펼치고, 로드가 끝나면 전체 선택 처리
    if (bundleId !== activeBundleId) {
      setActiveBundleId(bundleId);
      setPendingSelectAllBundleId(bundleId);
      return;
    }

    // 이미 이 번들이 펼쳐져 있는 경우: 바로 전체 선택/해제
    if (!activeBundleId || memories.length === 0) return;

    const allSelected = memories.every((m) => !!selectedMemories[m.id]);
    setSelectedMemories((prev) => {
      const next = { ...prev };
      if (allSelected) {
        // 전체 선택 상태였다면 → 모두 해제
        memories.forEach((m) => {
          delete next[m.id];
        });
      } else {
        // 아니었다면 → 모두 선택
        memories.forEach((m) => {
          next[m.id] = m;
        });
      }
      return next;
    });
  };

  // "다른 번들을 선택 → 메모 로드 완료 → pendingSelectAllBundleId 일치" 시 전체 선택/해제
  useEffect(() => {
    if (
      !activeBundleId ||
      pendingSelectAllBundleId !== activeBundleId ||
      memories.length === 0
    ) {
      return;
    }

    const allSelected = memories.every((m) => !!selectedMemories[m.id]);

    setSelectedMemories((prev) => {
      const next = { ...prev };
      if (allSelected) {
        memories.forEach((m) => {
          delete next[m.id];
        });
      } else {
        memories.forEach((m) => {
          next[m.id] = m;
        });
      }
      return next;
    });

    setPendingSelectAllBundleId(null);
  }, [activeBundleId, memories, pendingSelectAllBundleId, selectedMemories]);

  // 메모 개별 체크/해제
  const handleToggleMemorySelect = (memoryId: string) => {
    const memory = memories.find((m) => m.id === memoryId);
    if (!memory) return;

    setSelectedMemories((prev) => {
      const next = { ...prev };
      if (next[memoryId]) {
        delete next[memoryId];
      } else {
        next[memoryId] = memory;
      }
      return next;
    });
  };

  // 현재 펼쳐진 번들에서 선택된 메모 id 목록
  const selectedMemoryIdsForActive = memories
    .filter((m) => !!selectedMemories[m.id])
    .map((m) => m.id);

  // 번들 체크박스가 "체크된 상태"인지: 이 번들의 모든 메모가 선택되어 있을 때만 true
  const isBundleFullySelected = (bundleId: string): boolean => {
    if (bundleId !== activeBundleId || memories.length === 0) return false;
    return memories.every((m) => !!selectedMemories[m.id]);
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
      const selectedMemoryArray = Object.values(selectedMemories);
      const selectedMemoryIds = selectedMemoryArray.map((m) => m.id);

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
      if (autoSaveToBundle && activeBundleId) {
        try {
          const titleBase = message.trim();
          const title =
            titleBase.length > 30 ? titleBase.slice(0, 30) + "…" : titleBase || "자동 저장 메모";

          const autoText = `사용자: ${message}\n\nLLM: ${res.answer}`;

          const memory = await saveMemoryToBundle(activeBundleId, {
            user_id: MOCK_USER_ID,
            original_text: autoText,
            title,
            metadata: { from_ui: "auto_chat_save" },
          });

          // 현재 펼친 번들과 동일하면 리스트에 즉시 반영
          if (activeBundleId === memory.bundle_id) {
            setMemories((prev) => [memory, ...prev]);
          }
        } catch (err) {
          console.error("[auto-save] saveMemoryToBundle failed", err);
          // UX상 조용히 실패해도 되고, 필요하면 alert 추가 가능
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
    if (!window.confirm(`"${name}" 번들을 삭제할까요? (메모도 함께 삭제됩니다)`)) {
      return;
    }

    try {
      await deleteBundle(bundleId);
      setBundles((prev) => prev.filter((b) => b.id !== bundleId));

      // 현재 펼쳐진 번들을 지운 경우
      if (activeBundleId === bundleId) {
        setActiveBundleId(null);
        setMemories([]);
      }

      // 선택된 메모들 중, 이 번들에 속한 것들 제거
      setSelectedMemories((prev) => {
        const next: Record<string, MemoryItem> = {};
        for (const [id, mem] of Object.entries(prev)) {
          if (mem.bundle_id !== bundleId) {
            next[id] = mem;
          }
        }
        return next;
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

      // 현재 펼쳐진 번들과 같으면 리스트에 바로 반영
      if (activeBundleId === bundleId) {
        setMemories((prev) => [memory, ...prev]);
      }
      setTextToSave("");
    } catch (err) {
      console.error("saveMemoryToBundle failed", err);
      window.alert("메모 저장 실패");
    }
  };

  // 메모 내용(제목/요약/원문) 편집
  const handleUpdateMemoryContent = async (
    memoryId: string,
    patch: { title?: string; summary?: string; original_text?: string },
  ) => {
    if (!activeBundleId) return;

    try {
      const updated = await updateMemoryInBundle(activeBundleId, memoryId, patch);

      // 리스트 갱신
      setMemories((prev) =>
        prev.map((m) => (m.id === memoryId ? updated : m)),
      );

      // 선택된 메모에도 반영
      setSelectedMemories((prev) => {
        if (!prev[memoryId]) return prev;
        return {
          ...prev,
          [memoryId]: updated,
        };
      });

      return updated;
    } catch (err) {
      console.error("updateMemoryInBundle failed", err);
      window.alert("메모 편집 실패");
    }
  };

  // 메모 삭제
  const handleDeleteMemory = async (memoryId: string) => {
    if (!activeBundleId) return;

    if (!window.confirm("이 메모를 삭제할까요?")) return;

    try {
      await deleteMemoryInBundle(activeBundleId, memoryId);

      // 리스트에서 제거
      setMemories((prev) => prev.filter((m) => m.id !== memoryId));

      // 선택 목록에서도 제거
      setSelectedMemories((prev) => {
        const next = { ...prev };
        delete next[memoryId];
        return next;
      });
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
                activeBundleId={activeBundleId}
                onExpandBundle={handleExpandBundle}
                onToggleBundleSelectAll={handleToggleBundleSelectAll}
                isBundleFullySelected={isBundleFullySelected}
                memories={memories}
                isLoadingMemories={isLoadingMemories}
                selectedMemoryIds={selectedMemoryIdsForActive}
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
