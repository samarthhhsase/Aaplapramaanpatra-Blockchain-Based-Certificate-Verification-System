import { useEffect, useMemo, useState } from "react";
import jsQR from "jsqr";
import {
  FaCheckCircle,
  FaClock,
  FaExclamationCircle,
  FaQrcode,
  FaSearch,
  FaShieldAlt,
  FaTimesCircle,
  FaUpload,
} from "react-icons/fa";
import { Link, useParams } from "react-router-dom";
import Logo from "../components/Logo";
import PortalNavbar from "../components/PortalNavbar";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Input from "../components/ui/Input";
import { useLanguage } from "../context/LanguageContext";
import { apiRequest, getApiErrorMessage } from "../utils/api";

function extractCertificateId(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";

  if (trimmed.includes("/verify/")) {
    return decodeURIComponent(trimmed.split("/verify/")[1] || "").trim();
  }

  if (trimmed.includes("/verify-certificate/")) {
    return decodeURIComponent(trimmed.split("/verify-certificate/")[1] || "").trim();
  }

  return trimmed;
}

async function decodeQrFromFile(file, t) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const img = await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const context = canvas.getContext("2d");
  context.drawImage(img, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const code = jsQR(imageData.data, imageData.width, imageData.height);

  if (!code?.data) {
    throw new Error(t("qrCodeNotDetected"));
  }

  return extractCertificateId(code.data);
}

function formatPercentage(value) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  return `${Number(value).toFixed(2)}%`;
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function StatusBadge({ status, t }) {
  const normalized = String(status || "").trim().toLowerCase();
  const config = {
    valid: {
      label: t("valid"),
      className: "bg-[#28A745] text-white",
      icon: <FaCheckCircle className="text-white" />,
    },
    revoked: {
      label: t("revoked"),
      className: "bg-[#DC3545] text-white",
      icon: <FaTimesCircle className="text-white" />,
    },
    pending: {
      label: "Pending",
      className: "bg-[#FFC107] text-slate-900",
      icon: <FaClock className="text-slate-900" />,
    },
    not_found: {
      label: t("notFound"),
      className: "bg-slate-200 text-slate-700",
      icon: <FaExclamationCircle className="text-slate-700" />,
    },
  };

  const current = config[normalized] || config.not_found;

  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold ${current.className}`}>
      {current.icon}
      {current.label}
    </span>
  );
}

function ResultField({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">{label}</p>
      <p className="mt-2 break-all text-sm font-semibold text-slate-900">{value || "-"}</p>
    </div>
  );
}

export default function VerifyCertificate() {
  const { id } = useParams();
  const { t } = useLanguage();
  const [query, setQuery] = useState(id || "");
  const [rollNo, setRollNo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const certificate = result?.certificate || null;
  const resultStatus = result?.status || (error ? "not_found" : null);

  const statusMessage = useMemo(() => {
    if (error) {
      return error;
    }

    if (!result) {
      return "";
    }

    return result.message || "";
  }, [error, result]);

  const runVerify = async (value, rollValue = rollNo) => {
    const certificateId = extractCertificateId(value);
    if (!certificateId) {
      setError(t("certificateIdRequired"));
      setResult(null);
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    const endpoint = `/public/verify/${encodeURIComponent(certificateId)}`;
    const params = {};

    if (String(rollValue || "").trim()) {
      params.roll_no = String(rollValue).trim();
    }

    try {
      const data = await apiRequest(endpoint, { params });
      setResult(data);
      setQuery(certificateId);
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        getApiErrorMessage(err) ||
        t("verificationFailed");

      if (err?.response?.status === 404) {
        setResult({
          success: false,
          status: "not_found",
          message,
        });
        setError("");
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      runVerify(id, "");
    }
  }, [id]);

  const handleQrUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const certificateId = await decodeQrFromFile(file, t);
      if (!certificateId) {
        throw new Error(t("unableToReadQr"));
      }

      setQuery(certificateId);
      await runVerify(certificateId, rollNo);
    } catch (err) {
      setError(err.message || t("qrVerificationFailed"));
    } finally {
      setLoading(false);
      event.target.value = "";
    }
  };

  return (
    <div className="gov-page-bg min-h-screen">
      <PortalNavbar />

      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8 md:py-10">
        <section className="gov-card overflow-hidden">
          <div className="bg-gradient-to-br from-white via-slate-50 to-blue-50 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#0B5ED7] sm:text-sm sm:tracking-[0.28em]">{t("publicVerification")}</p>
                <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl lg:text-4xl">{t("verifyCertificate")}</h1>
                <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-slate-700 sm:text-base">
                  Enter the certificate ID to verify authenticity through institutional records and blockchain-backed validation.
                </p>
              </div>
              <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <Logo />
              </div>
            </div>
          </div>
        </section>

        <Card className="gov-card border-none p-4 sm:p-6 lg:p-8">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <Input
                label="Certificate ID"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("enterCertificateNumber")}
              />
            </div>
            <div className="lg:col-span-4">
              <Input
                label={t("rollNumberOptional")}
                value={rollNo}
                onChange={(event) => setRollNo(event.target.value)}
                placeholder={t("rollNumberOptional")}
              />
            </div>
            <div className="flex items-end lg:col-span-3">
              <Button onClick={() => runVerify(query)} disabled={loading} className="min-h-12 w-full justify-center">
                <FaSearch />
                {loading ? t("verifying") : t("verifyCertificate")}
              </Button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[1.3fr_0.7fr]">
            <div className="rounded-3xl border border-slate-200 bg-[#F5F7FA] p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-blue-50 p-3 text-[#0B5ED7]">
                  <FaShieldAlt />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">{t("publicCertificateCheck")}</p>
                  <p className="text-sm leading-6 text-slate-700">Matches the certificate number against the issued records and the latest certificate status.</p>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-4 sm:p-5">
              <label className="flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-center text-sm font-semibold text-slate-800 transition hover:border-blue-300 hover:bg-blue-50">
                <FaUpload />
                {t("uploadQrImage")}
                <input type="file" accept="image/*" className="hidden" onChange={handleQrUpload} />
              </label>
              <p className="mt-3 flex items-center gap-2 text-xs font-medium text-slate-600">
                <FaQrcode />
                Scan to verify certificate authenticity. {t("qrUploadHint")}
              </p>
            </div>
          </div>
        </Card>

        {statusMessage ? (
          <Card
            className={
              resultStatus === "revoked"
                ? "border-red-200 bg-red-50 text-red-700"
                : resultStatus === "pending"
                  ? "border-yellow-200 bg-yellow-50 text-yellow-800"
                  : resultStatus === "not_found" || error
                    ? "border-rose-200 bg-rose-50 text-rose-700"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <StatusBadge status={resultStatus || "valid"} t={t} />
                <p className="text-sm font-semibold">{statusMessage}</p>
              </div>
              {result?.verified_at ? (
                <p className="flex items-center gap-2 text-xs font-medium">
                  <FaClock />
                  {t("verifiedOn")} {formatDateTime(result.verified_at)}
                </p>
              ) : null}
            </div>
          </Card>
        ) : null}

        {certificate ? (
          <Card className="gov-card border-none p-4 sm:p-6 lg:p-8">
            <div className="mx-auto max-w-4xl text-center">
              <p className="gov-section-title">{t("certificateResult")}</p>
              <h2 className="mt-3 text-2xl font-black text-slate-900 sm:text-3xl">Official Certificate Status Card</h2>
              <p className="mt-3 text-sm leading-6 text-slate-700">
                Verified result for certificate <span className="font-semibold text-slate-900">{certificate.certificate_id}</span>
              </p>
            </div>

            <div className="mx-auto mt-6 max-w-4xl rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_12px_32px_rgba(15,23,42,0.08)] sm:mt-8 sm:rounded-[28px] sm:p-6 lg:p-8">
              <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-start md:justify-between">
                <div className="text-center md:text-left">
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#0B5ED7] sm:text-sm sm:tracking-[0.3em]">AaplaPramaanPatra</p>
                  <h3 className="mt-2 break-words text-xl font-black text-slate-900 sm:text-2xl">{certificate.student_name}</h3>
                  <p className="mt-1 text-sm font-medium text-slate-700">{certificate.course || "-"}</p>
                </div>
                <div className="flex justify-center md:justify-end">
                  <StatusBadge status={certificate.status} t={t} />
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                <ResultField label={t("studentName")} value={certificate.student_name} />
                <ResultField label={t("course")} value={certificate.course} />
                <ResultField label={t("issuerName")} value={certificate.issuer_name || "-"} />
                <ResultField label={t("certificateId")} value={certificate.certificate_id} />
                <ResultField label={t("certificateHash")} value={certificate.certificate_hash || "-"} />
                <ResultField label={t("issuedDate")} value={formatDateTime(certificate.issued_at)} />
                <ResultField label={t("status")} value={String(certificate.status || "-").toUpperCase()} />
                <ResultField label={t("chainIssuerAddress")} value={certificate.blockchain?.issuer_address || "-"} />
              </div>

              <div className="mt-6 rounded-3xl border border-blue-100 bg-blue-50 p-4 sm:p-5">
                <p className="text-sm font-bold text-slate-900">Status Summary</p>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm leading-6 text-slate-700">
                    Student: <span className="font-semibold text-slate-900">{certificate.student_name}</span>{" "}
                    Course: <span className="font-semibold text-slate-900">{certificate.course || "-"}</span>{" "}
                    Issuer: <span className="font-semibold text-slate-900">{certificate.issuer_name || "-"}</span>
                  </p>
                  <StatusBadge status={certificate.status} t={t} />
                </div>
              </div>

              <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">{t("remarks")}</p>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-800">
                  {certificate.remarks || t("noRemarksAdded")}
                </p>
              </div>

              {(certificate.subjects || []).length > 0 ? (
                <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200">
                  <div className="border-b border-slate-200 bg-slate-50 px-4 py-4 sm:px-5">
                    <p className="text-sm font-semibold text-slate-900">{t("subjectWiseMarks")}</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-[640px] text-left text-sm">
                      <thead className="bg-white text-xs uppercase tracking-[0.18em] text-slate-500">
                        <tr>
                          <th className="px-5 py-4">{t("subjectName")}</th>
                          <th className="px-5 py-4">{t("marksObtained")}</th>
                          <th className="px-5 py-4">{t("outOf")}</th>
                          <th className="px-5 py-4">{t("percentage")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {certificate.subjects.map((subject) => (
                          <tr key={subject.id} className="border-t border-slate-200 bg-white">
                            <td className="px-5 py-4 font-medium text-slate-900">{subject.subject_name}</td>
                            <td className="px-5 py-4 text-slate-700">{subject.marks_scored}</td>
                            <td className="px-5 py-4 text-slate-700">{subject.out_of}</td>
                            <td className="px-5 py-4 font-semibold text-[#0B5ED7]">
                              {formatPercentage(subject.subject_percentage)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>
          </Card>
        ) : null}

        <div className="flex justify-start">
          <Link
            to="/"
            className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-blue-300 hover:text-[#0B5ED7]"
          >
            {t("backToHome")}
          </Link>
        </div>
      </div>
    </div>
  );
}
