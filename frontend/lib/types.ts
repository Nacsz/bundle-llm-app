// lib/types.ts

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt?: string;
};

export type ChatApiResponse = {
  answer: string;
  memory_context: string;
};

export type Bundle = {
  id: string;
  user_id: string;
  name: string;
  description?: string | null;
};

export type MemoryItem = {
  id: string;
  user_id: string;
  bundle_id: string;
  title: string;
  original_text: string;
  summary: string;
  source_type: string;
  source_id: string;
  metadata: any;
  is_pinned: boolean;
  usage_count: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
};
