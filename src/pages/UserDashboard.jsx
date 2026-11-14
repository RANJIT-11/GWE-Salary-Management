
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function UserDashboard({ username }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [works, setWorks] = useState([]);

  const [stats, setStats] = useState({
    totalEarned: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    monthlyEarned: 0,
  });

  async function fetchDashboard() {
    setLoading(true);
    setError("");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) throw new Error("Please sign in again.");

      const { data, error: workError } = await supabase
        .from("work_submissions")
        .select(
          "id, lobby_date, lobby_start_time, lobby_end_time, work_type, match_type, status, amount, created_at"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (workError) throw workError;

      const submissions = data || [];

      const approved = submissions.filter(
        (work) => work.status === "approved"
      );

      const pending = submissions.filter(
        (work) => work.status === "pending"
      );

      const rejected = submissions.filter(
        (work) => work.status === "rejected"
      );

      const totalEarned = approved.reduce(
        (sum, work) => sum + Number(work.amount || 0),
        0
      );

      const currentMonth = new Date().getMonth();
      const currentYear = new Date().getFullYear();

      const monthlyEarned = approved
        .filter((work) => {
          const date = new Date(work.lobby_date + "T00:00:00");
          return (
            date.getMonth() === currentMonth &&
            date.getFullYear() === currentYear
          );
        })
        .reduce((sum, work) => sum + Number(work.amount || 0), 0);

      setStats({
        totalEarned,
        pending: pending.length,
        approved: approved.length,
        rejected: rejected.length,
        monthlyEarned,
      });

      setWorks(submissions.slice(0, 5));
    } catch (err) {
      console.error("Dashboard error:", err);
      setError(err.message || "Unable to load dashboard.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchDashboard();
  }, []);

  const formatMoney = (amount) =>
    `₹${Number(amount).toLocaleString("en-IN")}`;

  const statCards = [
    {
      label: "Pending Work",
      value: stats.pending,
      color: "text-yellow-400",
    },
    {
      label: "Approved Work",
      value: stats.approved,
      color: "text-green-400",
    },
    {
      label: "Rejected Work",
      value: stats.rejected,
      color: "text-red-400",
    },
    {
      label: "Monthly Earnings",
      value: formatMoney(stats.monthlyEarned),
      color: "text-[#e9a0ab]",
    },
  ];

  const statusStyle = {
    pending: "bg-yellow-400/10 text-yellow-400",
    approved: "bg-green-400/10 text-green-400",
    rejected: "bg-red-400/10 text-red-400",
  };

  return (
    <div className="mx-auto max-w-5xl space-y-7">

      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="break-words text-3xl font-semibold text-[#d77a88] sm:text-4xl">
            {username}
          </h1>
          <p className="mt-2 text-sm text-[#a69e98]">
            Welcome to your GWE ESPORTS dashboard.
          </p>
        </div>

        <button
          onClick={fetchDashboard}
          disabled={loading}
          className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white hover:bg-white/5 disabled:opacity-50"
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {/* TOTAL EARNINGS */}
      <section className="rounded-2xl border border-white/[0.08] bg-[#201d1d] p-6 sm:p-9">
        <p className="text-sm font-medium text-[#a69e98]">
          Total Salary Earned
        </p>

        <p className="mt-3 text-4xl font-semibold text-[#f5eee5] sm:text-5xl">
          {loading ? "..." : formatMoney(stats.totalEarned)}
          <span className="ml-2 text-lg font-medium text-[#9a918b]">
            INR
          </span>
        </p>

        <p className="mt-3 text-xs text-[#89817c]">
          Only approved work is included in your earnings.
        </p>
      </section>

      {/* STATISTICS */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-[#f5eee5]">
          Work Overview
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {statCards.map((card) => (
            <div
              key={card.label}
              className="rounded-xl border border-white/[0.08] bg-[#201d1d] p-5"
            >
              <p className="text-sm text-[#a69e98]">
                {card.label}
              </p>

              <p className={`mt-3 text-2xl font-bold ${card.color}`}>
                {loading ? "..." : card.value}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* RECENT WORK */}
      <section className="rounded-2xl border border-white/[0.08] bg-[#201d1d] p-5 sm:p-7">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-[#f5eee5]">
            Recent Work Submissions
          </h2>

          <a
            href="#work-history"
            className="text-sm text-[#e18b99] hover:underline"
          >
            View All
          </a>
        </div>

        {error && (
          <div className="rounded-lg bg-red-400/10 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <p className="py-8 text-center text-sm text-[#a69e98]">
            Loading your work...
          </p>
        ) : works.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#a69e98]">
            No work submissions found. Add your first work!
          </p>
        ) : (
          <div className="space-y-3">
            {works.map((work) => (
              <div
                key={work.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-[#171515] p-4"
              >
                <div>
                  <p className="font-semibold text-[#f5eee5]">
                    {work.work_type?.toUpperCase().replace("_", " + ")}
                    {" - "}
                    {work.match_type?.toUpperCase().replace("_", " ")}
                  </p>

                  <p className="mt-1 text-xs text-[#a69e98]">
                    {work.lobby_date} | {work.lobby_start_time} - {work.lobby_end_time}
                  </p>
                </div>

                <div className="text-right">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      statusStyle[work.status] || ""
                    }`}
                  >
                    {work.status?.toUpperCase()}
                  </span>

                  <p className="mt-2 text-sm font-semibold text-[#f5eee5]">
                    {work.status === "approved"
                      ? formatMoney(work.amount)
                      : "—"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ADD WORK */}
      <a
        href="#add-work"
        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[#a83245] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#b93c50]"
      >
        <span className="text-lg">+</span>
        Add New Work
      </a>
    </div>
  );
}
