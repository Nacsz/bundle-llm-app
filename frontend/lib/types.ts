// frontend/lib/types.ts

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
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
  bundle_id: string | null;
  title?: string | null;
  original_text?: string | null;
  summary?: string | null;
  source_type: string;
  source_id?: string | null;
  metadata?: any;
  is_pinned: boolean;
  usage_count: number;
  last_used_at?: string | null;
  created_at?: string;
  updated_at?: string;
};
