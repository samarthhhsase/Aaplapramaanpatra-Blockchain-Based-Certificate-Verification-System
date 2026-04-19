import { useEffect, useState } from "react";
import { scrollDashboardToSection } from "../components/layout/DashboardShell";
import AdminShell from "../components/admin/AdminShell";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Input from "../components/ui/Input";
import { apiRequest } from "../utils/api";

const emptyForm = {
  student_name: "",
  email: "",
  password: "",
  roll_number: "",
  course: "",
  class_name: "",
  class_div: "",
  semester: "",
};

export default function ManageStudents() {
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadStudents = async (query = search) => {
    setLoading(true);
    try {
      const response = await apiRequest("/admin/students", { params: query ? { search: query } : undefined });
      setStudents(response.students || []);
    } catch (err) {
      setError(err.message || "Failed to load students");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStudents("");
  }, []);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const payload = { ...form };
      if (editingId && !payload.password) delete payload.password;

      if (editingId) {
        await apiRequest(`/admin/students/${editingId}`, { method: "PUT", body: payload });
        setSuccess("Student updated successfully.");
      } else {
        await apiRequest("/admin/students", { method: "POST", body: payload });
        setSuccess("Student created successfully.");
      }

      resetForm();
      await loadStudents();
    } catch (err) {
      setError(err.message || "Failed to save student");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (student) => {
    setEditingId(student.id);
    setForm({
      student_name: student.student_name,
      email: student.email,
      password: "",
      roll_number: student.roll_number || "",
      course: student.course || "",
      class_name: student.class_name || "",
      class_div: student.class_div || "",
      semester: student.semester || "",
    });
    scrollDashboardToSection("student-form-section");
  };

  const handleDelete = async (student) => {
    if (!window.confirm(`Delete student "${student.student_name}"?`)) return;

    try {
      await apiRequest(`/admin/students/${student.id}`, { method: "DELETE" });
      setSuccess("Student deleted successfully.");
      if (selectedStudent?.id === student.id) setSelectedStudent(null);
      await loadStudents();
    } catch (err) {
      setError(err.message || "Failed to delete student");
    }
  };

  const handleView = async (studentId) => {
    try {
      const response = await apiRequest(`/admin/students/${studentId}`);
      setSelectedStudent(response.student);
      scrollDashboardToSection("student-profile-section");
    } catch (err) {
      setError(err.message || "Failed to fetch student profile");
    }
  };

  return (
    <AdminShell title="Manage Students" description="Create and maintain student records for your school, search by roll number or certificate ID, and inspect every certificate linked to a student profile.">
      {error ? <div className="rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div> : null}
      {success ? <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">{success}</div> : null}

      <section className="dashboard-section-grid xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <Card className="rounded-[28px]">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-serif text-2xl font-bold text-slate-950">Student Directory</h2>
              <p className="mt-1 text-sm text-slate-600">Search by name, roll number, course, or certificate number inside your school.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-emerald-500 md:w-72" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search students" />
              <Button onClick={() => loadStudents(search)}>Search</Button>
            </div>
          </div>

          <div className="dashboard-table-wrap">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-[0.18em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Roll Number</th>
                  <th className="px-4 py-3">Class</th>
                  <th className="px-4 py-3">Certificates</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Loading students...</td></tr> : null}
                {!loading && students.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No students found.</td></tr> : null}
                {!loading ? students.map((student) => (
                  <tr key={student.id} className="border-t border-slate-200 align-top">
                    <td className="px-4 py-4">
                      <p className="font-semibold text-slate-900">{student.student_name}</p>
                      <p className="text-xs text-slate-500">{student.email}</p>
                    </td>
                    <td className="px-4 py-4">{student.roll_number || student.roll_no || "-"}</td>
                    <td className="px-4 py-4">
                      <p>{student.class_name || "-"}</p>
                      <p className="text-xs text-slate-500">{student.class_div || "-"} • {student.semester || "-"}</p>
                    </td>
                    <td className="px-4 py-4">{student.certificates_count}</td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" className="text-xs" onClick={() => handleView(student.id)}>View</Button>
                        <Button variant="secondary" className="text-xs" onClick={() => handleEdit(student)}>Edit</Button>
                        <Button variant="danger" className="text-xs" onClick={() => handleDelete(student)}>Delete</Button>
                      </div>
                    </td>
                  </tr>
                )) : null}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="grid gap-6">
          <Card id="student-form-section" data-dashboard-section className="rounded-[28px]">
            <h2 className="font-serif text-2xl font-bold text-slate-950">{editingId ? "Edit Student" : "Add Student"}</h2>
            <form className="mt-5 max-w-xl space-y-4" onSubmit={handleSubmit}>
              <Input label="Student Name" value={form.student_name} onChange={(event) => setForm((prev) => ({ ...prev, student_name: event.target.value }))} required />
              <Input label="Email / Login" type="email" value={form.email} onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))} required />
              <Input label={editingId ? "Password (leave blank to keep current)" : "Password"} type="password" value={form.password} onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))} required={!editingId} />
              <Input label="Roll Number" value={form.roll_number} onChange={(event) => setForm((prev) => ({ ...prev, roll_number: event.target.value }))} required />
              <Input label="Course" value={form.course} onChange={(event) => setForm((prev) => ({ ...prev, course: event.target.value }))} />
              <Input label="Class" value={form.class_name} onChange={(event) => setForm((prev) => ({ ...prev, class_name: event.target.value }))} />
              <Input label="Division" value={form.class_div} onChange={(event) => setForm((prev) => ({ ...prev, class_div: event.target.value.toUpperCase() }))} />
              <Input label="Semester" value={form.semester} onChange={(event) => setForm((prev) => ({ ...prev, semester: event.target.value }))} />
              <div className="flex flex-wrap gap-3 pt-1">
                <Button type="submit" disabled={saving}>{saving ? "Saving..." : editingId ? "Update Student" : "Create Student"}</Button>
                {editingId ? <Button type="button" variant="secondary" onClick={resetForm}>Cancel</Button> : null}
              </div>
            </form>
          </Card>

          <Card id="student-profile-section" data-dashboard-section className="rounded-[28px]">
            <h2 className="font-serif text-2xl font-bold text-slate-950">Student Profile</h2>
            {!selectedStudent ? <p className="mt-4 text-sm text-slate-500">Select a student to see profile details and all linked certificates.</p> : (
              <div className="mt-5 space-y-4">
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-lg font-semibold text-slate-900">{selectedStudent.student_name}</p>
                  <p className="text-sm text-slate-600">{selectedStudent.email}</p>
                  <p className="mt-2 text-sm text-slate-600">Roll: {selectedStudent.roll_number || selectedStudent.roll_no || "-"}</p>
                  <p className="text-sm text-slate-600">{selectedStudent.course || "Course not set"} • {selectedStudent.class_name || "-"} • {selectedStudent.class_div || "-"} • {selectedStudent.semester || "-"}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Linked certificates</p>
                  <div className="mt-3 space-y-3">
                    {(selectedStudent.certificates || []).length === 0 ? <p className="text-sm text-slate-500">No certificates linked yet.</p> : null}
                    {(selectedStudent.certificates || []).map((certificate) => (
                      <div key={certificate.id} className="rounded-2xl border border-slate-200 p-3">
                        <p className="font-medium text-slate-900">{certificate.certificate_no}</p>
                        <p className="text-sm text-slate-600">{certificate.course} • {certificate.issuer_name}</p>
                        <p className="text-xs text-slate-500">{certificate.certificate_type || "Certificate"} • {certificate.status}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>
      </section>
    </AdminShell>
  );
}
