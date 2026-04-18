"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("doctor@aqbobek.local");
  const [password, setPassword] = useState("demo12345");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setMessage("");

    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();
    setIsLoading(false);

    if (!response.ok) {
      setMessage(data.message || "Не удалось войти");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="card grid gap-5 p-7" data-testid="login-form">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-600">Демо-доступ</p>
        <h1 className="mt-2 text-3xl font-black text-slate-950">Вход врача</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Используйте тестовые учетные данные для запуска сценариев MedBot.
        </p>
      </div>

      <label className="grid gap-2">
        <span className="field-label">Логин</span>
        <input
          className="field-control"
          data-testid="login-email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          autoComplete="username"
        />
      </label>

      <label className="grid gap-2">
        <span className="field-label">Пароль</span>
        <input
          className="field-control"
          data-testid="login-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          autoComplete="current-password"
        />
      </label>

      {message ? <p className="rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-700">{message}</p> : null}

      <button className="btn-primary w-full" type="submit" disabled={isLoading} data-testid="login-submit">
        {isLoading ? "Вход..." : "Войти"}
      </button>
    </form>
  );
}
