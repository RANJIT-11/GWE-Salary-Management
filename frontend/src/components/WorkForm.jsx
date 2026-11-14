
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

const BUCKET_NAME = "WORK PROOFS";
const MAX_VIDEO_SIZE = 50 * 1024 * 1024;
const DRAFT_KEY = "gwe_work_draft";

const matchOptions = [
  { value: "b2b_3", label: "B2B 3" },
  { value: "b2b_4", label: "B2B 4" },
  { value: "b2b_6", label: "B2B 6" },
];

const workOptions = [
  { value: "host", label: "HOST" },
  { value: "pt", label: "PT" },
  { value: "host_pt", label: "HOST + PT" },
];

const initialForm = {
  lobby_date: "",
  lobby_start_time: "",
  lobby_end_time: "",
  lobby_url: "",
  match_type: "b2b_3",
  work_type: "host",
};

export default function WorkForm() {
  const [form, setForm] = useState(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      return saved
        ? { ...initialForm, ...JSON.parse(saved) }
        : { ...initialForm };
    } catch {
      return { ...initialForm };
    }
  });

  const [videoFile, setVideoFile] = useState(null);
  const [profileRole, setProfileRole] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Load current user's role
  useEffect(() => {
    let mounted = true;

    async function loadRole() {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) throw userError;
        if (!user) return;

        const { data, error: profileError } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();

        if (profileError) throw profileError;

        if (mounted) {
          setProfileRole(data.role);
        }
      } catch (err) {
        console.error("Role loading error:", err);
      }
    }

    loadRole();

    return () => {
      mounted = false;
    };
  }, []);

  // Save draft automatically
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
    } catch (err) {
      console.error("Draft save error:", err);
    }
  }, [form]);

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));

    setError("");
    setSuccess("");
  }

  function handleVideoChange(event) {
    const file = event.target.files?.[0];

    setVideoFile(null);
    setError("");
    setSuccess("");

    if (!file) return;

    const allowedTypes = [
      "video/mp4",
      "video/webm",
      "video/quicktime",
    ];

    if (!allowedTypes.includes(file.type)) {
      setError("Only MP4, WEBM and MOV videos are allowed.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_VIDEO_SIZE) {
      setError("Video size must not exceed 50 MB.");
      event.target.value = "";
      return;
    }

    setVideoFile(file);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (!supabase) {
      setError("Supabase connection is not configured.");
      return;
    }

    if (
      !form.lobby_date ||
      !form.lobby_start_time ||
      !form.lobby_end_time ||
      !form.lobby_url.trim() ||
      !videoFile
    ) {
      setError("Please fill all fields and select a video proof.");
      return;
    }

    if (form.lobby_end_time <= form.lobby_start_time) {
      setError("End time must be later than start time.");
      return;
    }

    try {
      new URL(form.lobby_url);
    } catch {
      setError("Please enter a valid Lobby URL.");
      return;
    }

    setLoading(true);

    let uploadedFilePath = null;

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) throw new Error("Please sign in again.");

      // Get current role from database
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role, is_active")
        .eq("id", user.id)
        .single();

      if (profileError) throw profileError;

      if (!profile.is_active) {
        throw new Error("Your account is inactive.");
      }

      if (!["member", "admin", "main_admin"].includes(profile.role)) {
        throw new Error("Your account is not authorized to submit work.");
      }

      const extension = videoFile.name.split(".").pop().toLowerCase();

      const filePath = `${user.id}/${crypto.randomUUID()}.${extension}`;

      // Upload video proof
      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filePath, videoFile, {
          contentType: videoFile.type,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      uploadedFilePath = filePath;

      // Database trigger handles Main Admin auto-approval.
      const { data: submission, error: insertError } = await supabase
        .from("work_submissions")
        .insert({
          user_id: user.id,
          lobby_date: form.lobby_date,
          lobby_start_time: form.lobby_start_time,
          lobby_end_time: form.lobby_end_time,
          lobby_url: form.lobby_url.trim(),
          video_url: filePath,
          match_type: form.match_type,
          work_type: form.work_type,
          status: "pending",
          amount: 0,
        })
        .select("id, status")
        .single();

      if (insertError) throw insertError;

      // Clear draft only after successful submission
      localStorage.removeItem(DRAFT_KEY);

      if (submission.status === "approved") {
        setSuccess(
          "Work submitted and automatically approved! Salary will be calculated according to the Pricebook."
        );
      } else if (profile.role === "admin") {
        setSuccess(
          "Work submitted successfully! Waiting for Main Admin approval."
        );
      } else {
        setSuccess(
          "Work and video submitted successfully! Waiting for Admin approval."
        );
      }

      setForm({ ...initialForm });
      setVideoFile(null);

      const fileInput = document.getElementById("video-proof");
      if (fileInput) fileInput.value = "";

    } catch (err) {
      console.error("Work submission error:", err);

      // Remove uploaded video if submission failed
      if (uploadedFilePath) {
        const { error: cleanupError } = await supabase.storage
          .from(BUCKET_NAME)
          .remove([uploadedFilePath]);

        if (cleanupError) {
          console.error("Video cleanup error:", cleanupError);
        }
      }

      setError(err.message || "Unable to submit work. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "mt-2 w-full rounded-lg border border-white/10 bg-[#201d1d] px-4 py-3 text-sm text-white outline-none focus:border-[#c55365]";

  const labelClass =
    "block text-sm font-medium text-[#d6cec8]";

  const optionClass = (selected) =>
    `rounded-lg border p-4 text-center text-sm font-semibold transition ${
      selected
        ? "border-[#c55365] bg-[#a83245]/15 text-[#f0b6bd]"
        : "border-white/10 bg-[#201d1d] text-[#aaa29c] hover:border-white/20"
    }`;

  const submitLabel =
    profileRole === "main_admin"
      ? "Submit & Auto Approve"
      : "Submit for Approval";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      <section>
        <h3 className="mb-3 text-sm font-semibold text-[#f5eee5]">
          Select Match Type
        </h3>

        <div className="grid grid-cols-3 gap-3">
          {matchOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() =>
                setForm((previous) => ({
                  ...previous,
                  match_type: option.value,
                }))
              }
              className={optionClass(form.match_type === option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold text-[#f5eee5]">
          Select Work Type
        </h3>

        <div className="grid grid-cols-3 gap-3">
          {workOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() =>
                setForm((previous) => ({
                  ...previous,
                  work_type: option.value,
                }))
              }
              className={optionClass(form.work_type === option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-[#f5eee5]">
          Lobby Details
        </h3>

        <label className={labelClass}>
          Lobby Date
          <input
            type="date"
            name="lobby_date"
            value={form.lobby_date}
            onChange={handleChange}
            className={inputClass}
            required
          />
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            Lobby Start Time
            <input
              type="time"
              name="lobby_start_time"
              value={form.lobby_start_time}
              onChange={handleChange}
              className={inputClass}
              required
            />
          </label>

          <label className={labelClass}>
            Lobby End Time
            <input
              type="time"
              name="lobby_end_time"
              value={form.lobby_end_time}
              onChange={handleChange}
              className={inputClass}
              required
            />
          </label>
        </div>

        <label className={labelClass}>
          Lobby URL
          <input
            type="url"
            name="lobby_url"
            value={form.lobby_url}
            onChange={handleChange}
            placeholder="https://..."
            className={inputClass}
            required
          />
        </label>
      </section>

      <section>
        <label className={labelClass}>
          Upload Video Proof (Required)
          <input
            id="video-proof"
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            onChange={handleVideoChange}
            className={`${inputClass} file:mr-3 file:rounded-md file:border-0 file:bg-[#a83245] file:px-3 file:py-2 file:text-white`}
            required
          />
        </label>

        <p className="mt-2 text-xs text-[#89817c]">
          MP4, WEBM, MOV | Maximum size: 50 MB
        </p>

        {videoFile && (
          <p className="mt-2 text-sm text-green-400">
            Selected: {videoFile.name}
          </p>
        )}
      </section>

      {error && (
        <div className="rounded-lg border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-green-400/20 bg-green-400/10 p-3 text-sm text-green-300">
          {success}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-[#a83245] px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-[#bd4055] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Uploading & Submitting..." : submitLabel}
      </button>

      <p className="text-center text-xs text-[#89817c]">
        {profileRole === "main_admin"
          ? "Your work will be automatically approved and salary calculated."
          : profileRole === "admin"
          ? "Your work will be reviewed by Main Admin. Salary is updated after approval."
          : "Your work will be reviewed by Admin. Salary is updated after approval."}
      </p>
    </form>
  );
}
