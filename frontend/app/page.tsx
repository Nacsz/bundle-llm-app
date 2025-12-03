// app/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Bundle, ChatMessage, MemoryItem } from '@/lib/types';
import { ChatWindow } from '@/components/ChatWindow';
import { BundlePanel } from '@/components/BundlePanel';
import { SaveMemoryPanel } from '@/components/SaveMemoryPanel';
import { MemoryList } from '@/components/MemoryList';
import {
  sendChat,
  fetchBundles,
  saveMemoryToBundle,
  fetchMemoriesForBundle,
} from '@/lib/api';

// 안전한 ID 생성기
function genId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    // @ts-ignore
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const MOCK_USER_ID =
  process.env.NEXT_PUBLIC_MOCK_USER_ID ??
  '11111111-1111-1111-1111-111111111111';

export default function HomePage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);

  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [selectedBundleIds, setSelectedBundleIds] = useState<string[]>([]);

  const [lastMemoryContext, setLastMemoryContext] = useState<string | null>(
    null,
  );
  const [showMemoryContext, setShowMemoryContext] = useState(false);

  // “이 대화 블록 저장”용 텍스트
  const [textToSave, setTextToSave] = useState('');

  // 번들별 메모 보기용 상태
  const [activeBundleId, setActiveBundleId] = useState<string | null>(null);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [isLoadingMemories, setIsLoadingMemories] = useState(false);

  // /chat에 포함해서 보낼 history 포맷
  const historyForApi = useMemo(
    () =>
      messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    [messages],
  );

  // 1) 번들 목록 로딩
  useEffect(() => {
    (async () => {
      try {
        const data = await fetchBundles(MOCK_USER_ID);
        setBundles(data);

        if (data.length > 0) {
          setActiveBundleId(data[0].id);
        }
      } catch (e) {
        console.error('[HomePage] fetchBundles error:', e);
      }
    })();
  }, []);

  // 2) activeBundleId 변경 시, 해당 번들 메모 로딩
  useEffect(() => {
    if (!activeBundleId) {
      setMemories([]);
      return;
    }

    (async () => {
      try {
        setIsLoadingMemories(true);
        const data = await fetchMemoriesForBundle(activeBundleId);
        setMemories(data);
      } catch (e) {
        console.error('[HomePage] fetchMemoriesForBundle error:', e);
        setMemories([]);
      } finally {
        setIsLoadingMemories(false);
      }
    })();
  }, [activeBundleId]);

  // 번들 체크 + active 번들 변경
  function handleToggleBundle(id: string) {
    setSelectedBundleIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
    setActiveBundleId(id);
  }

  // 채팅 전송 (/chat)
  async function handleSendMessage(text: string) {
    if (!text.trim()) return;

    const userMessage: ChatMessage = {
      id: genId(),
      role: 'user',
      content: text,
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsSending(true);

    try {
      console.log('[handleSendMessage] request payload =', {
        userId: MOCK_USER_ID,
        message: text,
        selectedBundleIds,
        historyForApi,
      });

      const res: any = await sendChat({
        userId: MOCK_USER_ID,
        message: text,
        selectedBundleIds,
        history: historyForApi,
      });

      console.log('[handleSendMessage] /chat response =', res);

      // 여러 케이스를 대비해서 reply 텍스트 추출
      let replyText = '';

      if (typeof res === 'string') {
        replyText = res;
      } else if (res) {
        replyText =
          res.reply ??
          res.answer ??
          res.message ??
          res.content ??
          '';
      }

      if (!replyText) {
        console.warn(
          '[handleSendMessage] replyText가 비어있음. 응답 구조를 확인하세요.',
          res,
        );
        replyText = '(LLM 응답이 비어 있습니다. 서버 응답 구조를 확인하세요.)';
      }

      const assistantMessage: ChatMessage = {
        id: genId(),
        role: 'assistant',
        content: replyText,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setLastMemoryContext(
        res && typeof res === 'object' ? res.memory_context ?? null : null,
      );
    } catch (e) {
      console.error('[handleSendMessage] error:', e);
    } finally {
      setIsSending(false);
    }
  }

  // 메모 저장 (/bundles/{bundle_id}/memories)
  async function handleSaveMemory(bundleId: string, title: string) {
    if (!textToSave.trim()) return;

    try {
      await saveMemoryToBundle({
        userId: MOCK_USER_ID,
        bundleId,
        originalText: textToSave,
        title,
        metadata: {
          from_ui: 'manual_save_panel',
        },
      });

      setTextToSave('');

      if (bundleId === activeBundleId) {
        try {
          const data = await fetchMemoriesForBundle(bundleId);
          setMemories(data);
        } catch (e) {
          console.error('[handleSaveMemory] refresh memories error:', e);
        }
      }
    } catch (e) {
      console.error('[handleSaveMemory] error:', e);
    }
  }

  return (
    <div className="flex h-screen">
      {/* 왼쪽: 번들 패널 */}
      <aside className="w-72 border-r border-gray-200 p-3">
        <h2 className="font-semibold mb-2 text-sm">Bundles</h2>
        <BundlePanel
          bundles={bundles}
          selectedIds={selectedBundleIds}
          onToggleSelect={handleToggleBundle}
        />
      </aside>

      {/* 오른쪽: 채팅 + 메모 저장/리스트 패널 */}
      <main className="flex-1 flex flex-col">
        <header className="border-b border-gray-200 p-3 flex items-center justify-between">
          <h1 className="font-semibold text-sm">LLM Chat</h1>
          <label className="flex items-center gap-1 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={showMemoryContext}
              onChange={(e) => setShowMemoryContext(e.target.checked)}
            />
            show memory_context
          </label>
        </header>

        <div className="flex-1">
          <ChatWindow
            messages={messages}
            onSendMessage={handleSendMessage}
            isSending={isSending}
            memoryContext={showMemoryContext ? lastMemoryContext ?? '' : ''}
          />
        </div>

        <footer className="border-t border-gray-200 p-3 flex gap-4">
          {/* 왼쪽: “대화 블록 저장” 패널 */}
          <div className="w-1/2">
            <SaveMemoryPanel
              bundles={bundles}
              text={textToSave}
              onTextChange={setTextToSave}
              onSave={handleSaveMemory}
            />
          </div>

          {/* 오른쪽: active 번들의 메모 리스트 */}
          <div className="w-1/2">
            <div className="text-xs font-semibold mb-1">
              선택된 번들 메모 목록
            </div>
            {isLoadingMemories ? (
              <div className="text-xs text-gray-400">로딩 중...</div>
            ) : (
              <MemoryList memories={memories} />
            )}
          </div>
        </footer>
      </main>
    </div>
  );
}
