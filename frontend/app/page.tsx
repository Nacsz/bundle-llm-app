// frontend/app/page.tsx
"use client";

import { useState, useEffect } from "react";
import type { Bundle, ChatMessage, MemoryItem } from "@/lib/types";
import { ChatWindow } from "@/components/ChatWindow";
import { BundlePanel } from "@/components/BundlePanel";
import { SaveMemoryPanel } from "@/components/SaveMemoryPanel";
import { MemoryList } from "@/components/MemoryList";
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
  const [selectedBundleIds, setSelectedBundleIds] = useState<string[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [showMemoryContext, setShowMemoryContext] = useState(false);
  const [lastMemoryContext, setLastMemoryContext] = useState<string | null>(
    null,
  );

  const [textToSave, setTextToSave] = useState("");
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [activeBundleId, setActiveBundleId] = useState<string | null>(null);
  const [isLoadingMemories, setIsLoadingMemories] = useState(false);

  const [sidebarWidth, setSidebarWidth] = useState<number>(260);
  const [isResizing, setIsResizing] = useState(false);

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

  // 사이드바 리사이즈
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.min(480, Math.max(200, e.clientX));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  // 번들 선택/해제
  const handleToggleBundle = (bundleId: string) => {
    setSelectedBundleIds((prev) =>
      prev.includes(bundleId)
        ? prev.filter((id) => id !== bundleId)
        : [...prev, bundleId],
    );

    setActiveBundleId(bundleId);
  };

  // activeBundleId 변경 시 메모 로드
  useEffect(() => {
    const loadMemoriesForActive = async () => {
      if (!activeBundleId) return;
      setIsLoadingMemories(true);

      const items = await fetchMemoriesForBundle(activeBundleId);
      setMemories(items);

      setIsLoadingMemories(false);
    };
    loadMemoriesForActive();
  }, [activeBundleId]);

  // 채팅 보내기
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
        selected_bundle_ids: selectedBundleIds,
        history: historySlice,
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
        {/* 왼쪽: 번들 패널 */}
        <aside
          className="shrink-0 border-r border-gray-200 p-3"
          style={{ width: sidebarWidth }}
        >
          <h2 className="mb-2 text-sm font-semibold">Bundles</h2>
          <BundlePanel
            bundles={bundles}
            selectedIds={selectedBundleIds}
            onToggleSelect={handleToggleBundle}
            onCreateBundle={handleCreateBundle}
            chatMessages={messages}
          />
        </aside>

        {/* 가운데: 드래그 바 */}
        <div
          className="h-full w-[3px] cursor-col-resize bg-gray-200 hover:bg-gray-300"
          onMouseDown={() => setIsResizing(true)}
        />

        {/* 오른쪽: 채팅 + 메모 */}
        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-gray-200 p-3">
            <h1 className="text-sm font-semibold">LLM Chat</h1>
            <label className="flex items-center gap-1 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={showMemoryContext}
                onChange={(e) => setShowMemoryContext(e.target.checked)}
              />
              show memory_context
            </label>
          </header>

          <section className="min-h-0 flex-1 overflow-y-auto p-3">
            <ChatWindow
              messages={messages}
              onSendMessage={handleSendMessage}
              isSending={isSending}
              memoryContext={showMemoryContext ? lastMemoryContext ?? "" : ""}
            />
          </section>

          <footer className="border-t border-gray-200 p-3">
            <div className="flex gap-4">
              <div className="w-1/2">
                <SaveMemoryPanel
                  bundles={bundles}
                  text={textToSave}
                  onTextChange={setTextToSave}
                  onSave={handleSaveMemory}
                  onFillFromCurrentChat={handleFillCurrentChatToSavePanel}
                />
              </div>

              <div className="w-1/2">
                <div className="mb-1 text-xs font-semibold">
                  선택된 번들 메모 목록
                </div>
                {isLoadingMemories ? (
                  <div className="text-xs text-gray-400">로딩 중...</div>
                ) : (
                  <MemoryList
                    memories={memories}
                    activeBundleName={activeBundleName}
                  />
                )}
              </div>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}
