import { FaArrowRightFromBracket } from "react-icons/fa6";
import { useLanguage } from "../../context/LanguageContext";
import LanguageSwitcher from "../LanguageSwitcher";

export default function AdminNavbar({ user, title, description, onLogout }) {
  const { t } = useLanguage();
  const initials = (user?.adminName || user?.admin_name || user?.username || "A")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white/90 p-5 shadow-xl shadow-slate-200/50 backdrop-blur">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-700">{t("administration")}</p>
          <h1 className="mt-2 font-serif text-3xl font-bold text-slate-950">{title}</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">{description}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <LanguageSwitcher light />
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{t("school")}</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{user?.schoolName || user?.school_name || t("admin")}</p>
            <p className="mt-1 text-xs text-slate-500">{t("schoolNumber")}: {user?.schoolNo || user?.school_no || "-"}</p>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-sm font-bold text-emerald-300">
              {initials}
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900">{user?.adminName || user?.admin_name || user?.username || "Administrator"}</p>
              <p className="text-xs text-slate-500">{user?.loginId || user?.login_id || "admin"}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            <FaArrowRightFromBracket />
            {t("logout")}
          </button>
        </div>
      </div>
    </div>
  );
}
