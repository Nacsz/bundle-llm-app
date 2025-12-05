// frontend/app/page.tsx
"use client";

import { useEffect, useState } from "react";
import type { Bundle, ChatMessage, MemoryItem } from "@/lib/types";
import {
  debugApiBase,
  fetchBundles,
  createBundle,
  sendChat,
  fetchMemoriesForBundle,
  saveMemoryToBundle,
  updateBundle,
  deleteBundle,
  updateMemoryInBundle,
  deleteMemoryInBundle,
  login,
  register,
  setAccessToken,
  clearAccessToken,
  fetchMe,
} from "@/lib/api";
import { ChatWindow } from "@/components/ChatWindow";
import { BundlePanel } from "@/components/BundlePanel";
import { SaveMemoryPanel } from "@/components/SaveMemoryPanel";

type CurrentUser = {
  id: string;
  email: string;
  username?: string | null;
};

export default function HomePage() {
  // -----------------------------
  // ✅ 인증/유저 상태
  // -----------------------------
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // -----------------------------
  // 번들/메모/채팅 상태
  // -----------------------------
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

  // -----------------------------
  // 최초 로딩: API base + 토큰으로 자동 로그인
  // -----------------------------
  useEffect(() => {
    debugApiBase();
    const init = async () => {
      try {
        const me = await fetchMe(); // 토큰 없거나 만료면 에러
        const user: CurrentUser = {
          id: me.id,
          email: me.email,
          username: me.username ?? null,
        };
        setCurrentUser(user);

        const data = await fetchBundles(user.id);
        setBundles(data);
      } catch (err) {
        console.log("[init] not logged in or fetchMe failed", err);
      }
    };
    void init();
  }, []);

  // -----------------------------
  // 로그인 / 회원가입 핸들러
  // -----------------------------
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);

    try {
      if (!authEmail.trim() || !authPassword.trim()) {
        setAuthError("이메일과 비밀번호를 모두 입력하세요.");
        setAuthLoading(false);
        return;
      }

      if (authMode === "register") {
        // 먼저 회원가입
        await register({
          email: authEmail.trim(),
          username: authUsername.trim() || undefined,
          password: authPassword,
        });
      }

      // 그 다음 로그인
      const res = await login(authEmail.trim(), authPassword);
      setAccessToken(res.access_token);

      const user: CurrentUser = {
        id: res.user.id,
        email: res.user.email,
        username: res.user.username ?? null,
      };
      setCurrentUser(user);

      // 로그인 후 번들 로드
      const data = await fetchBundles(user.id);
      setBundles(data);

      // 이전 상태들 리셋
      setMessages([]);
      setBundleMemories({});
      setSelectedMemoryIds([]);
      setExpandedBundleIds([]);

      setAuthError(null);
    } catch (err) {
      console.error("[auth] failed", err);
      setAuthError("인증에 실패했습니다. 이메일/비밀번호를 확인해주세요.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    clearAccessToken();
    setCurrentUser(null);
    setBundles([]);
    setMessages([]);
    setBundleMemories({});
    setSelectedMemoryIds([]);
    setExpandedBundleIds([]);
    setLastMemoryContext(null);
  };

  // -----------------------------
  // 특정 번들의 메모 로드
  // -----------------------------
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

    setExpandedBundleIds((prev) => [...prev, bundleId]);
    void loadBundleMemories(bundleId);
  };

  // 번들 체크박스: 이 번들의 메모 전체 선택/해제 + 펼치기
  const handleToggleBundleSelectAll = (bundleId: string) => {
    setExpandedBundleIds((prev) =>
      prev.includes(bundleId) ? prev : [...prev, bundleId],
    );

    const mems = bundleMemories[bundleId];
    if (!mems || mems.length === 0) {
      void (async () => {
        const items = await fetchMemoriesForBundle(bundleId);
        setBundleMemories((prev) => ({ ...prev, [bundleId]: items }));
        if (items.length === 0) return;

        setSelectedMemoryIds((prev) => {
          const idsInBundle = items.map((m) => m.id);
          const allSelected = idsInBundle.every((id) => prev.includes(id));
          if (allSelected) {
            return prev.filter((id) => !idsInBundle.includes(id));
          }
          const set = new Set(prev);
          idsInBundle.forEach((id) => set.add(id));
          return Array.from(set);
        });
      })();
      return;
    }

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

  const handleToggleMemorySelect = (memoryId: string) => {
    setSelectedMemoryIds((prev) =>
      prev.includes(memoryId)
        ? prev.filter((id) => id !== memoryId)
        : [...prev, memoryId],
    );
  };

  // -----------------------------
  // 채팅 보내기 (/chat)
  // -----------------------------
  const handleSendMessage = async (message: string) => {
    if (!currentUser) {
      window.alert("먼저 로그인 해주세요.");
      return;
    }
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
        user_id: currentUser.id,
        message,
        history: historySlice,
        selected_bundle_ids: [], // 지금은 메모 체크 방식만 사용
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
            user_id: currentUser.id,
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
    } catch (err) {
      console.error("sendChat failed", err);
      window.alert("채팅 전송 실패");
    } finally {
      setIsSending(false);
    }
  };

  // -----------------------------
  // 번들 생성/수정/삭제
  // -----------------------------
  const handleCreateBundle = async (payload: {
    name: string;
    parentId?: string | null;
  }) => {
    if (!currentUser) {
      window.alert("먼저 로그인 해주세요.");
      return;
    }

    const { name, parentId } = payload;

    if (!name.trim()) {
      window.alert("번들 이름을 입력해주세요.");
      return;
    }

    try {
      const newBundle = await createBundle({
        name: name.trim(),
        description: "",
        color: "#4F46E5",
        icon: "📁",
        parent_id: parentId ?? null,
      });

      setBundles((prev) => [newBundle, ...prev]);
    } catch (err) {
      console.error("createBundle failed", err);
      window.alert("번들 생성 실패");
    }
  };

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

      setBundles((prev) => prev.filter((b) => b.id !== bundleId));
      setExpandedBundleIds((prev) => prev.filter((id) => id !== bundleId));

      setBundleMemories((prev) => {
        const next = { ...prev };
        delete next[bundleId];
        return next;
      });

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

  // -----------------------------
  // 메모 저장(수동 패널)
  // -----------------------------
  const handleSaveMemory = async (bundleId: string, title: string) => {
    if (!currentUser) {
      window.alert("먼저 로그인 해주세요.");
      return;
    }

    if (!textToSave.trim()) {
      window.alert("저장할 텍스트가 비어 있습니다.");
      return;
    }

    try {
      const memory = await saveMemoryToBundle(bundleId, {
        user_id: currentUser.id,
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

  // -----------------------------
  // 메모 편집/삭제
  // -----------------------------
  const handleUpdateMemoryContent = async (
    memoryId: string,
    patch: {
      title?: string;
      summary?: string;
      original_text?: string;
      bundle_id?: string;
    },
  ) => {
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

        for (const [bId, mems] of Object.entries(prev)) {
          next[bId] = mems.filter((m) => m.id !== memoryId);
        }

        const targetList = next[toBundleId] ?? [];
        next[toBundleId] = [updated, ...targetList];

        return next;
      });

      setSelectedMemoryIds((prev) => {
        if (!prev.includes(memoryId)) return prev;
        if (toBundleId !== fromBundleId) {
          return prev.filter((id) => id !== memoryId);
        }
        return prev;
      });

      return updated;
    } catch (err) {
      console.error("updateMemoryInBundle failed", err);
      window.alert("메모 편집 실패");
    }
  };

  const handleDeleteMemory = async (memoryId: string) => {
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

  // -----------------------------
  // 현재 채팅 10개 → 저장 패널
  // -----------------------------
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

  // -----------------------------
  // 로그인 화면 렌더링
  // -----------------------------
  if (!currentUser) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-gray-50">
        <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h1 className="mb-4 text-lg font-semibold text-gray-900">
            Bundle LLM 메모리 – {authMode === "login" ? "로그인" : "회원가입"}
          </h1>

          <form onSubmit={handleAuthSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700">
                이메일
              </label>
              <input
                type="email"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                required
              />
            </div>

            {authMode === "register" && (
              <div>
                <label className="block text-xs font-medium text-gray-700">
                  사용자 이름 (선택)
                </label>
                <input
                  type="text"
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                  value={authUsername}
                  onChange={(e) => setAuthUsername(e.target.value)}
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-700">
                비밀번호
              </label>
              <input
                type="password"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                required
              />
            </div>

            {authError && (
              <div className="text-xs text-red-500">{authError}</div>
            )}

            <button
              type="submit"
              disabled={authLoading}
              className="mt-2 w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {authLoading
                ? "처리 중..."
                : authMode === "login"
                  ? "로그인"
                  : "회원가입 후 로그인"}
            </button>
          </form>

          <div className="mt-3 flex items-center justify-between text-xs text-gray-600">
            <span>
              {authMode === "login"
                ? "계정이 없다면 회원가입을 해주세요."
                : "이미 계정이 있다면 로그인으로 전환하세요."}
            </span>
            <button
              type="button"
              onClick={() =>
                setAuthMode((prev) => (prev === "login" ? "register" : "login"))
              }
              className="text-indigo-600 hover:underline"
            >
              {authMode === "login" ? "회원가입으로" : "로그인으로"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -----------------------------
  // 실제 LLM + 번들 UI 렌더링
  // -----------------------------
  return (
    <div className="h-screen w-screen overflow-hidden">
      <div className="flex h-full">
        {/* 왼쪽: 번들 + 메모 관리 */}
        {isSidebarOpen && (
          <aside className="flex h-full w-1/2 flex-col border-r border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
              <div>
                <div className="text-xs text-gray-500">로그인 계정</div>
                <div className="text-xs font-medium text-gray-900">
                  {currentUser.email}
                  {currentUser.username ? ` (${currentUser.username})` : ""}
                </div>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded border border-gray-300 px-2 py-0.5 text-[11px] text-gray-600 hover:bg-gray-100"
              >
                로그아웃
              </button>
            </div>

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
