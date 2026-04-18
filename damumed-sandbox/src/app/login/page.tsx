import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "@/components/LoginForm";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <main className="grid min-h-screen place-items-center px-5 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500 to-blue-600 font-black text-white shadow-soft">
            D
          </div>
          <div>
            <p className="font-black text-slate-950">Damumed Sandbox</p>
            <p className="text-sm text-slate-500">Медицинская демо-система</p>
          </div>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
