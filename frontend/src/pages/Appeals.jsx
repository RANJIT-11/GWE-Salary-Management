
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const BUCKET = "PENALTY APPEALS";

const money = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN")}`;

export default function Appeals() {
  const [appeals, setAppeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [responses, setResponses] = useState({});

  const loadAppeals = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const { data, error: appealError } = await supabase
        .from("penalty_appeals")
        .select("*")
        .order("submitted_at", { ascending: false });

      if (appealError) throw appealError;

      const appealRows = data || [];

      const userIds = [
        ...new Set(appealRows.map((item) => item.user_id)),
      ];

      const penaltyIds = [
        ...new Set(appealRows.map((item) => item.penalty_id)),
      ];

      let profiles = [];
      let penalties = [];

      if (userIds.length) {
        const result = await supabase
          .from("profiles")
          .select("id, username")
          .in("id", userIds);

        if (result.error) throw result.error;
        profiles = result.data || [];
      }

      if (penaltyIds.length) {
        const result = await supabase
          .from("penalties")
          .select("id, amount, reason, lobby_date, status")
          .in("id", penaltyIds);

        if (result.error) throw result.error;
        penalties = result.data || [];
      }

      const profileMap = Object.fromEntries(
        profiles.map((item) => [item.id, item])
      );

      const penaltyMap = Object.fromEntries(
        penalties.map((item) => [item.id, item])
      );

      const enriched = await Promise.all(
        appealRows.map(async (appeal) => {
          let videoUrl = null;

          if (appeal.video_path) {
            const { data: signedData, error: signedError } =
              await supabase.storage
                .from(BUCKET)
                .createSignedUrl(appeal.video_path, 3600);

            if (!signedError) {
              videoUrl = signedData?.signedUrl || null;
            } else {
              console.error("Video URL error:", signedError);
            }
          }

          return {
            ...appeal,
            member: profileMap[appeal.user_id],
            penalty: penaltyMap[appeal.penalty_id],
            videoUrl,
          };
        })
      );

      setAppeals(enriched);
    } catch (err) {
      console.error("Appeal loading error:", err);
      setError(err.message || "Unable to load appeals.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAppeals();
  }, [loadAppeals]);

  const handleReview = async (appeal, decision) => {
    setError("");
    setSuccess("");

    const response = (responses[appeal.id] || "").trim();

    if (decision === "rejected" && !response) {
      setError("Rejection reason is mandatory.");
      return;
    }

    const confirmed = window.confirm(
      decision === "approved"
        ? "Approve this appeal and reverse the penalty?"
        : "Reject this appeal? The penalty will remain active."
    );

    if (!confirmed) return;

    setProcessing(appeal.id);

    try {
      const { error: reviewError } = await supabase.rpc(
        "review_penalty_appeal",
        {
          p_appeal_id: appeal.id,
          p_decision: decision,
          p_admin_response: response || null,
        }
      );

      if (reviewError) throw reviewError;

      setSuccess(
        decision === "approved"
          ? "Appeal approved. Penalty reversal requested successfully."
          : "Appeal rejected. Penalty remains active."
      );

      setResponses((previous) => ({
        ...previous,
        [appeal.id]: "",
      }));

      await loadAppeals();
    } catch (err) {
      console.error("Appeal review error:", err);
      setError(err.message || "Unable to review appeal.");
    } finally {
      setProcessing("");
    }
  };

  const pendingCount = appeals.filter(
    (item) => item.status === "pending"
  ).length;

  const reviewedCount = appeals.filter(
    (item) => item.status !== "pending"
  ).length;

  return (
    <div className="mx-auto max-w-6xl space-y-7">

      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-[#d77a88]">
            Appeal Management
          </h1>

          <p className="mt-2 text-sm text-[#a69e98]">
            Verify member penalty appeals and supporting evidence.
          </p>
        </div>

        <button
          onClick={loadAppeals}
          disabled={loading}
          className="rounded-lg border border-white/10 px-4 py-2 text-sm hover:bg-white/5 disabled:opacity-50"
        >
          Refresh
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

      {/* SUMMARY */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-[#201d1d] p-5">
          <p className="text-sm text-[#a69e98]">Total Appeals</p>
          <h2 className="mt-3 text-3xl font-bold text-white">
            {appeals.length}
          </h2>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#201d1d] p-5">
          <p className="text-sm text-[#a69e98]">Pending Verification</p>
          <h2 className="mt-3 text-3xl font-bold text-yellow-400">
            {pendingCount}
          </h2>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#201d1d] p-5">
          <p className="text-sm text-[#a69e98]">Reviewed Appeals</p>
          <h2 className="mt-3 text-3xl font-bold text-green-400">
            {reviewedCount}
          </h2>
        </div>
      </div>

      {/* APPEALS */}
      <section className="rounded-xl border border-white/10 bg-[#201d1d] p-5 sm:p-6">
        <h2 className="mb-5 text-xl font-semibold text-white">
          Member Appeals
        </h2>

        {loading ? (
          <p className="py-10 text-center text-[#a69e98]">
            Loading appeals...
          </p>
        ) : appeals.length === 0 ? (
          <p className="py-10 text-center text-[#a69e98]">
            No penalty appeals available.
          </p>
        ) : (
          <div className="space-y-5">
            {appeals.map((appeal) => {
              const isPending = appeal.status === "pending";
              const busy = processing === appeal.id;

              return (
                <article
                  key={appeal.id}
                  className="rounded-xl border border-white/10 bg-[#171515] p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-white">
                        {appeal.member?.username || "Unknown Member"}
                      </h3>

                      <p className="mt-1 text-xs text-[#89817c]">
                        Submitted:{" "}
                        {new Date(appeal.submitted_at).toLocaleString("en-IN")}
                      </p>
                    </div>

                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        appeal.status === "approved"
                          ? "bg-green-500/10 text-green-400"
                          : appeal.status === "rejected"
                            ? "bg-red-500/10 text-red-400"
                            : "bg-yellow-500/10 text-yellow-400"
                      }`}
                    >
                      {appeal.status.toUpperCase()}
                    </span>
                  </div>

                  {/* PENALTY DETAILS */}
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg bg-[#201d1d] p-3">
                      <p className="text-xs text-[#89817c]">
                        Penalty Amount
                      </p>
                      <p className="mt-1 font-semibold text-red-400">
                        {money(appeal.penalty?.amount)}
                      </p>
                    </div>

                    <div className="rounded-lg bg-[#201d1d] p-3">
                      <p className="text-xs text-[#89817c]">
                        Penalty Date
                      </p>
                      <p className="mt-1 font-semibold text-white">
                        {appeal.penalty?.lobby_date || "-"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <p className="text-sm font-semibold text-[#d77a88]">
                      Original Penalty Reason
                    </p>
                    <p className="mt-2 text-sm text-[#c2bab4]">
                      {appeal.penalty?.reason || "-"}
                    </p>
                  </div>

                  {/* MEMBER EXPLANATION */}
                  <div className="mt-4">
                    <p className="text-sm font-semibold text-[#d77a88]">
                      Member Explanation
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#c2bab4]">
                      {appeal.explanation}
                    </p>
                  </div>

                  {/* LOBBY URL */}
                  <div className="mt-4">
                    <p className="text-sm font-semibold text-[#d77a88]">
                      Lobby URL
                    </p>

                    <a
                      href={appeal.lobby_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-block break-all text-sm text-blue-400 underline"
                    >
                      Open Lobby Link
                    </a>
                  </div>

                  {/* VIDEO PROOF */}
                  <div className="mt-5">
                    <p className="mb-3 text-sm font-semibold text-[#d77a88]">
                      Video Proof
                    </p>

                    {appeal.videoUrl ? (
                      <video
                        controls
                        preload="metadata"
                        className="max-h-[420px] w-full rounded-lg bg-black"
                        src={appeal.videoUrl}
                      >
                        Your browser does not support video playback.
                      </video>
                    ) : (
                      <p className="rounded-lg bg-[#201d1d] p-4 text-sm text-yellow-400">
                        Video could not be loaded. Refresh or check Storage permissions.
                      </p>
                    )}
                  </div>

                  {/* ADMIN RESPONSE */}
                  {appeal.admin_response && (
                    <div className="mt-4 rounded-lg bg-[#201d1d] p-4">
                      <p className="text-sm font-semibold text-white">
                        Admin Response
                      </p>
                      <p className="mt-2 text-sm text-[#a69e98]">
                        {appeal.admin_response}
                      </p>
                    </div>
                  )}

                  {/* REVIEW */}
                  {isPending && (
                    <div className="mt-5 border-t border-white/10 pt-5">
                      <label className="mb-2 block text-sm text-[#c2bab4]">
                        Admin Response
                        <span className="text-[#89817c]">
                          {" "} (Required for rejection)
                        </span>
                      </label>

                      <textarea
                        rows={3}
                        value={responses[appeal.id] || ""}
                        onChange={(e) =>
                          setResponses((previous) => ({
                            ...previous,
                            [appeal.id]: e.target.value,
                          }))
                        }
                        placeholder="Enter verification notes or rejection reason..."
                        className="w-full rounded-lg border border-white/10 bg-[#201d1d] p-3 text-sm text-white"
                      />

                      <div className="mt-4 flex flex-wrap gap-3">
                        <button
                          onClick={() =>
                            handleReview(appeal, "approved")
                          }
                          disabled={busy || !appeal.videoUrl}
                          className="rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          {busy ? "Processing..." : "Approve Appeal"}
                        </button>

                        <button
                          onClick={() =>
                            handleReview(appeal, "rejected")
                          }
                          disabled={busy}
                          className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          Reject Appeal
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
