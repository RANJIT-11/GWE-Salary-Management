import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

const HANDOFF_KEY = "gwe_penalty_from_work_approval";
const HANDOFF_EVENT = "gwe-open-penalty";

const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const formatDate = (value) => {
  if (!value) return "—";

  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatDateTime = (value) => {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN");
};

const formatWorkType = (value) => {
  if (!value) return "—";

  return String(value)
    .replace(/_/g, "+")
    .toUpperCase();
};

const formatMatchType = (value) => {
  if (!value) return "—";

  return String(value)
    .replace(/_/g, "")
    .toUpperCase()
    .replace("B2B", "B2B ");
};

const getSavedWork = () => {
  try {
    const saved = sessionStorage.getItem(HANDOFF_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch (error) {
    console.error("Penalty work details error:", error);
    return null;
  }
};

const getQuantityLabel = (mode) => {
  if (mode === "per_minute") return "Minutes";
  if (mode === "per_match") return "Number of Matches";
  return "Quantity";
};

export default function Penalties() {
  const [members, setMembers] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [penalties, setPenalties] = useState([]);
  const [historyItems, setHistoryItems] = useState([]);

  const [currentRole, setCurrentRole] = useState("");
  const [editingRate, setEditingRate] = useState(null);
  const [newRate, setNewRate] = useState("");
  const [rateSaving, setRateSaving] = useState(false);

  const [linkedWork, setLinkedWork] = useState(getSavedWork);

  const [selectedItems, setSelectedItems] = useState({});
  const [customIssues, setCustomIssues] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Listen for a work submission sent from Work Approvals.
  useEffect(() => {
    const handlePenaltyEvent = (event) => {
      const work = event.detail || getSavedWork();

      if (work?.id) {
        setLinkedWork(work);
        setSelectedItems({});
        setCustomIssues([]);
        setError("");
        setMessage("");
      }
    };

    window.addEventListener(HANDOFF_EVENT, handlePenaltyEvent);

    return () => {
      window.removeEventListener(HANDOFF_EVENT, handlePenaltyEvent);
    };
  }, []);

  // Fetch workers, penalty catalog and existing history.
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;

      if (user) {
        const { data: roleData, error: roleError } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();

        if (roleError) throw roleError;
        setCurrentRole(roleData?.role || "");
      } else {
        setCurrentRole("");
      }

      const [
        profileResult,
        catalogResult,
        penaltyResult,
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, username, full_name")
          .eq("role", "member")
          .order("username"),

        supabase
          .from("penalty_catalog")
          .select("*")
          .eq("is_active", true)
          .order("category")
          .order("description"),

        supabase
          .from("penalties")
          .select("*")
          .order("created_at", { ascending: false }),
      ]);

      if (profileResult.error) throw profileResult.error;
      if (catalogResult.error) throw catalogResult.error;
      if (penaltyResult.error) throw penaltyResult.error;

      const penaltyRows = penaltyResult.data || [];

      setMembers(profileResult.data || []);
      setCatalog(catalogResult.data || []);
      setPenalties(penaltyRows);

      const penaltyIds = penaltyRows.map((item) => item.id);

      if (penaltyIds.length > 0) {
        const { data, error: itemError } = await supabase
          .from("penalty_items")
          .select("*")
          .in("penalty_id", penaltyIds);

        if (itemError) throw itemError;

        setHistoryItems(data || []);
      } else {
        setHistoryItems([]);
      }
    } catch (err) {
      console.error("Penalty fetch error:", err);
      setError(err.message || "Unable to load penalty records.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const memberMap = useMemo(
    () =>
      Object.fromEntries(
        members.map((member) => [member.id, member])
      ),
    [members]
  );

  const historyItemsMap = useMemo(() => {
    const grouped = {};

    historyItems.forEach((item) => {
      if (!grouped[item.penalty_id]) {
        grouped[item.penalty_id] = [];
      }

      grouped[item.penalty_id].push(item);
    });

    return grouped;
  }, [historyItems]);

  const totalActivePenalties = penalties
    .filter((item) => item.status === "active")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);

  const incompleteCount = penalties.filter(
    (item) => item.penalty_type === "incomplete_lobby"
  ).length;

  const activeCount = penalties.filter(
    (item) => item.status === "active"
  ).length;

  // Main Admin can update penalty rates.
  const handleSaveRate = async (item) => {
    if (currentRole !== "main_admin") {
      setError("Only Main Admin can update penalty rates.");
      return;
    }

    const amount = Number(newRate);

    if (!Number.isFinite(amount) || amount < 0) {
      setError("Please enter a valid penalty amount.");
      return;
    }

    setError("");
    setMessage("");
    setRateSaving(true);

    try {
      const { error: rpcError } = await supabase.rpc(
        "update_penalty_rate",
        {
          p_option_code: item.option_code,
          p_new_amount: amount,
        }
      );

      if (rpcError) throw rpcError;

      setCatalog((previous) =>
        previous.map((catalogItem) =>
          catalogItem.option_code === item.option_code
            ? { ...catalogItem, unit_amount: amount }
            : catalogItem
        )
      );

      setEditingRate(null);
      setNewRate("");

      setMessage(
        `Rate updated successfully. ${item.description}: ${money(amount)}. The new rate will apply to future penalties.`
      );
    } catch (err) {
      console.error("Penalty rate update error:", err);
      setError(err.message || "Unable to update penalty rate.");
    } finally {
      setRateSaving(false);
    }
  };

  // Catalog selection.
  const toggleCatalogItem = (item) => {
    setSelectedItems((previous) => {
      const next = { ...previous };

      if (next[item.option_code]) {
        delete next[item.option_code];
      } else {
        next[item.option_code] = {
          quantity: 1,
        };
      }

      return next;
    });
  };

  const updateQuantity = (code, value) => {
    setSelectedItems((previous) => ({
      ...previous,
      [code]: {
        ...previous[code],
        quantity: value,
      },
    }));
  };

  // Custom issue management.
  const addCustomIssue = () => {
    setCustomIssues((previous) => [
      ...previous,
      {
        id: `${Date.now()}-${previous.length}`,
        description: "",
        unit_amount: "5",
        quantity: "1",
      },
    ]);
  };

  const updateCustomIssue = (id, field, value) => {
    setCustomIssues((previous) =>
      previous.map((item) =>
        item.id === id
          ? { ...item, [field]: value }
          : item
      )
    );
  };

  const removeCustomIssue = (id) => {
    setCustomIssues((previous) =>
      previous.filter((item) => item.id !== id)
    );
  };

  // Calculate totals before confirmation.
  const catalogTotal = catalog.reduce((sum, item) => {
    const selected = selectedItems[item.option_code];

    if (!selected) return sum;

    const quantity = Number(selected.quantity);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return sum;
    }

    return sum + Number(item.unit_amount || 0) * quantity;
  }, 0);

  const customTotal = customIssues.reduce((sum, item) => {
    const amount = Number(item.unit_amount);
    const quantity = Number(item.quantity);

    if (
      !Number.isFinite(amount) ||
      !Number.isFinite(quantity) ||
      amount <= 0 ||
      quantity <= 0
    ) {
      return sum;
    }

    return sum + amount * quantity;
  }, 0);

  const grandTotal = catalogTotal + customTotal;

  const earningExcluded = catalog.some(
    (item) =>
      selectedItems[item.option_code] &&
      item.exclude_earning
  );

  const selectedCount =
    Object.keys(selectedItems).length + customIssues.length;

  const groupOrder = ["Standard", "Main Mistakes", "Custom"];

  const groupedCatalog = groupOrder.map((category) => ({
    category,
    items: catalog.filter(
      (item) => item.category === category
    ),
  }));

  // Apply penalty and approve work in one database transaction.
  const handleApplyPenalty = async () => {
    setError("");
    setMessage("");

    if (!linkedWork?.id) {
      setError("Please open a pending lobby from Work Approvals first.");
      return;
    }

    if (selectedCount === 0) {
      setError("Please select at least one penalty option.");
      return;
    }

    const itemsPayload = [];

    for (const [code, selected] of Object.entries(selectedItems)) {
      const item = catalog.find(
        (entry) => entry.option_code === code
      );

      if (!item) {
        setError(`Penalty option not found: ${code}`);
        return;
      }

      const quantity = Number(selected.quantity);

      if (
        !Number.isFinite(quantity) ||
        quantity <= 0
      ) {
        setError(`Enter a valid quantity for ${item.description}.`);
        return;
      }

      itemsPayload.push({
        option_code: code,
        quantity,
      });
    }

    for (const item of customIssues) {
      const description = item.description.trim();
      const unitAmount = Number(item.unit_amount);
      const quantity = Number(item.quantity);

      if (description.length < 3) {
        setError("Every custom issue needs a description of at least 3 characters.");
        return;
      }

      if (
        !Number.isFinite(unitAmount) ||
        unitAmount <= 0
      ) {
        setError("Enter a valid amount for every custom issue.");
        return;
      }

      if (
        !Number.isFinite(quantity) ||
        quantity <= 0
      ) {
        setError("Enter a valid quantity for every custom issue.");
        return;
      }

      itemsPayload.push({
        option_code: "custom_issue",
        description,
        unit_amount: unitAmount,
        quantity,
      });
    }

    const earningMessage = earningExcluded
      ? "\nThis lobby's earning will be excluded."
      : "";

    const confirmed = window.confirm(
      `Apply ${money(grandTotal)} penalty to ${
        linkedWork.profile?.username || "this member"
      } and approve this work?${earningMessage}\n\nWorker will receive a notification and have 24 hours to appeal.`
    );

    if (!confirmed) return;

    setSaving(true);

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "apply_penalty_and_approve_work",
        {
          p_work_submission_id: linkedWork.id,
          p_items: itemsPayload,
        }
      );

      if (rpcError) throw rpcError;

      sessionStorage.removeItem(HANDOFF_KEY);

      setLinkedWork(null);
      setSelectedItems({});
      setCustomIssues([]);

      setMessage(
        `Penalty applied successfully. Work approved and worker notified. Penalty ID: ${data}`
      );

      await fetchData();
    } catch (err) {
      console.error("Apply penalty error:", err);
      setError(err.message || "Unable to apply penalty.");
    } finally {
      setSaving(false);
    }
  };

  const cancelLinkedWork = () => {
    const confirmed = window.confirm(
      "Cancel this penalty selection and return to Work Approvals?"
    );

    if (!confirmed) return;

    sessionStorage.removeItem(HANDOFF_KEY);
    setLinkedWork(null);
    setSelectedItems({});
    setCustomIssues([]);
    setError("");
    window.location.hash = "approvals";
  };

  return (
    <div className="space-y-6">

      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#d77a88]">
            Penalty Management
          </h1>

          <p className="mt-2 text-sm text-[#89817c]">
            Apply multiple penalties directly to a work submission.
          </p>
        </div>

        <button
          onClick={fetchData}
          disabled={loading}
          className="rounded-lg border border-white/10 px-4 py-2 text-sm hover:bg-white/5 disabled:opacity-50"
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {/* ALERTS */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {message && (
        <div className="break-words rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-sm text-green-300">
          {message}
        </div>
      )}

      {/* SUMMARY */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-[#201d1d] p-5">
          <p className="text-sm text-[#89817c]">
            Active Penalty Amount
          </p>

          <p className="mt-2 text-2xl font-semibold text-red-400">
            {money(totalActivePenalties)}
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#201d1d] p-5">
          <p className="text-sm text-[#89817c]">
            Total Penalty Records
          </p>

          <p className="mt-2 text-2xl font-semibold text-white">
            {penalties.length}
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#201d1d] p-5">
          <p className="text-sm text-[#89817c]">
            Incomplete Lobby Penalties
          </p>

          <p className="mt-2 text-2xl font-semibold text-yellow-400">
            {incompleteCount}
          </p>
        </div>
      </div>

      {/* WORK SUBMISSION */}
      <section className="rounded-xl border border-white/10 bg-[#201d1d] p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">
              Apply Penalty to Work
            </h2>

            <p className="mt-1 text-sm text-[#89817c]">
              Choose a pending work submission from Work Approvals.
            </p>
          </div>

          <a
            href="#approvals"
            className="rounded-lg border border-white/10 px-4 py-2 text-sm hover:bg-white/5"
          >
            Open Work Approvals
          </a>
        </div>

        {linkedWork ? (
          <div className="mt-5 rounded-xl border border-[#d77a88]/30 bg-[#171515] p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-[#89817c]">
                  Selected Worker
                </p>

                <h3 className="mt-1 text-xl font-semibold">
                  {linkedWork.profile?.full_name ||
                    linkedWork.profile?.username ||
                    memberMap[linkedWork.user_id]?.username ||
                    "Worker"}
                </h3>

                <p className="mt-1 text-xs text-[#89817c]">
                  @{linkedWork.profile?.username ||
                    memberMap[linkedWork.user_id]?.username ||
                    "unknown"}
                </p>
              </div>

              <span className="rounded-full bg-yellow-500/10 px-3 py-1 text-xs text-yellow-300">
                Pending Work
              </span>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <p className="text-xs text-[#89817c]">Lobby Date</p>
                <p className="mt-1">
                  {formatDate(linkedWork.lobby_date)}
                </p>
              </div>

              <div>
                <p className="text-xs text-[#89817c]">Lobby Timing</p>
                <p className="mt-1">
                  {linkedWork.lobby_start_time || "—"} -{" "}
                  {linkedWork.lobby_end_time || "—"}
                </p>
              </div>

              <div>
                <p className="text-xs text-[#89817c]">Work Type</p>
                <p className="mt-1">
                  {formatWorkType(linkedWork.work_type)}
                </p>
              </div>

              <div>
                <p className="text-xs text-[#89817c]">Match Type</p>
                <p className="mt-1">
                  {formatMatchType(linkedWork.match_type)}
                </p>
              </div>

              <div className="sm:col-span-2">
                <p className="text-xs text-[#89817c]">Lobby URL</p>

                {linkedWork.lobby_url ? (
                  <a
                    href={linkedWork.lobby_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-block break-all text-sm text-blue-400 underline"
                  >
                    Open Original Lobby
                  </a>
                ) : (
                  <p className="mt-1">—</p>
                )}
              </div>
            </div>

            <div className="mt-4 border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={cancelLinkedWork}
                disabled={saving}
                className="rounded-lg border border-white/10 px-4 py-2 text-sm text-[#c9c1bb] hover:bg-white/5 disabled:opacity-50"
              >
                Cancel Selection
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-dashed border-white/15 bg-[#171515] p-8 text-center">
            <h3 className="font-semibold text-white">
              No work submission selected
            </h3>

            <p className="mt-2 text-sm text-[#89817c]">
              Open Work Approvals and click Apply Penalty on the required worker's lobby.
            </p>
          </div>
        )}

        {/* PENALTY OPTIONS */}
        {linkedWork && (
          <div className="mt-7 space-y-6">
            <div>
              <h3 className="text-lg font-semibold">
                Select Penalty Options
              </h3>

              <p className="mt-1 text-sm text-[#89817c]">
                Select multiple issues. Enter minutes or match count wherever required.
              </p>
            </div>

            {loading ? (
              <p className="text-sm text-[#89817c]">
                Loading penalty options...
              </p>
            ) : (
              groupedCatalog.map((group) => (
                <div key={group.category}>
                  {group.items.length > 0 && (
                    <>
                      <h4 className="mb-3 font-semibold text-[#d77a88]">
                        {group.category}
                      </h4>

                      <div className="space-y-3">
                        {group.items.map((item) => {
                          const selected =
                            selectedItems[item.option_code];

                          const quantity = Number(
                            selected?.quantity || 1
                          );

                          const itemTotal =
                            selected &&
                            Number.isFinite(quantity) &&
                            quantity > 0
                              ? Number(item.unit_amount || 0) * quantity
                              : 0;

                          return (
                            <div
                              key={item.option_code}
                              className={`rounded-xl border p-4 transition ${
                                selected
                                  ? "border-[#d77a88]/50 bg-[#d77a88]/5"
                                  : "border-white/10 bg-[#171515]"
                              }`}
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(selected)}
                                    onChange={() =>
                                      toggleCatalogItem(item)
                                    }
                                    disabled={saving}
                                    className="mt-1 h-4 w-4 accent-[#d77a88]"
                                  />

                                  <span>
                                    <span className="block text-sm font-medium text-white">
                                      {item.description}
                                    </span>

                                    <span className="mt-1 block text-xs text-[#89817c]">
                                      {item.calculation_mode === "no_earning"
                                        ? "No earning for this lobby"
                                        : `${money(item.unit_amount)} per ${
                                            item.calculation_mode === "per_minute"
                                              ? "minute"
                                              : item.calculation_mode === "per_match"
                                                ? "match"
                                                : "occurrence"
                                          }`}
                                    </span>

                                    {item.exclude_earning && (
                                      <span className="mt-2 inline-block rounded-full bg-yellow-500/10 px-2 py-1 text-[10px] text-yellow-300">
                                        Lobby earning will be excluded
                                      </span>
                                    )}
                                  </span>
                                </label>

                                <div className="flex items-center gap-3">
                                  {selected && (
                                    <div className="text-right">
                                      <p className="text-xs text-[#89817c]">
                                        Deduction
                                      </p>

                                      <p className="mt-1 font-semibold text-red-300">
                                        {money(itemTotal)}
                                      </p>
                                    </div>
                                  )}

                                  {currentRole === "main_admin" && (
                                    <div className="flex flex-col items-end gap-2">
                                      {editingRate === item.option_code ? (
                                        <div className="flex flex-wrap items-center justify-end gap-2">
                                          <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={newRate}
                                            onChange={(e) =>
                                              setNewRate(e.target.value)
                                            }
                                            disabled={rateSaving}
                                            className="w-24 rounded-lg border border-white/10 bg-[#201d1d] px-2 py-1.5 text-sm text-white"
                                          />

                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleSaveRate(item)
                                            }
                                            disabled={rateSaving}
                                            className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                                          >
                                            {rateSaving ? "Saving..." : "Save Rate"}
                                          </button>

                                          <button
                                            type="button"
                                            onClick={() => {
                                              setEditingRate(null);
                                              setNewRate("");
                                            }}
                                            disabled={rateSaving}
                                            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-[#c9c1bb] hover:bg-white/5"
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setEditingRate(item.option_code);
                                            setNewRate(String(item.unit_amount ?? 0));
                                            setError("");
                                            setMessage("");
                                          }}
                                          disabled={saving || rateSaving}
                                          className="rounded-lg border border-[#d77a88]/40 px-3 py-1.5 text-xs font-medium text-[#f0b6bd] hover:bg-[#d77a88]/10 disabled:opacity-50"
                                        >
                                          Edit Rate
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {selected && (
                                <div className="mt-4 max-w-xs">
                                  <label className="mb-1 block text-xs text-[#aaa09a]">
                                    {getQuantityLabel(item.calculation_mode)}
                                  </label>

                                  <input
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={selected.quantity}
                                    disabled={
                                      saving ||
                                      item.calculation_mode === "no_earning"
                                    }
                                    onChange={(e) =>
                                      updateQuantity(
                                        item.option_code,
                                        e.target.value
                                      )
                                    }
                                    className="w-full rounded-lg border border-white/10 bg-[#201d1d] p-2.5 text-sm disabled:opacity-50"
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              ))
            )}

            {/* CUSTOM ISSUES */}
            <div className="rounded-xl border border-white/10 bg-[#171515] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="font-semibold text-white">
                    Custom Issue
                  </h4>

                  <p className="mt-1 text-xs text-[#89817c]">
                    Add any additional issue and its amount.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={addCustomIssue}
                  disabled={saving}
                  className="rounded-lg border border-[#d77a88]/40 px-4 py-2 text-sm text-[#f0b6bd] hover:bg-[#d77a88]/10 disabled:opacity-50"
                >
                  + Add Issue
                </button>
              </div>

              {customIssues.length > 0 && (
                <div className="mt-4 space-y-4">
                  {customIssues.map((item, index) => (
                    <div
                      key={item.id}
                      className="rounded-lg border border-white/10 bg-[#201d1d] p-4"
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-sm font-medium">
                          Custom Issue {index + 1}
                        </p>

                        <button
                          type="button"
                          onClick={() => removeCustomIssue(item.id)}
                          disabled={saving}
                          className="text-xs text-red-300 hover:underline"
                        >
                          Remove
                        </button>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="sm:col-span-3">
                          <label className="mb-1 block text-xs text-[#aaa09a]">
                            Issue Description
                          </label>

                          <input
                            value={item.description}
                            onChange={(e) =>
                              updateCustomIssue(
                                item.id,
                                "description",
                                e.target.value
                              )
                            }
                            placeholder="Enter issue description"
                            disabled={saving}
                            className="w-full rounded-lg border border-white/10 bg-[#171515] p-2.5 text-sm"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-xs text-[#aaa09a]">
                            Amount Per Time (₹)
                          </label>

                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={item.unit_amount}
                            onChange={(e) =>
                              updateCustomIssue(
                                item.id,
                                "unit_amount",
                                e.target.value
                              )
                            }
                            disabled={saving}
                            className="w-full rounded-lg border border-white/10 bg-[#171515] p-2.5 text-sm"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-xs text-[#aaa09a]">
                            Number of Times
                          </label>

                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={item.quantity}
                            onChange={(e) =>
                              updateCustomIssue(
                                item.id,
                                "quantity",
                                e.target.value
                              )
                            }
                            disabled={saving}
                            className="w-full rounded-lg border border-white/10 bg-[#171515] p-2.5 text-sm"
                          />
                        </div>

                        <div>
                          <p className="mb-1 text-xs text-[#aaa09a]">
                            Total
                          </p>

                          <p className="rounded-lg bg-[#171515] p-2.5 text-sm font-semibold text-red-300">
                            {money(
                              Number(item.unit_amount) *
                                Number(item.quantity)
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* TOTAL */}
            <div className="rounded-xl border border-[#d77a88]/30 bg-[#d77a88]/5 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-[#c2bab4]">
                    Total Selected Penalties
                  </p>

                  <p className="mt-1 text-xs text-[#89817c]">
                    {selectedCount} selected item(s)
                  </p>
                </div>

                <p className="text-3xl font-bold text-red-300">
                  {money(grandTotal)}
                </p>
              </div>

              {earningExcluded && (
                <p className="mt-4 rounded-lg bg-yellow-500/10 p-3 text-sm text-yellow-300">
                  Important: This selection will exclude this lobby's earning from salary.
                </p>
              )}

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleApplyPenalty}
                  disabled={saving || loading || selectedCount === 0}
                  className="rounded-lg bg-red-600 px-6 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {saving
                    ? "Applying Penalty & Approving..."
                    : "Confirm Penalty & Approve Work"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedItems({});
                    setCustomIssues([]);
                    setError("");
                  }}
                  disabled={saving}
                  className="rounded-lg border border-white/10 px-5 py-3 text-sm hover:bg-white/5 disabled:opacity-50"
                >
                  Clear Selection
                </button>
              </div>

              <p className="mt-3 text-xs leading-5 text-[#89817c]">
                On confirmation, the work will be approved, selected penalties will be saved, salary will be recalculated and the worker will receive a notification with a 24-hour appeal window.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* PENALTY HISTORY */}
      <section className="overflow-hidden rounded-xl border border-white/10 bg-[#201d1d]">
        <div className="border-b border-white/10 p-5">
          <h2 className="text-lg font-semibold">
            Penalty History
          </h2>

          <p className="mt-1 text-sm text-[#89817c]">
            All recorded member penalties and their status.
          </p>
        </div>

        {loading ? (
          <p className="p-8 text-center text-[#89817c]">
            Loading penalties...
          </p>
        ) : penalties.length === 0 ? (
          <p className="p-8 text-center text-[#89817c]">
            No penalty records available.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="bg-[#171515] text-[#aaa09a]">
                <tr>
                  <th className="p-4">Member</th>
                  <th className="p-4">Date</th>
                  <th className="p-4">Lobby</th>
                  <th className="p-4">Work</th>
                  <th className="p-4">Category</th>
                  <th className="p-4">Amount</th>
                  <th className="p-4">Penalty Items</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Appeal Deadline</th>
                </tr>
              </thead>

              <tbody>
                {penalties.map((penalty) => (
                  <tr
                    key={penalty.id}
                    className="border-t border-white/10 align-top"
                  >
                    <td className="p-4 font-medium">
                      {memberMap[penalty.user_id]?.username || "Unknown"}
                    </td>

                    <td className="whitespace-nowrap p-4">
                      {formatDate(penalty.lobby_date)}
                    </td>

                    <td className="p-4">
                      {penalty.lobby_url ? (
                        <a
                          href={penalty.lobby_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 underline"
                        >
                          Open Lobby
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>

                    <td className="whitespace-nowrap p-4">
                      {penalty.work_type} / {penalty.match_type}
                    </td>

                    <td className="p-4">
                      {penalty.penalty_type === "approved_lobby"
                        ? "Approved"
                        : "Incomplete"}
                    </td>

                    <td className="whitespace-nowrap p-4 font-semibold text-red-400">
                      {money(penalty.amount)}
                    </td>

                    <td className="max-w-xs p-4">
                      <div className="space-y-1">
                        {(historyItemsMap[penalty.id] || []).map((item) => (
                          <p key={item.id} className="text-xs text-[#c2bab4]">
                            {item.description} × {item.quantity} —{" "}
                            {money(item.total_amount)}
                          </p>
                        ))}

                        {!(historyItemsMap[penalty.id] || []).length && (
                          <span className="text-xs text-[#89817c]">
                            {penalty.reason}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="p-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs ${
                          penalty.status === "active"
                            ? "bg-red-500/10 text-red-300"
                            : "bg-green-500/10 text-green-300"
                        }`}
                      >
                        {penalty.status}
                      </span>
                    </td>

                    <td className="whitespace-nowrap p-4 text-xs text-[#aaa09a]">
                      {formatDateTime(penalty.appeal_deadline)}
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