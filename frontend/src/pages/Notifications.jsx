
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  clearAppealFileDraft,
  loadAppealFileDraft,
  saveAppealFileDraft,
} from "../lib/appealDraftStorage";

const BUCKET = "PENALTY APPEALS";
const APPEAL_DRAFT_KEY = "notifications-member-appeal-proof";
const APPEAL_TEXT_DRAFT_KEY = "gwe_notifications_appeal_text_draft";

function readAppealTextDraft() {
  try {
    return JSON.parse(localStorage.getItem(APPEAL_TEXT_DRAFT_KEY) || "{}");
  } catch {
    return {};
  }
}

const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

const formatDateTime = (value) => {
  if (!value) return "—";

  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [activePenaltyId, setActivePenaltyId] = useState(
    () => readAppealTextDraft().activePenaltyId || ""
  );
  const [explanation, setExplanation] = useState(
    () => readAppealTextDraft().explanation || ""
  );
  const [proofFile, setProofFile] = useState(null);

  // Keep the appeal draft if mobile Chrome reloads the page after opening Files.
  useEffect(() => {
    try {
      if (activePenaltyId || explanation) {
        localStorage.setItem(
          APPEAL_TEXT_DRAFT_KEY,
          JSON.stringify({ activePenaltyId, explanation })
        );
      } else {
        localStorage.removeItem(APPEAL_TEXT_DRAFT_KEY);
      }
    } catch (draftError) {
      console.warn("Appeal text draft could not be saved:", draftError);
    }
  }, [activePenaltyId, explanation]);

  useEffect(() => {
    let cancelled = false;
    loadAppealFileDraft(APPEAL_DRAFT_KEY)
      .then((file) => {
        if (!cancelled && file) setProofFile(file);
      })
      .catch((draftError) => {
        console.warn("Appeal proof draft could not be restored:", draftError);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!user) throw new Error("Please sign in again.");

      const { data: rows, error: notificationError } =
        await supabase
          .from("notifications")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

      if (notificationError) throw notificationError;

      const notificationRows = rows || [];

      const penaltyIds = [
        ...new Set(
          notificationRows
            .map((item) => item.related_penalty_id)
            .filter(Boolean)
        ),
      ];

      let penalties = [];
      let penaltyItems = [];
      let appeals = [];

      if (penaltyIds.length > 0) {
        const [penaltyResult, itemResult, appealResult] =
          await Promise.all([
            supabase
              .from("penalties")
              .select("*")
              .in("id", penaltyIds),

            supabase
              .from("penalty_items")
              .select(
                "id, penalty_id, option_code, description, unit_amount, quantity, total_amount, exclude_earning"
              )
              .in("penalty_id", penaltyIds),

            supabase
              .from("penalty_appeals")
              .select("id, penalty_id, status, submitted_at")
              .in("penalty_id", penaltyIds),
          ]);

        if (penaltyResult.error) throw penaltyResult.error;
        if (itemResult.error) throw itemResult.error;
        if (appealResult.error) throw appealResult.error;

        penalties = penaltyResult.data || [];
        penaltyItems = itemResult.data || [];
        appeals = appealResult.data || [];
      }

      const penaltyMap = Object.fromEntries(
        penalties.map((item) => [item.id, item])
      );

      const itemMap = {};
      penaltyItems.forEach((item) => {
        if (!itemMap[item.penalty_id]) {
          itemMap[item.penalty_id] = [];
        }

        itemMap[item.penalty_id].push(item);
      });

      const appealMap = Object.fromEntries(
        appeals.map((item) => [item.penalty_id, item])
      );

      const enriched = notificationRows.map((notification) => {
        const penaltyId = notification.related_penalty_id;

        return {
          ...notification,
          penalty: penaltyMap[penaltyId] || null,
          items: itemMap[penaltyId] || [],
          appeal: appealMap[penaltyId] || null,
        };
      });

      setNotifications(enriched);
    } catch (err) {
      console.error("Notification loading error:", err);
      setError(err.message || "Unable to load notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const markAsRead = async (notification) => {
    if (notification.read_at) return;

    setError("");

    try {
      const { error: updateError } = await supabase
        .from("notifications")
        .update({
          read_at: new Date().toISOString(),
        })
        .eq("id", notification.id)
        .is("read_at", null);

      if (updateError) throw updateError;

      setNotifications((previous) =>
        previous.map((item) =>
          item.id === notification.id
            ? { ...item, read_at: new Date().toISOString() }
            : item
        )
      );
    } catch (err) {
      setError(err.message || "Unable to mark notification as read.");
    }
  };

  const openAppealForm = (notification) => {
    setActivePenaltyId(notification.penalty.id);
    setExplanation("");
    setProofFile(null);
    clearAppealFileDraft(APPEAL_DRAFT_KEY);
    setError("");
    setSuccess("");

    markAsRead(notification);
  };

  const cancelAppeal = () => {
    setActivePenaltyId("");
    setExplanation("");
    setProofFile(null);
    clearAppealFileDraft(APPEAL_DRAFT_KEY);
    localStorage.removeItem(APPEAL_TEXT_DRAFT_KEY);
    setError("");
  };

  const submitAppeal = async (notification) => {
    setError("");
    setSuccess("");

    const penalty = notification.penalty;

    if (!penalty) {
      setError("Penalty details could not be loaded.");
      return;
    }

    if (!explanation.trim() || explanation.trim().length < 10) {
      setError("Please explain your appeal in at least 10 characters.");
      return;
    }

    if (!proofFile) {
      setError("Please attach screenshot, image, PDF or video proof.");
      return;
    }

    const allowedFile =
      proofFile.type.startsWith("image/") ||
      proofFile.type === "application/pdf" ||
      proofFile.type.startsWith("video/");

    if (!allowedFile) {
      setError("Only image, PDF and video files are allowed.");
      return;
    }

    if (
      penalty.status !== "active" ||
      !penalty.appeal_deadline ||
      new Date(penalty.appeal_deadline).getTime() < Date.now()
    ) {
      setError("The appeal deadline has expired or this penalty is inactive.");
      return;
    }

    if (notification.appeal) {
      setError("You have already submitted an appeal for this penalty.");
      return;
    }

    setSubmitting(true);

    let uploadedPath = null;

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!user) throw new Error("Please sign in again.");

      const safeName = proofFile.name
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .slice(-100);

      uploadedPath =
        `${user.id}/${penalty.id}/${Date.now()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(uploadedPath, proofFile, {
          cacheControl: "3600",
          upsert: false,
          contentType: proofFile.type,
        });

      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase
        .from("penalty_appeals")
        .insert({
          penalty_id: penalty.id,
          user_id: user.id,
          explanation: explanation.trim(),
          lobby_url: penalty.lobby_url,
          video_path: uploadedPath,
          status: "pending",
        });

      if (insertError) throw insertError;

      await markAsRead(notification);

      setSuccess(
        "Your appeal has been submitted successfully. Admin will review it."
      );

      setActivePenaltyId("");
      setExplanation("");
      setProofFile(null);
      await clearAppealFileDraft(APPEAL_DRAFT_KEY);
      localStorage.removeItem(APPEAL_TEXT_DRAFT_KEY);

      await loadNotifications();
    } catch (err) {
      console.error("Appeal submission error:", err);

      if (uploadedPath) {
        const { error: cleanupError } = await supabase.storage
          .from(BUCKET)
          .remove([uploadedPath]);

        if (cleanupError) {
          console.error("Proof cleanup error:", cleanupError);
        }
      }

      setError(
        err.message || "Unable to submit appeal. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const unreadCount = notifications.filter(
    (item) => !item.read_at
  ).length;

  return (
    <div className="mx-auto max-w-5xl space-y-6">

      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#d77a88]">
            My Notifications
          </h1>

          <p className="mt-2 text-sm text-[#89817c]">
            View penalty updates and submit appeals.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="rounded-full bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {unreadCount} Unread
          </span>

          <button
            onClick={loadNotifications}
            disabled={loading}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm hover:bg-white/5 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-green-400/20 bg-green-400/10 p-4 text-sm text-green-300">
          {success}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-white/10 bg-[#201d1d] p-10 text-center text-[#89817c]">
          Loading notifications...
        </div>
      ) : notifications.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-[#201d1d] p-10 text-center">
          <h2 className="text-lg font-semibold">No notifications</h2>
          <p className="mt-2 text-sm text-[#89817c]">
            Your penalty and account notifications will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {notifications.map((notification) => {
            const penalty = notification.penalty;
            const appeal = notification.appeal;

            const expired =
              !penalty?.appeal_deadline ||
              new Date(penalty.appeal_deadline).getTime() < Date.now();

            const canAppeal =
              notification.notification_type === "penalty" &&
              penalty?.status === "active" &&
              !expired &&
              !appeal;

            const formOpen =
              activePenaltyId === penalty?.id;

            return (
              <article
                key={notification.id}
                className={`rounded-xl border p-5 sm:p-6 ${
                  notification.read_at
                    ? "border-white/10 bg-[#201d1d]"
                    : "border-[#d77a88]/40 bg-[#201d1d]"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">
                      {notification.title}
                    </h2>

                    <p className="mt-1 text-xs text-[#89817c]">
                      {formatDateTime(notification.created_at)}
                    </p>
                  </div>

                  <span
                    className={`rounded-full px-3 py-1 text-xs ${
                      notification.read_at
                        ? "bg-white/5 text-[#89817c]"
                        : "bg-red-500/10 text-red-300"
                    }`}
                  >
                    {notification.read_at ? "Read" : "New"}
                  </span>
                </div>

                <p className="mt-4 text-sm leading-6 text-[#c2bab4]">
                  {notification.message}
                </p>

                {!notification.read_at && (
                  <button
                    type="button"
                    onClick={() => markAsRead(notification)}
                    className="mt-3 text-xs text-blue-300 hover:underline"
                  >
                    Mark as read
                  </button>
                )}

                {penalty && (
                  <div className="mt-5 rounded-xl border border-white/10 bg-[#171515] p-4">
                    <h3 className="font-semibold text-[#d77a88]">
                      Penalty Details
                    </h3>

                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div>
                        <p className="text-xs text-[#89817c]">
                          Total Penalty
                        </p>
                        <p className="mt-1 font-semibold text-red-300">
                          {money(penalty.amount)}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-[#89817c]">
                          Lobby Date
                        </p>
                        <p className="mt-1 text-sm">
                          {penalty.lobby_date || "—"}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-[#89817c]">
                          Work Type
                        </p>
                        <p className="mt-1 text-sm">
                          {penalty.work_type || "—"}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-[#89817c]">
                          Match Type
                        </p>
                        <p className="mt-1 text-sm">
                          {penalty.match_type || "—"}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4">
                      <p className="text-xs text-[#89817c]">
                        Penalty Reason
                      </p>
                      <p className="mt-1 text-sm leading-6">
                        {penalty.reason}
                      </p>
                    </div>

                    {notification.items.length > 0 && (
                      <div className="mt-5">
                        <p className="mb-2 text-sm font-semibold">
                          Penalty Breakdown
                        </p>

                        <div className="space-y-2">
                          {notification.items.map((item) => (
                            <div
                              key={item.id}
                              className="flex flex-wrap justify-between gap-2 rounded-lg bg-white/[0.03] p-3 text-sm"
                            >
                              <span>
                                {item.description} × {item.quantity}
                              </span>

                              <span className="font-medium text-red-300">
                                {money(item.total_amount)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {penalty.lobby_url && (
                      <a
                        href={penalty.lobby_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-4 inline-block text-sm text-blue-300 underline"
                      >
                        Open Lobby URL
                      </a>
                    )}

                    <div className="mt-5 border-t border-white/10 pt-4">
                      <p className="text-xs text-[#89817c]">
                        Appeal Deadline
                      </p>

                      <p className="mt-1 text-sm font-medium text-yellow-300">
                        {formatDateTime(penalty.appeal_deadline)}
                      </p>

                      {appeal ? (
                        <div className="mt-4 rounded-lg bg-white/[0.04] p-3">
                          <p className="text-sm font-medium">
                            Appeal Status
                          </p>

                          <p className="mt-1 text-sm capitalize text-yellow-300">
                            {appeal.status}
                          </p>

                          <p className="mt-1 text-xs text-[#89817c]">
                            Submitted: {formatDateTime(appeal.submitted_at)}
                          </p>
                        </div>
                      ) : penalty.status === "reversed" ? (
                        <p className="mt-3 text-sm text-green-300">
                          This penalty has already been reversed.
                        </p>
                      ) : expired ? (
                        <p className="mt-3 text-sm text-red-300">
                          Appeal deadline has expired.
                        </p>
                      ) : canAppeal && !formOpen ? (
                        <button
                          type="button"
                          onClick={() => openAppealForm(notification)}
                          className="mt-4 rounded-lg bg-[#a83245] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#bd4054]"
                        >
                          Appeal This Penalty
                        </button>
                      ) : null}
                    </div>
                  </div>
                )}

                {/* APPEAL FORM */}
                {formOpen && (
                  <div className="mt-5 rounded-xl border border-[#d77a88]/30 bg-[#171515] p-4 sm:p-5">
                    <h3 className="font-semibold text-[#d77a88]">
                      Submit Penalty Appeal
                    </h3>

                    <p className="mt-2 text-xs text-[#89817c]">
                      Explain why this particular penalty should be reviewed.
                    </p>

                    <div className="mt-4">
                      <label className="mb-2 block text-sm">
                        Your Explanation *
                      </label>

                      <textarea
                        value={explanation}
                        onChange={(e) => setExplanation(e.target.value)}
                        rows={4}
                        placeholder="Explain your issue..."
                        className="w-full rounded-lg border border-white/10 bg-[#201d1d] p-3 text-sm outline-none focus:border-[#d77a88]"
                      />
                    </div>

                    <div className="mt-4">
                      <label className="mb-2 block text-sm">
                        Upload Proof (Image / PDF / Video) *
                      </label>

                      <input
                        type="file"
                        accept="image/*,application/pdf,video/*"
                        onChange={async (e) => {
                          const file = e.target.files?.[0] || null;
                          setProofFile(file);
                          if (file) {
                            try {
                              await saveAppealFileDraft(APPEAL_DRAFT_KEY, file);
                            } catch (draftError) {
                              console.error("Could not preserve selected appeal proof:", draftError);
                              setError("Proof selected, but this browser could not save a recovery copy. Please keep this page open until submission finishes.");
                            }
                          } else {
                            await clearAppealFileDraft(APPEAL_DRAFT_KEY);
                          }
                        }}
                        className="block w-full rounded-lg border border-white/10 bg-[#201d1d] p-3 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-white"
                      />

                      {proofFile && (
                        <p className="mt-2 break-all text-xs text-green-300">
                          Selected: {proofFile.name}
                        </p>
                      )}
                    </div>

                    <div className="mt-5 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => submitAppeal(notification)}
                        disabled={submitting}
                        className="rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
                      >
                        {submitting ? "Submitting..." : "Submit Appeal"}
                      </button>

                      <button
                        type="button"
                        onClick={cancelAppeal}
                        disabled={submitting}
                        className="rounded-lg border border-white/10 px-5 py-2.5 text-sm hover:bg-white/5 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
