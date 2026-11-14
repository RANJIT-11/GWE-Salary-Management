
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const money = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function getMonday(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));

  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000)
    .toISOString()
    .slice(0, 10);
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + days);

  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000)
    .toISOString()
    .slice(0, 10);
}

function getToday() {
  const date = new Date();
  const offset = date.getTimezoneOffset();

  return new Date(date.getTime() - offset * 60000)
    .toISOString()
    .slice(0, 10);
}

function formatDate(value) {
  if (!value) return "-";

  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function downloadPDF(reportData, weekStart, weekEnd, reportType) {
  const doc = new jsPDF("landscape", "mm", "a4");

  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(32, 29, 29);
  doc.rect(0, 0, pageWidth, 42, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("GWE ESPORTS", 14, 17);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("GRIND WITH EXP - SALARY MANAGEMENT SYSTEM", 14, 25);

  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.text("WEEKLY SALARY REPORT", 14, 35);

  doc.setTextColor(70, 70, 70);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");

  doc.text(
    `Week: ${formatDate(weekStart)} to ${formatDate(weekEnd)}`,
    14,
    51
  );

  doc.text(
    `Report Type: ${reportType === "combined" ? "Combined Report" : "Individual Member Report"}`,
    14,
    58
  );

  doc.text(
    `Generated: ${new Date().toLocaleString("en-IN")}`,
    pageWidth - 14,
    51,
    { align: "right" }
  );

  if (reportType === "combined") {
    autoTable(doc, {
      startY: 67,
      head: [[
        "Member",
        "Opening",
        "HOST",
        "PT",
        "HOST + PT",
        "Earned",
        "Penalty",
        "Paid",
        "Closing",
      ]],
      body: reportData.map((item) => [
        item.username,
        money(item.opening),
        money(item.host),
        money(item.pt),
        money(item.hostPt),
        money(item.earned),
        money(item.penalties),
        money(item.paid),
        money(item.closing),
      ]),
      styles: {
        fontSize: 8,
        cellPadding: 3,
      },
      headStyles: {
        fillColor: [168, 50, 69],
        textColor: 255,
        fontStyle: "bold",
      },
      alternateRowStyles: {
        fillColor: [245, 242, 242],
      },
      columnStyles: {
        0: { cellWidth: 35 },
      },
    });

    const totals = reportData.reduce(
      (sum, item) => ({
        opening: sum.opening + item.opening,
        host: sum.host + item.host,
        pt: sum.pt + item.pt,
        hostPt: sum.hostPt + item.hostPt,
        earned: sum.earned + item.earned,
        penalties: sum.penalties + item.penalties,
        paid: sum.paid + item.paid,
        closing: sum.closing + item.closing,
      }),
      {
        opening: 0,
        host: 0,
        pt: 0,
        hostPt: 0,
        earned: 0,
        penalties: 0,
        paid: 0,
        closing: 0,
      }
    );

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 5,
      head: [["TOTAL", ...[
        totals.opening,
        totals.host,
        totals.pt,
        totals.hostPt,
        totals.earned,
        totals.penalties,
        totals.paid,
        totals.closing,
      ].map(money)]],
      styles: {
        fontSize: 8,
        fontStyle: "bold",
        cellPadding: 3,
      },
      headStyles: {
        fillColor: [45, 45, 45],
        textColor: 255,
      },
    });
  } else {
    const report = reportData[0];

    if (!report) return;

    doc.setFontSize(15);
    doc.setFont("helvetica", "bold");
    doc.text(`Member: ${report.username}`, 14, 70);

    autoTable(doc, {
      startY: 78,
      head: [["Salary Details", "Amount"]],
      body: [
        ["Opening Balance", money(report.opening)],
        ["HOST Earnings", money(report.host)],
        ["PT Earnings", money(report.pt)],
        ["HOST + PT Earnings", money(report.hostPt)],
        ["Total Approved Earnings", money(report.earned)],
        ["Active Penalties", money(report.penalties)],
        ["Payments Made", money(report.paid)],
        ["Closing Balance", money(report.closing)],
        ["Approved Work Count", String(report.workCount)],
        ["Payment Count", String(report.paymentCount)],
      ],
      styles: {
        fontSize: 10,
        cellPadding: 5,
      },
      headStyles: {
        fillColor: [168, 50, 69],
        textColor: 255,
      },
      columnStyles: {
        0: { cellWidth: 100 },
        1: { cellWidth: 60 },
      },
    });

    doc.setFontSize(9);
    doc.setTextColor(90, 90, 90);

    doc.text(
      "Closing Balance = Opening Balance + Earnings - Active Penalties - Payments",
      14,
      doc.lastAutoTable.finalY + 12
    );
  }

  const pageCount = doc.internal.getNumberOfPages();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    const pageHeight = doc.internal.pageSize.getHeight();

    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);

    doc.text(
      "GWE ESPORTS | Official Weekly Salary Report",
      14,
      pageHeight - 8
    );

    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth - 14,
      pageHeight - 8,
      { align: "right" }
    );
  }

  const filename =
    reportType === "combined"
      ? `GWE_Combined_Weekly_Report_${weekStart}.pdf`
      : `GWE_${reportData[0]?.username || "Member"}_Weekly_Report_${weekStart}.pdf`;

  doc.save(filename);
}

export default function WeeklySalaryReport() {
  const [members, setMembers] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [works, setWorks] = useState([]);
  const [penalties, setPenalties] = useState([]);
  const [payments, setPayments] = useState([]);

  const [weekStart, setWeekStart] = useState(getMonday(getToday()));
  const [selectedMember, setSelectedMember] = useState("all");
  const [view, setView] = useState("combined");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const weekEnd = addDays(weekStart, 6);

  async function fetchData() {
    setLoading(true);
    setError("");

    try {
      const [
        profileResult,
        ledgerResult,
        workResult,
        penaltyResult,
        paymentResult,
      ] = await Promise.all([
        supabase.from("profiles")
          .select("id, username, full_name")
          .eq("role", "member")
          .order("username"),

        supabase.from("weekly_salary_ledger")
          .select("*")
          .order("week_start_date", { ascending: true }),

        supabase.from("work_submissions")
          .select("user_id, amount, lobby_date, work_type, status")
          .eq("status", "approved"),

        supabase.from("penalties")
          .select("user_id, amount, lobby_date, status")
          .eq("status", "active"),

        supabase.from("payments")
          .select("user_id, amount, payment_date"),
      ]);

      if (profileResult.error) throw profileResult.error;
      if (ledgerResult.error) throw ledgerResult.error;
      if (workResult.error) throw workResult.error;
      if (penaltyResult.error) throw penaltyResult.error;
      if (paymentResult.error) throw paymentResult.error;

      setMembers(profileResult.data || []);
      setLedger(ledgerResult.data || []);
      setWorks(workResult.data || []);
      setPenalties(penaltyResult.data || []);
      setPayments(paymentResult.data || []);
    } catch (err) {
      console.error(err);
      setError(err.message || "Unable to load weekly report.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  const reports = useMemo(() => {
    return members.map((member) => {
      const weeklyLedger = ledger.find(
        (row) =>
          row.user_id === member.id &&
          row.week_start_date === weekStart
      );

      const weeklyWorks = works.filter(
        (work) =>
          work.user_id === member.id &&
          work.lobby_date >= weekStart &&
          work.lobby_date <= weekEnd
      );

      const weeklyPenalties = penalties.filter(
        (penalty) =>
          penalty.user_id === member.id &&
          penalty.lobby_date >= weekStart &&
          penalty.lobby_date <= weekEnd
      );

      const weeklyPayments = payments.filter(
        (payment) =>
          payment.user_id === member.id &&
          payment.payment_date >= weekStart &&
          payment.payment_date <= weekEnd
      );

      const host = weeklyWorks
        .filter((work) => work.work_type === "host")
        .reduce((sum, work) => sum + Number(work.amount || 0), 0);

      const pt = weeklyWorks
        .filter((work) => work.work_type === "pt")
        .reduce((sum, work) => sum + Number(work.amount || 0), 0);

      const hostPt = weeklyWorks
        .filter((work) => work.work_type === "host_pt")
        .reduce((sum, work) => sum + Number(work.amount || 0), 0);

      const earned = host + pt + hostPt;

      const penaltyTotal = weeklyPenalties.reduce(
        (sum, item) => sum + Number(item.amount || 0), 0
      );

      const paid = weeklyPayments.reduce(
        (sum, item) => sum + Number(item.amount || 0), 0
      );

      const opening = Number(weeklyLedger?.opening_balance || 0);

      const closing = weeklyLedger
        ? Number(weeklyLedger.closing_balance || 0)
        : opening + earned - penaltyTotal - paid;

      return {
        user_id: member.id,
        username: member.username,
        opening,
        host,
        pt,
        hostPt,
        earned,
        penalties: penaltyTotal,
        paid,
        closing,
        workCount: weeklyWorks.length,
        paymentCount: weeklyPayments.length,
        ledgerExists: Boolean(weeklyLedger),
      };
    });
  }, [members, ledger, works, penalties, payments, weekStart, weekEnd]);

  const visibleReports = reports.filter(
    (report) =>
      selectedMember === "all" ||
      report.user_id === selectedMember
  );

  const totals = visibleReports.reduce(
    (sum, report) => ({
      opening: sum.opening + report.opening,
      earned: sum.earned + report.earned,
      penalties: sum.penalties + report.penalties,
      paid: sum.paid + report.paid,
      closing: sum.closing + report.closing,
      host: sum.host + report.host,
      pt: sum.pt + report.pt,
      hostPt: sum.hostPt + report.hostPt,
    }),
    {
      opening: 0,
      earned: 0,
      penalties: 0,
      paid: 0,
      closing: 0,
      host: 0,
      pt: 0,
      hostPt: 0,
    }
  );

  const individualReport = visibleReports.length === 1
    ? visibleReports[0]
    : null;

  function handlePDFDownload(type) {
    if (type === "individual" && !individualReport) {
      setError("Please select one member for the individual PDF.");
      return;
    }

    downloadPDF(
      type === "combined" ? visibleReports : [individualReport],
      weekStart,
      weekEnd,
      type
    );
  }

  return (
    <div className="space-y-6 text-white">

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#c55365]">
            GWE ESPORTS
          </p>
          <h1 className="mt-2 text-2xl font-semibold">
            Weekly Salary Report
          </h1>
          <p className="mt-2 text-sm text-[#89817c]">
            Weekly earnings, penalties, payments and remaining balance.
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

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid gap-4 rounded-xl border border-white/10 bg-[#201d1d] p-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="mb-2 block text-sm text-[#aaa09a]">
            Select Week (Monday)
          </label>
          <input
            type="date"
            value={weekStart}
            onChange={(e) => setWeekStart(getMonday(e.target.value))}
            className="w-full rounded-lg border border-white/10 bg-[#171515] p-3 text-sm"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm text-[#aaa09a]">
            Select Member
          </label>
          <select
            value={selectedMember}
            onChange={(e) => setSelectedMember(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-[#171515] p-3 text-sm"
          >
            <option value="all">All Members</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.username}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm text-[#aaa09a]">
            Report View
          </label>
          <select
            value={view}
            onChange={(e) => setView(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-[#171515] p-3 text-sm"
          >
            <option value="combined">Combined Report</option>
            <option value="individual">Individual Report</option>
          </select>
        </div>

        <div className="flex flex-wrap items-end gap-3 sm:col-span-2 lg:col-span-3">
          <p className="text-sm text-[#c7bdb6]">
            Selected Week:{" "}
            <span className="font-semibold text-white">
              {formatDate(weekStart)} – {formatDate(weekEnd)}
            </span>
          </p>

          <div className="ml-auto flex flex-wrap gap-2">
            <button
              onClick={() => handlePDFDownload("combined")}
              disabled={loading || visibleReports.length === 0}
              className="rounded-lg bg-[#a83245] px-4 py-2.5 text-sm font-semibold hover:bg-[#bd4055] disabled:opacity-40"
            >
              Download Combined PDF
            </button>

            <button
              onClick={() => handlePDFDownload("individual")}
              disabled={loading || !individualReport}
              className="rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold hover:bg-green-700 disabled:opacity-40"
            >
              Download Individual PDF
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl bg-[#201d1d] p-10 text-center text-[#aaa09a]">
          Loading weekly report...
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ["Opening Balance", totals.opening, "text-blue-400"],
              ["Total Earned", totals.earned, "text-green-400"],
              ["Active Penalties", totals.penalties, "text-red-400"],
              ["Total Paid", totals.paid, "text-blue-400"],
              [
                "Closing Balance",
                totals.closing,
                totals.closing < 0
                  ? "text-red-400"
                  : "text-yellow-400",
              ],
            ].map(([label, amount, color]) => (
              <div
                key={label}
                className="rounded-xl border border-white/10 bg-[#201d1d] p-5"
              >
                <p className="text-sm text-[#89817c]">{label}</p>
                <p className={`mt-2 text-xl font-semibold ${color}`}>
                  {money(amount)}
                </p>
              </div>
            ))}
          </div>

          {view === "combined" ? (
            <div className="overflow-hidden rounded-xl border border-white/10 bg-[#201d1d]">
              <div className="border-b border-white/10 p-5">
                <h2 className="text-lg font-semibold">
                  Combined Member Report
                </h2>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1050px] text-left text-sm">
                  <thead className="bg-[#171515] text-[#aaa09a]">
                    <tr>
                      <th className="p-4">Member</th>
                      <th className="p-4">Opening</th>
                      <th className="p-4">HOST</th>
                      <th className="p-4">PT</th>
                      <th className="p-4">HOST + PT</th>
                      <th className="p-4">Earned</th>
                      <th className="p-4">Penalty</th>
                      <th className="p-4">Paid</th>
                      <th className="p-4">Closing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleReports.map((report) => (
                      <tr key={report.user_id} className="border-t border-white/10">
                        <td className="p-4 font-medium">{report.username}</td>
                        <td className="p-4">{money(report.opening)}</td>
                        <td className="p-4">{money(report.host)}</td>
                        <td className="p-4">{money(report.pt)}</td>
                        <td className="p-4">{money(report.hostPt)}</td>
                        <td className="p-4 text-green-400">{money(report.earned)}</td>
                        <td className="p-4 text-red-400">{money(report.penalties)}</td>
                        <td className="p-4 text-blue-400">{money(report.paid)}</td>
                        <td className="p-4 font-semibold text-yellow-400">{money(report.closing)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-white/10 bg-[#171515] font-semibold">
                    <tr>
                      <td className="p-4">TOTAL</td>
                      <td className="p-4">{money(totals.opening)}</td>
                      <td className="p-4">{money(totals.host)}</td>
                      <td className="p-4">{money(totals.pt)}</td>
                      <td className="p-4">{money(totals.hostPt)}</td>
                      <td className="p-4">{money(totals.earned)}</td>
                      <td className="p-4">{money(totals.penalties)}</td>
                      <td className="p-4">{money(totals.paid)}</td>
                      <td className="p-4">{money(totals.closing)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-[#201d1d] p-5">
              <h2 className="text-lg font-semibold">
                Individual Member Report
              </h2>

              {!individualReport ? (
                <p className="mt-5 text-sm text-[#89817c]">
                  Select one specific member to view their individual report.
                </p>
              ) : (
                <>
                  <h3 className="mt-4 text-xl font-semibold text-[#e8a1aa]">
                    {individualReport.username}
                  </h3>

                  <p className="mt-1 text-sm text-[#89817c]">
                    {formatDate(weekStart)} – {formatDate(weekEnd)}
                  </p>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {[
                      ["Opening Balance", individualReport.opening],
                      ["HOST Earnings", individualReport.host],
                      ["PT Earnings", individualReport.pt],
                      ["HOST + PT Earnings", individualReport.hostPt],
                      ["Total Earnings", individualReport.earned],
                      ["Active Penalties", -individualReport.penalties],
                      ["Payments Made", -individualReport.paid],
                      ["Closing Balance", individualReport.closing],
                      ["Approved Work Count", individualReport.workCount],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-lg border border-white/10 bg-[#171515] p-4">
                        <p className="text-xs text-[#89817c]">{label}</p>
                        <p className="mt-2 text-lg font-semibold">
                          {label === "Approved Work Count" ? value : money(value)}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
