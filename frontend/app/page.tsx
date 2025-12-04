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
  const [activeBundleId, setActiveBundleId] = useState<string | null>(null);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [isLoadingMemories, setIsLoadingMemories] = useState(false);

  // 번들 상관 없이, 선택된 메모 전체를 메모 id → MemoryItem 으로 저장
  const [selectedMemories, setSelectedMemories] = useState<
    Record<string, MemoryItem>
  >({});

  // "번들 체크 → 메모 전체 선택"을 위해, 비동기 로딩 이후 한 번 실행할 플래그
  const [pendingSelectAllBundleId, setPendingSelectAllBundleId] = useState<
    string | null
  >(null);

  // 왼쪽 번들/메모 패널 접기/펼치기
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

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

  // "다른 번들을 선택 → 메모 로드 완료 → pendingSelectAllBundleId 일치" 시 전체 선택
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

  // 채팅 보내기 (/chat에 선택된 메모 id만 보냄)
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

  // 메모 저장
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
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={showMemoryContext}
                  onChange={(e) => setShowMemoryContext(e.target.checked)}
                />
                show memory_context
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
