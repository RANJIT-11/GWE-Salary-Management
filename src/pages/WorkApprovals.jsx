
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const REJECTION_DRAFT_KEY = "gwe_work_approval_rejection_draft";
const PENALTY_HANDOFF_KEY = "gwe_penalty_from_work_approval";

const getSavedRejectionDraft = () => {
  try {
    const saved = localStorage.getItem(REJECTION_DRAFT_KEY);

    return saved
      ? JSON.parse(saved)
      : { workId: null, reason: "" };
  } catch (error) {
    console.error("Rejection draft restore error:", error);
    return { workId: null, reason: "" };
  }
};

export default function WorkApprovals({ role = "admin" }) {
  const [works, setWorks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [rejectionDraft, setRejectionDraft] = useState(
    getSavedRejectionDraft
  );

  const rejectingId = rejectionDraft.workId;
  const rejectionReason = rejectionDraft.reason;

  useEffect(() => {
    try {
      localStorage.setItem(
        REJECTION_DRAFT_KEY,
        JSON.stringify(rejectionDraft)
      );
    } catch (error) {
      console.error("Rejection draft save error:", error);
    }
  }, [rejectionDraft]);

  const fetchWorks = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const { data, error: workError } = await supabase
        .from("work_submissions")
        .select(`
          id,
          user_id,
          lobby_date,
          lobby_start_time,
          lobby_end_time,
          lobby_url,
          video_url,
          work_type,
          match_type,
          status,
          created_at
        `)
        .eq("status", "pending")
        .order("created_at", { ascending: true });

      if (workError) throw workError;

      const userIds = [...new Set((data || []).map((w) => w.user_id))];

      let profiles = [];

      if (userIds.length > 0) {
        const { data: profileData, error: profileError } =
          await supabase
            .from("profiles")
            .select("id, username, full_name")
            .in("id", userIds);

        if (profileError) throw profileError;
        profiles = profileData || [];
      }

      const profileMap = Object.fromEntries(
        profiles.map((p) => [p.id, p])
      );

      const formattedWorks = (data || []).map((work) => ({
        ...work,
        profile: profileMap[work.user_id] || null,
      }));

      setWorks(formattedWorks);

      setRejectionDraft((previous) => {
        if (
          previous.workId &&
          !formattedWorks.some((work) => work.id === previous.workId)
        ) {
          return { workId: null, reason: "" };
        }

        return previous;
      });
    } catch (err) {
      setError(err.message || "Unable to load work submissions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorks();
  }, [fetchWorks]);

  // Open the penalty page with the selected lobby details.
  const openPenalty = (work) => {
    try {
      const penaltyDetails = {
        id: work.id,
        user_id: work.user_id,
        lobby_date: work.lobby_date,
        lobby_start_time: work.lobby_start_time,
        lobby_end_time: work.lobby_end_time,
        lobby_url: work.lobby_url,
        work_type: work.work_type,
        match_type: work.match_type,
        profile: work.profile,
      };

      sessionStorage.setItem(
        PENALTY_HANDOFF_KEY,
        JSON.stringify(penaltyDetails)
      );

      window.location.hash = "penalties";

      window.dispatchEvent(
        new CustomEvent("gwe-open-penalty", {
          detail: penaltyDetails,
        })
      );

      setError("");
    } catch (err) {
      console.error("Penalty navigation error:", err);
      setError("Unable to open penalty management.");
    }
  };

  const openVideo = async (work) => {
    if (!work.video_url) {
      setError("Video proof is not available.");
      return;
    }

    const newTab = window.open("about:blank", "_blank");

    try {
      const { data, error: videoError } = await supabase.storage
        .from("WORK PROOFS")
        .createSignedUrl(work.video_url, 300);

      if (videoError) throw videoError;

      if (newTab && data?.signedUrl) {
        newTab.location.href = data.signedUrl;
      } else if (data?.signedUrl) {
        window.location.href = data.signedUrl;
      }
    } catch (err) {
      if (newTab) newTab.close();
      setError(err.message || "Unable to open video proof.");
    }
  };

  const approveWork = async (work) => {
    const confirmed = window.confirm(
      `Approve work submitted by ${work.profile?.username || "this member"}?`
    );

    if (!confirmed) return;

    setProcessingId(work.id);
    setError("");
    setMessage("");

    try {
      const { error: updateError } = await supabase
        .from("work_submissions")
        .update({
          status: "approved",
          rejection_reason: null,
        })
        .eq("id", work.id)
        .eq("status", "pending");

      if (updateError) throw updateError;

      setMessage("Work approved successfully. Salary calculation triggered.");

      await fetchWorks();
    } catch (err) {
      setError(err.message || "Unable to approve work.");
    } finally {
      setProcessingId(null);
    }
  };

  const rejectWork = async (work) => {
    if (!rejectionReason.trim()) {
      setError("Please enter a rejection reason.");
      return;
    }

    setProcessingId(work.id);
    setError("");
    setMessage("");

    try {
      const { error: updateError } = await supabase
        .from("work_submissions")
        .update({
          status: "rejected",
          rejection_reason: rejectionReason.trim(),
        })
        .eq("id", work.id)
        .eq("status", "pending");

      if (updateError) throw updateError;

      setMessage("Work rejected successfully.");

      setRejectionDraft({
        workId: null,
        reason: "",
      });

      await fetchWorks();
    } catch (err) {
      setError(err.message || "Unable to reject work.");
    } finally {
      setProcessingId(null);
    }
  };

  const cancelRejection = () => {
    setRejectionDraft({
      workId: null,
      reason: "",
    });

    setError("");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Work Approvals</h1>
          <p className="mt-2 text-sm text-[#89817c]">
            Review and approve member work submissions.
          </p>
        </div>

        <button
          onClick={fetchWorks}
          disabled={loading}
          className="rounded-lg border border-white/10 px-4 py-2 text-sm hover:bg-white/5 disabled:opacity-50"
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div className="rounded-xl border border-white/10 bg-[#201d1d] p-5">
        <p className="text-sm text-[#89817c]">Pending submissions</p>
        <p className="mt-2 text-3xl font-semibold">{works.length}</p>
      </div>

      {message && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-sm text-green-300">
          {message}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-white/10 bg-[#201d1d] p-8 text-center text-[#89817c]">
          Loading submissions...
        </div>
      ) : works.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-[#201d1d] p-10 text-center">
          <h2 className="text-lg font-semibold">No pending submissions</h2>
          <p className="mt-2 text-sm text-[#89817c]">
            New member submissions will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {works.map((work) => (
            <div
              key={work.id}
              className="rounded-xl border border-white/10 bg-[#201d1d] p-5 sm:p-6"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">
                    {work.profile?.username || "Unknown member"}
                  </h2>
                  <p className="text-sm text-[#89817c]">
                    {work.profile?.full_name || "Member"}
                  </p>
                </div>

                <span className="rounded-full bg-yellow-500/10 px-3 py-1 text-xs text-yellow-400">
                  Pending
                </span>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <p className="text-xs text-[#89817c]">Lobby Date</p>
                  <p className="mt-1">{work.lobby_date}</p>
                </div>

                <div>
                  <p className="text-xs text-[#89817c]">Lobby Timing</p>
                  <p className="mt-1">
                    {work.lobby_start_time} - {work.lobby_end_time}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-[#89817c]">Work Type</p>
                  <p className="mt-1">{work.work_type}</p>
                </div>

                <div>
                  <p className="text-xs text-[#89817c]">Match Type</p>
                  <p className="mt-1">{work.match_type}</p>
                </div>

                <div>
                  <p className="text-xs text-[#89817c]">Submitted At</p>
                  <p className="mt-1">
                    {new Date(work.created_at).toLocaleString("en-IN")}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-[#89817c]">Salary</p>
                  <p className="mt-1">Calculated after approval</p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <a
                  href={work.lobby_url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-white/10 px-4 py-2 text-sm hover:bg-white/5"
                >
                  Open Lobby Link
                </a>

                <button
                  onClick={() => openVideo(work)}
                  className="rounded-lg border border-white/10 px-4 py-2 text-sm hover:bg-white/5"
                >
                  View Video Proof
                </button>
              </div>

              {rejectingId === work.id && (
                <div className="mt-5 space-y-3 rounded-lg border border-red-500/20 bg-red-500/5 p-4">
                  <label className="text-sm font-medium">
                    Rejection Reason
                  </label>

                  <textarea
                    value={rejectionReason}
                    onChange={(e) =>
                      setRejectionDraft((previous) => ({
                        ...previous,
                        reason: e.target.value,
                      }))
                    }
                    placeholder="Enter reason for rejecting this work..."
                    rows={3}
                    className="w-full rounded-lg border border-white/10 bg-[#171515] p-3 text-sm outline-none focus:border-red-400"
                  />

                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={() => rejectWork(work)}
                      disabled={processingId === work.id}
                      className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                    >
                      {processingId === work.id
                        ? "Processing..."
                        : "Confirm Reject"}
                    </button>

                    <button
                      onClick={cancelRejection}
                      className="rounded-lg border border-white/10 px-4 py-2 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {rejectingId !== work.id && (
                <div className="mt-5 flex flex-wrap gap-3 border-t border-white/10 pt-5">
                  <button
                    onClick={() => approveWork(work)}
                    disabled={processingId === work.id || role === "member"}
                    className="rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
                  >
                    {processingId === work.id
                      ? "Processing..."
                      : "Approve Work"}
                  </button>

                  <button
                    onClick={() => {
                      setRejectionDraft({
                        workId: work.id,
                        reason: "",
                      });
                      setError("");
                    }}
                    disabled={processingId === work.id || role === "member"}
                    className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
                  >
                    Reject Work
                  </button>

                  <button
                    onClick={() => openPenalty(work)}
                    disabled={processingId === work.id || role === "member"}
                    className="rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    Apply Penalty
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
