// frontend/app/login/page.tsx

"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { login, setAccessToken } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    try {
      const res = await login(email, password);
      if (!res.access_token) {
        // 혹시 백엔드 응답 포맷이 다르면 여기서 콘솔로 한 번 찍어봐도 됨
        console.warn("[login] 응답에 access_token 이 없습니다:", res);
        throw new Error("토큰 발급 실패");
      }

      // 🔒 토큰 저장
      setAccessToken(res.access_token);

      // TODO: 필요하면 사용자 정보 전역 상태에 저장하는 로직 추가 가능

      // 홈으로 이동
      router.push("/");
    } catch (err: any) {
      console.error("[LoginPage] login failed", err);
      setErrorMsg(err?.message ?? "로그인에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="mb-4 text-2xl font-semibold text-slate-800">
          로그인
        </h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">
              이메일
            </label>
            <input
              type="email"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">
              비밀번호
            </label>
            <input
              type="password"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          {errorMsg && (
            <p className="text-sm text-red-600">{errorMsg}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 inline-flex w-full items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "로그인 중..." : "로그인"}
          </button>
        </form>

        <p className="mt-4 text-xs text-slate-500">
          아직 계정이 없다면 Swagger에서{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5">/auth/register</code>{" "}
          호출해서 테스트용 계정을 하나 만든 다음 사용해도 돼.
        </p>
      </div>
    </main>
  );
}
