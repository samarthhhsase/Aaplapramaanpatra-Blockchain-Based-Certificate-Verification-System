import { useState } from "react";
import { FaEye, FaEyeSlash, FaUserShield } from "react-icons/fa6";
import { Link, useNavigate } from "react-router-dom";
import LanguageSwitcher from "../components/LanguageSwitcher";
import { useLanguage } from "../context/LanguageContext";
import { authApi, getApiErrorMessage } from "../utils/api";

const defaultForm = {
  school_name: "",
  school_no: "",
  admin_name: "",
  login_id: "",
  email: "",
  password: "",
};

export default function AdminRegister() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [form, setForm] = useState(defaultForm);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!/^\d{4}$/.test(form.school_no.trim())) {
      setError(t("schoolNumberFourDigits"));
      return;
    }
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const { data } = await authApi.adminRegister(form);
      if (!data?.success) {
        throw new Error(data?.message || "Admin registration failed");
      }

      setForm(defaultForm);
      setSuccess(data.message || "Admin registered successfully. Redirecting to login...");
      setTimeout(() => navigate("/admin-login", { replace: true }), 900);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#99f6e4,_transparent_22%),linear-gradient(145deg,_#052e16,_#0f172a_45%,_#1e293b)] px-4 py-10">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.95fr,1.05fr]">
        <section className="rounded-[32px] border border-white/10 bg-white/5 p-8 text-white shadow-2xl backdrop-blur">
          <div className="mb-6 flex justify-end">
            <LanguageSwitcher />
          </div>
          <div className="inline-flex items-center gap-3 rounded-full border border-emerald-300/25 bg-emerald-300/10 px-4 py-2 text-sm font-semibold text-emerald-100">
            <FaUserShield />
            {t("adminOnboarding")}
          </div>
          <h1 className="mt-6 font-serif text-5xl font-bold leading-tight">Create a secure admin identity for your school portal.</h1>
          <p className="mt-5 max-w-xl text-base text-slate-200">
            Register a dedicated administrator account with institute details, admin contact email, and a unique login ID. Existing issuer and student accounts remain untouched.
          </p>
        </section>

        <section className="rounded-[32px] border border-white/10 bg-white p-8 shadow-2xl shadow-black/20">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-700">{t("adminRegister")}</p>
          <h2 className="mt-3 font-serif text-3xl font-bold text-slate-950">{t("registerAdmin")}</h2>
          <p className="mt-2 text-sm text-slate-600">Fill out the form to create a new admin account in the `admins` table.</p>

          {error ? <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
          {success ? <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div> : null}

          <form className="mt-6 grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-700">{t("schoolName")}</label>
              <input className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-emerald-500" value={form.school_name} onChange={(event) => updateField("school_name", event.target.value)} required />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">{t("schoolNumber")}</label>
              <input
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                value={form.school_no}
                onChange={(event) => updateField("school_no", event.target.value.replace(/\D/g, "").slice(0, 4))}
                inputMode="numeric"
                maxLength={4}
                required
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">{t("adminName")}</label>
              <input className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-emerald-500" value={form.admin_name} onChange={(event) => updateField("admin_name", event.target.value)} required />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">{t("loginId")}</label>
              <input className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-emerald-500" value={form.login_id} onChange={(event) => updateField("login_id", event.target.value)} required />
            </div>
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-700">{t("email")}</label>
              <input type="email" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-emerald-500" value={form.email} onChange={(event) => updateField("email", event.target.value)} required />
            </div>
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-700">{t("password")}</label>
              <div className="relative">
                <input type={showPassword ? "text" : "password"} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 pr-12 text-sm outline-none focus:border-emerald-500" value={form.password} onChange={(event) => updateField("password", event.target.value)} minLength={6} required />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-xl p-2 text-slate-500 hover:bg-slate-100" onClick={() => setShowPassword((prev) => !prev)}>
                  {showPassword ? <FaEyeSlash /> : <FaEye />}
                </button>
              </div>
            </div>
            <div className="md:col-span-2">
              <button type="submit" disabled={loading} className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60">
                {loading ? t("registering") : t("createAdminAccount")}
              </button>
            </div>
          </form>

          <p className="mt-6 text-sm text-slate-600">
            Already registered?{" "}
            <Link to="/admin-login" className="font-semibold text-emerald-700 underline decoration-emerald-300 underline-offset-4">
              {t("openAdminLogin")}
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}
