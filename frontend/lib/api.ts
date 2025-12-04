// lib/api.ts

// -------------------
// 공통 API base URL
// -------------------
function getApiBase() {
  // 1) 브라우저에서 실행될 때: 현재 페이지의 hostname + :8000
  if (typeof window !== "undefined") {
    const { protocol, hostname } = window.location; // 예: http / 172.24.4.113
    return `${protocol}//${hostname}:8000`;
  }

  // 2) 서버(Next.js dev/SSR)에서 사용할 기본값
  if (process.env.NEXT_PUBLIC_API_BASE_URL) {
    return process.env.NEXT_PUBLIC_API_BASE_URL;
  }

  // docker-compose 안에서 backend 서비스 이름이 'backend' 라고 가정
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
export { getApiBase };

// -------------------
// 타입들
// -------------------

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export interface ChatApiResponse {
  answer: string;
  memory_context: string;
  used_memories: any[];
}

// -------------------
// 1) /chat 호출
//    (page.tsx 에서 쓰는 payload 모양 그대로 받는다)
// -------------------

type SendChatPayload = {
  user_id: string;                    // MOCK_USER_ID
  message: string;
  selected_bundle_ids: string[];      // 선택된 번들 id 목록
  history: ChatMessage[];             // [{role, content}, ...]
};

export async function sendChat(payload: SendChatPayload): Promise<ChatApiResponse> {
  const base = getApiBase();

  const res = await fetch(`${base}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text(); // 에러 상세 확인용
    console.error("[sendChat] failed:", res.status, text);
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

  const res = await fetch(`${base}/bundles?user_id=${encodeURIComponent(userId)}`, {
    method: "GET",
    cache: "no-store",
  });

  if (!res.ok) {
    console.error("[fetchBundles] failed:", res.status);
    throw new Error(`fetchBundles failed: ${res.status}`);
  }

  return res.json() as Promise<import("./types").Bundle[]>;
}

// -------------------
// 3) 특정 번들의 메모 목록 조회
//    GET /bundles/{bundle_id}/memories
// -------------------
export async function fetchMemoriesForBundle(bundleId: string) {
  const base = getApiBase();

  try {
    const res = await fetch(`${base}/bundles/${bundleId}/memories`, {
      method: "GET",
      cache: "no-store",
    });

    // HTTP 에러(404, 500 등)인 경우
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(
        "[fetchMemoriesForBundle] HTTP error",
        res.status,
        text || "(no body)",
      );
      // UI는 그냥 '메모 없음' 처럼 동작하면 되니까 빈 배열 리턴
      return [];
    }

    return (await res.json()) as any[];
  } catch (err) {
    // 네트워크 레벨 에러 (CORS, 연결 문제 등)
    console.warn("[fetchMemoriesForBundle] network error", err);
    return [];
  }
}

// -------------------
// 4) 메모 저장
//    POST /bundles/{bundle_id}/memories
//    (page.tsx: saveMemoryToBundle(bundleId, { user_id, original_text, ... }))
// -------------------

type SaveMemoryPayload = {
  user_id: string;
  original_text: string;
  title?: string;
  metadata?: Record<string, any>;
  // source_type / source_id 는 백엔드 Pydantic 기본값 사용 ("chat", None)
};

export async function saveMemoryToBundle(
  bundleId: string,
  payload: SaveMemoryPayload,
) {
  const base = getApiBase();

  const res = await fetch(`${base}/bundles/${bundleId}/memories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("[saveMemoryToBundle] failed:", res.status, text);
    throw new Error(`saveMemoryToBundle failed: ${res.status}`);
  }

  return (await res.json()) as import("./types").MemoryItem;
}

// -------------------
// 5) 번들 생성
//    POST /bundles/
//    (page.tsx: createBundle({ user_id, name, description, color, icon, parent_id }))
// -------------------

type CreateBundlePayload = {
  user_id: string;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  parent_id?: string | null;
};

// -------------------
// 5) 번들 생성
//    POST /bundles/
// -------------------
export async function createBundle(params: {
  user_id: string;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  parent_id?: string | null;
}) {
  const base = getApiBase();

  const body = {
    user_id: params.user_id,
    name: params.name,
    description: params.description ?? "",
    color: params.color ?? "#4F46E5",
    icon: params.icon ?? "�",
    parent_id: params.parent_id ?? null,
  };

  const res = await fetch(`${base}/bundles/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    // 에러 디버깅용 로그 (지금 네가 본 detail 그대로 찍히게)
    const text = await res.text();
    console.error("[createBundle] failed:", res.status, text);
    throw new Error("Failed to create bundle");
  }

  return (await res.json()) as import("./types").Bundle;
}