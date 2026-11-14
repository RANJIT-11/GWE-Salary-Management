
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const BUCKET_NAME = "WORK PROOFS";
const MAX_VIDEO_SIZE = 50 * 1024 * 1024;

const initialCorrection = {
  lobby_date: "",
  lobby_start_time: "",
  lobby_end_time: "",
  lobby_url: "",
  work_type: "host",
  match_type: "b2b_3",
  reason: "",
};

export default function WorkHistory() {
  const [works, setWorks] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [videoLoading, setVideoLoading] = useState(null);

  const [selectedWork, setSelectedWork] = useState(null);
  const [correction, setCorrection] = useState(initialCorrection);
  const [correctionVideo, setCorrectionVideo] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function fetchWorks() {
    setLoading(true);
    setError("");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) throw new Error("Please sign in again.");

      const [workResult, requestResult] = await Promise.all([
        supabase
          .from("work_submissions")
          .select(
            "id, lobby_date, lobby_start_time, lobby_end_time, lobby_url, video_url, work_type, match_type, status, amount, rejection_reason, created_at"
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),

        supabase
          .from("work_correction_requests")
          .select("*")
          .eq("user_id", user.id)
          .order("submitted_at", { ascending: false }),
      ]);

      if (workResult.error) throw workResult.error;
      if (requestResult.error) throw requestResult.error;

      setWorks(workResult.data || []);
      setRequests(requestResult.data || []);
    } catch (err) {
      console.error(err);
      setError(err.message || "Unable to load work history.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchWorks();
  }, []);

  async function viewVideo(path) {
    if (!path) {
      setError("Video proof not found.");
      return;
    }

    setVideoLoading(path);
    setError("");

    try {
      const { data, error: urlError } = await supabase.storage
        .from(BUCKET_NAME)
        .createSignedUrl(path, 300);

      if (urlError) throw urlError;

      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error(err);
      setError("Unable to open video. Please try again.");
    } finally {
      setVideoLoading(null);
    }
  }

  function openCorrection(work) {
    setSelectedWork(work);

    setCorrection({
      lobby_date: work.lobby_date || "",
      lobby_start_time: work.lobby_start_time?.slice(0, 5) || "",
      lobby_end_time: work.lobby_end_time?.slice(0, 5) || "",
      lobby_url: work.lobby_url || "",
      work_type: work.work_type || "host",
      match_type: work.match_type || "b2b_3",
      reason: "",
    });

    setCorrectionVideo(null);
    setError("");
    setSuccess("");
  }

  function closeCorrection() {
    if (submitting) return;

    setSelectedWork(null);
    setCorrection(initialCorrection);
    setCorrectionVideo(null);
  }

  function handleCorrectionChange(event) {
    const { name, value } = event.target;

    setCorrection((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  function handleCorrectionVideo(event) {
    const file = event.target.files?.[0];

    setCorrectionVideo(null);
    setError("");

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

    setCorrectionVideo(file);
  }

  async function submitCorrection(event) {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (!selectedWork || !correctionVideo) {
      setError("Please select a new video proof.");
      return;
    }

    if (
      !correction.lobby_date ||
      !correction.lobby_start_time ||
      !correction.lobby_end_time ||
      !correction.lobby_url.trim() ||
      correction.reason.trim().length < 5
    ) {
      setError("Please complete all fields and provide a correction reason.");
      return;
    }

    if (correction.lobby_end_time <= correction.lobby_start_time) {
      setError("End time must be later than start time.");
      return;
    }

    try {
      new URL(correction.lobby_url.trim());
    } catch {
      setError("Please enter a valid Lobby URL.");
      return;
    }

    setSubmitting(true);

    let uploadedPath = null;

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) throw new Error("Please sign in again.");

      const extension = correctionVideo.name.split(".").pop().toLowerCase();
      uploadedPath = `${user.id}/${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(uploadedPath, correctionVideo, {
          contentType: correctionVideo.type,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase
        .from("work_correction_requests")
        .insert({
          work_submission_id: selectedWork.id,
          user_id: user.id,
          requested_lobby_date: correction.lobby_date,
          requested_lobby_start_time: correction.lobby_start_time,
          requested_lobby_end_time: correction.lobby_end_time,
          requested_lobby_url: correction.lobby_url.trim(),
          requested_work_type: correction.work_type,
          requested_match_type: correction.match_type,
          requested_video_path: uploadedPath,
          reason: correction.reason.trim(),
          status: "pending",
        });

      if (insertError) throw insertError;

      setSuccess("Correction request submitted successfully. Waiting for Admin approval.");

      setSelectedWork(null);
      setCorrection(initialCorrection);
      setCorrectionVideo(null);

      await fetchWorks();
    } catch (err) {
      console.error("Correction request error:", err);

      if (uploadedPath) {
        const { error: cleanupError } = await supabase.storage
          .from(BUCKET_NAME)
          .remove([uploadedPath]);

        if (cleanupError) {
          console.error("Video cleanup error:", cleanupError);
        }
      }

      if (err.code === "23505") {
        setError("A pending correction request already exists for this work.");
      } else {
        setError(err.message || "Unable to submit correction request.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const statusStyle = {
    pending: "bg-yellow-400/10 text-yellow-400",
    approved: "bg-green-400/10 text-green-400",
    rejected: "bg-red-400/10 text-red-400",
  };

  const formatMoney = (amount) =>
    `₹${Number(amount || 0).toLocaleString("en-IN")}`;

  const inputClass =
    "mt-2 w-full rounded-lg border border-white/10 bg-[#201d1d] px-4 py-3 text-sm text-white outline-none focus:border-[#c55365]";

  const labelClass =
    "block text-sm font-medium text-[#d6cec8]";

  function getWorkRequest(workId) {
    return requests.find(
      (request) => request.work_submission_id === workId
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold text-[#d77a88]">
            My Work History
          </h1>
          <p className="mt-2 text-sm text-[#a69e98]">
            View your submitted work and correction requests.
          </p>
        </div>

        <button
          onClick={fetchWorks}
          disabled={loading}
          className="rounded-lg border border-white/10 px-4 py-2 text-sm hover:bg-white/5 disabled:opacity-50"
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

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

      {loading ? (
        <div className="rounded-xl bg-[#201d1d] p-10 text-center text-[#a69e98]">
          Loading your work history...
        </div>
      ) : works.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-[#201d1d] p-10 text-center">
          <h2 className="text-lg font-semibold">No Work Found</h2>
          <p className="mt-2 text-sm text-[#a69e98]">
            Your submitted work will appear here.
          </p>
          <a
            href="#add-work"
            className="mt-5 inline-block rounded-lg bg-[#a83245] px-5 py-3 text-sm font-semibold"
          >
            Add New Work
          </a>
        </div>
      ) : (
        <div className="space-y-4">
          {works.map((work) => {
            const request = getWorkRequest(work.id);
            const hasPendingRequest = request?.status === "pending";

            return (
              <article
                key={work.id}
                className="rounded-xl border border-white/10 bg-[#201d1d] p-5 sm:p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-[#f5eee5]">
                      {work.work_type?.toUpperCase().replace("_", " + ")}
                      {" - "}
                      {work.match_type?.toUpperCase().replace("_", " ")}
                    </h2>

                    <p className="mt-2 text-sm text-[#a69e98]">
                      Lobby Date: {work.lobby_date}
                    </p>
                  </div>

                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      statusStyle[work.status] || ""
                    }`}
                  >
                    {work.status?.toUpperCase()}
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                  <div>
                    <p className="text-[#89817c]">Start Time</p>
                    <p className="mt-1">{work.lobby_start_time}</p>
                  </div>

                  <div>
                    <p className="text-[#89817c]">End Time</p>
                    <p className="mt-1">{work.lobby_end_time}</p>
                  </div>

                  <div>
                    <p className="text-[#89817c]">Salary</p>
                    <p className="mt-1 font-semibold text-[#f5eee5]">
                      {work.status === "approved"
                        ? formatMoney(work.amount)
                        : "Not finalized"}
                    </p>
                  </div>

                  <div>
                    <p className="text-[#89817c]">Submitted On</p>
                    <p className="mt-1">
                      {new Date(work.created_at).toLocaleDateString("en-IN")}
                    </p>
                  </div>
                </div>

                {work.status === "rejected" && work.rejection_reason && (
                  <div className="mt-4 rounded-lg bg-red-400/10 p-3 text-sm text-red-300">
                    Rejection Reason: {work.rejection_reason}
                  </div>
                )}

                <div className="mt-5 flex flex-wrap gap-3">
                  {work.lobby_url && (
                    <a
                      href={work.lobby_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-white/10 px-4 py-2 text-sm hover:bg-white/5"
                    >
                      View Lobby
                    </a>
                  )}

                  <button
                    type="button"
                    onClick={() => viewVideo(work.video_url)}
                    disabled={videoLoading === work.video_url}
                    className="rounded-lg bg-[#a83245] px-4 py-2 text-sm font-semibold hover:bg-[#bd4055] disabled:opacity-50"
                  >
                    {videoLoading === work.video_url
                      ? "Opening..."
                      : "View My Video"}
                  </button>

                  {["pending", "approved"].includes(work.status) && (
                    <button
                      type="button"
                      onClick={() => openCorrection(work)}
                      disabled={hasPendingRequest}
                      className="rounded-lg border border-[#c55365] px-4 py-2 text-sm font-semibold text-[#f0b6bd] hover:bg-[#a83245]/15 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {hasPendingRequest
                        ? "Correction Pending"
                        : "Request Correction"}
                    </button>
                  )}
                </div>

                {request && (
                  <div className="mt-4 rounded-lg border border-white/10 bg-[#171515] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">
                        Correction Request
                      </p>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          statusStyle[request.status] || ""
                        }`}
                      >
                        {request.status?.toUpperCase()}
                      </span>
                    </div>

                    <p className="mt-2 text-sm text-[#a69e98]">
                      Reason: {request.reason}
                    </p>

                    {request.admin_response && (
                      <p className="mt-2 text-sm text-[#d6cec8]">
                        Admin Response: {request.admin_response}
                      </p>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {selectedWork && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-4">
          <div className="my-auto w-full max-w-2xl rounded-2xl border border-white/10 bg-[#201d1d] p-5 sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-[#d77a88]">
                Request Work Correction
              </h2>

              <button
                type="button"
                onClick={closeCorrection}
                disabled={submitting}
                className="rounded-lg px-3 py-2 text-[#a69e98] hover:bg-white/5"
              >
                ✕
              </button>
            </div>

            <p className="mt-2 text-sm text-[#a69e98]">
              Original work details will only change after Admin approval.
            </p>

            <form onSubmit={submitCorrection} className="mt-6 space-y-4">

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className={labelClass}>
                  Lobby Date
                  <input
                    type="date"
                    name="lobby_date"
                    value={correction.lobby_date}
                    onChange={handleCorrectionChange}
                    className={inputClass}
                    required
                  />
                </label>

                <label className={labelClass}>
                  Work Type
                  <select
                    name="work_type"
                    value={correction.work_type}
                    onChange={handleCorrectionChange}
                    className={inputClass}
                  >
                    <option value="host">HOST</option>
                    <option value="pt">PT</option>
                    <option value="host_pt">HOST + PT</option>
                  </select>
                </label>

                <label className={labelClass}>
                  Start Time
                  <input
                    type="time"
                    name="lobby_start_time"
                    value={correction.lobby_start_time}
                    onChange={handleCorrectionChange}
                    className={inputClass}
                    required
                  />
                </label>

                <label className={labelClass}>
                  End Time
                  <input
                    type="time"
                    name="lobby_end_time"
                    value={correction.lobby_end_time}
                    onChange={handleCorrectionChange}
                    className={inputClass}
                    required
                  />
                </label>
              </div>

              <label className={labelClass}>
                Match Type
                <select
                  name="match_type"
                  value={correction.match_type}
                  onChange={handleCorrectionChange}
                  className={inputClass}
                >
                  <option value="b2b_3">B2B 3</option>
                  <option value="b2b_4">B2B 4</option>
                  <option value="b2b_6">B2B 6</option>
                </select>
              </label>

              <label className={labelClass}>
                Lobby URL
                <input
                  type="url"
                  name="lobby_url"
                  value={correction.lobby_url}
                  onChange={handleCorrectionChange}
                  placeholder="https://..."
                  className={inputClass}
                  required
                />
              </label>

              <label className={labelClass}>
                New Video Proof (Required)
                <input
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime"
                  onChange={handleCorrectionVideo}
                  className={`${inputClass} file:mr-3 file:rounded-md file:border-0 file:bg-[#a83245] file:px-3 file:py-2 file:text-white`}
                  required
                />
                <span className="mt-2 block text-xs text-[#89817c]">
                  MP4, WEBM, MOV | Maximum size: 50 MB
                </span>

                {correctionVideo && (
                  <span className="mt-2 block text-sm text-green-400">
                    Selected: {correctionVideo.name}
                  </span>
                )}
              </label>

              <label className={labelClass}>
                Correction Reason
                <textarea
                  name="reason"
                  value={correction.reason}
                  onChange={handleCorrectionChange}
                  placeholder="Explain why you need to correct this work..."
                  rows={3}
                  maxLength={1000}
                  className={inputClass}
                  required
                  minLength={5}
                />
              </label>

              <div className="rounded-lg border border-yellow-400/20 bg-yellow-400/5 p-3 text-xs text-yellow-200">
                Your original work and salary will remain unchanged until Admin approves this request.
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 rounded-lg bg-[#a83245] px-5 py-3 text-sm font-semibold text-white hover:bg-[#bd4055] disabled:opacity-50"
                >
                  {submitting ? "Uploading & Submitting..." : "Submit Correction Request"}
                </button>

                <button
                  type="button"
                  onClick={closeCorrection}
                  disabled={submitting}
                  className="rounded-lg border border-white/10 px-5 py-3 text-sm hover:bg-white/5 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
