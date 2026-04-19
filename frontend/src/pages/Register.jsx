import { useEffect, useMemo, useState } from "react";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import { Link, useNavigate } from "react-router-dom";
import LanguageSwitcher from "../components/LanguageSwitcher";
import { useLanguage } from "../context/LanguageContext";
import { authApi, getApiErrorMessage } from "../utils/api";

const ROLE_STORAGE_KEY = "selectedRole";

function roleLabel(role, t) {
  return role === "issuer" ? t("issuer") : t("student");
}

export default function Register() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    school_name: "",
    school_no: "",
    roll_no: "",
    class_name: "",
    class_div: "",
    role: localStorage.getItem(ROLE_STORAGE_KEY) || "student",
    school_id: "",
  });
  const [schools, setSchools] = useState([]);
  const [schoolsLoading, setSchoolsLoading] = useState(true);
  const [manualSchoolEntry, setManualSchoolEntry] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const title = useMemo(() => t("registerAs", { role: roleLabel(form.role, t) }), [form.role, t]);

  useEffect(() => {
    localStorage.setItem(ROLE_STORAGE_KEY, form.role);
  }, [form.role]);

  useEffect(() => {
    let isMounted = true;

    async function loadSchools() {
      setSchoolsLoading(true);
      try {
        const { data } = await authApi.schools();
        if (!isMounted) {
          return;
        }

        const nextSchools = Array.isArray(data?.schools) ? data.schools : [];
        setSchools(nextSchools);
      } catch (err) {
        if (isMounted) {
          setSchools([]);
        }
      } finally {
        if (isMounted) {
          setSchoolsLoading(false);
        }
      }
    }

    loadSchools();

    return () => {
      isMounted = false;
    };
  }, []);

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSchoolSelect = (value) => {
    if (!value) {
      setForm((prev) => ({
        ...prev,
        school_id: "",
        school_name: "",
        school_no: "",
      }));
      return;
    }

    const selectedSchool = schools.find((school) => String(school.id) === String(value));
    setForm((prev) => ({
      ...prev,
      school_id: value,
      school_name: selectedSchool?.school_name || "",
      school_no: selectedSchool?.school_no || "",
    }));
  };

  const enableManualSchoolEntry = () => {
    setManualSchoolEntry(true);
    setForm((prev) => ({
      ...prev,
      school_id: "",
      school_name: "",
      school_no: "",
    }));
  };

  const useListedSchools = () => {
    setManualSchoolEntry(false);
    setForm((prev) => ({
      ...prev,
      school_id: "",
      school_name: "",
      school_no: "",
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      setError(t("allCoreFieldsRequired"));
      return;
    }

    if (manualSchoolEntry) {
      if (!form.school_name.trim() || !form.school_no.trim()) {
        setError(t("registrationSchoolFieldsRequired"));
        return;
      }

      if (!/^\d{4}$/.test(form.school_no.trim())) {
        setError(t("schoolNumberFourDigits"));
        return;
      }
    } else if (!form.school_id) {
      setError(t("selectExistingSchoolRequired"));
      return;
    }

    if (form.role === "student") {
      if (!form.roll_no.trim() || !form.class_name.trim() || !form.class_div.trim()) {
        setError(t("studentRegistrationFieldsRequired"));
        return;
      }
    }

    setLoading(true);

    try {
      const payload = {
        name: form.name,
        email: form.email,
        password: form.password,
        role: form.role,
        roll_no: form.role === "student" ? form.roll_no : "",
        class_name: form.role === "student" ? form.class_name : "",
        class_div: form.role === "student" ? form.class_div : "",
        school_id: manualSchoolEntry ? "" : form.school_id,
        school_name: manualSchoolEntry ? form.school_name : "",
        school_no: manualSchoolEntry ? form.school_no : "",
      };

      const { data } = await authApi.register(payload);
      if (!data?.success) {
        throw new Error(data?.message || t("registrationFailed"));
      }

      setSuccess(t("registrationSuccessfulRedirecting"));
      setTimeout(() => navigate("/login", { replace: true }), 700);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-gradient-bg flex min-h-screen items-center justify-center px-4 py-6 sm:py-10">
      <div className="w-full max-w-md animate-fade-in-up rounded-3xl border border-white/25 bg-white/15 p-5 shadow-soft backdrop-blur-xl sm:p-8">
        <div className="mb-4 flex justify-end">
          <LanguageSwitcher className="w-full justify-end sm:w-auto" />
        </div>

        <div className="mb-6 text-center text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100">{t("createAccount")}</p>
          <h1 className="mt-3 text-2xl font-extrabold sm:text-3xl">{title}</h1>
          <p className="mt-2 text-sm text-blue-100">{t("joinWithRole")}</p>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl border border-white/25 bg-white/10 p-1 text-sm text-white">
          <button
            type="button"
            className={`min-h-11 rounded-xl px-3 py-2 transition ${form.role === "issuer" ? "bg-white text-indigo-700" : "hover:bg-white/20"}`}
            onClick={() => updateField("role", "issuer")}
          >
            {t("issuer")}
          </button>
          <button
            type="button"
            className={`min-h-11 rounded-xl px-3 py-2 transition ${form.role === "student" ? "bg-white text-indigo-700" : "hover:bg-white/20"}`}
            onClick={() => updateField("role", "student")}
          >
            {t("student")}
          </button>
        </div>

        {error ? <div className="mb-4 rounded-xl border border-red-300/70 bg-red-100/95 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {success ? <div className="mb-4 rounded-xl border border-emerald-300/70 bg-emerald-100/95 px-4 py-3 text-sm text-emerald-700">{success}</div> : null}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-white" htmlFor="name">{t("fullName")}</label>
            <input
              id="name"
              type="text"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500"
              value={form.name}
              onChange={(event) => updateField("name", event.target.value)}
              required
              placeholder={t("enterFullName")}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-white" htmlFor="email">{t("email")}</label>
            <input
              id="email"
              type="email"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500"
              value={form.email}
              onChange={(event) => updateField("email", event.target.value)}
              required
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-white" htmlFor="password">{t("password")}</label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 pr-11 text-sm text-slate-900 outline-none transition focus:border-indigo-500"
                value={form.password}
                onChange={(event) => updateField("password", event.target.value)}
                required
                minLength={6}
                placeholder={t("createStrongPassword")}
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-600 hover:bg-slate-100"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={t("password")}
              >
                {showPassword ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <label className="block text-sm font-medium text-white" htmlFor="school_id">{t("schoolSelection")}</label>
              <button
                type="button"
                className="text-xs font-semibold text-cyan-100 underline decoration-cyan-100/80 underline-offset-4"
                onClick={manualSchoolEntry ? useListedSchools : enableManualSchoolEntry}
              >
                {manualSchoolEntry ? t("chooseFromListedSchools") : t("schoolNotListedManual")}
              </button>
            </div>

            {!manualSchoolEntry ? (
              <>
                <select
                  id="school_id"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500"
                  value={form.school_id}
                  onChange={(event) => handleSchoolSelect(event.target.value)}
                  required={!manualSchoolEntry}
                  disabled={schoolsLoading}
                >
                  <option value="">
                    {schoolsLoading ? t("loadingSchools") : t("selectRegisteredSchool")}
                  </option>
                  {schools.map((school) => (
                    <option key={school.id} value={school.id}>
                      {school.school_name} - {school.school_no}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-blue-100">
                  {schools.length > 0 ? t("selectSchoolHelp") : t("noSchoolsAvailable")}
                </p>
                {form.school_id ? (
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <input
                      type="text"
                      className="w-full rounded-xl border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm text-slate-700 outline-none"
                      value={form.school_name}
                      readOnly
                      aria-label={t("schoolName")}
                    />
                    <input
                      type="text"
                      className="w-full rounded-xl border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm text-slate-700 outline-none"
                      value={form.school_no}
                      readOnly
                      aria-label={t("schoolNumber")}
                    />
                  </div>
                ) : null}
              </>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-white" htmlFor="school_name">{t("schoolName")}</label>
                  <input
                    id="school_name"
                    type="text"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500"
                    value={form.school_name}
                    onChange={(event) => updateField("school_name", event.target.value)}
                    required={manualSchoolEntry}
                    placeholder={t("enterSchoolName")}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-white" htmlFor="school_no">{t("schoolNumber")}</label>
                  <input
                    id="school_no"
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500"
                    value={form.school_no}
                    onChange={(event) => updateField("school_no", event.target.value.replace(/\D/g, "").slice(0, 4))}
                    required={manualSchoolEntry}
                    placeholder={t("enterSchoolNumber")}
                  />
                </div>
              </div>
            )}
          </div>

          {form.role === "student" ? (
            <>
              <div>
                <label className="mb-2 block text-sm font-medium text-white" htmlFor="roll_no">{t("rollNo")}</label>
                <input
                  id="roll_no"
                  type="text"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500"
                  value={form.roll_no}
                  onChange={(event) => updateField("roll_no", event.target.value)}
                  required={form.role === "student"}
                  placeholder={t("enterRollNumber")}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-white" htmlFor="class_name">{t("className")}</label>
                <input
                  id="class_name"
                  type="text"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500"
                  value={form.class_name}
                  onChange={(event) => updateField("class_name", event.target.value)}
                  required={form.role === "student"}
                  placeholder={t("enterClassName")}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-white" htmlFor="class_div">{t("classDivision")}</label>
                <input
                  id="class_div"
                  type="text"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm uppercase text-slate-900 outline-none transition focus:border-indigo-500"
                  value={form.class_div}
                  onChange={(event) => updateField("class_div", event.target.value.toUpperCase())}
                  required={form.role === "student"}
                  placeholder={t("enterClassDivision")}
                />
              </div>
            </>
          ) : null}

          <button
            className="min-h-12 w-full rounded-xl bg-gradient-to-r from-indigo-600 to-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:opacity-95"
            type="submit"
            disabled={loading}
          >
            {loading ? t("creatingAccount") : t("register")}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-blue-100">
          {t("alreadyHaveAccount")}{" "}
          <Link to="/login" className="font-semibold text-white underline decoration-white/70 underline-offset-4">{t("login")}</Link>
        </p>
      </div>
    </div>
  );
}
