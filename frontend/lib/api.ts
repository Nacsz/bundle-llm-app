/* lib/api.ts
import type { Bundle, ChatApiResponse, MemoryItem } from './types';

export const API_BASE = "http://localhost:8000";
export const MOCK_USER_ID = "test-user";

const MOCK_USER_ID =
  process.env.NEXT_PUBLIC_MOCK_USER_ID ??
  '65142c1c-6ab9-4369-8d31-666c6456472b';

export { MOCK_USER_ID };

// ★ 번들 목록 가져오기
export async function fetchBundles(userId: string): Promise<Bundle[]> {
  // 네가 구현한 실제 엔드포인트에 맞게 경로만 맞춰줘
  // 예: GET /users/{user_id}/bundles 또는 GET /bundles?user_id=...
  const res = await fetch(`${API_BASE}/bundles?user_id=${userId}`, {
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('fetchBundles error:', res.status, text);
    throw new Error('Failed to load bundles');
  }

  return res.json();
}

// ★ selectedBundleIds를 받도록 수정
export async function sendChat(options: {
  userId: string;
  message: string;
  selectedBundleIds: string[];
  history: { role: 'user' | 'assistant'; content: string }[];
}): Promise<ChatApiResponse> {
  const res = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: options.userId,
      message: options.message,
      selected_bundle_ids: options.selectedBundleIds,
      history: options.history,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('sendChat error:', res.status, text);
    throw new Error('Failed to send chat');
  }

  return res.json();
}

// ★ /bundles/{bundle_id}/memories 호출
export async function saveMemoryToBundle(options: {
  userId: string;
  bundleId: string;
  originalText: string;
  title: string;
  sourceType?: string;
  sourceId?: string;
  metadata?: Record<string, any>;
}) {
  const {
    userId,
    bundleId,
    originalText,
    title,
    sourceType = 'chat',
    sourceId = `chat_${new Date().toISOString()}`,
    metadata = {},
  } = options;

  const res = await fetch(`${API_BASE}/bundles/${bundleId}/memories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: userId,
      original_text: originalText,
      title,
      source_type: sourceType,
      source_id: sourceId,
      metadata,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('saveMemoryToBundle error:', res.status, text);
    throw new Error('Failed to save memory');
  }

  return res.json();
}
export async function fetchMemoriesForBundle(
  bundleId: string
): Promise<MemoryItem[]> {
  const res = await fetch(`${API_BASE}/bundles/${bundleId}/memories`, {
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('fetchMemoriesForBundle error:', res.status, text);
    throw new Error('Failed to load memories');
  }

  return res.json();
}
*/


// lib/api.ts

// 브라우저 / 서버 어디서든 공통으로 부를 함수
function getApiBase() {
  // 1) 브라우저에서 실행될 때: 현재 페이지의 hostname + :8000
  if (typeof window !== "undefined") {
    const { protocol, hostname } = window.location; // 예: http / 172.24.4.113
    return `${protocol}//${hostname}:8000`;
  }

  // 2) 서버(Next.js dev/SSR)에서 사용할 기본값 (도커 네트워크 안)
  // docker-compose에서 backend 서비스 이름이 'backend' 라고 가정
  if (process.env.NEXT_PUBLIC_API_BASE_URL) {
    return process.env.NEXT_PUBLIC_API_BASE_URL;
  }

  return "http://backend:8000";
}

export function debugApiBase() {
  const base = getApiBase();
  if (typeof window !== "undefined") {
    console.log("[API_BASE] (browser)", base);
  } else {
    console.log("[API_BASE] (server)", base);
  }
}

export const API_BASE = getApiBase();
// 필요하면 다른 곳에서도 쓸 수 있게 export
export { getApiBase };


// 채팅 메시지 타입 (page.tsx에서 쓰는 형식과 맞춤)
export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

// -------------------
// 1) /chat 호출
// -------------------

export interface ChatApiResponse {
  reply: string;
  used_memories: any[];
}

export async function sendChat(opts: {
  userId: string;
  message: string;
  selectedBundleIds: string[];
  history: { role: "user" | "assistant"; content: string }[];
}) {
  const base = getApiBase();
  console.log("[sendChat] API base =", base)
  
  const res = await fetch(`${base}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: opts.userId,
      message: opts.message,
      selected_bundle_ids: opts.selectedBundleIds,
      history: opts.history,
    }),
  });

  if (!res.ok) {
    throw new Error(`sendChat failed: ${res.status}`);
  }

  const data = await res.json();
  return {
    answer: data.answer ?? data.reply ?? "",
    memory_context: data.memory_context ?? "",
    used_memories: data.used_memories ?? [],
  };
}


// -------------------
// 2) /bundles 목록 조회
//    GET /bundles?user_id=...
// -------------------

export async function fetchBundles(userId: string) {
  const base = getApiBase();

    const res = await fetch(
    `${base}/bundles?user_id=${encodeURIComponent(userId)}`,
    {
      method: "GET",
      cache: "no-store",
    }
);

  if (!res.ok) {
    throw new Error(`fetchBundles failed: ${res.status}`);
  }
  return res.json();
}


// -------------------
// 3) 특정 번들의 메모 목록 조회
//    GET /bundles/{bundle_id}/memories
// -------------------

export async function fetchMemoriesForBundle(bundleId: string) {
  const base = getApiBase();

  const res = await fetch(`${base}/bundles/${bundleId}/memories`, {
    method: "GET",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`fetchMemoriesForBundle failed: ${res.status}`);
  }
  return res.json();
}

// -------------------
// 4) 메모 저장
//    POST /bundles/{bundle_id}/memories
// -------------------

export async function saveMemoryToBundle(opts: {
  userId: string;
  bundleId: string;
  originalText: string;
  title: string;
  metadata?: Record<string, any>;
}) {
  const base = getApiBase();

  const res = await fetch(`${base}/bundles/${opts.bundleId}/memories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: opts.userId,
      original_text: opts.originalText,
      title: opts.title,
      metadata: opts.metadata ?? {},
    }),
  });
  if (!res.ok) {
    throw new Error(`saveMemoryToBundle failed: ${res.status}`);
  }
  return res.json();
}
// -------------------
// 5) 번들 생성
//    POST /bundles/{bundle_id}/memories
// -------------------
export async function createBundle(params: {
  userId: string;
  name: string;
  description?: string;
}) {
  const res = await fetch(`${API_BASE}/bundles/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: params.userId,
      name: params.name,
      description: params.description ?? "",
      color: "#4F46E5",
      icon: "💡",
    }),
  });

  if (!res.ok) {
    console.error("[createBundle] failed", res.status);
    throw new Error("Failed to create bundle");
  }

  return (await res.json()) as import("./types").Bundle;
}
