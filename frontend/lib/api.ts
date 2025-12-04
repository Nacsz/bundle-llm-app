// frontend/lib/api.ts

// -------------------
// 공통 API base URL
// -------------------
function getApiBase() {
  if (typeof window !== "undefined") {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:8000`;
  }

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

// MemoryItem 타입은 lib/types.ts 것을 그대로 사용
export type MemoryItem = import("./types").MemoryItem;

// -------------------
// 1) /chat 호출
// -------------------

type SendChatPayload = {
  user_id: string;
  message: string;
  selected_bundle_ids: string[];
  history: ChatMessage[];
};

export async function sendChat(
  payload: SendChatPayload,
): Promise<ChatApiResponse> {
  const base = getApiBase();

  const res = await fetch(`${base}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
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
// -------------------

export async function fetchBundles(userId: string) {
  const base = getApiBase();

  const res = await fetch(
    `${base}/bundles?user_id=${encodeURIComponent(userId)}`,
    {
      method: "GET",
      cache: "no-store",
    },
  );

  if (!res.ok) {
    console.error("[fetchBundles] failed:", res.status);
    throw new Error(`fetchBundles failed: ${res.status}`);
  }

  return res.json() as Promise<import("./types").Bundle[]>;
}

// -------------------
// 3) 특정 번들의 메모 목록
// -------------------
export async function fetchMemoriesForBundle(
  bundleId: string,
): Promise<MemoryItem[]> {
  const base = getApiBase();

  try {
    const res = await fetch(`${base}/bundles/${bundleId}/memories`, {
      method: "GET",
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(
        "[fetchMemoriesForBundle] HTTP error",
        res.status,
        text || "(no body)",
      );
      return [];
    }

    const data = await res.json();
    return (data ?? []) as MemoryItem[];
  } catch (err) {
    console.warn("[fetchMemoriesForBundle] network error", err);
    return [];
  }
}

// -------------------
// 4) 메모 저장
// -------------------

type SaveMemoryPayload = {
  user_id: string;
  original_text: string;
  title?: string;
  metadata?: Record<string, any>;
};

export async function saveMemoryToBundle(
  bundleId: string,
  payload: SaveMemoryPayload,
): Promise<MemoryItem> {
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

  return (await res.json()) as MemoryItem;
}

// -------------------
// 5) 번들 생성
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
    const text = await res.text();
    console.error("[createBundle] failed:", res.status, text);
    throw new Error("Failed to create bundle");
  }

  return (await res.json()) as import("./types").Bundle;
}
