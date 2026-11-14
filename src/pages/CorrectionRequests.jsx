
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function CorrectionRequests({ role = "admin" }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [responses, setResponses] = useState({});
  const [videoUrls, setVideoUrls] = useState({});
  const [filter, setFilter] = useState("pending");
  const [message, setMessage] = useState("");

  const isAdmin = role === "admin" || role === "main_admin";

  useEffect(() => {
    fetchRequests();
  }, []);

  async function fetchRequests() {
    setLoading(true);
    setMessage("");

    const { data, error } = await supabase
      .from("work_correction_requests")
      .select("*")
      .order("submitted_at", { ascending: false });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    const userIds = [...new Set((data || []).map((item) => item.user_id))];

    let profileMap = {};

    if (userIds.length > 0) {
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id, username")
        .in("id", userIds);

      if (profileError) {
        console.error("Profile fetch error:", profileError);
      } else {
        profileMap = Object.fromEntries(
          (profiles || []).map((profile) => [
            profile.id,
            profile.username,
          ])
        );
      }
    }

    const enrichedRequests = (data || []).map((item) => ({
      ...item,
      username: profileMap[item.user_id] || "Unknown Member",
    }));

    setRequests(enrichedRequests);

    const paths = new Set();

    enrichedRequests.forEach((item) => {
      if (item.requested_video_path) paths.add(item.requested_video_path);

      if (item.original_details?.video_url) {
        paths.add(item.original_details.video_url);
      }
    });

    const urlMap = {};

    await Promise.all(
      [...paths].map(async (path) => {
        const { data: signedData, error: signedError } =
          await supabase.storage
            .from("WORK PROOFS")
            .createSignedUrl(path, 3600);

        if (!signedError && signedData?.signedUrl) {
          urlMap[path] = signedData.signedUrl;
        }
      })
    );

    setVideoUrls(urlMap);
    setLoading(false);
  }

  async function reviewRequest(request, decision) {
    const response = (responses[request.id] || "").trim();

    if (decision === "rejected" && response.length < 3) {
      setMessage("Rejection reason must contain at least 3 characters.");
      return;
    }

    const confirmed = window.confirm(
      decision === "approved"
        ? "Are you sure you want to approve this correction?"
        : "Are you sure you want to reject this correction?"
    );

    if (!confirmed) return;

    setProcessingId(request.id);
    setMessage("");

    const { data, error } = await supabase.rpc(
      "review_work_correction",
      {
        p_request_id: request.id,
        p_decision: decision,
        p_admin_response: response || null,
      }
    );

    if (error) {
      setMessage(error.message);
      setProcessingId(null);
      return;
    }

    setMessage(
      decision === "approved"
        ? "Correction request approved successfully."
        : "Correction request rejected successfully."
    );

    setProcessingId(null);
    await fetchRequests();
  }

  function formatDate(value) {
    if (!value) return "-";

    return new Date(`${value}T00:00:00`).toLocaleDateString(
      "en-IN",
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }
    );
  }

  function formatTime(value) {
    if (!value) return "-";

    return value.slice(0, 5);
  }

  function DetailCard({ title, details, isOriginal = false }) {
    return (
      <div className="rounded-xl border border-white/[0.08] bg-[#211e1e] p-4">
        <h3 className="mb-4 text-sm font-semibold text-white">
          {title}
        </h3>

        <div className="space-y-3 text-sm">
          <Detail label="Lobby Date" value={formatDate(details?.lobby_date)} />
          <Detail label="Start Time" value={formatTime(details?.lobby_start_time)} />
          <Detail label="End Time" value={formatTime(details?.lobby_end_time)} />
          <Detail label="Work Type" value={details?.work_type} />
          <Detail label="Match Type" value={details?.match_type?.replace("_", " ").toUpperCase()} />

          {isOriginal && (
            <Detail label="Work Status" value={details?.status?.toUpperCase()} />
          )}

          {isOriginal && (
            <Detail label="Current Amount" value={`₹${details?.amount ?? 0}`} />
          )}

          <div>
            <p className="mb-1 text-xs text-[#938b87]">Lobby URL</p>
            {details?.lobby_url ? (
              <a
                href={details.lobby_url}
                target="_blank"
                rel="noreferrer"
                className="break-all text-[#e8a1aa] underline"
              >
                Open Lobby Link
              </a>
            ) : (
              <span className="text-[#b8b0ab]">-</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  function Detail({ label, value }) {
    return (
      <div className="flex items-start justify-between gap-3">
        <span className="text-[#938b87]">{label}</span>
        <span className="text-right font-medium text-[#e8e1dc]">
          {value || "-"}
        </span>
      </div>
    );
  }

  const filteredRequests = requests.filter((request) =>
    filter === "all" ? true : request.status === filter
  );

  if (!isAdmin) {
    return (
      <div className="p-6 text-red-400">
        Access denied. Admin only.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#171515] p-4 text-white sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">

        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#c55365]">
            GWE ESPORTS
          </p>

          <h1 className="mt-2 text-2xl font-bold">
            Work Correction Requests
          </h1>

          <p className="mt-1 text-sm text-[#938b87]">
            Review member requests to correct submitted work details.
          </p>
        </div>

        {message && (
          <div className="mb-5 rounded-lg border border-white/10 bg-white/[0.05] p-3 text-sm text-[#e8d8d8]">
            {message}
          </div>
        )}

        <div className="mb-6 flex flex-wrap gap-2">
          {[
            { value: "pending", label: "Pending" },
            { value: "approved", label: "Approved" },
            { value: "rejected", label: "Rejected" },
            { value: "all", label: "All Requests" },
          ].map((item) => (
            <button
              key={item.value}
              onClick={() => setFilter(item.value)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                filter === item.value
                  ? "bg-[#a83245] text-white"
                  : "border border-white/10 bg-white/[0.04] text-[#b8b0ab] hover:bg-white/[0.08]"
              }`}
            >
              {item.label}
              {" "}
              ({item.value === "all"
                ? requests.length
                : requests.filter((request) => request.status === item.value).length})
            </button>
          ))}

          <button
            onClick={fetchRequests}
            className="ml-auto rounded-lg border border-white/10 px-4 py-2 text-sm text-[#d8d0ca] hover:bg-white/[0.06]"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="py-16 text-center text-[#938b87]">
            Loading correction requests...
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="rounded-xl border border-white/[0.08] bg-[#211e1e] p-10 text-center">
            <p className="font-medium text-white">
              No correction requests found.
            </p>
            <p className="mt-2 text-sm text-[#938b87]">
              New member requests will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {filteredRequests.map((request) => {
              const original = request.original_details || {};

              return (
                <div
                  key={request.id}
                  className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#1d1a1a]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] p-4">
                    <div>
                      <h2 className="font-semibold text-white">
                        {request.username}
                      </h2>
                      <p className="mt-1 text-xs text-[#938b87]">
                        Submitted: {new Date(request.submitted_at).toLocaleString("en-IN")}
                      </p>
                    </div>

                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        request.status === "pending"
                          ? "bg-yellow-500/10 text-yellow-400"
                          : request.status === "approved"
                          ? "bg-green-500/10 text-green-400"
                          : "bg-red-500/10 text-red-400"
                      }`}
                    >
                      {request.status.toUpperCase()}
                    </span>
                  </div>

                  <div className="grid gap-4 p-4 md:grid-cols-2">
                    <DetailCard
                      title="Original Work Details"
                      details={original}
                      isOriginal
                    />

                    <DetailCard
                      title="Requested New Details"
                      details={{
                        lobby_date: request.requested_lobby_date,
                        lobby_start_time: request.requested_lobby_start_time,
                        lobby_end_time: request.requested_lobby_end_time,
                        lobby_url: request.requested_lobby_url,
                        work_type: request.requested_work_type,
                        match_type: request.requested_match_type,
                      }}
                    />
                  </div>

                  <div className="grid gap-4 px-4 pb-4 md:grid-cols-2">
                    <div className="rounded-xl border border-white/[0.08] bg-[#211e1e] p-4">
                      <h3 className="mb-3 text-sm font-semibold">
                        Original Video Proof
                      </h3>

                      {videoUrls[original.video_url] ? (
                        <video
                          src={videoUrls[original.video_url]}
                          controls
                          className="w-full rounded-lg"
                        />
                      ) : (
                        <p className="text-sm text-[#938b87]">
                          Original video unavailable.
                        </p>
                      )}
                    </div>

                    <div className="rounded-xl border border-white/[0.08] bg-[#211e1e] p-4">
                      <h3 className="mb-3 text-sm font-semibold">
                        Requested New Video Proof
                      </h3>

                      {videoUrls[request.requested_video_path] ? (
                        <video
                          src={videoUrls[request.requested_video_path]}
                          controls
                          className="w-full rounded-lg"
                        />
                      ) : (
                        <p className="text-sm text-[#938b87]">
                          New video unavailable.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mx-4 mb-4 rounded-xl border border-white/[0.08] bg-[#211e1e] p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#938b87]">
                      Member's Correction Reason
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-[#e8e1dc]">
                      {request.reason}
                    </p>
                  </div>

                  {request.status === "pending" ? (
                    <div className="border-t border-white/[0.08] p-4">
                      <label className="mb-2 block text-sm font-medium text-[#d8d0ca]">
                        Admin Response
                        <span className="ml-1 text-xs font-normal text-[#938b87]">
                          (Required for rejection)
                        </span>
                      </label>

                      <textarea
                        value={responses[request.id] || ""}
                        onChange={(event) =>
                          setResponses((previous) => ({
                            ...previous,
                            [request.id]: event.target.value,
                          }))
                        }
                        placeholder="Enter response or rejection reason..."
                        rows={2}
                        className="w-full rounded-lg border border-white/10 bg-[#171515] p-3 text-sm text-white outline-none focus:border-[#a83245]"
                      />

                      <div className="mt-4 flex flex-wrap justify-end gap-3">
                        <button
                          disabled={processingId === request.id}
                          onClick={() => reviewRequest(request, "rejected")}
                          className="rounded-lg border border-red-500/30 px-5 py-2.5 text-sm font-semibold text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                        >
                          {processingId === request.id ? "Processing..." : "Reject"}
                        </button>

                        <button
                          disabled={processingId === request.id}
                          onClick={() => reviewRequest(request, "approved")}
                          className="rounded-lg bg-[#a83245] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#91283a] disabled:opacity-50"
                        >
                          {processingId === request.id ? "Processing..." : "Approve Correction"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="border-t border-white/[0.08] p-4">
                      <p className="text-xs text-[#938b87]">
                        Admin Response
                      </p>
                      <p className="mt-1 text-sm text-[#e8e1dc]">
                        {request.admin_response || "No response provided."}
                      </p>
                      <p className="mt-2 text-xs text-[#938b87]">
                        Reviewed: {request.reviewed_at
                          ? new Date(request.reviewed_at).toLocaleString("en-IN")
                          : "-"}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
