
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  clearAppealFileDraft,
  loadAppealFileDraft,
  saveAppealFileDraft,
} from "../lib/appealDraftStorage";

const BUCKET = "PENALTY APPEALS";
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const APPEAL_DRAFT_KEY = "salary-member-appeal-proof";
const APPEAL_TEXT_DRAFT_KEY = "gwe_salary_appeal_text_draft";

function readAppealTextDraft() {
  try {
    return JSON.parse(localStorage.getItem(APPEAL_TEXT_DRAFT_KEY) || "{}");
  } catch {
    return {};
  }
}

const ALLOWED_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
];

const money = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;

function formatDate(value) {
  if (!value) return "-";

  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getFileExtension(file) {
  const extensions = {
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
  };

  return extensions[file.type];
}

export default function Salary() {
  const [loading, setLoading] = useState(true);
  const [savingAppeal, setSavingAppeal] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [user, setUser] = useState(null);
  const [works, setWorks] = useState([]);
  const [payments, setPayments] = useState([]);
  const [penalties, setPenalties] = useState([]);
  const [appeals, setAppeals] = useState([]);
  const [salaryLedger, setSalaryLedger] = useState([]);
  const [earningExclusions, setEarningExclusions] = useState([]);
  const [salaryAdjustments, setSalaryAdjustments] = useState([]);

  const [selectedPenalty, setSelectedPenalty] = useState(
    () => readAppealTextDraft().selectedPenalty || ""
  );
  const [explanation, setExplanation] = useState(
    () => readAppealTextDraft().explanation || ""
  );
  const [lobbyUrl, setLobbyUrl] = useState(
    () => readAppealTextDraft().lobbyUrl || ""
  );
  const [videoFile, setVideoFile] = useState(null);

  // Preserve text fields across a mobile Chrome tab reload.
  useEffect(() => {
    try {
      if (selectedPenalty || explanation || lobbyUrl) {
        localStorage.setItem(
          APPEAL_TEXT_DRAFT_KEY,
          JSON.stringify({ selectedPenalty, explanation, lobbyUrl })
        );
      } else {
        localStorage.removeItem(APPEAL_TEXT_DRAFT_KEY);
      }
    } catch (draftError) {
      console.warn("Salary appeal text draft could not be saved:", draftError);
    }
  }, [selectedPenalty, explanation, lobbyUrl]);

  useEffect(() => {
    let cancelled = false;
    loadAppealFileDraft(APPEAL_DRAFT_KEY)
      .then((file) => {
        if (!cancelled && file) setVideoFile(file);
      })
      .catch((draftError) => {
        console.warn("Salary appeal proof draft could not be restored:", draftError);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchSalary = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const {
        data: { user: currentUser },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!currentUser) throw new Error("Please sign in again.");

      setUser(currentUser);

      const [
        workResult,
        paymentResult,
        penaltyResult,
        appealResult,
        ledgerResult,
        exclusionResult,
        adjustmentResult,
      ] = await Promise.all([
        supabase
          .from("work_submissions")
          .select("id, lobby_date, amount, status")
          .eq("user_id", currentUser.id)
          .eq("status", "approved")
          .order("lobby_date", { ascending: false }),

        supabase
          .from("payments")
          .select(
            "id, amount, payment_date, payment_method, reference_note, created_at"
          )
          .eq("user_id", currentUser.id)
          .order("payment_date", { ascending: false }),

        supabase
          .from("penalties")
          .select(
            "id, amount, reason, lobby_date, penalty_type, status, created_at"
          )
          .eq("user_id", currentUser.id)
          .order("created_at", { ascending: false }),

        supabase
          .from("penalty_appeals")
          .select(
            "id, penalty_id, explanation, lobby_url, status, admin_response, submitted_at, reviewed_at"
          )
          .eq("user_id", currentUser.id)
          .order("submitted_at", { ascending: false }),

        supabase
          .from("weekly_salary_ledger")
          .select(
            "id, user_id, week_start_date, week_end_date, opening_balance, approved_earnings, payments_made, closing_balance"
          )
          .eq("user_id", currentUser.id)
          .order("week_start_date", { ascending: false }),

        supabase
          .from("work_earning_exclusions")
          .select("work_submission_id, is_active")
          .eq("user_id", currentUser.id)
          .eq("is_active", true),

        supabase
          .from("salary_adjustments")
          .select("adjustment_amount, effective_date")
          .eq("user_id", currentUser.id)
          .order("effective_date", { ascending: false }),
      ]);

      if (workResult.error) throw workResult.error;
      if (paymentResult.error) throw paymentResult.error;
      if (penaltyResult.error) throw penaltyResult.error;
      if (appealResult.error) throw appealResult.error;
      if (ledgerResult.error) throw ledgerResult.error;
      if (exclusionResult.error) throw exclusionResult.error;
      if (adjustmentResult.error) throw adjustmentResult.error;

      setWorks(workResult.data || []);
      setPayments(paymentResult.data || []);
      setPenalties(penaltyResult.data || []);
      setAppeals(appealResult.data || []);
      setSalaryLedger(ledgerResult.data || []);
      setEarningExclusions(exclusionResult.data || []);
      setSalaryAdjustments(adjustmentResult.data || []);
    } catch (err) {
      console.error("Salary error:", err);
      setError(err.message || "Unable to load salary.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSalary();
  }, [fetchSalary]);

  // Excluded approved work remains in history, but does not earn salary.
  const excludedWorkIds = useMemo(
    () => new Set(earningExclusions.map((item) => item.work_submission_id)),
    [earningExclusions]
  );

  const payableWorks = useMemo(
    () => works.filter((work) => !excludedWorkIds.has(work.id)),
    [works, excludedWorkIds]
  );

  const totalEarned = useMemo(
    () =>
      payableWorks.reduce(
        (sum, work) => sum + Number(work.amount || 0),
        0
      ),
    [payableWorks]
  );

  const totalPaid = useMemo(
    () =>
      payments.reduce(
        (sum, payment) => sum + Number(payment.amount || 0),
        0
      ),
    [payments]
  );

  const activePenalties = useMemo(
    () => penalties.filter((item) => item.status === "active"),
    [penalties]
  );

  const totalActivePenalties = useMemo(
    () =>
      activePenalties.reduce(
        (sum, item) => sum + Number(item.amount || 0),
        0
      ),
    [activePenalties]
  );

  // The database weekly ledger is the source of truth for balances.
  const calculatedLedger = useMemo(() => {
    return salaryLedger.map((week) => {
      const weeklyPenalties = activePenalties
        .filter(
          (penalty) =>
            penalty.lobby_date >= week.week_start_date &&
            penalty.lobby_date <= week.week_end_date
        )
        .reduce((sum, penalty) => sum + Number(penalty.amount || 0), 0);

      const weeklyAdjustments = salaryAdjustments
        .filter(
          (adjustment) =>
            adjustment.effective_date >= week.week_start_date &&
            adjustment.effective_date <= week.week_end_date
        )
        .reduce(
          (sum, adjustment) =>
            sum + Number(adjustment.adjustment_amount || 0),
          0
        );

      return {
        ...week,
        penalties: weeklyPenalties,
        adjustments: weeklyAdjustments,
      };
    });
  }, [salaryLedger, activePenalties, salaryAdjustments]);

  // The latest database ledger row contains the actual closing balance.
  const outstandingBalance = calculatedLedger.length
    ? Number(calculatedLedger[0].closing_balance || 0)
    : 0;

  const eligible = outstandingBalance >= 150;

  const monthlyEarned = useMemo(() => {
    const now = new Date();

    return payableWorks
      .filter((work) => {
        const date = new Date(work.lobby_date + "T00:00:00");

        return (
          date.getMonth() === now.getMonth() &&
          date.getFullYear() === now.getFullYear()
        );
      })
      .reduce((sum, work) => sum + Number(work.amount || 0), 0);
  }, [payableWorks]);

  const appealMap = useMemo(
    () =>
      Object.fromEntries(
        appeals.map((appeal) => [appeal.penalty_id, appeal])
      ),
    [appeals]
  );

  const totalAdjustments = useMemo(
    () =>
      salaryAdjustments.reduce(
        (sum, item) => sum + Number(item.adjustment_amount || 0),
        0
      ),
    [salaryAdjustments]
  );

  const submitAppeal = async (e) => {
    e.preventDefault();

    setError("");
    setSuccess("");

    if (!user) {
      setError("Please sign in again.");
      return;
    }

    const penalty = activePenalties.find(
      (item) => item.id === selectedPenalty
    );

    if (!penalty) {
      setError("Please select an active penalty.");
      return;
    }

    if (!explanation.trim()) {
      setError("Please enter your explanation.");
      return;
    }

    if (!lobbyUrl.trim()) {
      setError("Please enter the lobby URL.");
      return;
    }

    try {
      new URL(lobbyUrl.trim());
    } catch {
      setError("Please enter a valid lobby URL.");
      return;
    }

    if (!videoFile) {
      setError("Please upload video proof.");
      return;
    }

    if (!ALLOWED_TYPES.includes(videoFile.type)) {
      setError("Only MP4, WebM and QuickTime videos are allowed.");
      return;
    }

    if (videoFile.size > MAX_FILE_SIZE) {
      setError("Video size cannot exceed 50 MB.");
      return;
    }

    const existingAppeal = appeals.find(
      (item) =>
        item.penalty_id === selectedPenalty &&
        item.status === "pending"
    );

    if (existingAppeal) {
      setError("An appeal is already pending for this penalty.");
      return;
    }

    const confirmed = window.confirm(
      "Are you sure you want to submit this penalty appeal?"
    );

    if (!confirmed) return;

    setSavingAppeal(true);

    let uploadedPath = "";

    try {
      const extension = getFileExtension(videoFile);
      const filePath = `${user.id}/${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(filePath, videoFile, {
          contentType: videoFile.type,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      uploadedPath = filePath;

      const { error: insertError } = await supabase
        .from("penalty_appeals")
        .insert({
          penalty_id: selectedPenalty,
          user_id: user.id,
          explanation: explanation.trim(),
          lobby_url: lobbyUrl.trim(),
          video_path: uploadedPath,
          status: "pending",
        });

      if (insertError) throw insertError;

      setSuccess(
        "Appeal submitted successfully. Admin will verify your proof."
      );

      setSelectedPenalty("");
      setExplanation("");
      setLobbyUrl("");
      setVideoFile(null);
      await clearAppealFileDraft(APPEAL_DRAFT_KEY);
      localStorage.removeItem(APPEAL_TEXT_DRAFT_KEY);

      const fileInput = document.getElementById(
        "penalty-appeal-video"
      );

      if (fileInput) fileInput.value = "";

      await fetchSalary();
    } catch (err) {
      console.error("Appeal submission error:", err);

      setError(
        err.message ||
          "Unable to submit appeal. Please try again."
      );

      if (uploadedPath) {
        console.warn(
          "Uploaded proof may remain in private storage:",
          uploadedPath
        );
      }
    } finally {
      setSavingAppeal(false);
    }
  };

  const getAppealStatus = (status) => {
    if (status === "approved") {
      return "bg-green-500/10 text-green-400";
    }

    if (status === "rejected") {
      return "bg-red-500/10 text-red-400";
    }

    return "bg-yellow-500/10 text-yellow-400";
  };

  return (
    <div className="mx-auto max-w-5xl space-y-7">

      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold text-[#d77a88]">
            My Salary
          </h1>

          <p className="mt-2 text-sm text-[#a69e98]">
            Weekly and monthly salary details.
          </p>
        </div>

        <button
          onClick={fetchSalary}
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
        <p className="py-12 text-center text-[#a69e98]">
          Loading salary details...
        </p>
      ) : (
        <>
          {/* TOTAL SALARY */}
          <section className="rounded-2xl border border-white/10 bg-[#201d1d] p-6 sm:p-8">
            <p className="text-sm text-[#a69e98]">
              Total Approved Salary
            </p>

            <h2 className="mt-3 text-4xl font-bold text-white">
              {money(totalEarned)}
            </h2>

            <p className="mt-2 text-xs text-[#89817c]">
              Approved work earnings after active no-earning exclusions.
            </p>
          </section>

          {/* SALARY CARDS */}
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-xl border border-white/10 bg-[#201d1d] p-5">
              <p className="text-sm text-[#a69e98]">Paid Salary</p>
              <h3 className="mt-3 text-2xl font-bold text-green-400">
                {money(totalPaid)}
              </h3>
            </div>

            <div className="rounded-xl border border-white/10 bg-[#201d1d] p-5">
              <p className="text-sm text-[#a69e98]">
                Active Penalties
              </p>
              <h3 className="mt-3 text-2xl font-bold text-red-400">
                {money(totalActivePenalties)}
              </h3>
            </div>

            <div className="rounded-xl border border-white/10 bg-[#201d1d] p-5">
              <p className="text-sm text-[#a69e98]">
                Outstanding Balance
              </p>
              <h3 className={`mt-3 text-2xl font-bold ${
                outstandingBalance < 0
                  ? "text-red-400"
                  : "text-yellow-400"
              }`}>
                {money(outstandingBalance)}
              </h3>
            </div>

            <div className="rounded-xl border border-white/10 bg-[#201d1d] p-5">
              <p className="text-sm text-[#a69e98]">
                This Month Earned
              </p>
              <h3 className="mt-3 text-2xl font-bold text-[#e9a0ab]">
                {money(monthlyEarned)}
              </h3>
            </div>

            <div className="rounded-xl border border-white/10 bg-[#201d1d] p-5">
              <p className="text-sm text-[#a69e98]">
                Salary Adjustments
              </p>
              <h3 className={`mt-3 text-2xl font-bold ${
                totalAdjustments < 0
                  ? "text-red-400"
                  : "text-green-400"
              }`}>
                {money(totalAdjustments)}
              </h3>
            </div>
          </section>

          {/* PAYMENT ELIGIBILITY */}
          <section className="rounded-xl border border-white/10 bg-[#201d1d] p-5">
            <h2 className="font-semibold text-white">
              Payment Eligibility
            </h2>

            <p className="mt-3 text-sm text-[#a69e98]">
              Minimum outstanding balance: ₹150
            </p>

            <p className={`mt-3 text-sm font-semibold ${
              eligible ? "text-green-400" : "text-yellow-400"
            }`}>
              {eligible
                ? "Your balance has reached ₹150 and is eligible for payment."
                : outstandingBalance < 0
                  ? `Your negative balance is ${money(Math.abs(outstandingBalance))}. Future earnings will first adjust this amount.`
                  : `${money(Math.max(0, 150 - outstandingBalance))} more needed to reach the payment threshold.`}
            </p>

            <p className="mt-2 text-xs text-[#89817c]">
              Unpaid salary carries forward. Payment is recorded only
              when Admin clears it.
            </p>
          </section>

          {/* MY PENALTIES */}
          <section className="rounded-xl border border-white/10 bg-[#201d1d] p-5 sm:p-6">
            <h2 className="mb-2 text-lg font-semibold text-white">
              My Penalties
            </h2>

            <p className="mb-5 text-xs text-[#89817c]">
              View your penalties and submit an appeal with supporting proof.
            </p>

            {penalties.length === 0 ? (
              <p className="text-sm text-[#a69e98]">
                No penalty records available.
              </p>
            ) : (
              <div className="space-y-3">
                {penalties.map((penalty) => {
                  const appeal = appealMap[penalty.id];

                  return (
                    <div
                      key={penalty.id}
                      className="rounded-xl border border-white/10 bg-[#171515] p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-white">
                            {penalty.penalty_type === "approved_lobby"
                              ? "Approved Lobby Penalty"
                              : "Incomplete Lobby Penalty"}
                          </p>

                          <p className="mt-1 text-xs text-[#89817c]">
                            Date: {formatDate(penalty.lobby_date)}
                          </p>

                          <p className="mt-2 text-sm text-[#a69e98]">
                            Reason: {penalty.reason}
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="font-bold text-red-400">
                            {money(penalty.amount)}
                          </p>

                          <span className={`mt-2 inline-block rounded-full px-3 py-1 text-xs ${
                            penalty.status === "reversed"
                              ? "bg-green-500/10 text-green-400"
                              : "bg-red-500/10 text-red-400"
                          }`}>
                            {penalty.status === "reversed"
                              ? "Reversed"
                              : "Active"}
                          </span>
                        </div>
                      </div>

                      {appeal && (
                        <div className="mt-4 border-t border-white/10 pt-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm text-[#a69e98]">
                              Appeal Status
                            </span>

                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getAppealStatus(appeal.status)}`}>
                              {appeal.status.toUpperCase()}
                            </span>
                          </div>

                          {appeal.admin_response && (
                            <p className="mt-3 text-sm text-[#a69e98]">
                              Admin Response: {appeal.admin_response}
                            </p>
                          )}

                          <p className="mt-2 text-xs text-[#89817c]">
                            Submitted: {formatDate(appeal.submitted_at?.slice(0, 10))}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* SUBMIT APPEAL */}
          {activePenalties.length > 0 && (
            <section className="rounded-xl border border-white/10 bg-[#201d1d] p-5 sm:p-6">
              <h2 className="text-lg font-semibold text-white">
                Submit Penalty Appeal
              </h2>

              <p className="mt-2 text-sm text-[#89817c]">
                If you have a valid reason, submit your explanation,
                lobby URL and video proof for Admin verification.
              </p>

              <form
                onSubmit={submitAppeal}
                className="mt-5 space-y-5"
              >
                <div>
                  <label className="mb-2 block text-sm text-[#aaa09a]">
                    Select Active Penalty *
                  </label>

                  <select
                    value={selectedPenalty}
                    onChange={(e) => setSelectedPenalty(e.target.value)}
                    required
                    className="w-full rounded-lg border border-white/10 bg-[#171515] p-3 text-sm text-white"
                  >
                    <option value="">Choose penalty</option>

                    {activePenalties.map((penalty) => {
                      const appeal = appealMap[penalty.id];

                      const hasPendingAppeal =
                        appeal?.status === "pending";

                      return (
                        <option
                          key={penalty.id}
                          value={penalty.id}
                          disabled={hasPendingAppeal}
                        >
                          {formatDate(penalty.lobby_date)} |{" "}
                          {money(penalty.amount)} |{" "}
                          {hasPendingAppeal
                            ? "Appeal Pending"
                            : "Available"}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm text-[#aaa09a]">
                    Explanation / Reason *
                  </label>

                  <textarea
                    value={explanation}
                    onChange={(e) => setExplanation(e.target.value)}
                    required
                    minLength={5}
                    rows={4}
                    placeholder="Explain why this penalty should be removed..."
                    className="w-full resize-y rounded-lg border border-white/10 bg-[#171515] p-3 text-sm text-white"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-[#aaa09a]">
                    Lobby URL *
                  </label>

                  <input
                    type="url"
                    value={lobbyUrl}
                    onChange={(e) => setLobbyUrl(e.target.value)}
                    required
                    placeholder="https://..."
                    className="w-full rounded-lg border border-white/10 bg-[#171515] p-3 text-sm text-white"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-[#aaa09a]">
                    Video Proof *
                  </label>

                  <input
                    id="penalty-appeal-video"
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime"
                    onChange={async (e) => {
                      const file = e.target.files?.[0] || null;
                      setVideoFile(file);
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
                    className="w-full rounded-lg border border-white/10 bg-[#171515] p-3 text-sm text-white file:mr-4 file:rounded-md file:border-0 file:bg-[#d77a88] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
                  />

                  <p className="mt-2 text-xs text-[#89817c]">
                    Accepted formats: MP4, WebM, MOV. Maximum size: 50 MB.
                  </p>

                  {videoFile && (
                    <p className="mt-2 text-xs text-green-400">
                      Selected: {videoFile.name} (
                      {(videoFile.size / (1024 * 1024)).toFixed(2)} MB)
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={savingAppeal || !selectedPenalty}
                  className="rounded-lg bg-red-600 px-6 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingAppeal
                    ? "Submitting Appeal..."
                    : "Submit Appeal"}
                </button>
              </form>
            </section>
          )}

          {/* WEEKLY LEDGER */}
          <section className="rounded-xl border border-white/10 bg-[#201d1d] p-5 sm:p-6">
            <h2 className="mb-2 text-lg font-semibold text-white">
              Weekly Salary Breakdown
            </h2>

            <p className="mb-5 text-xs text-[#89817c]">
              Monday to Sunday salary records.
            </p>

            {calculatedLedger.length === 0 ? (
              <p className="text-sm text-[#a69e98]">
                No weekly salary records available yet.
              </p>
            ) : (
              <div className="space-y-4">
                {calculatedLedger.map((week) => (
                  <div
                    key={week.id}
                    className="rounded-xl border border-white/10 bg-[#171515] p-4"
                  >
                    <div className="mb-4 flex flex-wrap justify-between gap-2">
                      <p className="font-semibold text-white">
                        {formatDate(week.week_start_date)} –{" "}
                        {formatDate(week.week_end_date)}
                      </p>

                      <span className="text-xs text-[#a69e98]">
                        Weekly Summary
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
                      <div>
                        <p className="text-xs text-[#89817c]">
                          Opening Balance
                        </p>
                        <p className="mt-2 font-semibold text-white">
                          {money(week.opening_balance)}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-[#89817c]">
                          Earned
                        </p>
                        <p className="mt-2 font-semibold text-green-400">
                          {money(week.approved_earnings)}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-[#89817c]">
                          Penalties
                        </p>
                        <p className="mt-2 font-semibold text-red-400">
                          {money(week.penalties)}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-[#89817c]">
                          Adjustments
                        </p>
                        <p className={`mt-2 font-semibold ${
                          Number(week.adjustments || 0) < 0
                            ? "text-red-400"
                            : "text-green-400"
                        }`}>
                          {money(week.adjustments)}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-[#89817c]">
                          Paid
                        </p>
                        <p className="mt-2 font-semibold text-blue-400">
                          {money(week.payments_made)}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-[#89817c]">
                          Closing Balance
                        </p>
                        <p className={`mt-2 font-semibold ${
                          Number(week.closing_balance) < 0
                            ? "text-red-400"
                            : "text-yellow-400"
                        }`}>
                          {money(week.closing_balance)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* WEEKLY EARNINGS */}
          <section className="rounded-xl border border-white/10 bg-[#201d1d] p-5 sm:p-6">
            <h2 className="mb-5 text-lg font-semibold text-white">
              Weekly Earnings
            </h2>

            {payableWorks.length === 0 ? (
              <p className="text-sm text-[#a69e98]">
                No payable approved work yet.
              </p>
            ) : (
              <div className="space-y-3">
                {(() => {
                  const groups = {};

                  payableWorks.forEach((work) => {
                    const date = new Date(
                      work.lobby_date + "T00:00:00"
                    );

                    const day = date.getDay();

                    date.setDate(
                      date.getDate() - (day === 0 ? 6 : day - 1)
                    );

                    const key = [
                      date.getFullYear(),
                      String(date.getMonth() + 1).padStart(2, "0"),
                      String(date.getDate()).padStart(2, "0"),
                    ].join("-");

                    if (!groups[key]) {
                      const end = new Date(date);
                      end.setDate(end.getDate() + 6);

                      groups[key] = {
                        start: date,
                        end,
                        earned: 0,
                        count: 0,
                      };
                    }

                    groups[key].earned += Number(work.amount || 0);
                    groups[key].count += 1;
                  });

                  return Object.values(groups)
                    .sort((a, b) => b.start - a.start)
                    .map((week) => (
                      <div
                        key={week.start.toISOString()}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[#171515] p-4"
                      >
                        <div>
                          <p className="font-semibold text-white">
                            {week.start.toLocaleDateString("en-IN")} –{" "}
                            {week.end.toLocaleDateString("en-IN")}
                          </p>

                          <p className="mt-1 text-xs text-[#a69e98]">
                            {week.count} approved work submissions
                          </p>
                        </div>

                        <p className="text-lg font-bold text-green-400">
                          {money(week.earned)}
                        </p>
                      </div>
                    ));
                })()}
              </div>
            )}
          </section>

          {/* PAYMENT HISTORY */}
          <section className="rounded-xl border border-white/10 bg-[#201d1d] p-5 sm:p-6">
            <h2 className="mb-5 text-lg font-semibold text-white">
              Payment History
            </h2>

            {payments.length === 0 ? (
              <p className="text-sm text-[#a69e98]">
                No payments recorded yet.
              </p>
            ) : (
              <div className="space-y-3">
                {payments.map((payment) => (
                  <div
                    key={payment.id}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-[#171515] p-4"
                  >
                    <div>
                      <p className="font-semibold text-white">
                        Payment Received
                      </p>

                      <p className="mt-1 text-xs text-[#a69e98]">
                        Date: {formatDate(payment.payment_date)}
                      </p>

                      <p className="mt-1 text-xs text-[#a69e98]">
                        Method: {payment.payment_method || "-"}
                      </p>

                      {payment.reference_note && (
                        <p className="mt-1 text-xs text-[#a69e98]">
                          Reference: {payment.reference_note}
                        </p>
                      )}
                    </div>

                    <p className="font-bold text-green-400">
                      {money(payment.amount)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
