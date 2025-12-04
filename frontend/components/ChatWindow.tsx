"use client";

import React, { useState, FormEvent } from "react";
import type { ChatMessage } from "@/lib/api";

interface ChatWindowProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => Promise<void>;
  isSending: boolean;
  memoryContext: string;
}

export function ChatWindow({
  messages,
  onSendMessage,
  isSending,
  memoryContext,
}: ChatWindowProps) {
  const [input, setInput] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;

    await onSendMessage(input.trim());
    setInput("");
  }

  return (
    <div className="flex flex-col h-full">
      {/* 채팅 내용 영역 */}
      <div className="flex-1 overflow-auto p-4 space-y-3 bg-gray-50">
        {messages.map((m, index) => (
          <div
            // key: id가 없어서 role+index 조합으로 유니크하게 만듦
            key={`${m.role}-${index}`}
            className={`max-w-xl rounded px-3 py-2 text-sm ${
              m.role === "user"
                ? "ml-auto bg-blue-500 text-white"
                : "mr-auto bg-white border border-gray-200"
            }`}
          >
            {m.content}
          </div>
        ))}
      </div>

      {/* memory_context 표시 (옵션) */}
      {memoryContext && (
        <div className="border-t border-gray-200 bg-gray-100 p-2 text-xs text-gray-600 whitespace-pre-wrap">
          {memoryContext}
        </div>
      )}

      {/* 입력창 */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-gray-200 p-2 flex gap-2"
      >
        <textarea
          className="flex-1 resize-none border border-gray-300 rounded px-2 py-1 text-sm"
          rows={2}
          placeholder="메시지를 입력하세요..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button
          type="submit"
          className="px-4 py-2 text-sm rounded bg-blue-600 text-white disabled:opacity-60"
          disabled={isSending}
        >
          {isSending ? "전송 중..." : "전송"}
        </button>
      </form>
    </div>
  );
}
