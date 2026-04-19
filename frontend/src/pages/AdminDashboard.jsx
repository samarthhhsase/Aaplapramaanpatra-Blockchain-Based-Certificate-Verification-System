import { useEffect, useState } from "react";
import { FaBuildingColumns, FaEnvelope, FaIdCard, FaUserShield } from "react-icons/fa6";
import AdminShell from "../components/admin/AdminShell";
import Card from "../components/ui/Card";
import { useLanguage } from "../context/LanguageContext";
import { apiRequest } from "../utils/api";

export default function AdminDashboard() {
  const { t } = useLanguage();
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadProfile = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await apiRequest("/admin/profile");
        setAdmin(response.admin || null);
      } catch (err) {
        setError(err.message || t("loadFailedAdminProfile"));
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [t]);

  return (
    <AdminShell
      title={t("adminDashboard")}
      description="Welcome admin. This dashboard confirms your authenticated admin session and shows the core account details for your institution."
    >
      {error ? <div className="rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div> : null}

      {loading ? (
        <Card className="rounded-[28px] text-sm text-slate-600">{t("loadingAdminDashboard")}</Card>
      ) : (
        <div className="dashboard-section-grid lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
          <Card className="rounded-[28px] border-none bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-900 p-8 text-white shadow-2xl">
            <div className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-emerald-100">
              <FaUserShield />
              {t("admin")}
            </div>
            <h2 className="mt-6 font-serif text-4xl font-bold">{admin?.admin_name || "Administrator"}</h2>
            <p className="mt-3 max-w-xl text-sm text-slate-200">
              Your admin session is active. This workspace is ready for future issuer, student, and certificate management features.
            </p>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <div className="rounded-3xl border border-white/10 bg-white/10 p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-emerald-100">{t("schoolName")}</p>
                <p className="mt-2 text-xl font-semibold">{admin?.school_name || "-"}</p>
                <p className="mt-1 text-sm text-emerald-100">{t("schoolNumber")}: {admin?.school_no || "-"}</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/10 p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-emerald-100">{t("adminName")}</p>
                <p className="mt-2 text-xl font-semibold">{admin?.admin_name || "-"}</p>
              </div>
            </div>
          </Card>

          <div className="grid gap-5">
            <Card className="rounded-[28px]">
              <div className="flex items-center gap-3">
                <span className="rounded-2xl bg-slate-950 p-3 text-white"><FaIdCard /></span>
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-500">{t("loginId")}</p>
                  <p className="text-lg font-semibold text-slate-900">{admin?.login_id || "-"}</p>
                </div>
              </div>
            </Card>
            <Card className="rounded-[28px]">
              <div className="flex items-center gap-3">
                <span className="rounded-2xl bg-emerald-600 p-3 text-white"><FaEnvelope /></span>
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-500">{t("email")}</p>
                  <p className="text-lg font-semibold text-slate-900">{admin?.email || "-"}</p>
                </div>
              </div>
            </Card>
            <Card className="rounded-[28px]">
              <div className="flex items-center gap-3">
                <span className="rounded-2xl bg-cyan-600 p-3 text-white"><FaBuildingColumns /></span>
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-500">{t("institution")}</p>
                  <p className="text-lg font-semibold text-slate-900">{admin?.school_name || "-"}</p>
                  <p className="text-sm text-slate-500">{t("schoolNumber")}: {admin?.school_no || "-"}</p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
