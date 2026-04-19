import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  FaClipboardList,
  FaFileAlt,
  FaHome,
  FaListUl,
  FaPlusCircle,
  FaSignOutAlt,
  FaTrashAlt,
} from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import Layout from "../components/layout/Layout";
import { scrollDashboardToSection } from "../components/layout/DashboardShell";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Input from "../components/ui/Input";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { apiRequest } from "../utils/api";

const ISSUE_DEFAULTS = {
  studentId: "",
  studentName: "",
  studentEmail: "",
  course: "",
  grade: "",
  issueDate: "",
  rollNo: "",
  studentClassName: "",
  studentClassDiv: "",
  year: "",
  certificateType: "Final Marksheet",
  remarks: "",
  class: "FE",
  studentType: "Regular",
  semester: "I",
  subjects: [],
};

const EDIT_FORM_DEFAULTS = {
  grade: "",
  subjects: [],
};

const EDIT_FORM_ERROR_DEFAULTS = {
  grade: "",
  subjects: "",
};

function createSubjectRow() {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    subject_name: "",
    marks_scored: "",
    out_of: "",
  };
}

function createDefaultIssueForm() {
  return {
    ...ISSUE_DEFAULTS,
    subjects: [createSubjectRow()],
  };
}

function createEditSubjectRow(subject) {
  return {
    id: subject.id,
    subject_name: subject.subject_name || "",
    marks_scored: subject.marks_scored ?? "",
    out_of: subject.out_of ?? "",
    subject_percentage: subject.subject_percentage ?? 0,
  };
}

function createNewEditSubjectRow() {
  return {
    id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    subject_name: "",
    marks_scored: "",
    out_of: "",
    subject_percentage: 0,
    isNew: true,
  };
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toPercentage(scored, outOf) {
  if (outOf <= 0) return 0;
  return Number(((scored / outOf) * 100).toFixed(2));
}

function calculateOverallPercentage(subjects) {
  const totals = subjects.reduce(
    (accumulator, subject) => ({
      scored: accumulator.scored + toNumber(subject.marks_scored),
      outOf: accumulator.outOf + toNumber(subject.out_of),
    }),
    { scored: 0, outOf: 0 }
  );

  return totals.outOf > 0 ? toPercentage(totals.scored, totals.outOf) : 0;
}

function validateIssueForm(issueForm, t) {
  const errors = [];

  if (!issueForm.studentId) errors.push(t("studentRequired"));
  if (!issueForm.course.trim()) errors.push(t("courseRequired"));
  if (!issueForm.grade.trim()) errors.push(t("gradeRequired"));
  if (!issueForm.issueDate) errors.push(t("issueDateRequired"));
  if (!issueForm.rollNo.trim()) errors.push(t("rollNoRequired"));
  if (!issueForm.year.trim()) errors.push(t("yearRequired"));
  if (!issueForm.certificateType.trim()) errors.push(t("certificateTypeRequired"));
  if (issueForm.remarks.trim().length > 500) errors.push(t("remarksTooLong"));
  if (!Array.isArray(issueForm.subjects) || issueForm.subjects.length === 0) {
    errors.push(t("atLeastOneSubjectRowRequired"));
    return errors;
  }

  issueForm.subjects.forEach((subject, index) => {
    const label = `${t("subjectRow")} ${index + 1}`;
    const scored = Number(subject.marks_scored);
    const outOf = Number(subject.out_of);

    if (!String(subject.subject_name || "").trim()) {
      errors.push(`${label}: ${t("subjectNameRequired")}`);
    }
    if (subject.marks_scored === "" || !Number.isFinite(scored) || scored < 0) {
      errors.push(`${label}: ${t("marksScoredInvalid")}`);
    }
    if (subject.out_of === "" || !Number.isFinite(outOf) || outOf <= 0) {
      errors.push(`${label}: ${t("outOfInvalid")}`);
    }
    if (Number.isFinite(scored) && Number.isFinite(outOf) && scored > outOf) {
      errors.push(`${label}: ${t("marksCannotExceed")}`);
    }
  });

  return errors;
}

function statusBadge(status) {
  if (status === "Revoked") return "bg-red-100 text-red-700";
  return "bg-emerald-100 text-emerald-700";
}

export default function IssuerDashboard() {
  const navigate = useNavigate();
  const { user, token, logout } = useAuth();
  const { t } = useLanguage();

  const [stats, setStats] = useState({ totalIssued: 0, totalRevoked: 0, totalComplaints: 0 });
  const [students, setStudents] = useState([]);
  const [studentDetailsLoading, setStudentDetailsLoading] = useState(false);
  const [studentDetailsError, setStudentDetailsError] = useState("");
  const [certificates, setCertificates] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [logs, setLogs] = useState([]);
  const [issueForm, setIssueForm] = useState(() => createDefaultIssueForm());
  const [responseMap, setResponseMap] = useState({});
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [selectedCertificate, setSelectedCertificate] = useState(null);
  const [editForm, setEditForm] = useState(EDIT_FORM_DEFAULTS);
  const [editErrors, setEditErrors] = useState(EDIT_FORM_ERROR_DEFAULTS);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [lastIssuedCertificate, setLastIssuedCertificate] = useState(null);
  const [toast, setToast] = useState(null);
  const closeModalTimerRef = useRef(null);
  const toastTimerRef = useRef(null);

  const selectedStudent = useMemo(
    () => students.find((student) => String(student.id) === String(issueForm.studentId)) || null,
    [students, issueForm.studentId]
  );
  const calculatedSubjects = useMemo(
    () =>
      issueForm.subjects.map((subject) => {
        const scored = toNumber(subject.marks_scored);
        const outOf = toNumber(subject.out_of);
        return {
          ...subject,
          subject_percentage: toPercentage(scored, outOf),
        };
      }),
    [issueForm.subjects]
  );
  const overallPercentage = useMemo(() => calculateOverallPercentage(calculatedSubjects), [calculatedSubjects]);
  const calculatedEditSubjects = useMemo(
    () =>
      editForm.subjects.map((subject) => {
        const scored = toNumber(subject.marks_scored);
        const outOf = toNumber(subject.out_of);
        return {
          ...subject,
          subject_percentage: toPercentage(scored, outOf),
        };
      }),
    [editForm.subjects]
  );
  const editOverallPercentage = useMemo(
    () => (calculatedEditSubjects.length > 0 ? calculateOverallPercentage(calculatedEditSubjects) : 0),
    [calculatedEditSubjects]
  );

  const fetchAll = async () => {
    setLoading(true);
    setError("");
    try {
      const [statsRes, studentsRes, certsRes, complaintsRes, logsRes] = await Promise.all([
        apiRequest("/issuer/dashboard/stats"),
        apiRequest("/issuer/students"),
        apiRequest("/issuer/certificates"),
        apiRequest("/issuer/complaints"),
        apiRequest("/issuer/audit-logs"),
      ]);
      setStats(statsRes.stats || { totalIssued: 0, totalRevoked: 0, totalComplaints: 0 });
      setStudents(studentsRes.students || []);
      setCertificates(certsRes.certificates || []);
      setComplaints(complaintsRes.complaints || []);
      setLogs(logsRes.logs || []);
    } catch (err) {
      setError(err.message || t("loadFailedIssuerDashboard"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadStudentDetails() {
      const selectedId = String(issueForm.studentId || "").trim();
      if (!selectedId) {
        if (isMounted) {
          setStudentDetailsError("");
          setStudentDetailsLoading(false);
          setIssueForm((prev) => ({
            ...prev,
            studentName: "",
            studentEmail: "",
            rollNo: "",
            studentClassName: "",
            studentClassDiv: "",
          }));
        }
        return;
      }

      try {
        if (isMounted) {
          setStudentDetailsLoading(true);
          setStudentDetailsError("");
        }

        const response = await apiRequest(`/issuer/students/${selectedId}`);
        const student = response?.student;
        if (!student) {
          throw new Error("Student details not found");
        }

        if (isMounted) {
          setIssueForm((prev) => ({
            ...prev,
            studentName: student.name || "",
            studentEmail: student.email || "",
            rollNo: student.roll_no || "",
            studentClassName: student.class_name || "",
            studentClassDiv: student.class_div || "",
          }));
        }
      } catch (err) {
        if (isMounted) {
          setStudentDetailsError(err.message || "Failed to load student details");
        }
      } finally {
        if (isMounted) {
          setStudentDetailsLoading(false);
        }
      }
    }

    loadStudentDetails();
    return () => {
      isMounted = false;
    };
  }, [issueForm.studentId]);

  useEffect(() => {
    if (!isEditModalOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        closeEditModal();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isEditModalOpen, isSavingEdit]);

  useEffect(() => {
    return () => {
      if (closeModalTimerRef.current) {
        window.clearTimeout(closeModalTimerRef.current);
      }
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const updateIssue = (key, value) => setIssueForm((prev) => ({ ...prev, [key]: value }));
  const showToast = (type, message) => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }

    setToast({ type, message, visible: true });
    toastTimerRef.current = window.setTimeout(() => {
      setToast((prev) => (prev ? { ...prev, visible: false } : prev));
      toastTimerRef.current = window.setTimeout(() => {
        setToast(null);
      }, 180);
    }, 2600);
  };

  const addSubjectRow = () => {
    setIssueForm((prev) => ({ ...prev, subjects: [...prev.subjects, createSubjectRow()] }));
  };
  const removeSubjectRow = (subjectId) => {
    setIssueForm((prev) => {
      if (prev.subjects.length === 1) {
        return prev;
      }

      return {
        ...prev,
        subjects: prev.subjects.filter((subject) => subject.id !== subjectId),
      };
    });
  };
  const updateSubjectRow = (subjectId, key, value) => {
    setIssueForm((prev) => ({
      ...prev,
      subjects: prev.subjects.map((subject) =>
        subject.id === subjectId ? { ...subject, [key]: value } : subject
      ),
    }));
  };

  const issueCertificate = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    setLastIssuedCertificate(null);
    try {
      const validationErrors = validateIssueForm(issueForm, t);
      if (validationErrors.length > 0) {
        setError(validationErrors[0]);
        return;
      }

      setIssuing(true);
      const payload = {
        studentId: issueForm.studentId,
        student_name: issueForm.studentName.trim(),
        student_email: issueForm.studentEmail.trim(),
        course: issueForm.course.trim(),
        grade: issueForm.grade.trim(),
        issueDate: issueForm.issueDate,
        roll_no: issueForm.rollNo.trim(),
        student_class_name: issueForm.studentClassName.trim(),
        student_class_div: issueForm.studentClassDiv.trim(),
        year: issueForm.year.trim(),
        semester: issueForm.semester,
        class: issueForm.class,
        class_name: issueForm.class,
        studentType: issueForm.studentType,
        certificate_type: issueForm.certificateType.trim(),
        remarks: issueForm.remarks.trim(),
        overall_percentage: overallPercentage,
        subjects: calculatedSubjects.map((subject) => ({
          subject_name: subject.subject_name.trim(),
          marks_scored: Number(subject.marks_scored),
          out_of: Number(subject.out_of),
          subject_percentage: subject.subject_percentage,
        })),
      };

      const response = await apiRequest("/issuer/certificates", { method: "POST", body: payload });
      setLastIssuedCertificate(response?.certificate || null);
      setSuccess(response?.message || t("certificateIssuedSuccessfully"));
      setIssueForm(createDefaultIssueForm());
      await fetchAll();
      scrollDashboardToSection("certificates-section");
    } catch (err) {
      console.error("[IssuerDashboard] issueCertificate failed", {
        error: err?.message || err,
        payload: {
          ...issueForm,
          student_name: issueForm.studentName.trim(),
          remarks: issueForm.remarks.trim(),
          overall_percentage: overallPercentage,
          subjects: calculatedSubjects,
        },
      });
      setError(err.message || t("failedToIssueCertificate"));
    } finally {
      setIssuing(false);
    }
  };

  const closeEditModal = (force = false) => {
    if (isSavingEdit && !force) {
      return;
    }

    setIsEditModalVisible(false);
    if (closeModalTimerRef.current) {
      window.clearTimeout(closeModalTimerRef.current);
    }
    closeModalTimerRef.current = window.setTimeout(() => {
      setIsEditModalOpen(false);
      setSelectedCertificate(null);
      setEditForm(EDIT_FORM_DEFAULTS);
      setEditErrors(EDIT_FORM_ERROR_DEFAULTS);
    }, 180);
  };

  const openEditModal = (certificate) => {
    setError("");
    setSuccess("");
    if (closeModalTimerRef.current) {
      window.clearTimeout(closeModalTimerRef.current);
    }
    setSelectedCertificate(certificate);
    setEditForm({
      grade: certificate.grade || "",
      subjects: Array.isArray(certificate.subjects)
        ? certificate.subjects.map((subject) => createEditSubjectRow(subject))
        : [],
    });
    setEditErrors(EDIT_FORM_ERROR_DEFAULTS);
    setIsEditModalOpen(true);
    window.requestAnimationFrame(() => {
      setIsEditModalVisible(true);
    });
  };

  const updateEditForm = (key, value) => {
    setEditForm((prev) => ({ ...prev, [key]: value }));
    if (key === "grade") {
      setEditErrors((prev) => (prev[key] ? { ...prev, [key]: "" } : prev));
    }
  };

  const addEditSubjectRow = () => {
    setEditForm((prev) => ({
      ...prev,
      subjects: [...prev.subjects, createNewEditSubjectRow()],
    }));
    setEditErrors((prev) => (prev.subjects ? { ...prev, subjects: "" } : prev));
  };

  const updateEditSubject = (subjectId, key, value) => {
    setEditForm((prev) => ({
      ...prev,
      subjects: prev.subjects.map((subject) =>
        subject.id === subjectId ? { ...subject, [key]: value } : subject
      ),
    }));
    setEditErrors((prev) => (prev.subjects ? { ...prev, subjects: "" } : prev));
  };

  const removeEditSubject = (subjectId) => {
    setEditForm((prev) => {
      if (prev.subjects.length === 1) {
        return prev;
      }

      return {
        ...prev,
        subjects: prev.subjects.filter((subject) => subject.id !== subjectId),
      };
    });
    setEditErrors((prev) => (prev.subjects ? { ...prev, subjects: "" } : prev));
  };

  const saveCertificateEdits = async () => {
    if (!selectedCertificate) {
      return;
    }

    const trimmedGrade = editForm.grade.trim();
    const nextSubjects = calculatedEditSubjects;
    const nextErrors = {
      grade: trimmedGrade ? "" : "Grade is required",
      subjects: "",
    };

    if (nextSubjects.length === 0) {
      nextErrors.subjects = "At least one subject row is required";
    } else {
      const invalidSubject = nextSubjects.find((subject) => {
        const scored = Number(subject.marks_scored);
        const outOf = Number(subject.out_of);
        return (
          !String(subject.subject_name || "").trim() ||
          !Number.isFinite(scored) ||
          scored < 0 ||
          !Number.isFinite(outOf) ||
          outOf <= 0 ||
          scored > outOf
        );
      });

      if (invalidSubject) {
        nextErrors.subjects = `Enter a subject name and valid marks for ${invalidSubject.subject_name || "the new row"}.`;
      }
    }

    if (nextErrors.grade || nextErrors.subjects) {
      setEditErrors(nextErrors);
      return;
    }

    if (!window.confirm(`Save updated marks for certificate ${selectedCertificate.certificate_no}?`)) {
      return;
    }

    try {
      setIsSavingEdit(true);
      const response = await apiRequest(`/certificates/${encodeURIComponent(selectedCertificate.id)}`, {
        method: "PUT",
        body: {
          grade: trimmedGrade,
          subjects: nextSubjects.map((subject) => ({
            id: String(subject.id).startsWith("new-") ? undefined : subject.id,
            subject_name: subject.subject_name.trim(),
            marks_scored: Number(subject.marks_scored),
            out_of: Number(subject.out_of),
          })),
        },
      });

      setCertificates((prev) =>
        prev.map((certificate) =>
          certificate.id === selectedCertificate.id
            ? {
                ...certificate,
                grade: response?.certificate?.grade || trimmedGrade,
                overall_percentage: response?.certificate?.overall_percentage ?? certificate.overall_percentage,
                certificate_hash: response?.certificate?.certificate_hash || certificate.certificate_hash,
                blockchain_tx_hash: response?.certificate?.blockchain_tx_hash ?? certificate.blockchain_tx_hash,
                ipfs_hash: response?.certificate?.ipfs_hash ?? certificate.ipfs_hash,
                subjects: response?.certificate?.subjects || certificate.subjects,
              }
            : certificate
        )
      );

      setSuccess(response?.message || `Certificate ${selectedCertificate.certificate_no} marks updated.`);
      closeEditModal(true);
      showToast("success", response?.message || "Certificate marks updated successfully");
    } catch (err) {
      const message = err.message || "Failed to update certificate marks";
      setError(message);
      showToast("error", message);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const revokeCertificate = async (certNo) => {
    setError("");
    setSuccess("");
    try {
      const endpoint = `/issuer/certificates/${encodeURIComponent(certNo)}/revoke`;
      if (import.meta.env.DEV) {
        console.log("[IssuerDashboard] revoke request", {
          certNo,
          endpoint: `/api${endpoint}`,
          method: "PATCH",
          hasAuthorization: Boolean(token),
        });
      }

      const response = await apiRequest(endpoint, { method: "PATCH" });
      setCertificates((prev) =>
        prev.map((certificate) =>
          certificate.certificate_no === certNo
            ? { ...certificate, status: "Revoked", is_revoked: 1 }
            : certificate
        )
      );
      setSuccess(response?.warning ? `Certificate ${certNo} revoked. ${response.warning}` : `Certificate ${certNo} revoked.`);
      await fetchAll();
    } catch (err) {
      setError(err.message || t("failedToRevokeCertificate"));
    }
  };

  const deleteCertificate = async (certNo) => {
    setError("");
    setSuccess("");
    try {
      const endpoint = `/issuer/certificates/${encodeURIComponent(certNo)}`;
      if (import.meta.env.DEV) {
        console.log("[IssuerDashboard] delete request", {
          certNo,
          endpoint: `/api${endpoint}`,
          method: "DELETE",
          hasAuthorization: Boolean(token),
        });
      }

      await apiRequest(endpoint, { method: "DELETE" });
      setCertificates((prev) => prev.filter((certificate) => certificate.certificate_no !== certNo));
      setSuccess(`Certificate ${certNo} deleted.`);
      await fetchAll();
    } catch (err) {
      setError(err.message || t("failedToDeleteCertificate"));
    }
  };

  const downloadPdf = async (certNo) => {
    try {
      const blob = await apiRequest(`/issuer/certificates/${encodeURIComponent(certNo)}/pdf`, { isBlob: true });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${certNo}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || t("failedToDownloadPdf"));
    }
  };

  const respondComplaint = async (complaintId) => {
    setError("");
    setSuccess("");
    const response = (responseMap[complaintId] || "").trim();
    if (!response) {
      setError(t("responseRequired"));
      return;
    }

    try {
      await apiRequest(`/issuer/complaints/${complaintId}/respond`, {
        method: "PATCH",
        body: { response },
      });
      setSuccess(t("complaintResponseSubmitted"));
      setResponseMap((prev) => ({ ...prev, [complaintId]: "" }));
      await fetchAll();
    } catch (err) {
      setError(err.message || t("failedToRespondComplaint"));
    }
  };

  const sidebarItems = [
    { label: "Dashboard", icon: FaHome, onClick: () => scrollDashboardToSection("dashboard-section"), translationKey: "dashboard" },
    { label: "Issue Certificate", icon: FaPlusCircle, onClick: () => scrollDashboardToSection("issue-section"), translationKey: "issueCertificate" },
    { label: "Certificates List", icon: FaListUl, onClick: () => scrollDashboardToSection("certificates-section"), translationKey: "certificatesList" },
    { label: "Complaints", icon: FaClipboardList, onClick: () => scrollDashboardToSection("complaints-section"), translationKey: "complaints" },
    { label: "Audit Logs", icon: FaFileAlt, onClick: () => scrollDashboardToSection("audit-section"), translationKey: "auditLogs" },
    { label: "Logout", icon: FaSignOutAlt, onClick: handleLogout, translationKey: "logout" },
  ];

  return (
    <Layout role={user?.role} userName={user?.username} sidebarItems={sidebarItems}>
      {toast ? (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-[120] flex justify-center px-4 sm:justify-end">
          <div
            className={[
              "w-full max-w-sm rounded-2xl border px-4 py-3 text-sm font-semibold shadow-[0_18px_40px_rgba(15,23,42,0.16)] transition-all duration-200",
              toast.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-800",
              toast.visible ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0",
            ].join(" ")}
            role="status"
            aria-live="polite"
          >
            {toast.message}
          </div>
        </div>
      ) : null}

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {success ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div> : null}
      {lastIssuedCertificate ? (
        <div className="rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-4 text-sm text-cyan-900">
          <p className="font-semibold">{t("issuedCertificateDetails")}</p>
          <p className="mt-2">{t("certificateNo")}: {lastIssuedCertificate.certificateNo}</p>
          <p>{t("studentName")}: {lastIssuedCertificate.studentName}</p>
          <p>{t("course")}: {lastIssuedCertificate.course}</p>
          <p>{t("certificateHash")}: {lastIssuedCertificate.certificateHash}</p>
          <p>{t("blockchainTx")}: {lastIssuedCertificate.blockchainTxHash}</p>
        </div>
      ) : null}

      <section id="dashboard-section" data-dashboard-section className="dashboard-section-grid lg:grid-cols-3">
        <Card className="dashboard-stat-card"><p className="text-sm text-slate-500">{t("certificatesIssued")}</p><p className="mt-2 text-3xl font-extrabold">{stats.totalIssued}</p></Card>
        <Card className="dashboard-stat-card"><p className="text-sm text-slate-500">{t("certificatesRevoked")}</p><p className="mt-2 text-3xl font-extrabold">{stats.totalRevoked}</p></Card>
        <Card className="dashboard-stat-card"><p className="text-sm text-slate-500">{t("studentComplaints")}</p><p className="mt-2 text-3xl font-extrabold">{stats.totalComplaints}</p></Card>
      </section>

      <Card id="issue-section" data-dashboard-section>
        <div className="mx-auto max-w-5xl">
          <div className="mb-6 max-w-3xl">
            <h2 className="text-xl font-bold text-slate-900">{t("issueNewCertificate")}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Prepare the certificate details, add subject-wise marks, and review the calculated summary before issuing the final document.
            </p>
          </div>

          <form className="space-y-6" onSubmit={issueCertificate}>
            <div className="dashboard-form-grid">
            <Input label={t("student")} as="select" value={issueForm.studentId} onChange={(event) => updateIssue("studentId", event.target.value)} required>
              <option value="">{t("selectStudent")}</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name} {student.roll_no ? `| ${student.roll_no}` : ""} {student.email ? `| ${student.email}` : ""}
                </option>
              ))}
            </Input>

            <Input
              label={t("fullName")}
              value={issueForm.studentName}
              onChange={(event) => updateIssue("studentName", event.target.value)}
              placeholder={t("selectStudentToAutofill")}
              required
            />
            <Input
              label={t("studentEmail")}
              type="email"
              value={issueForm.studentEmail}
              onChange={(event) => updateIssue("studentEmail", event.target.value)}
              placeholder="student@example.com"
            />
            <Input
              label={t("rollNo")}
              value={issueForm.rollNo}
              onChange={(event) => updateIssue("rollNo", event.target.value)}
              required
            />
            <Input
              label={t("className")}
              value={issueForm.studentClassName}
              onChange={(event) => updateIssue("studentClassName", event.target.value)}
              placeholder={t("enterClassName")}
            />
            <Input
              label={t("classDivision")}
              value={issueForm.studentClassDiv}
              onChange={(event) => updateIssue("studentClassDiv", event.target.value.toUpperCase())}
              placeholder={t("enterClassDivision")}
            />
            <Input label={t("course")} value={issueForm.course} onChange={(event) => updateIssue("course", event.target.value)} required />
            <Input label="Grade" value={issueForm.grade} onChange={(event) => updateIssue("grade", event.target.value)} required />
            <Input label={t("issueDate")} type="date" value={issueForm.issueDate} onChange={(event) => updateIssue("issueDate", event.target.value)} required />
            <Input label={t("year")} value={issueForm.year} onChange={(event) => updateIssue("year", event.target.value)} placeholder="2025-2026" required />
            <Input
              label={t("certificateType")}
              value={issueForm.certificateType}
              onChange={(event) => updateIssue("certificateType", event.target.value)}
              placeholder="Final Marksheet"
              required
            />

            <Input label={t("class")} as="select" value={issueForm.class} onChange={(event) => updateIssue("class", event.target.value)} required>
              <option value="FE">FE</option>
              <option value="SE">SE</option>
              <option value="TE">TE</option>
              <option value="BE">BE</option>
            </Input>

            <Input label={t("studentType")} as="select" value={issueForm.studentType} onChange={(event) => updateIssue("studentType", event.target.value)} required>
              <option value="Regular">{t("regular")}</option>
              <option value="Dropper">{t("dropper")}</option>
            </Input>

            <Input label={t("semester")} as="select" value={issueForm.semester} onChange={(event) => updateIssue("semester", event.target.value)} required>
              {["I", "II", "III", "IV", "V", "VI", "VII", "VIII"].map((semester) => (
                <option key={semester} value={semester}>{semester}</option>
              ))}
            </Input>
            <div className="xl:col-span-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                {studentDetailsLoading ? t("loadingStudentDetails") : issueForm.studentId ? t("studentDataAutoFilled") : t("selectStudentToAutofill")}
              </div>
              {studentDetailsError ? (
                <div className="mt-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {studentDetailsError}
                </div>
              ) : null}
            </div>
            <div className="xl:col-span-3">
              <Input
                label={t("remarks")}
                as="textarea"
                rows={4}
                value={issueForm.remarks}
                onChange={(event) => updateIssue("remarks", event.target.value)}
                placeholder={t("enterRemarksForStudent")}
                maxLength={500}
              />
              <p className="mt-2 text-right text-xs text-slate-500">{issueForm.remarks.trim().length}/500 {t("characters")}</p>
            </div>
          </div>

            <div className="dashboard-subtle-panel p-5 sm:p-6">
              <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-2xl">
                  <h3 className="text-base font-bold text-slate-900">{t("subjectWiseMarks")}</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-500">Add each subject, the marks obtained, the maximum marks, and verify the automatically calculated percentages.</p>
                </div>
                <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={addSubjectRow}>
                  <FaPlusCircle /> {t("addSubject")}
                </Button>
              </div>

              <div className="space-y-4">
                {calculatedSubjects.map((subject, index) => (
                  <div key={subject.id} className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{t("subject")} {index + 1}</p>
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{t("subjectWiseMarks")}</p>
                      </div>
                      <Button
                        type="button"
                        variant="danger"
                        className="w-full px-3 py-2 text-xs sm:w-auto"
                        disabled={issueForm.subjects.length === 1}
                        onClick={() => removeSubjectRow(subject.id)}
                      >
                        <FaTrashAlt /> {t("remove")}
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1.5fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(160px,0.9fr)]">
                      <Input
                        label={t("subjectName")}
                        value={subject.subject_name}
                        onChange={(event) => updateSubjectRow(subject.id, "subject_name", event.target.value)}
                        placeholder="Data Structures"
                        required
                      />
                      <Input
                        label={t("marksObtained")}
                        type="number"
                        min="0"
                        step="0.01"
                        value={subject.marks_scored}
                        onChange={(event) => updateSubjectRow(subject.id, "marks_scored", event.target.value)}
                        required
                      />
                      <Input
                        label={t("outOf")}
                        type="number"
                        min="1"
                        step="0.01"
                        value={subject.out_of}
                        onChange={(event) => updateSubjectRow(subject.id, "out_of", event.target.value)}
                        required
                      />
                      <div className="space-y-1.5">
                        <p className="text-sm font-medium text-slate-700">{t("subjectPercentage")}</p>
                        <div className="flex min-h-[46px] items-center rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-700">
                          {subject.subject_percentage.toFixed(2)}%
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500">{t("student")}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{issueForm.studentName || selectedStudent?.name || t("selectAStudent")}</p>
                  <p className="mt-1 text-xs text-slate-500">{issueForm.studentEmail || "-"}</p>
                </div>
                <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500">{t("className")}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {(issueForm.studentClassName || "-") + (issueForm.studentClassDiv ? ` / ${issueForm.studentClassDiv}` : "")}
                  </p>
                </div>
                <div className="rounded-[20px] border border-cyan-200 bg-cyan-50 px-4 py-4">
                  <p className="text-xs uppercase tracking-wide text-cyan-700">{t("overallPercentage")}</p>
                  <p className="mt-1 text-lg font-extrabold text-cyan-900">{overallPercentage.toFixed(2)}%</p>
                </div>
              </div>
            </div>

            <div className="flex justify-center pt-2">
              <Button type="submit" className="min-w-[220px] px-8" disabled={issuing}>
                {issuing ? t("issuingCertificate") : t("issueCertificate")}
              </Button>
            </div>
          </form>
        </div>
      </Card>

      <Card id="certificates-section" data-dashboard-section className="mt-2">
        <h2 className="mb-4 text-lg font-bold text-slate-900">{t("certificatesList")}</h2>
        {loading ? (
          <p className="text-sm text-slate-500">{t("loadingCertificates")}</p>
        ) : (
          <div className="dashboard-table-wrap dashboard-table-scroll rounded-[20px]">
            <table className="dashboard-table min-w-[1220px]">
              <colgroup>
                <col className="w-[140px]" />
                <col className="w-[180px]" />
                <col className="w-[210px]" />
                <col className="w-[290px]" />
                <col className="w-[130px]" />
                <col className="w-[130px]" />
                <col className="w-[220px]" />
                <col className="w-[120px]" />
                <col className="w-[250px]" />
              </colgroup>
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="dashboard-table-head">{t("certificateId")}</th>
                  <th className="dashboard-table-head">{t("studentName")}</th>
                  <th className="dashboard-table-head">{t("studentEmail")}</th>
                  <th className="dashboard-table-head">{t("course")}</th>
                  <th className="dashboard-table-head">{t("overallPercentage")}</th>
                  <th className="dashboard-table-head">{t("issueDate")}</th>
                  <th className="dashboard-table-head">IPFS Hash</th>
                  <th className="dashboard-table-head">{t("status")}</th>
                  <th className="dashboard-table-head dashboard-sticky-action-head w-[260px] min-w-[260px] pr-5">{t("actions")}</th>
                </tr>
              </thead>
              <tbody>
                {certificates.map((certificate) => (
                  <Fragment key={certificate.id}>
                    <tr key={certificate.id} className="dashboard-table-row border-t border-slate-200 align-top">
                      <td className="dashboard-table-cell font-medium text-slate-800">{certificate.certificate_no}</td>
                      <td className="dashboard-table-cell">
                        <p className="font-medium text-slate-900">{certificate.student_name}</p>
                        <p className="mt-1 text-xs text-slate-500">Roll: {certificate.roll_no || "-"}</p>
                      </td>
                      <td className="dashboard-table-cell">
                        <p className="break-words text-slate-700">{certificate.student_email}</p>
                      </td>
                      <td className="dashboard-table-cell">
                        <div className="space-y-2">
                          <p className="font-medium text-slate-900">{certificate.course || "-"}</p>
                          <p className="text-sm text-slate-700">Grade: {certificate.grade || "-"}</p>
                          <p className="text-xs leading-5 text-slate-500">
                            Remarks: {certificate.remarks?.trim() || "-"}
                          </p>
                        </div>
                      </td>
                      <td className="dashboard-table-cell font-semibold text-cyan-700">
                        {certificate.overall_percentage !== null ? `${Number(certificate.overall_percentage).toFixed(2)}%` : "-"}
                      </td>
                      <td className="dashboard-table-cell whitespace-nowrap">{new Date(certificate.issue_date).toLocaleDateString()}</td>
                      <td className="dashboard-table-cell text-xs text-slate-600">
                        <p className="line-clamp-3 break-all">{certificate.ipfs_hash}</p>
                      </td>
                      <td className="dashboard-table-cell">
                        <span className={`rounded-lg px-2 py-1 text-xs font-semibold ${statusBadge(certificate.status)}`}>{certificate.status}</span>
                      </td>
                      <td className="dashboard-table-cell dashboard-sticky-action-cell w-[260px] min-w-[260px] overflow-visible pr-5">
                        <div className="flex flex-col items-start gap-2">
                          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-start">
                            <Button
                              variant="secondary"
                              className="w-full min-w-[120px] rounded-lg px-4 py-2 text-sm sm:flex-1"
                              onClick={() => openEditModal(certificate)}
                            >
                              Edit Marks
                            </Button>
                            <Button
                              variant="secondary"
                              className="w-full min-w-[120px] rounded-lg px-4 py-2 text-sm sm:flex-1"
                              onClick={() => downloadPdf(certificate.certificate_no)}
                            >
                              PDF
                            </Button>
                          </div>
                          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-start">
                            <Button
                              variant="danger"
                              className="w-full min-w-[120px] rounded-lg px-4 py-2 text-sm sm:flex-1"
                              disabled={certificate.status === "Revoked"}
                              onClick={() => revokeCertificate(certificate.certificate_no)}
                            >
                              {t("revokeCertificate")}
                            </Button>
                            <Button
                              variant="danger"
                              className="w-full min-w-[120px] rounded-lg px-4 py-2 text-sm sm:flex-1"
                              onClick={() => deleteCertificate(certificate.certificate_no)}
                            >
                              <FaTrashAlt /> {t("deleteCertificate")}
                            </Button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card id="complaints-section" data-dashboard-section>
        <h2 className="mb-4 text-lg font-bold text-slate-900">{t("complaints")}</h2>
        <div className="space-y-3">
          {complaints.map((complaint) => (
            <div key={complaint.id} className="rounded-xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-900">{complaint.certificate_no} | {complaint.student_name}</p>
              <p className="mt-1 text-sm text-slate-700">{complaint.message}</p>
              <p className="mt-1 text-xs text-slate-500">{t("status")}: {complaint.status}</p>
              {complaint.response ? <p className="mt-1 text-xs text-emerald-700">{t("response")}: {complaint.response}</p> : null}
              {complaint.status !== "resolved" ? (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder={t("writeResponse")}
                    value={responseMap[complaint.id] || ""}
                    onChange={(event) => setResponseMap((prev) => ({ ...prev, [complaint.id]: event.target.value }))}
                  />
                  <Button onClick={() => respondComplaint(complaint.id)}>{t("respond")}</Button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </Card>

      <Card id="audit-section" data-dashboard-section>
        <h2 className="mb-4 text-lg font-bold text-slate-900">{t("auditLogs")}</h2>
        <div className="space-y-2">
          {logs.map((log) => (
            <div key={log.id} className="rounded-xl border border-slate-200 p-3 text-sm">
              <p className="font-semibold text-slate-900">{log.action}</p>
              <p className="text-xs text-slate-500">{new Date(log.created_at).toLocaleString()}</p>
              {log.new_data ? <p className="mt-1 break-all text-xs text-slate-600">new: {log.new_data}</p> : null}
            </div>
          ))}
        </div>
      </Card>

      {isEditModalOpen ? (
        <div
          className={[
            "fixed inset-0 z-[100] flex items-center justify-center px-4 py-6 backdrop-blur-[2px] transition-all duration-200",
            isEditModalVisible ? "bg-slate-950/45 opacity-100" : "bg-slate-950/0 opacity-0",
          ].join(" ")}
          onClick={closeEditModal}
          role="presentation"
        >
          <div
            className={[
              "w-full max-w-3xl rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_28px_70px_rgba(15,23,42,0.22)] transition-all duration-200 sm:p-6",
              isEditModalVisible ? "scale-100 opacity-100" : "scale-95 opacity-0",
            ].join(" ")}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-certificate-title"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="edit-certificate-title" className="text-xl font-bold text-slate-900">
                  Edit Marks
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedCertificate?.certificate_no ? `Certificate ${selectedCertificate.certificate_no}` : ""}
                </p>
              </div>
              <button
                type="button"
                className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
                onClick={closeEditModal}
                aria-label="Close edit certificate modal"
              >
                x
              </button>
            </div>

            <div className="mt-6 space-y-4">
              {selectedCertificate ? (
                <div className="grid grid-cols-1 gap-3 rounded-[22px] border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Student</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{selectedCertificate.student_name}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Course</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{selectedCertificate.course || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Current Overall</p>
                    <p className="mt-1 text-sm font-semibold text-cyan-800">
                      {selectedCertificate.overall_percentage !== null ? `${Number(selectedCertificate.overall_percentage).toFixed(2)}%` : "-"}
                    </p>
                  </div>
                </div>
              ) : null}

              <Input
                label="Grade"
                value={editForm.grade}
                error={editErrors.grade}
                onChange={(event) => updateEditForm("grade", event.target.value)}
                required
              />

              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Subject-wise Marks</p>
                    <p className="mt-1 text-xs text-slate-500">Update marks obtained. Percentages are recalculated automatically.</p>
                  </div>
                  <Button variant="secondary" className="px-4 py-2 text-sm" onClick={addEditSubjectRow}>
                    <FaPlusCircle /> Add Subject
                  </Button>
                  <div className="rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-right">
                    <p className="text-xs uppercase tracking-[0.18em] text-cyan-700">Updated Overall</p>
                    <p className="mt-1 text-lg font-extrabold text-cyan-900">
                      {calculatedEditSubjects.length > 0 ? `${editOverallPercentage.toFixed(2)}%` : "-"}
                    </p>
                  </div>
                </div>

                {editErrors.subjects ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {editErrors.subjects}
                  </div>
                ) : null}

                <div className="space-y-3">
                  {calculatedEditSubjects.map((subject, index) => (
                    <div key={subject.id} className="grid grid-cols-1 gap-3 rounded-[22px] border border-slate-200 bg-white p-4 md:grid-cols-[minmax(0,1.2fr)_120px_120px_140px_110px]">
                      <Input
                        label="Subject Name"
                        value={subject.subject_name}
                        onChange={(event) => updateEditSubject(subject.id, "subject_name", event.target.value)}
                        placeholder={`Subject ${index + 1}`}
                        required
                      />
                      <Input
                        label="Marks"
                        type="number"
                        min="0"
                        step="0.01"
                        value={subject.marks_scored}
                        onChange={(event) => updateEditSubject(subject.id, "marks_scored", event.target.value)}
                        required
                      />
                      <Input
                        label="Out Of"
                        type="number"
                        min="1"
                        step="0.01"
                        value={subject.out_of}
                        onChange={(event) => updateEditSubject(subject.id, "out_of", event.target.value)}
                        required
                      />
                      <div className="space-y-1.5">
                        <p className="text-sm font-semibold text-slate-800">Percentage</p>
                        <div className="flex min-h-[46px] items-center rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-700">
                          {Number(subject.subject_percentage).toFixed(2)}%
                        </div>
                      </div>
                      <Button
                        variant="danger"
                        className="mt-auto px-3 py-2 text-sm"
                        disabled={editForm.subjects.length === 1}
                        onClick={() => removeEditSubject(subject.id)}
                      >
                        <FaTrashAlt /> Remove
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button variant="secondary" className="w-full sm:w-auto" onClick={closeEditModal} disabled={isSavingEdit}>
                Cancel
              </Button>
              <Button className="w-full sm:w-auto" onClick={saveCertificateEdits} disabled={isSavingEdit}>
                {isSavingEdit ? "Saving..." : "Save Marks"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </Layout>
  );
}
