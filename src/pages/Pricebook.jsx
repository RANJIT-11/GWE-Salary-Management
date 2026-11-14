
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const workTypes = [
  { value: "host", label: "HOST" },
  { value: "pt", label: "PT" },
  { value: "host_pt", label: "HOST + PT" },
];

const matchTypes = [
  { value: "b2b_3", label: "B2B 3" },
  { value: "b2b_4", label: "B2B 4" },
  { value: "b2b_6", label: "B2B 6" },
];

const formatDate = (date) => {
  if (!date) return "-";

  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export default function Pricebook({ role = "admin" }) {
  const [rates, setRates] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [workType, setWorkType] = useState("host");
  const [matchType, setMatchType] = useState("b2b_3");
  const [newAmount, setNewAmount] = useState("");

  const isMainAdmin = role === "main_admin";

  const tomorrow = () => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  };

  const fetchPricebook = async () => {
    setLoading(true);
    setError("");

    try {
      const [ratesResult, historyResult] = await Promise.all([
        supabase
          .from("pricebook_rates")
          .select("*")
          .order("effective_from", { ascending: false }),

        supabase
          .from("pricebook_history")
          .select("*")
          .order("changed_at", { ascending: false }),
      ]);

      if (ratesResult.error) throw ratesResult.error;
      if (historyResult.error) throw historyResult.error;

      setRates(ratesResult.data || []);
      setHistory(historyResult.data || []);
    } catch (err) {
      setError(err.message || "Unable to load Pricebook.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPricebook();
  }, []);

  const getApplicableRate = (type, match) => {
    const today = new Date().toLocaleDateString("en-CA");

    return rates
      .filter(
        (rate) =>
          rate.work_type === type &&
          rate.match_type === match &&
          rate.effective_from <= today
      )
      .sort(
        (a, b) =>
          b.effective_from.localeCompare(a.effective_from)
      )[0];
  };

  const upcomingRates = rates.filter((rate) => {
    const today = new Date().toLocaleDateString("en-CA");
    return rate.effective_from > today;
  });

  const handleUpdateRate = async (e) => {
    e.preventDefault();

    setError("");
    setMessage("");

    const amount = Number(newAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid rate greater than zero.");
      return;
    }

    if (!isMainAdmin) {
      setError("Only Main Admin can change rates.");
      return;
    }

    setSaving(true);

    try {
      const { error: rpcError } = await supabase.rpc(
        "update_pricebook_rate",
        {
          p_work_type: workType,
          p_match_type: matchType,
          p_new_amount: amount,
        }
      );

      if (rpcError) throw rpcError;

      setMessage(
        `Rate updated successfully. New rate will apply from ${tomorrow()}.`
      );

      setNewAmount("");
      await fetchPricebook();
    } catch (err) {
      setError(err.message || "Unable to update rate.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-white/10 bg-[#201d1d] p-8 text-center text-[#a29a95]">
        Loading Pricebook...
      </div>
    );
  }

  return (
    <div className="space-y-7">

      <div>
        <h1 className="text-2xl font-semibold text-white">
          Pricebook Management
        </h1>

        <p className="mt-2 text-sm text-[#918984]">
          Manage HOST, PT and HOST + PT work rates.
        </p>
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

      {/* CURRENT RATES */}
      <section className="rounded-xl border border-white/10 bg-[#201d1d] p-5">
        <h2 className="mb-5 text-lg font-semibold text-white">
          Current Pricebook
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[500px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-[#928a84]">
                <th className="px-4 py-3">Work Type</th>
                <th className="px-4 py-3">B2B 3</th>
                <th className="px-4 py-3">B2B 4</th>
                <th className="px-4 py-3">B2B 6</th>
              </tr>
            </thead>

            <tbody>
              {workTypes.map((type) => (
                <tr
                  key={type.value}
                  className="border-b border-white/[0.06]"
                >
                  <td className="px-4 py-4 font-medium text-white">
                    {type.label}
                  </td>

                  {matchTypes.map((match) => {
                    const rate = getApplicableRate(
                      type.value,
                      match.value
                    );

                    return (
                      <td
                        key={match.value}
                        className="px-4 py-4 text-[#e8b3ba]"
                      >
                        {rate
                          ? `₹${Number(rate.amount).toFixed(2)}`
                          : "Not set"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* UPDATE RATE */}
      {isMainAdmin && (
        <section className="rounded-xl border border-white/10 bg-[#201d1d] p-5">
          <h2 className="text-lg font-semibold text-white">
            Update Work Rate
          </h2>

          <p className="mb-5 mt-2 text-sm text-[#918984]">
            New rates automatically become effective from the next day.
          </p>

          <form onSubmit={handleUpdateRate} className="space-y-4">

            <div className="grid gap-4 sm:grid-cols-2">

              <div>
                <label className="mb-2 block text-sm text-[#c5bdb7]">
                  Select Work Type
                </label>

                <select
                  value={workType}
                  onChange={(e) => setWorkType(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-[#171515] px-3 py-3 text-white outline-none focus:border-[#c55365]"
                >
                  {workTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm text-[#c5bdb7]">
                  Select Match Type
                </label>

                <select
                  value={matchType}
                  onChange={(e) => setMatchType(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-[#171515] px-3 py-3 text-white outline-none focus:border-[#c55365]"
                >
                  {matchTypes.map((match) => (
                    <option key={match.value} value={match.value}>
                      {match.label}
                    </option>
                  ))}
                </select>
              </div>

            </div>

            <div>
              <label className="mb-2 block text-sm text-[#c5bdb7]">
                New Rate (₹)
              </label>

              <input
                type="number"
                min="0.01"
                step="0.01"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                placeholder="Enter new amount"
                required
                className="w-full rounded-lg border border-white/10 bg-[#171515] px-3 py-3 text-white outline-none focus:border-[#c55365]"
              />
            </div>

            <div className="rounded-lg border border-[#c55365]/20 bg-[#a83245]/10 p-4">
              <p className="text-sm text-[#e9b7bd]">
                Effective Date
              </p>

              <p className="mt-1 font-semibold text-white">
                {tomorrow()}
              </p>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[#a83245] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#bd4054] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save New Rate"}
            </button>

          </form>
        </section>
      )}

      {!isMainAdmin && (
        <div className="rounded-lg border border-white/10 bg-[#201d1d] p-4 text-sm text-[#aaa19a]">
          You have read-only access to Pricebook. Only Main Admin can update rates.
        </div>
      )}

      {/* UPCOMING RATES */}
      <section className="rounded-xl border border-white/10 bg-[#201d1d] p-5">
        <h2 className="mb-4 text-lg font-semibold text-white">
          Upcoming Scheduled Rates
        </h2>

        {upcomingRates.length === 0 ? (
          <p className="text-sm text-[#918984]">
            No upcoming rate changes scheduled.
          </p>
        ) : (
          <div className="space-y-3">
            {upcomingRates.map((rate) => (
              <div
                key={rate.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/[0.07] bg-white/[0.02] p-4"
              >
                <div>
                  <p className="font-medium text-white">
                    {rate.work_type.toUpperCase()} -{" "}
                    {rate.match_type.toUpperCase()}
                  </p>

                  <p className="mt-1 text-xs text-[#918984]">
                    Effective: {formatDate(rate.effective_from)}
                  </p>
                </div>

                <p className="font-semibold text-[#e8b3ba]">
                  ₹{Number(rate.amount).toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* PRICE HISTORY */}
      <section className="rounded-xl border border-white/10 bg-[#201d1d] p-5">
        <h2 className="mb-4 text-lg font-semibold text-white">
          Price Change History
        </h2>

        {history.length === 0 ? (
          <p className="text-sm text-[#918984]">
            No price changes recorded yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-[#928a84]">
                  <th className="px-3 py-3">Work Type</th>
                  <th className="px-3 py-3">Match</th>
                  <th className="px-3 py-3">Old Rate</th>
                  <th className="px-3 py-3">New Rate</th>
                  <th className="px-3 py-3">Changed On</th>
                  <th className="px-3 py-3">Effective From</th>
                </tr>
              </thead>

              <tbody>
                {history.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-white/[0.06] text-[#d5cdc6]"
                  >
                    <td className="px-3 py-3">
                      {item.work_type.toUpperCase()}
                    </td>

                    <td className="px-3 py-3">
                      {item.match_type.toUpperCase()}
                    </td>

                    <td className="px-3 py-3">
                      ₹{Number(item.old_amount).toFixed(2)}
                    </td>

                    <td className="px-3 py-3 text-green-300">
                      ₹{Number(item.new_amount).toFixed(2)}
                    </td>

                    <td className="px-3 py-3">
                      {new Date(item.changed_at).toLocaleDateString("en-IN")}
                    </td>

                    <td className="px-3 py-3">
                      {formatDate(item.effective_from)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

    </div>
  );
}
