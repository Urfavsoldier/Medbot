import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

const navItems = [
  { href: "/dashboard", label: "Дашборд", testId: "nav-dashboard" },
  { href: "/patients", label: "Пациенты", testId: "nav-patients" },
  { href: "/patients", label: "Регистратура", testId: "nav-registry" }
];

export async function AppShell({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  async function logout() {
    "use server";
    const { clearSessionCookie } = await import("@/lib/auth");
    clearSessionCookie();
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-72 border-r border-slate-200 bg-white/95 p-6 lg:block">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500 to-blue-600 text-lg font-black text-white shadow-soft">
            D
          </div>
          <div>
            <p className="font-black text-slate-950">Damumed Sandbox</p>
            <p className="text-xs font-medium text-slate-500">Реабилитационный центр</p>
          </div>
        </div>

        <nav className="mt-10 grid gap-2">
          {navItems.map((item) => (
            <Link
              key={item.testId}
              href={item.href}
              data-testid={item.testId}
              className="rounded-2xl px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-blue-50 hover:text-blue-700"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="absolute bottom-6 left-6 right-6 rounded-3xl border border-emerald-100 bg-emerald-50 p-4">
          <p className="text-sm font-black text-emerald-950">MedBot ready</p>
          <p className="mt-1 text-xs leading-5 text-emerald-800">
            DOM-структура стабилизирована для внешней автоматизации Chrome Extension.
          </p>
        </div>
      </aside>

      <main className="lg:pl-72">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/85 px-5 py-4 backdrop-blur lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Медицинская платформа</p>
              <p className="mt-1 text-sm font-semibold text-slate-600">Рабочее место врача</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="text-sm font-black text-slate-900">{user.name}</p>
                <p className="text-xs text-slate-500">{user.email}</p>
              </div>
              <form action={logout}>
                <button className="btn-secondary" type="submit" data-testid="logout-button">
                  Выйти
                </button>
              </form>
            </div>
          </div>
        </header>
        <div className="p-5 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
