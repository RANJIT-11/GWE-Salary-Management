
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const summaryCards = [
  { label: "Active workers", icon: "01", type: "count" },
  { label: "Total earned salary", icon: "02", type: "money" },
  { label: "Pending salary", icon: "03", type: "money" },
  { label: "Cleared / paid", icon: "04", type: "money" },
  { label: "Total penalties", icon: "05", type: "money" },
];

const formatMoney = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

export default function AdminDashboard({ username }) {
  const [dashboard, setDashboard] = useState({
    workers: [],
    activeWorkers: 0,
    totalEarned: 0,
    pendingSalary: 0,
    totalPaid: 0,
    totalPenalties: 0,
    totalAdjustments: 0,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async () => {
    if (!supabase) {
      setError("Supabase is not configured.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const { data: profiles, error: profileError } =
        await supabase
          .from("profiles")
          .select("id, username, full_name, role, is_active")
          .in("role", ["member", "admin"])
          .eq("is_active", true);

      if (profileError) throw profileError;

      const workers = profiles || [];
      const workerIds = workers.map((worker) => worker.id);

      if (workerIds.length === 0) {
        setDashboard({
          workers: [],
          activeWorkers: 0,
          totalEarned: 0,
          pendingSalary: 0,
          totalPaid: 0,
          totalPenalties: 0,
          totalAdjustments: 0,
        });
        return;
      }

      const [
        { data: workData, error: workError },
        { data: penaltyData, error: penaltyError },
        { data: paymentData, error: paymentError },
        { data: adjustmentData, error: adjustmentError },
      ] = await Promise.all([
        supabase
          .from("work_submissions")
          .select("user_id, amount")
          .in("user_id", workerIds)
          .eq("status", "approved"),

        supabase
          .from("penalties")
          .select("user_id, amount")
          .in("user_id", workerIds)
          .eq("status", "active"),

        supabase
          .from("payments")
          .select("user_id, amount")
          .in("user_id", workerIds),

        supabase
          .from("salary_adjustments")
          .select("user_id, adjustment_amount")
          .in("user_id", workerIds),
      ]);

      if (workError) throw workError;
      if (penaltyError) throw penaltyError;
      if (paymentError) throw paymentError;
      if (adjustmentError) throw adjustmentError;

      const earnings = {};
      const penalties = {};
      const payments = {};
      const adjustments = {};

      workerIds.forEach((id) => {
        earnings[id] = 0;
        penalties[id] = 0;
        payments[id] = 0;
        adjustments[id] = 0;
      });

      (workData || []).forEach((item) => {
        earnings[item.user_id] += Number(item.amount || 0);
      });

      (penaltyData || []).forEach((item) => {
        penalties[item.user_id] += Number(item.amount || 0);
      });

      (paymentData || []).forEach((item) => {
        payments[item.user_id] += Number(item.amount || 0);
      });

      (adjustmentData || []).forEach((item) => {
        adjustments[item.user_id] += Number(
          item.adjustment_amount || 0
        );
      });

      const workerRows = workers.map((worker) => {
        const earned = earnings[worker.id] || 0;
        const penalty = penalties[worker.id] || 0;
        const paid = payments[worker.id] || 0;
        const adjustment = adjustments[worker.id] || 0;

        return {
          id: worker.id,
          name:
            worker.full_name ||
            worker.username ||
            "Unknown worker",
          role: worker.role,
          earned,
          penalty,
          paid,
          adjustment,
          payable: earned - penalty - paid + adjustment,
        };
      });

      const totalEarned = workerRows.reduce(
        (sum, worker) => sum + worker.earned,
        0
      );

      const totalPenalties = workerRows.reduce(
        (sum, worker) => sum + worker.penalty,
        0
      );

      const totalPaid = workerRows.reduce(
        (sum, worker) => sum + worker.paid,
        0
      );

      const totalAdjustments = workerRows.reduce(
        (sum, worker) => sum + worker.adjustment,
        0
      );

      const pendingSalary =
        totalEarned -
        totalPenalties -
        totalPaid +
        totalAdjustments;

      setDashboard({
        workers: workerRows,
        activeWorkers: workerRows.filter(
          (worker) => worker.role === "member"
        ).length,
        totalEarned,
        pendingSalary,
        totalPaid,
        totalPenalties,
        totalAdjustments,
      });
    } catch (err) {
      console.error("Dashboard loading error:", err);
      setError(
        err.message || "Could not load dashboard data."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const cardValues = {
    "Active workers": dashboard.activeWorkers,
    "Total earned salary": dashboard.totalEarned,
    "Pending salary": dashboard.pendingSalary,
    "Cleared / paid": dashboard.totalPaid,
    "Total penalties": dashboard.totalPenalties,
  };

  return (
    <div className="mx-auto max-w-[1200px]">

      {/* HEADER */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-[#a9a09a]">
            Admin overview
          </p>

          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Welcome,{" "}
            <span className="text-[#d77a88]">
              {username}
            </span>
          </h1>

          <p className="mt-2 text-sm text-[#89817c]">
            Organization salary and workforce overview.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="w-fit rounded-full border border-[#278b65]/30 bg-[#278b65]/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.17em] text-[#64c79a]">
            Supabase connected
          </span>

          <button
            onClick={loadDashboard}
            disabled={loading}
            className="rounded-lg border border-white/10 px-3 py-2 text-xs text-[#d6cec8] hover:bg-white/5 disabled:opacity-50"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* ERROR MESSAGE */}
      {error && (
        <div
          className="mt-6 rounded-lg border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-300"
          role="alert"
        >
          {error}
        </div>
      )}

      {/* SUMMARY CARDS */}
      <section
        aria-label="Organization salary summary"
        className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
      >
        {summaryCards.map((card) => (
          <article
            className="rounded-xl border border-white/[0.08] bg-[#201d1d] p-5 sm:p-6"
            key={card.label}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-[#aaa29c]">
                {card.label}
              </p>

              <span className="text-[10px] font-medium tracking-[0.16em] text-[#69625e]">
                {card.icon}
              </span>
            </div>

            <p className="mt-5 text-2xl font-semibold tracking-tight text-[#f5eee5] sm:text-3xl">
              {loading
                ? "Loading..."
                : card.type === "count"
                  ? cardValues[card.label]
                  : formatMoney(cardValues[card.label])}
            </p>
          </article>
        ))}
      </section>

      {/* WORKER SALARY TABLE */}
      <section className="mt-8 overflow-hidden rounded-xl border border-white/[0.08] bg-[#201d1d]">

        <div className="flex flex-col gap-1 border-b border-white/[0.07] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 className="text-base font-semibold">
              Worker salary breakdown
            </h2>

            <p className="mt-1 text-xs text-[#89817c]">
              Approved earnings, active penalties, payments,
              salary adjustments and remaining balance.
            </p>
          </div>

          <span className="w-fit rounded-md border border-white/[0.08] px-2.5 py-1 text-[10px] font-medium text-[#89817c]">
            Live database
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-xs">

            <thead className="bg-white/[0.025] text-[10px] uppercase tracking-[0.12em] text-[#88807b]">
              <tr>
                <th className="px-6 py-3.5 font-medium">Worker</th>
                <th className="px-4 py-3.5 font-medium">Gross earned</th>
                <th className="px-4 py-3.5 font-medium">Active penalties</th>
                <th className="px-4 py-3.5 font-medium">Paid</th>
                <th className="px-4 py-3.5 font-medium">Salary adjustments</th>
                <th className="px-6 py-3.5 text-right font-medium">Payable</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-white/[0.06]">

              {loading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-12 text-center text-sm text-[#8a827d]"
                  >
                    Loading worker salary data...
                  </td>
                </tr>
              ) : dashboard.workers.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-12 text-center text-sm text-[#8a827d]"
                  >
                    No active workers found.
                  </td>
                </tr>
              ) : (
                dashboard.workers.map((worker) => (
                  <tr key={worker.id} className="hover:bg-white/[0.02]">

                    <td className="px-6 py-4">
                      <p className="font-medium text-[#f5eee5]">
                        {worker.name}
                      </p>

                      <p className="mt-1 text-[10px] uppercase text-[#89817c]">
                        {worker.role.replace("_", " ")}
                      </p>
                    </td>

                    <td className="px-4 py-4 text-[#d6cec8]">
                      {formatMoney(worker.earned)}
                    </td>

                    <td className="px-4 py-4 text-[#d6cec8]">
                      {formatMoney(worker.penalty)}
                    </td>

                    <td className="px-4 py-4 text-[#d6cec8]">
                      {formatMoney(worker.paid)}
                    </td>

                    <td className="px-4 py-4 text-[#d6cec8]">
                      {formatMoney(worker.adjustment)}
                    </td>

                    <td className="px-6 py-4 text-right font-semibold text-[#d77a88]">
                      {formatMoney(worker.payable)}
                    </td>

                  </tr>
                ))
              )}

            </tbody>
          </table>
        </div>
      </section>

      <p className="mt-4 text-xs text-[#77706b]">
        Salary figures include approved work, active penalties,
        recorded payments and salary adjustments.
      </p>

    </div>
  );
}
