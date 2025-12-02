

'use client';

import { useState, FormEvent } from 'react';
import type { ChatMessage } from '@/lib/types';

type ChatWindowProps = {
  messages: ChatMessage[];
  onSendMessage: (text: string) => Promise<void> | void;
  isSending: boolean;
  memoryContext?: string;
};

export function ChatWindow({
  messages,
  onSendMessage,
  isSending,
  memoryContext,
}: ChatWindowProps) {
  const [input, setInput] = useState('');

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

      {/* 채팅 메시지 영역 */}
      <div className="flex-1 overflow-auto p-4 space-y-3 bg-gray-50">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-xl rounded px-3 py-2 text-sm ${
              m.role === 'user'
                ? 'bg-blue-500 text-white ml-auto'
                : 'bg-white border border-gray-200'
            }`}
          >
            {m.content}
          </div>
        ))}
      </div>

      {/* 입력 폼 */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-gray-200 p-3 flex gap-2"
      >
        <textarea
          className="flex-1 border rounded px-2 py-1 text-sm resize-none h-16"
          placeholder="메시지를 입력하세요..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button
          type="submit"
          className="px-3 py-2 text-sm border rounded self-end disabled:opacity-50"
          disabled={isSending}
        >
          {isSending ? '전송 중...' : '전송'}
        </button>
      </form>
    </div>
  );
}
