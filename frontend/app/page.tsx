// frontend/app/page.tsx
"use client";

import React, { useEffect, useState, FormEvent } from "react";
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
  setUserOpenAIKey,
  setSharedApiPassword,
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
  
  // OpenAI 설정 (개인 키 / 테스트용 비밀번호)
  const [openAiInput, setOpenAiInput] = useState("");
  const [openAiStatus, setOpenAiStatus] = useState<string>("");

  // "현재 번들"은 마지막으로 펼친 번들 기준
  const currentBundleId =
    expandedBundleIds.length > 0
      ? expandedBundleIds[expandedBundleIds.length - 1]
      : null;
  const getDescendantBundleIds = (rootId: string): string[] => {
    const result: string[] = [rootId];
    const stack: string[] = [rootId];

    while (stack.length > 0) {
      const current = stack.pop()!;
      const children = bundles.filter(
        (b) => (b.parent_id ?? null) === current,
      );
      for (const child of children) {
        result.push(child.id);
        stack.push(child.id);
      }
    }

    return result;
  };
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

      // � OpenAI 설정 상태 텍스트 업데이트
      if (typeof window !== "undefined") {
        try {
          const userKey = localStorage.getItem("user_openai_key");
          const sharedPw = localStorage.getItem("shared_api_password");
          if (userKey) {
            setOpenAiStatus("개인 OpenAI API 키 사용 중");
          } else if (sharedPw) {
            setOpenAiStatus("공용(교수 평가용) API 사용 요청 중");
          } else {
            setOpenAiStatus("OpenAI 키 미설정 (echo 모드)");
          }
        } catch {
          setOpenAiStatus("OpenAI 키 상태 확인 실패");
        }
      }
    };
    void init();
  }, []);

  // -----------------------------
  // 로그인 / 회원가입 핸들러
  // -----------------------------
  const handleAuthSubmit = async (e: FormEvent) => {
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
    const handleSaveOpenAiConfig = () => {
    const value = openAiInput.trim();

    if (!value) {
      // 초기화
      setUserOpenAIKey(null);
      setSharedApiPassword(null);
      setOpenAiStatus("OpenAI 키 미설정 (echo 모드)");
      window.alert("OpenAI 설정을 초기화했습니다. (echo 모드로 동작)");
      setOpenAiInput("");
      return;
    }

    if (value.startsWith("sk-")) {
      // 개인 키 모드
      setUserOpenAIKey(value);
      setSharedApiPassword(null);
      setOpenAiStatus("개인 OpenAI API 키 사용 중");
      window.alert(
        "개인 OpenAI API 키가 저장되었습니다.\n브라우저 localStorage에만 저장됩니다.",
      );
      setOpenAiInput("");
      return;
    }

    // 그 밖의 값은 "교수 평가용 비밀번호"로 취급
    setUserOpenAIKey(null);
    setSharedApiPassword(value);
    setOpenAiStatus("공용(평가용) API 사용 요청 중");
    window.alert(
      "평가용 비밀번호가 저장되었습니다.\n서버에 설정된 비밀번호와 일치할 경우 공용 API 키를 사용합니다.",
    );
    setOpenAiInput("");
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

  // 번들 체크박스: 이 번들과 모든 하위 번들의 메모 전체 선택/해제
  const handleToggleBundleSelectAll = (bundleId: string) => {
    const targetBundleIds = getDescendantBundleIds(bundleId);

    void (async () => {
      // 1) 관련 번들의 메모를 모두 로딩 (아직 안 불러온 번들은 fetch)
      const newlyLoaded: Record<string, MemoryItem[]> = {};
      const allMemories: MemoryItem[] = [];

      for (const bId of targetBundleIds) {
        let mems = bundleMemories[bId];

        if (!mems) {
          const items = await fetchMemoriesForBundle(bId);
          mems = items;
          newlyLoaded[bId] = items;
        }

        if (mems && mems.length > 0) {
          allMemories.push(...mems);
        }
      }

      // 로딩된 메모들 상태 반영
      if (Object.keys(newlyLoaded).length > 0) {
        setBundleMemories((prev) => ({ ...prev, ...newlyLoaded }));
      }

      // 이 트리에 메모가 하나도 없으면 아무 일도 안 함
      if (allMemories.length === 0) return;

      const allIds = allMemories.map((m) => m.id);

      // 2) 이미 전부 선택되어 있으면 → 전부 해제, 아니면 → 전부 선택
      setSelectedMemoryIds((prev) => {
        const allSelected = allIds.every((id) => prev.includes(id));

        if (allSelected) {
          // 해제
          return prev.filter((id) => !allIds.includes(id));
        }

        // 선택
        const set = new Set(prev);
        allIds.forEach((id) => set.add(id));
        return Array.from(set);
      });
    })();
  };

    // � 모든 번들의 메모 전체 선택 / 해제
  const handleToggleAllBundlesSelect = () => {
    void (async () => {
      if (bundles.length === 0) return;

      const newlyLoaded: Record<string, MemoryItem[]> = {};
      const allMems: MemoryItem[] = [];

      // 모든 번들에 대해 메모 로딩 & 수집
      for (const b of bundles) {
        let mems = bundleMemories[b.id];

        if (!mems) {
          const items = await fetchMemoriesForBundle(b.id);
          mems = items;
          newlyLoaded[b.id] = items;
        }

        if (mems && mems.length > 0) {
          allMems.push(...mems);
        }
      }

      // 새로 로드한 메모를 상태에 반영
      if (Object.keys(newlyLoaded).length > 0) {
        setBundleMemories((prev) => ({ ...prev, ...newlyLoaded }));
      }

      if (allMems.length === 0) return;

      const allIds = allMems.map((m) => m.id);

      // 이미 전부 선택되어 있으면 → 해제, 아니면 → 전부 선택
      setSelectedMemoryIds((prev) => {
        const allSelected = allIds.every((id) => prev.includes(id));

        if (allSelected) {
          // 전체 해제
          return prev.filter((id) => !allIds.includes(id));
        }

        // 전체 선택
        const set = new Set(prev);
        allIds.forEach((id) => set.add(id));
        return Array.from(set);
      });
    })();
  };


      const isBundleFullySelected = (bundleId: string): boolean => {
    const targetBundleIds = getDescendantBundleIds(bundleId);

    const allMems: MemoryItem[] = [];
    for (const bId of targetBundleIds) {
      const mems = bundleMemories[bId];
      if (mems && mems.length > 0) {
        allMems.push(...mems);
      }
    }

    if (allMems.length === 0) return false;

    // 이 번들 트리 안에 있는 모든 메모가 selectedMemoryIds 에 포함되어 있으면 true
    return allMems.every((m) => selectedMemoryIds.includes(m.id));
  };



  const getMemoriesForBundle = (bundleId: string): MemoryItem[] => {
    return bundleMemories[bundleId] ?? [];
  };

  const isLoadingBundle = (bundleId: string): boolean => {
    return loadingBundles[bundleId] ?? false;
  };

  const isBundleMemoriesLoaded = (bundleId: string): boolean => {
    return Object.prototype.hasOwnProperty.call(bundleMemories, bundleId);
  };

  const handleToggleMemorySelect = (memoryId: string) => {
    setSelectedMemoryIds((prev) =>
      prev.includes(memoryId)
        ? prev.filter((id) => id !== memoryId)
        : [...prev, memoryId],
    );
  };

  // -----------------------------
  // 채팅 보내기
  //  (/chat에 선택된 메모 id만 보냄 + 자동 메모 저장)
  // -----------------------------
  const handleSendMessage = async (message: string) => {
    if (!message.trim()) return;
    if (!currentUser) {
      window.alert("먼저 로그인 해주세요.");
      return;
    }

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
        user_id: currentUser.id, // 지금은 백엔드가 토큰으로 유저를 알아서 찾아가니까 사실상 의미 없음
        message,
        history: historySlice,
        selected_bundle_ids: [], // 스키마 맞추기용
        selected_memory_ids: selectedMemoryIds,
      });

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: res.answer,
      };

      const updatedMessages = [...newMessages, assistantMsg];
      setMessages(updatedMessages);
      setLastMemoryContext(res.memory_context);

      // � auto_route 에서 새 번들을 만들 수 있으니, 번들 목록 리프레시
      try {
        const latestBundles = await fetchBundles(currentUser.id);
        setBundles(latestBundles);
      } catch (err) {
        console.warn("failed to refresh bundles after chat", err);
      }

      // ----- 자동 메모 저장 (현재 번들) -----
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
        icon: "�",
        parent_id: parentId ?? null,
      });

      setBundles((prev) => [newBundle, ...prev]);
    } catch (err) {
      console.error("createBundle failed", err);
      window.alert("번들 생성 실패");
    }
  };

    const handleMoveBundle = async (bundleId: string, newParentId: string) => {
    try {
      const updated = await updateBundle(bundleId, {
        parent_id: newParentId,
      });

      // 상태에도 반영
      setBundles((prev) =>
        prev.map((b) => (b.id === bundleId ? updated : b)),
      );
    } catch (err) {
      console.error("[handleMoveBundle] updateBundle failed", err);
      window.alert("번들 이동 중 오류가 발생했습니다.");
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
  // 번들 트리 헬퍼: 특정 번들의 하위 번들까지 모두 모으기
  // -----------------------------
  const collectDescendantBundleIds = (rootId: string): string[] => {
    const result: string[] = [];
    const stack: string[] = [rootId];

    while (stack.length > 0) {
      const id = stack.pop()!;
      if (!result.includes(id)) result.push(id);

      bundles.forEach((b) => {
        if (b.parent_id === id) {
          stack.push(b.id);
        }
      });
    }

    return result;
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
            {/* OpenAI 설정 영역 */}
            <div className="border-b border-gray-100 bg-slate-50 px-3 py-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-gray-700">
                  OpenAI 설정
                </span>
                <span className="text-[10px] text-gray-500">
                  sk-... 또는 평가 비밀번호
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  type="password"
                  className="flex-1 rounded border border-gray-300 px-2 py-1 text-[11px]"
                  placeholder="sk-로 시작하는 키 또는 평가용 비밀번호"
                  value={openAiInput}
                  onChange={(e) => setOpenAiInput(e.target.value)}
                />
                <button
                  type="button"
                  onClick={handleSaveOpenAiConfig}
                  className="rounded bg-indigo-600 px-2 py-1 text-[11px] text-white hover:bg-indigo-700"
                >
                  저장
                </button>
              </div>
              <div className="mt-1 text-[10px] text-gray-600">
                {openAiStatus || "OpenAI 키 미설정 (echo 모드)"}
              </div>
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
                onMoveBundle={handleMoveBundle}
                isBundleMemoriesLoaded={isBundleMemoriesLoaded}
                onToggleSelectAllBundles={handleToggleAllBundlesSelect}
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
          <header className="flex items-center justify_between border-b border-gray-200 p-3">
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
