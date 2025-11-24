// components/ChatWindow.tsx
'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@/lib/types';

type Props = {
  messages: ChatMessage[];
  onSendMessage: (text: string) => Promise<void> | void;
  isSending?: boolean;
  memoryContext?: string; // 디버그용 memory_context 표시
};

export function ChatWindow({
  messages,
  onSendMessage,
  isSending,
  memoryContext,
}: Props) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput('');
    await onSendMessage(text);
  }

  return (
    <div className="flex flex-col h-screen">
      {/* 상단: memory_context 디버그 표시 (옵션) */}
      {memoryContext && (
        <div className="border-b border-gray-200 bg-yellow-50 p-2 text-xs text-gray-700 max-h-32 overflow-auto">
          <div className="font-semibold mb-1">[memory_context]</div>
          <pre className="whitespace-pre-wrap">{memoryContext}</pre>
        </div>
      )}

      {/* 메시지 영역 */}
      <div className="flex-1 overflow-auto p-4 space-y-3 bg-gray-50">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-xl p-2 rounded text-sm ${
              m.role === 'user'
                ? 'bg-blue-100 self-end'
                : 'bg-white border self-start'
            }`}
          >
            <div className="text-[11px] text-gray-500 mb-1">
              {m.role === 'user' ? 'You' : 'Assistant'}
            </div>
            <div className="whitespace-pre-wrap">{m.content}</div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* 입력 영역 */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-gray-200 p-3 flex gap-2"
      >
        <textarea
          className="flex-1 border rounded px-2 py-1 text-sm resize-none h-16"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="메시지를 입력하세요..."
        />
        <button
          type="submit"
          className="px-3 py-2 text-sm border rounded self-end"
          disabled={isSending}
        >
          {isSending ? '전송 중...' : '전송'}
        </button>
      </form>
    </div>
  );
}

