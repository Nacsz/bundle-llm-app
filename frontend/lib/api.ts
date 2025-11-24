// lib/api.ts
import type { Bundle, ChatApiResponse, MemoryItem } from './types';

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';

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
