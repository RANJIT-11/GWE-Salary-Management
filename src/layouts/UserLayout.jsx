
import { useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import AddWork from "../pages/AddWork";
import WorkHistory from "../pages/WorkHistory";
import Salary from "../pages/Salary";
import Notifications from "../pages/Notifications";

export default function UserLayout({ username, onSignOut, children }) {
  const [activePage, setActivePage] = useState(
    () => window.location.hash.replace("#", "") || "overview"
  );

  useEffect(() => {
    const handleHashChange = () => {
      setActivePage(window.location.hash.replace("#", "") || "overview");
    };

    window.addEventListener("hashchange", handleHashChange);

    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  const pages = [
    { id: "overview", component: children },
    { id: "notifications", component: <Notifications /> },
    { id: "add-work", component: <AddWork /> },
    { id: "work-history", component: <WorkHistory /> },
    { id: "salary", component: <Salary /> },
  ];

  return (
    <div className="min-h-screen bg-[#171515] text-[#f5eee5]">
      <Navbar username={username} role="member" onSignOut={onSignOut} />

      <div className="mx-auto flex max-w-[1440px] flex-col lg:flex-row">
        <Sidebar role="member" activePage={activePage} />

        <main className="min-w-0 flex-1 px-4 py-8 sm:px-8 sm:py-10 lg:px-12 lg:py-14">
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
