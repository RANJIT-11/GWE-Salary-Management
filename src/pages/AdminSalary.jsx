import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const formatDate = (value) => {
  if (!value) return "-";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN");
};

const today = () => {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000)
    .toISOString()
    .slice(0, 10);
};

// LocalStorage draft keys
const PAYMENT_DRAFT_KEY = "gwe_admin_salary_payment_draft";
const ADJUSTMENT_DRAFT_KEY = "gwe_admin_salary_adjustment_draft";

// Restore saved draft
const getSavedDraft = (key, fallback) => {
  try {
    const saved = localStorage.getItem(key);
    return saved ? { ...fallback, ...JSON.parse(saved) } : fallback;
  } catch (error) {
    console.error("Salary draft restore error:", error);
    return fallback;
  }
};

export default function AdminSalary() {
  const [members, setMembers] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [payments, setPayments] = useState([]);
  const [approvedWork, setApprovedWork] = useState([]);
  const [penalties, setPenalties] = useState([]);
  const [adjustments, setAdjustments] = useState([]);

  const [selectedMember, setSelectedMember] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Payment form with saved draft
  const [paymentForm, setPaymentForm] = useState(() =>
    getSavedDraft(PAYMENT_DRAFT_KEY, {
      user_id: "",
      amount: "",
      payment_date: today(),
      payment_method: "UPI",
      reference_note: "",
    })
  );

  // Salary adjustment form with saved draft
  const [adjustmentForm, setAdjustmentForm] = useState(() =>
    getSavedDraft(ADJUSTMENT_DRAFT_KEY, {
      user_id: "",
      reason: "",
    })
  );

  // Automatically save payment form
  useEffect(() => {
    try {
      localStorage.setItem(
        PAYMENT_DRAFT_KEY,
        JSON.stringify(paymentForm)
      );
    } catch (error) {
      console.error("Payment draft save error:", error);
    }
  }, [paymentForm]);

  // Automatically save adjustment form
  useEffect(() => {
    try {
      localStorage.setItem(
        ADJUSTMENT_DRAFT_KEY,
        JSON.stringify(adjustmentForm)
      );
    } catch (error) {
      console.error("Adjustment draft save error:", error);
    }
  }, [adjustmentForm]);

  // Fetch salary data
  const fetchSalaryData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [
        { data: profileData, error: profileError },
        { data: ledgerData, error: ledgerError },
        { data: paymentData, error: paymentError },
        { data: workData, error: workError },
        { data: penaltyData, error: penaltyError },
        { data: adjustmentData, error: adjustmentError },
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, username, full_name")
          .eq("role", "member")
          .order("username"),

        supabase
          .from("weekly_salary_ledger")
          .select("*")
          .order("week_start_date", { ascending: false }),

        supabase
          .from("payments")
          .select("*")
          .order("payment_date", { ascending: false }),

        supabase
          .from("work_submissions")
          .select("user_id, amount, lobby_date")
          .eq("status", "approved"),

        supabase
          .from("penalties")
          .select("id, user_id, amount, reason, lobby_date, status")
          .eq("status", "active"),

        supabase
          .from("salary_adjustments")
          .select("*")
          .order("created_at", { ascending: false }),
      ]);

      if (profileError) throw profileError;
      if (ledgerError) throw ledgerError;
      if (paymentError) throw paymentError;
      if (workError) throw workError;
      if (penaltyError) throw penaltyError;
      if (adjustmentError) throw adjustmentError;

      setMembers(profileData || []);
      setLedger(ledgerData || []);
      setPayments(paymentData || []);
      setApprovedWork(workData || []);
      setPenalties(penaltyData || []);
      setAdjustments(adjustmentData || []);

      setPaymentForm((previous) => ({
        ...previous,
        user_id:
          previous.user_id ||
          (profileData?.length === 1 ? profileData[0].id : ""),
      }));

      setAdjustmentForm((previous) => ({
        ...previous,
        user_id:
          previous.user_id ||
          (profileData?.length === 1 ? profileData[0].id : ""),
      }));
    } catch (err) {
      console.error("Admin salary error:", err);
      setError(err.message || "Unable to load salary records.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSalaryData();
  }, [fetchSalaryData]);

  // Member map
  const memberMap = useMemo(
    () => Object.fromEntries(members.map((m) => [m.id, m])),
    [members]
  );

  // Filter weekly ledger
  const filteredLedger = useMemo(
    () =>
      ledger.filter(
        (row) =>
          selectedMember === "all" ||
          row.user_id === selectedMember
      ),
    [ledger, selectedMember]
  );

  // Filter payments
  const filteredPayments = useMemo(
    () =>
      payments.filter(
        (payment) =>
          selectedMember === "all" ||
          payment.user_id === selectedMember
      ),
    [payments, selectedMember]
  );

  // Filter approved work
  const filteredWork = useMemo(
    () =>
      approvedWork.filter(
        (work) =>
          selectedMember === "all" ||
          work.user_id === selectedMember
      ),
    [approvedWork, selectedMember]
  );

  // Filter penalties
  const filteredPenalties = useMemo(
    () =>
      penalties.filter(
        (penalty) =>
          selectedMember === "all" ||
          penalty.user_id === selectedMember
      ),
    [penalties, selectedMember]
  );

  // Filter adjustments
  const filteredAdjustments = useMemo(
    () =>
      adjustments.filter(
        (adjustment) =>
          selectedMember === "all" ||
          adjustment.user_id === selectedMember
      ),
    [adjustments, selectedMember]
  );

  // Total earned
  const totalEarned = useMemo(
    () =>
      filteredWork.reduce(
        (sum, work) => sum + Number(work.amount || 0),
        0
      ),
    [filteredWork]
  );

  // Total paid
  const totalPaid = useMemo(
    () =>
      filteredPayments.reduce(
        (sum, payment) => sum + Number(payment.amount || 0),
        0
      ),
    [filteredPayments]
  );

  // Total penalties
  const totalPenalties = useMemo(
    () =>
      filteredPenalties.reduce(
        (sum, penalty) => sum + Number(penalty.amount || 0),
        0
      ),
    [filteredPenalties]
  );

  // Total adjustments
  const totalAdjustments = useMemo(
    () =>
      filteredAdjustments.reduce(
        (sum, adjustment) =>
          sum + Number(adjustment.adjustment_amount || 0),
        0
      ),
    [filteredAdjustments]
  );

  // Includes salary adjustments in current balance
  const pendingSalary =
    totalEarned - totalPenalties - totalPaid + totalAdjustments;

  // Calculate selected member balance
  const selectedMemberBalance = useCallback(
    (userId) => {
      const earned = approvedWork
        .filter((work) => work.user_id === userId)
        .reduce(
          (sum, work) => sum + Number(work.amount || 0),
          0
        );

      const activePenalty = penalties
        .filter((penalty) => penalty.user_id === userId)
        .reduce(
          (sum, penalty) => sum + Number(penalty.amount || 0),
          0
        );

      const paid = payments
        .filter((payment) => payment.user_id === userId)
        .reduce(
          (sum, payment) => sum + Number(payment.amount || 0),
          0
        );

      const adjustmentTotal = adjustments
        .filter((item) => item.user_id === userId)
        .reduce(
          (sum, item) => sum + Number(item.adjustment_amount || 0),
          0
        );

      return earned - activePenalty - paid + adjustmentTotal;
    },
    [approvedWork, penalties, payments, adjustments]
  );

  const selectedBalance = paymentForm.user_id
    ? selectedMemberBalance(paymentForm.user_id)
    : 0;

  const adjustmentBalance = adjustmentForm.user_id
    ? selectedMemberBalance(adjustmentForm.user_id)
    : 0;

  // Set current pending salary to zero
  const handleSalaryZero = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!adjustmentForm.user_id) {
      setError("Please select a member.");
      return;
    }

    if (adjustmentForm.reason.trim().length < 5) {
      setError("Please enter a reason of at least 5 characters.");
      return;
    }

    if (adjustmentBalance === 0) {
      setError("This member's current balance is already ₹0.");
      return;
    }

    const username =
      memberMap[adjustmentForm.user_id]?.username || "this member";

    const confirmed = window.confirm(
      `Set ${username}'s current pending salary from ${money(
        adjustmentBalance
      )} to ₹0?\n\nThis action will be recorded in adjustment history.`
    );

    if (!confirmed) return;

    setAdjusting(true);

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "set_member_salary_zero",
        {
          p_user_id: adjustmentForm.user_id,
          p_reason: adjustmentForm.reason.trim(),
        }
      );

      if (rpcError) throw rpcError;

      setMessage(
        `Salary balance for ${username} has been adjusted to ₹0. Adjustment ID: ${data}`
      );

      setAdjustmentForm((previous) => ({
        ...previous,
        reason: "",
      }));

      await fetchSalaryData();
    } catch (err) {
      console.error("Salary adjustment error:", err);
      setError(err.message || "Unable to adjust salary.");
    } finally {
      setAdjusting(false);
    }
  };

  // Record member payment
  const handlePayment = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");

    const amount = Number(paymentForm.amount);

    if (!paymentForm.user_id) {
      setError("Please select a member.");
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid payment amount.");
      return;
    }

    if (selectedBalance < 150) {
      setError("Minimum outstanding salary of ₹150 is required.");
      return;
    }

    if (amount > selectedBalance) {
      setError("Payment cannot exceed the outstanding salary.");
      return;
    }

    if (paymentForm.payment_date > today()) {
      setError("Future payment dates are not allowed.");
      return;
    }

    const confirmed = window.confirm(
      `Record payment of ${money(amount)} for ${
        memberMap[paymentForm.user_id]?.username || "this member"
      }?`
    );

    if (!confirmed) return;

    setSaving(true);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!user) throw new Error("Please sign in again.");

      const { error: insertError } = await supabase
        .from("payments")
        .insert({
          user_id: paymentForm.user_id,
          amount,
          payment_date: paymentForm.payment_date,
          payment_method: paymentForm.payment_method,
          reference_note: paymentForm.reference_note.trim() || null,
          recorded_by: user.id,
        });

      if (insertError) throw insertError;

      setMessage("Payment recorded successfully.");

      setPaymentForm((previous) => ({
        ...previous,
        amount: "",
        reference_note: "",
        payment_date: today(),
      }));

      await fetchSalaryData();
    } catch (err) {
      console.error("Payment error:", err);
      setError(err.message || "Unable to record payment.");
    } finally {
      setSaving(false);
    }
  };

  // Get weekly penalty
  const getWeeklyPenalty = (row) =>
    penalties
      .filter(
        (penalty) =>
          penalty.user_id === row.user_id &&
          penalty.lobby_date >= row.week_start_date &&
          penalty.lobby_date <= row.week_end_date
      )
      .reduce(
        (sum, penalty) => sum + Number(penalty.amount || 0),
        0
      );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            Salary Management
          </h1>
          <p className="mt-2 text-sm text-[#89817c]">
            Manage member earnings, weekly balances and payments.
          </p>
        </div>

        <button
          onClick={fetchSalaryData}
          disabled={loading}
          className="rounded-lg border border-white/10 px-4 py-2 text-sm hover:bg-white/5 disabled:opacity-50"
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {message && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-sm text-green-300">
          {message}
        </div>
      )}

      {/* MEMBER FILTER */}
      <div className="rounded-xl border border-white/10 bg-[#201d1d] p-4">
        <label className="mb-2 block text-sm text-[#89817c]">
          Filter by member
        </label>

        <select
          value={selectedMember}
          onChange={(e) => setSelectedMember(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-[#171515] px-3 py-3 text-sm sm:max-w-sm"
        >
          <option value="all">All Members</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.username}
            </option>
          ))}
        </select>
      </div>

      {/* SALARY SUMMARY */}
      <div className="grid gap-4 sm:grid-cols-5">
        <div className="rounded-xl border border-white/10 bg-[#201d1d] p-5">
          <p className="text-sm text-[#89817c]">Total Earned</p>
          <p className="mt-2 text-2xl font-semibold text-green-400">
            {money(totalEarned)}
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#201d1d] p-5">
          <p className="text-sm text-[#89817c]">Total Paid</p>
          <p className="mt-2 text-2xl font-semibold text-blue-400">
            {money(totalPaid)}
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#201d1d] p-5">
          <p className="text-sm text-[#89817c]">Active Penalties</p>
          <p className="mt-2 text-2xl font-semibold text-red-400">
            {money(totalPenalties)}
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#201d1d] p-5">
          <p className="text-sm text-[#89817c]">Adjustments</p>
          <p className="mt-2 text-2xl font-semibold text-purple-400">
            {money(totalAdjustments)}
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#201d1d] p-5">
          <p className="text-sm text-[#89817c]">Pending Salary</p>
          <p
            className={`mt-2 text-2xl font-semibold ${
              pendingSalary < 0
                ? "text-red-400"
                : "text-yellow-400"
            }`}
          >
            {money(pendingSalary)}
          </p>
        </div>
      </div>

      {/* SET SALARY TO ZERO */}
      <div className="rounded-xl border border-red-500/20 bg-[#201d1d] p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-red-300">
          Salary Adjustment
        </h2>

        <p className="mt-1 text-sm text-[#89817c]">
          Set a member's current pending salary balance to ₹0.
          Future approved work earnings will continue normally.
        </p>

        <form onSubmit={handleSalaryZero} className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm text-[#aaa09a]">
                Select Member
              </label>

              <select
                value={adjustmentForm.user_id}
                onChange={(e) =>
                  setAdjustmentForm((previous) => ({
                    ...previous,
                    user_id: e.target.value,
                  }))
                }
                required
                className="w-full rounded-lg border border-white/10 bg-[#171515] p-3 text-sm"
              >
                <option value="">Choose member</option>

                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.username}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm text-[#aaa09a]">
                Current Pending Balance
              </label>

              <div
                className={`rounded-lg border border-white/10 bg-[#171515] p-3 font-semibold ${
                  adjustmentBalance < 0
                    ? "text-red-400"
                    : "text-yellow-400"
                }`}
              >
                {money(adjustmentBalance)}
              </div>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm text-[#aaa09a]">
              Reason (Required)
            </label>

            <textarea
              value={adjustmentForm.reason}
              onChange={(e) =>
                setAdjustmentForm((previous) => ({
                  ...previous,
                  reason: e.target.value,
                }))
              }
              required
              minLength={5}
              maxLength={500}
              rows={3}
              placeholder="Enter reason for setting salary to zero..."
              className="w-full rounded-lg border border-white/10 bg-[#171515] p-3 text-sm outline-none focus:border-red-500/50"
            />
          </div>

          <button
            type="submit"
            disabled={
              adjusting ||
              loading ||
              !adjustmentForm.user_id ||
              adjustmentBalance === 0 ||
              adjustmentForm.reason.trim().length < 5
            }
            className="rounded-lg bg-red-700 px-6 py-3 text-sm font-semibold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {adjusting ? "Adjusting Salary..." : "Set Salary to ₹0"}
          </button>
        </form>
      </div>

      {/* SALARY ADJUSTMENT HISTORY */}
      <div className="overflow-hidden rounded-xl border border-white/10 bg-[#201d1d]">
        <div className="border-b border-white/10 p-5">
          <h2 className="text-lg font-semibold">
            Salary Adjustment History
          </h2>

          <p className="mt-1 text-sm text-[#89817c]">
            Records of all salary adjustments.
          </p>
        </div>

        {loading ? (
          <p className="p-8 text-center text-[#89817c]">
            Loading...
          </p>
        ) : filteredAdjustments.length === 0 ? (
          <p className="p-8 text-center text-[#89817c]">
            No salary adjustments recorded yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="bg-[#171515] text-[#aaa09a]">
                <tr>
                  <th className="p-4">Member</th>
                  <th className="p-4">Date</th>
                  <th className="p-4">Before</th>
                  <th className="p-4">Adjustment</th>
                  <th className="p-4">After</th>
                  <th className="p-4">Reason</th>
                </tr>
              </thead>

              <tbody>
                {filteredAdjustments.map((item) => (
                  <tr key={item.id} className="border-t border-white/10">
                    <td className="p-4 font-medium">
                      {memberMap[item.user_id]?.username || "Unknown"}
                    </td>

                    <td className="whitespace-nowrap p-4">
                      {formatDate(item.effective_date)}
                    </td>

                    <td className="p-4">
                      {money(item.balance_before)}
                    </td>

                    <td className="p-4 text-purple-400">
                      {money(item.adjustment_amount)}
                    </td>

                    <td className="p-4 font-semibold text-green-400">
                      {money(item.balance_after)}
                    </td>

                    <td className="max-w-xs whitespace-normal p-4 text-[#aaa09a]">
                      {item.reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* RECORD PAYMENT */}
      <div className="rounded-xl border border-white/10 bg-[#201d1d] p-5 sm:p-6">
        <h2 className="text-lg font-semibold">
          Record Member Payment
        </h2>

        <p className="mt-1 text-sm text-[#89817c]">
          Minimum outstanding balance required: ₹150.
        </p>

        <form onSubmit={handlePayment} className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm text-[#aaa09a]">
                Select Member
              </label>

              <select
                value={paymentForm.user_id}
                onChange={(e) =>
                  setPaymentForm((previous) => ({
                    ...previous,
                    user_id: e.target.value,
                  }))
                }
                required
                className="w-full rounded-lg border border-white/10 bg-[#171515] p-3 text-sm"
              >
                <option value="">Choose member</option>

                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.username}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm text-[#aaa09a]">
                Available Balance
              </label>

              <div
                className={`rounded-lg border border-white/10 bg-[#171515] p-3 font-semibold ${
                  selectedBalance < 0
                    ? "text-red-400"
                    : "text-yellow-400"
                }`}
              >
                {money(selectedBalance)}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm text-[#aaa09a]">
                Payment Amount (₹)
              </label>

              <input
                type="number"
                min="0.01"
                step="0.01"
                max={Math.max(0, selectedBalance)}
                value={paymentForm.amount}
                onChange={(e) =>
                  setPaymentForm((previous) => ({
                    ...previous,
                    amount: e.target.value,
                  }))
                }
                required
                placeholder="Enter amount"
                className="w-full rounded-lg border border-white/10 bg-[#171515] p-3 text-sm"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-[#aaa09a]">
                Actual Payment Date
              </label>

              <input
                type="date"
                max={today()}
                value={paymentForm.payment_date}
                onChange={(e) =>
                  setPaymentForm((previous) => ({
                    ...previous,
                    payment_date: e.target.value,
                  }))
                }
                required
                className="w-full rounded-lg border border-white/10 bg-[#171515] p-3 text-sm"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-[#aaa09a]">
                Payment Method
              </label>

              <select
                value={paymentForm.payment_method}
                onChange={(e) =>
                  setPaymentForm((previous) => ({
                    ...previous,
                    payment_method: e.target.value,
                  }))
                }
                className="w-full rounded-lg border border-white/10 bg-[#171515] p-3 text-sm"
              >
                <option value="UPI">UPI</option>
                <option value="Bank">Bank Transfer</option>
                <option value="Cash">Cash</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm text-[#aaa09a]">
                Transaction ID / Reference
              </label>

              <input
                type="text"
                value={paymentForm.reference_note}
                onChange={(e) =>
                  setPaymentForm((previous) => ({
                    ...previous,
                    reference_note: e.target.value,
                  }))
                }
                placeholder="Optional reference"
                className="w-full rounded-lg border border-white/10 bg-[#171515] p-3 text-sm"
              />
            </div>
          </div>

          {selectedBalance < 150 && (
            <p className="text-sm text-yellow-400">
              {selectedBalance < 0
                ? `Payment unavailable. This member has a negative balance of ${money(
                    Math.abs(selectedBalance)
                  )}.`
                : "Payment unavailable. This member needs at least ₹150 outstanding salary."}
            </p>
          )}

          <button
            type="submit"
            disabled={
              saving ||
              loading ||
              !paymentForm.user_id ||
              selectedBalance < 150
            }
            className="rounded-lg bg-green-600 px-6 py-3 text-sm font-semibold hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Recording Payment..." : "Record Payment"}
          </button>
        </form>
      </div>

      {/* WEEKLY LEDGER */}
      <div className="overflow-hidden rounded-xl border border-white/10 bg-[#201d1d]">
        <div className="border-b border-white/10 p-5">
          <h2 className="text-lg font-semibold">
            Weekly Salary Ledger
          </h2>

          <p className="mt-1 text-sm text-[#89817c]">
            Monday to Sunday salary records.
          </p>
        </div>

        {loading ? (
          <p className="p-8 text-center text-[#89817c]">
            Loading...
          </p>
        ) : filteredLedger.length === 0 ? (
          <p className="p-8 text-center text-[#89817c]">
            No weekly salary records found.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] text-left text-sm">
              <thead className="bg-[#171515] text-[#aaa09a]">
                <tr>
                  <th className="p-4">Member</th>
                  <th className="p-4">Week</th>
                  <th className="p-4">Opening</th>
                  <th className="p-4">Earned</th>
                  <th className="p-4">Penalties</th>
                  <th className="p-4">Paid</th>
                  <th className="p-4">Closing</th>
                </tr>
              </thead>

              <tbody>
                {filteredLedger.map((row) => {
                  const weeklyPenalty = getWeeklyPenalty(row);

                  return (
                    <tr key={row.id} className="border-t border-white/10">
                      <td className="p-4 font-medium">
                        {memberMap[row.user_id]?.username || "Unknown"}
                      </td>

                      <td className="whitespace-nowrap p-4">
                        {formatDate(row.week_start_date)} to{" "}
                        {formatDate(row.week_end_date)}
                      </td>

                      <td className="p-4">
                        {money(row.opening_balance)}
                      </td>

                      <td className="p-4 text-green-400">
                        {money(row.approved_earnings)}
                      </td>

                      <td className="p-4 text-red-400">
                        {money(weeklyPenalty)}
                      </td>

                      <td className="p-4 text-blue-400">
                        {money(row.payments_made)}
                      </td>

                      <td
                        className={`p-4 font-semibold ${
                          Number(row.closing_balance) < 0
                            ? "text-red-400"
                            : "text-yellow-400"
                        }`}
                      >
                        {money(row.closing_balance)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* PAYMENT HISTORY */}
      <div className="overflow-hidden rounded-xl border border-white/10 bg-[#201d1d]">
        <div className="border-b border-white/10 p-5">
          <h2 className="text-lg font-semibold">Payment History</h2>

          <p className="mt-1 text-sm text-[#89817c]">
            All recorded member payments.
          </p>
        </div>

        {loading ? (
          <p className="p-8 text-center text-[#89817c]">
            Loading payment history...
          </p>
        ) : filteredPayments.length === 0 ? (
          <p className="p-8 text-center text-[#89817c]">
            No payments recorded yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[750px] text-left text-sm">
              <thead className="bg-[#171515] text-[#aaa09a]">
                <tr>
                  <th className="p-4">Member</th>
                  <th className="p-4">Date Paid</th>
                  <th className="p-4">Amount</th>
                  <th className="p-4">Method</th>
                  <th className="p-4">Reference</th>
                </tr>
              </thead>

              <tbody>
                {filteredPayments.map((payment) => (
                  <tr key={payment.id} className="border-t border-white/10">
                    <td className="p-4">
                      {memberMap[payment.user_id]?.username || "Unknown"}
                    </td>

                    <td className="p-4">
                      {formatDate(payment.payment_date)}
                    </td>

                    <td className="p-4 font-semibold text-green-400">
                      {money(payment.amount)}
                    </td>

                    <td className="p-4">
                      {payment.payment_method || "-"}
                    </td>

                    <td className="p-4">
                      {payment.reference_note || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}