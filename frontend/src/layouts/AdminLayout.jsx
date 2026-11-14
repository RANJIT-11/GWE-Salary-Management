
import { useEffect, useState } from "react";

import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";

import Workers from "../pages/Workers";
import WorkApprovals from "../pages/WorkApprovals";
import AdminSalary from "../pages/AdminSalary";
import WeeklySalaryReport from "../pages/WeeklySalaryReport";
import Penalties from "../pages/Penalties";
import Appeals from "../pages/Appeals";
import CorrectionRequests from "../pages/CorrectionRequests";
import Pricebook from "../pages/Pricebook";

// Personal work and salary pages
import AddWork from "../pages/AddWork";
import WorkHistory from "../pages/WorkHistory";
import Salary from "../pages/Salary";

export default function AdminLayout({
  username,
  onSignOut,
  children,
  role = "admin",
}) {
  const [activePage, setActivePage] = useState(
    () => window.location.hash.replace("#", "") || "overview"
  );

  useEffect(() => {
    function handleHashChange() {
      setActivePage(
        window.location.hash.replace("#", "") || "overview"
      );
    }

    window.addEventListener("hashchange", handleHashChange);

    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  const pages = [
    // Admin dashboard
    { id: "overview", component: children },

    // Personal work and salary
    { id: "my-work", component: <AddWork /> },
    { id: "my-work-history", component: <WorkHistory /> },
    { id: "my-salary", component: <Salary /> },

    // Administration
    { id: "workers", component: <Workers role={role} /> },
    { id: "approvals", component: <WorkApprovals role={role} /> },
    { id: "salary", component: <AdminSalary /> },
    { id: "weekly-report", component: <WeeklySalaryReport /> },
    { id: "penalties", component: <Penalties /> },
    { id: "appeals", component: <Appeals /> },
    {
      id: "correction-requests",
      component: <CorrectionRequests role={role} />,
    },
    { id: "pricebook", component: <Pricebook role={role} /> },
  ];

  return (
    <div className="min-h-screen bg-[#171515] text-[#f5eee5]">
      <Navbar
        username={username}
        role={role}
        onSignOut={onSignOut}
      />

      <div className="mx-auto flex max-w-[1440px] flex-col lg:flex-row">
        <Sidebar
          role={role}
          activePage={activePage}
        />

        <main className="min-w-0 flex-1 px-4 py-8 sm:px-8 sm:py-10 lg:px-12 lg:py-12">
          {pages.map((page) => (
            <div
              key={page.id}
              style={{
                display: activePage === page.id ? "block" : "none",
              }}
            >
              {page.component}
            </div>
          ))}
        </main>
      </div>
    </div>
  );
}
