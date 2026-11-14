
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import WorkerDetails from "../components/WorkerDetails";

export default function Workers({ role = "admin" }) {
  const [workers, setWorkers] = useState([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const isMainAdmin = role === "main_admin";

  const loadWorkers = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, full_name, role, is_active, created_at")
        .in("role", ["member", "admin"])
        .order("created_at", { ascending: false });

      if (error) throw error;
      setWorkers(data || []);
    } catch (err) {
      setError(err.message || "Unable to load workers.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorkers();
  }, [loadWorkers]);

  async function toggleWorker(worker) {
    if (!isMainAdmin) {
      setError("Only Main Admin can change worker status.");
      return;
    }

    const action = worker.is_active ? "deactivate" : "activate";

    if (!window.confirm(
      `Are you sure you want to ${action} ${worker.username}?`
    )) return;

    setUpdatingId(worker.id);
    setError("");
    setMessage("");

    try {
      const { error } = await supabase
        .from("profiles")
        .update({ is_active: !worker.is_active })
        .eq("id", worker.id);

      if (error) throw error;

      setMessage(`${worker.username} updated successfully.`);
      await loadWorkers();
    } catch (err) {
      setError(err.message || "Unable to update worker.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function changeRole(worker) {
    if (!isMainAdmin) {
      setError("Only Main Admin can manage admin roles.");
      return;
    }

    const newRole = worker.role === "member" ? "admin" : "member";

    const actionText =
      newRole === "admin" ? "promote to Admin" : "demote to Member";

    if (!window.confirm(
      `Are you sure you want to ${actionText} ${worker.username}?`
    )) return;

    setUpdatingId(worker.id);
    setError("");
    setMessage("");

    try {
      const { error } = await supabase.rpc("manage_member_role", {
        p_user_id: worker.id,
        p_new_role: newRole,
      });

      if (error) throw error;

      setMessage(
        `${worker.username} successfully changed to ${newRole}.`
      );

      await loadWorkers();
    } catch (err) {
      setError(err.message || "Unable to change user role.");
    } finally {
      setUpdatingId(null);
    }
  }

  const filteredWorkers = workers.filter((worker) => {
    const searchText =
      `${worker.full_name || ""} ${worker.username || ""} ${worker.role}`
        .toLowerCase();

    const matchesSearch = searchText.includes(search.toLowerCase());

    const matchesRole =
      roleFilter === "all" || worker.role === roleFilter;

    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && worker.is_active) ||
      (statusFilter === "inactive" && !worker.is_active);

    const joiningDate = worker.created_at?.slice(0, 10);

    const matchesFromDate =
      !fromDate || (joiningDate && joiningDate >= fromDate);

    const matchesToDate =
      !toDate || (joiningDate && joiningDate <= toDate);

    return (
      matchesSearch &&
      matchesRole &&
      matchesStatus &&
      matchesFromDate &&
      matchesToDate
    );
  });

  function resetFilters() {
    setSearch("");
    setRoleFilter("all");
    setStatusFilter("all");
    setFromDate("");
    setToDate("");
  }

  const inputClass =
    "w-full rounded-lg border border-white/10 bg-[#171515] px-3 py-3 text-sm text-white outline-none focus:border-[#c55365]";

  return (
    <div className="mx-auto max-w-[1200px]">
      {/* HEADER */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#a9a09a]">
            Workforce management
          </p>

          <h1 className="mt-3 text-3xl font-semibold text-[#f5eee5]">
            Workers & Admins
          </h1>

          <p className="mt-2 text-sm text-[#89817c]">
            Manage GWE ESPORTS team accounts and administrator roles.
          </p>
        </div>

        <button
          onClick={loadWorkers}
          disabled={loading}
          className="rounded-lg border border-white/10 px-4 py-2 text-sm hover:bg-white/5"
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {/* SUMMARY */}
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {[
          ["Total accounts", workers.length],
          ["Active accounts", workers.filter((w) => w.is_active).length],
          ["Inactive accounts", workers.filter((w) => !w.is_active).length],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-xl border border-white/10 bg-[#201d1d] p-5"
          >
            <p className="text-sm text-[#aaa29c]">{label}</p>
            <p className="mt-3 text-3xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      {/* SEARCH AND FILTERS */}
      <section className="mt-6 rounded-xl border border-white/10 bg-[#201d1d] p-5">
        <h2 className="font-semibold">Search & Filters</h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="mb-2 block text-xs text-[#aaa29c]">
              Search worker
            </label>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or username..."
              className={inputClass}
            />
          </div>

          <div>
            <label className="mb-2 block text-xs text-[#aaa29c]">
              Filter by role
            </label>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className={inputClass}
            >
              <option value="all">All Roles</option>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-xs text-[#aaa29c]">
              Filter by status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={inputClass}
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-xs text-[#aaa29c]">
              Joining date from
            </label>
            <input
              type="date"
              value={fromDate}
              max={toDate || undefined}
              onChange={(e) => setFromDate(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className="mb-2 block text-xs text-[#aaa29c]">
              Joining date to
            </label>
            <input
              type="date"
              value={toDate}
              min={fromDate || undefined}
              onChange={(e) => setToDate(e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={resetFilters}
              className="w-full rounded-lg border border-white/10 px-4 py-3 text-sm hover:bg-white/5"
            >
              Reset Filters
            </button>
          </div>
        </div>

        <p className="mt-4 text-xs text-[#89817c]">
          Showing {filteredWorkers.length} of {workers.length} accounts.
        </p>
      </section>

      {/* MESSAGES */}
      {error && (
        <p className="mt-4 rounded-lg bg-red-400/10 p-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {message && (
        <p className="mt-4 rounded-lg bg-green-400/10 p-3 text-sm text-green-300">
          {message}
        </p>
      )}

      {/* WORKER TABLE */}
      <section className="mt-6 overflow-hidden rounded-xl border border-white/10 bg-[#201d1d]">
        <div className="border-b border-white/[0.07] p-5">
          <h2 className="font-semibold">Team accounts</h2>
          <p className="mt-1 text-xs text-[#89817c]">
            Only Main Admin can promote or demote accounts.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead className="bg-white/[0.025] text-xs text-[#88807b]">
              <tr>
                <th className="p-4">Name</th>
                <th className="p-4">Username</th>
                <th className="p-4">Role</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">View Details</th>
                <th className="p-4 text-right">Role Action</th>
                <th className="p-4 text-right">Account Action</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-white/[0.06]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-[#89817c]">
                    Loading workers...
                  </td>
                </tr>
              ) : filteredWorkers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-[#89817c]">
                    No workers found.
                  </td>
                </tr>
              ) : (
                filteredWorkers.map((worker) => (
                  <tr key={worker.id}>
                    <td className="p-4">
                      {worker.full_name || "Not provided"}
                    </td>

                    <td className="p-4 text-[#b6ada7]">
                      @{worker.username}
                    </td>

                    <td className="p-4 capitalize">
                      {worker.role.replace("_", " ")}
                    </td>

                    <td className="p-4">
                      <span
                        className={
                          worker.is_active
                            ? "text-green-300"
                            : "text-red-300"
                        }
                      >
                        {worker.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>

                    <td className="p-4 text-right">
                      <button
                        onClick={() => setSelectedWorker(worker)}
                        className="rounded-lg border border-white/10 px-3 py-2 text-xs hover:bg-white/5"
                      >
                        View Details
                      </button>
                    </td>

                    <td className="p-4 text-right">
                      {isMainAdmin ? (
                        <button
                          onClick={() => changeRole(worker)}
                          disabled={updatingId === worker.id}
                          className="rounded-lg border border-[#c55365]/40 px-3 py-2 text-xs text-[#e99aa6] hover:bg-[#c55365]/10 disabled:opacity-50"
                        >
                          {updatingId === worker.id
                            ? "Updating..."
                            : worker.role === "member"
                              ? "Promote to Admin"
                              : "Demote to Member"}
                        </button>
                      ) : (
                        <span className="text-xs text-[#77706b]">
                          View only
                        </span>
                      )}
                    </td>

                    <td className="p-4 text-right">
                      {isMainAdmin ? (
                        <button
                          onClick={() => toggleWorker(worker)}
                          disabled={updatingId === worker.id}
                          className="rounded-lg border border-white/10 px-3 py-2 text-xs hover:bg-white/5 disabled:opacity-50"
                        >
                          {updatingId === worker.id
                            ? "Updating..."
                            : worker.is_active
                              ? "Deactivate"
                              : "Activate"}
                        </button>
                      ) : (
                        <span className="text-xs text-[#77706b]">
                          View only
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* WORKER DETAILS MODAL */}
      {selectedWorker && (
        <WorkerDetails
          worker={selectedWorker}
          onClose={() => setSelectedWorker(null)}
        />
      )}
    </div>
  );
}
