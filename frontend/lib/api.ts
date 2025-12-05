// frontend/lib/api.ts

// -------------------
// 공통 API base URL
// -------------------

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "").replace(/\/$/, "");

export function getApiBase() {
  if (!API_BASE) {
    console.warn(
      "[getApiBase] NEXT_PUBLIC_API_BASE 가 설정되어 있지 않습니다.",
    );
  }
  return API_BASE;
}

export function debugApiBase() {
  const base = getApiBase();
  if (typeof window !== "undefined") {
    console.log(
      "[API_BASE] hostname =",
      window.location.hostname,
      "→",
      base,
    );
  } else {
    console.log("[API_BASE] (server) =", base);
  }
}

// -------------------
// 토큰 헬퍼
// -------------------

// 브라우저에서 로컬스토리지에 저장한 access_token 읽기
function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem("access_token");
  } catch {
    return null;
  }
}

// -------------------
// 공통 fetch 래퍼
// -------------------

async function apiFetch(path: string, options?: RequestInit) {
  const base = getApiBase();
  const url = `${base}${path}`;

  console.log("API request:", url, options?.method || "GET");

  const headers = new Headers(options?.headers || {});

  // body가 JSON일 때만 Content-Type 기본값 세팅
  if (
    !headers.has("Content-Type") &&
    !(options && options.body instanceof FormData)
  ) {
    headers.set("Content-Type", "application/json");
  }

  // 🔒 JWT 토큰이 있으면 Authorization 헤더 추가
  const token = getAccessToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[apiFetch] failed:", res.status, url, text || "(no body)");
    throw new Error(`[apiFetch] failed: ${res.status} ${url}`);
  }

  return res;
}

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

export type MemoryItem = import("./types").MemoryItem;

// -------------------
// 1) /chat 호출
// -------------------

type SendChatPayload = {
  user_id: string; // 백엔드가 실제로는 무시해도 되지만, 기존 스키마 때문에 유지
  message: string;
  selected_bundle_ids: string[];
  history: ChatMessage[];
  selected_memory_ids?: string[]; // ✅ 체크된 메모 id 배열
};

export async function sendChat(
  payload: SendChatPayload,
): Promise<ChatApiResponse> {
  const res = await apiFetch(`/chat`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

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

export async function fetchBundles(_userId: string) {
  // 이제 userId는 사용하지 않고, 토큰에서 유저를 식별
  const res = await apiFetch(`/bundles/`, {
    method: "GET",
    cache: "no-store",
  });

  return res.json() as Promise<import("./types").Bundle[]>;
}

// -------------------
// 3) 특정 번들의 메모 목록
// -------------------

export async function fetchMemoriesForBundle(
  bundleId: string,
): Promise<MemoryItem[]> {
  try {
    const res = await apiFetch(`/bundles/${bundleId}/memories`, {
      method: "GET",
      cache: "no-store",
    });

    const data = await res.json();
    return (data ?? []) as MemoryItem[];
  } catch (err) {
    console.warn("[fetchMemoriesForBundle] error", err);
    return [];
  }
}

// -------------------
// 4) 메모 저장
// -------------------

type SaveMemoryPayload = {
  user_id: string; // 백엔드에서 실제로는 current_user.id 사용
  original_text: string;
  title?: string;
  metadata?: Record<string, any>;
};

export async function saveMemoryToBundle(
  bundleId: string,
  payload: SaveMemoryPayload,
): Promise<MemoryItem> {
  const res = await apiFetch(`/bundles/${bundleId}/memories`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return (await res.json()) as MemoryItem;
}

// -------------------
// 5) 번들 생성
// -------------------

export async function createBundle(params: {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  parent_id?: string | null;
}) {
  const body = {
    name: params.name,
    description: params.description ?? "",
    color: params.color ?? "#4F46E5",
    icon: params.icon ?? "📁",
    parent_id: params.parent_id ?? null,
  };

  const res = await apiFetch(`/bundles/`, {
    method: "POST",
    body: JSON.stringify(body),
  });

  return (await res.json()) as import("./types").Bundle;
}

// -------------------
// 6) 번들 수정 / 삭제
// -------------------

export async function updateBundle(
  bundleId: string,
  patch: {
    name?: string;
    description?: string;
    color?: string;
    icon?: string;
    parent_id?: string | null;
    is_archived?: boolean;
  },
) {
  const res = await apiFetch(`/bundles/${bundleId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });

  return (await res.json()) as import("./types").Bundle;
}

export async function deleteBundle(bundleId: string) {
  const res = await apiFetch(`/bundles/${bundleId}`, {
    method: "DELETE",
  });

  return await res.json();
}

// -------------------
// 7) 메모 수정 / 삭제
// -------------------

export async function updateMemoryInBundle(
  bundleId: string,
  memoryId: string,
  patch: {
    title?: string;
    original_text?: string;
    summary?: string;
    metadata?: Record<string, any>;
    bundle_id?: string;
  },
): Promise<MemoryItem> {
  const res = await apiFetch(`/bundles/${bundleId}/memories/${memoryId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });

  return (await res.json()) as MemoryItem;
}

export async function deleteMemoryInBundle(
  bundleId: string,
  memoryId: string,
) {
  const res = await apiFetch(`/bundles/${bundleId}/memories/${memoryId}`, {
    method: "DELETE",
  });

  return await res.json();
}

// -------------------
// 8) Auth API
// -------------------

export function setAccessToken(token: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("access_token", token);
  } catch {
    // ignore
  }
}

export function clearAccessToken() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem("access_token");
  } catch {
    // ignore
  }
}

type LoginResponse = {
  access_token: string;
  token_type: string;
  user: {
    id: string;
    email: string;
    username?: string | null;
  };
};

// 로그인
export async function login(
  email: string,
  password: string,
): Promise<LoginResponse> {
  const res = await apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

  return (await res.json()) as LoginResponse;
}

// 회원가입
export async function register(params: {
  email: string;
  username?: string;
  password: string;
}): Promise<LoginResponse> {
  const res = await apiFetch("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email: params.email,
      username: params.username,
      password: params.password,
    }),
  });

  const user = await res.json();
  return {
    access_token: "",
    token_type: "bearer",
    user,
  };
}

// 내 정보 조회 (토큰 필요)
export async function fetchMe() {
  const res = await apiFetch("/auth/me", {
    method: "GET",
    cache: "no-store",
  });
  return res.json();
}
