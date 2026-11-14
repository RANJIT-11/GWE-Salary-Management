
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const BUCKET_NAME = "WORK PROOFS";

const formatMoney = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

const formatDate = (value) => {
  if (!value) return "—";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN");
};

const formatDateTime = (value) => {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN");
};

const formatTime = (value) => {
  if (!value) return "—";
  return String(value).slice(0, 5);
};

const statusStyle = (status) => {
  switch (String(status || "").toLowerCase()) {
    case "approved":
      return "bg-green-400/10 text-green-300";
    case "rejected":
      return "bg-red-400/10 text-red-300";
    case "pending":
      return "bg-yellow-400/10 text-yellow-300";
    default:
      return "bg-white/10 text-gray-300";
  }
};

export default function WorkerDetails({ worker, onClose }) {
  const [work, setWork] = useState([]);
  const [penalties, setPenalties] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDetails = useCallback(async () => {
    if (!worker?.id) return;

    setLoading(true);
    setError("");

    try {
      const [
        { data: workData, error: workError },
        { data: penaltyData, error: penaltyError },
        { data: paymentData, error: paymentError },
      ] = await Promise.all([
        supabase
          .from("work_submissions")
          .select("*")
          .eq("user_id", worker.id)
          .order("lobby_date", { ascending: false })
          .order("created_at", { ascending: false }),

        supabase
          .from("penalties")
          .select("*")
          .eq("user_id", worker.id)
          .order("created_at", { ascending: false }),

        supabase
          .from("payments")
          .select("*")
          .eq("user_id", worker.id)
          .order("payment_date", { ascending: false }),
      ]);

      if (workError) throw workError;
      if (penaltyError) throw penaltyError;
      if (paymentError) throw paymentError;

      // Generate temporary signed URLs for video proofs.
      const workWithVideos = await Promise.all(
        (workData || []).map(async (item) => {
          if (!item.video_url) {
            return { ...item, video_signed_url: null };
          }

          const { data, error: videoError } = await supabase.storage
            .from(BUCKET_NAME)
            .createSignedUrl(item.video_url, 300);

          if (videoError) {
            console.error("Video URL error:", videoError);
          }

          return {
            ...item,
            video_signed_url: videoError ? null : data?.signedUrl || null,
          };
        })
      );

      setWork(workWithVideos);
      setPenalties(penaltyData || []);
      setPayments(paymentData || []);
    } catch (err) {
      console.error("Worker details error:", err);
      setError(err.message || "Unable to load worker details.");
    } finally {
      setLoading(false);
    }
  }, [worker?.id]);

  useEffect(() => {
    loadDetails();
  }, [loadDetails]);

  const totalEarned = work
    .filter((item) => item.status === "approved")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);

  const totalPenalties = penalties
    .filter((item) => item.status === "active")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);

  const totalPaid = payments.reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0
  );

  const pendingSalary = totalEarned - totalPenalties - totalPaid;

  if (!worker) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-3 sm:p-6">
      <div className="mx-auto my-4 max-w-7xl rounded-2xl border border-white/10 bg-[#171515] p-5 text-[#f5eee5] shadow-2xl sm:p-7">

        {/* HEADER */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#a9a09a]">
              Worker Management
            </p>

            <h2 className="mt-2 text-2xl font-semibold">
              {worker.full_name || worker.username}
            </h2>

            <p className="mt-1 text-sm text-[#89817c]">
              @{worker.username}
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={loadDetails}
              disabled={loading}
              className="rounded-lg border border-white/10 px-3 py-2 text-sm hover:bg-white/5 disabled:opacity-50"
            >
              Refresh
            </button>

            <button
              onClick={onClose}
              className="rounded-lg border border-white/10 px-3 py-2 text-sm hover:bg-white/5"
            >
              Close
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-5 rounded-lg bg-red-400/10 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-20 text-center text-[#89817c]">
            Loading worker details...
          </div>
        ) : (
          <>
            {/* PROFILE */}
            <section className="mt-7 rounded-xl border border-white/10 bg-[#201d1d] p-5">
              <h3 className="font-semibold">Profile Details</h3>

              <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <p className="text-xs text-[#89817c]">Username</p>
                  <p className="mt-1">@{worker.username}</p>
                </div>

                <div>
                  <p className="text-xs text-[#89817c]">Role</p>
                  <p className="mt-1 capitalize">{worker.role}</p>
                </div>

                <div>
                  <p className="text-xs text-[#89817c]">Account Status</p>
                  <p className={`mt-1 ${worker.is_active ? "text-green-300" : "text-red-300"}`}>
                    {worker.is_active ? "Active" : "Inactive"}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-[#89817c]">Joining Date</p>
                  <p className="mt-1">
                    {worker.created_at
                      ? new Date(worker.created_at).toLocaleDateString("en-IN")
                      : "—"}
                  </p>
                </div>
              </div>
            </section>

            {/* SALARY SUMMARY */}
            <section className="mt-6">
              <h3 className="mb-4 font-semibold">Salary Summary</h3>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ["Total Earned", totalEarned, "text-green-300"],
                  ["Active Penalties", totalPenalties, "text-red-300"],
                  ["Total Paid", totalPaid, "text-blue-300"],
                  ["Pending Salary", pendingSalary, "text-[#d77a88]"],
                ].map(([label, value, color]) => (
                  <div
                    key={label}
                    className="rounded-xl border border-white/10 bg-[#201d1d] p-5"
                  >
                    <p className="text-sm text-[#aaa29c]">{label}</p>
                    <p className={`mt-3 text-2xl font-semibold ${color}`}>
                      {formatMoney(value)}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* COMPLETE WORK HISTORY */}
            <section className="mt-7 rounded-xl border border-white/10 bg-[#201d1d]">
              <div className="border-b border-white/[0.07] p-5">
                <h3 className="font-semibold">
                  Complete Work History ({work.length})
                </h3>
                <p className="mt-1 text-xs text-[#89817c]">
                  All submitted work including pending, approved and rejected entries.
                </p>
              </div>

              {work.length === 0 ? (
                <div className="p-8 text-center text-[#89817c]">
                  No work history found.
                </div>
              ) : (
                <div className="space-y-4 p-4 sm:p-5">
                  {work.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-white/10 bg-[#171515] p-4 sm:p-5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">
                            {item.work_type || "Work"}{" "}
                            <span className="text-[#89817c]">/</span>{" "}
                            {item.match_type || "—"}
                          </p>

                          <p className="mt-1 text-xs text-[#89817c]">
                            Lobby Date: {formatDate(item.lobby_date)}
                          </p>
                        </div>

                        <span className={`rounded-full px-3 py-1 text-xs capitalize ${statusStyle(item.status)}`}>
                          {item.status || "Unknown"}
                        </span>
                      </div>

                      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <div>
                          <p className="text-xs text-[#89817c]">Start Time</p>
                          <p className="mt-1">{formatTime(item.lobby_start_time)}</p>
                        </div>

                        <div>
                          <p className="text-xs text-[#89817c]">End Time</p>
                          <p className="mt-1">{formatTime(item.lobby_end_time)}</p>
                        </div>

                        <div>
                          <p className="text-xs text-[#89817c]">Salary Amount</p>
                          <p className="mt-1 font-semibold text-green-300">
                            {formatMoney(item.amount)}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs text-[#89817c]">Submitted On</p>
                          <p className="mt-1 text-sm">
                            {formatDateTime(item.created_at)}
                          </p>
                        </div>
                      </div>

                      {item.rejection_reason && (
                        <div className="mt-4 rounded-lg bg-red-400/10 p-3">
                          <p className="text-xs text-red-300">Rejection Reason</p>
                          <p className="mt-1 text-sm text-red-200">
                            {item.rejection_reason}
                          </p>
                        </div>
                      )}

                      <div className="mt-5 flex flex-wrap gap-3 border-t border-white/[0.07] pt-4">
                        {item.lobby_url ? (
                          <a
                            href={item.lobby_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-lg border border-blue-400/30 px-4 py-2 text-sm text-blue-300 hover:bg-blue-400/10"
                          >
                            View Lobby
                          </a>
                        ) : (
                          <span className="text-sm text-[#89817c]">
                            Lobby URL not provided
                          </span>
                        )}

                        {item.video_signed_url ? (
                          <a
                            href={item.video_signed_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-lg border border-green-400/30 px-4 py-2 text-sm text-green-300 hover:bg-green-400/10"
                          >
                            View Video Proof
                          </a>
                        ) : item.video_url ? (
                          <span className="text-sm text-yellow-300">
                            Video proof unavailable
                          </span>
                        ) : (
                          <span className="text-sm text-[#89817c]">
                            No video uploaded
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* PENALTY HISTORY */}
            <section className="mt-6 rounded-xl border border-white/10 bg-[#201d1d]">
              <div className="border-b border-white/[0.07] p-5">
                <h3 className="font-semibold">
                  Penalty History ({penalties.length})
                </h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[650px] text-left text-sm">
                  <thead className="bg-white/[0.025] text-xs text-[#89817c]">
                    <tr>
                      <th className="p-4">Date</th>
                      <th className="p-4">Reason</th>
                      <th className="p-4">Amount</th>
                      <th className="p-4">Status</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-white/[0.06]">
                    {penalties.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-[#89817c]">
                          No penalties found.
                        </td>
                      </tr>
                    ) : (
                      penalties.map((item) => (
                        <tr key={item.id}>
                          <td className="p-4">{formatDate(item.lobby_date)}</td>
                          <td className="p-4">{item.reason || "—"}</td>
                          <td className="p-4">{formatMoney(item.amount)}</td>
                          <td className={`p-4 capitalize ${item.status === "active" ? "text-red-300" : "text-green-300"}`}>
                            {item.status}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* PAYMENT HISTORY */}
            <section className="mt-6 rounded-xl border border-white/10 bg-[#201d1d]">
              <div className="border-b border-white/[0.07] p-5">
                <h3 className="font-semibold">
                  Payment History ({payments.length})
                </h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[650px] text-left text-sm">
                  <thead className="bg-white/[0.025] text-xs text-[#89817c]">
                    <tr>
                      <th className="p-4">Payment Date</th>
                      <th className="p-4">Amount</th>
                      <th className="p-4">Method</th>
                      <th className="p-4">Reference</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-white/[0.06]">
                    {payments.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-[#89817c]">
                          No payment history found.
                        </td>
                      </tr>
                    ) : (
                      payments.map((item) => (
                        <tr key={item.id}>
                          <td className="p-4">{formatDate(item.payment_date)}</td>
                          <td className="p-4">{formatMoney(item.amount)}</td>
                          <td className="p-4">{item.payment_method || "—"}</td>
                          <td className="p-4">{item.transaction_id || "—"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
