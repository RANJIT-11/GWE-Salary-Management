
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const adminNavigation = [
  { label: "Overview", path: "#overview" },

  // Personal work and salary
  { label: "My Work", path: "#my-work" },
  { label: "My Work History", path: "#my-work-history" },
  { label: "My Salary", path: "#my-salary" },

  // Administration
  { label: "Workers", path: "#workers" },
  { label: "Work approvals", path: "#approvals" },
  { label: "Correction Requests", path: "#correction-requests" },
  { label: "Salary Management", path: "#salary" },
  { label: "Weekly Salary Report", path: "#weekly-report" },
  { label: "Penalties", path: "#penalties" },
  { label: "Appeal Management", path: "#appeals" },
  { label: "Pricebook", path: "#pricebook" },
  { label: "Activity Logs", path: "#activity-logs" },
];

const memberNavigation = [
  { label: "My dashboard", path: "#overview" },
  { label: "Notifications", path: "#notifications" },
  { label: "Add New Work", path: "#add-work" },
  { label: "My work history", path: "#work-history" },
  { label: "My salary", path: "#salary" },
];

export default function Sidebar({
  role = "member",
  activePage = "overview",
}) {
  const [unreadCount, setUnreadCount] = useState(0);

  const isAdmin =
    role === "admin" || role === "main_admin";

  const loadUnreadCount = useCallback(async (userId) => {
    if (!userId) return;

    const { count, error } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("read_at", null);

    if (error) {
      console.error("Notification count error:", error);
      return;
    }

    setUnreadCount(count || 0);
  }, []);

  useEffect(() => {
    if (isAdmin || !supabase) {
      setUnreadCount(0);
      return undefined;
    }

    let cancelled = false;
    let channel = null;

    async function setupNotifications() {
      try {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();

        if (error) throw error;
        if (!user || cancelled) return;

        await loadUnreadCount(user.id);

        if (cancelled) return;

        channel = supabase
          .channel(`member-notifications-${user.id}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "notifications",
              filter: `user_id=eq.${user.id}`,
            },
            () => loadUnreadCount(user.id)
          )
          .subscribe();
      } catch (error) {
        console.error("Notification setup error:", error);
      }
    }

    setupNotifications();

    return () => {
      cancelled = true;

      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [isAdmin, loadUnreadCount]);

  const items = isAdmin
    ? adminNavigation
    : memberNavigation;

  return (
    <aside className="w-full shrink-0 border-b border-white/[0.08] bg-[#1b1919] px-4 py-3 lg:min-h-[calc(100vh-76px)] lg:w-[248px] lg:border-b-0 lg:border-r lg:px-5 lg:py-8">
      <p className="mb-3 hidden px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#77716e] lg:block">
        Workspace
      </p>

      <nav
        aria-label={`${role} navigation`}
        className="flex gap-2 overflow-x-auto lg:flex-col"
      >
        {items.map((item) => {
          const active =
            activePage === item.path.replace("#", "");

          const isNotifications =
            item.path === "#notifications";

          return (
            <a
              href={item.path}
              aria-current={active ? "page" : undefined}
              className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                active
                  ? "bg-[#a83245]/15 font-medium text-[#f0b6bd]"
                  : "text-[#a29a95] hover:bg-white/[0.04] hover:text-white"
              }`}
              key={item.path}
            >
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 rounded-full ${
                  active
                    ? "bg-[#c55365]"
                    : "bg-[#4a4542]"
                }`}
              />

              <span>{item.label}</span>

              {isNotifications && unreadCount > 0 && (
                <span className="ml-auto rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </a>
          );
        })}
      </nav>

      <div className="mt-8 hidden rounded-xl border border-white/[0.07] bg-white/[0.025] p-4 lg:block">
        <p className="text-xs font-medium text-[#d5cdc6]">
          GWE ESPORTS
        </p>

        <p className="mt-1.5 text-xs leading-5 text-[#817b77]">
          Grind With EXP - Salary Management System.
        </p>
      </div>
    </aside>
  );
}
