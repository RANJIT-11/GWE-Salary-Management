
import { useEffect, useState } from "react";

import AdminLayout from "./layouts/AdminLayout";
import UserLayout from "./layouts/UserLayout";

import AdminDashboard from "./pages/AdminDashboard";
import Login from "./pages/Login";
import UserDashboard from "./pages/UserDashboard";

import { supabase } from "./lib/supabase";

// Detect password recovery URL
function hasPasswordRecoveryParams() {
  const url = new URL(window.location.href);
  const hash = new URLSearchParams(url.hash.substring(1));

  return (
    url.searchParams.has("code") ||
    url.searchParams.get("type") === "recovery" ||
    hash.get("type") === "recovery" ||
    (
      hash.has("access_token") &&
      hash.has("refresh_token")
    )
  );
}

export default function App() {
  const [session, setSession] = useState(undefined);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  const [isPasswordRecovery, setIsPasswordRecovery] = useState(
    hasPasswordRecoveryParams
  );

  // AUTH SESSION MANAGEMENT
  useEffect(() => {
    if (!supabase) {
      setSession(null);
      setAuthError("Supabase is not configured.");
      return undefined;
    }

    let isMounted = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!isMounted) return;

      setSession(nextSession);
      setAuthError("");

      if (event === "PASSWORD_RECOVERY") {
        setIsPasswordRecovery(true);
      }

      if (event === "SIGNED_OUT") {
        setIsPasswordRecovery(false);
      }
    });

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!isMounted) return;

        if (error) {
          setAuthError(error.message);
          setSession(null);
          return;
        }

        setSession(data.session);
      })
      .catch((error) => {
        if (isMounted) {
          setAuthError(
            error instanceof Error
              ? error.message
              : "Could not restore your sign-in session."
          );
          setSession(null);
        }
      });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // LOAD USER PROFILE
  useEffect(() => {
    if (isPasswordRecovery || !session?.user || !supabase) {
      setProfile(null);
      setProfileLoading(false);
      return undefined;
    }

    let isMounted = true;

    setProfile(null);
    setProfileLoading(true);
    setAuthError("");

    async function loadProfile() {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, username, full_name, role, is_active")
          .eq("id", session.user.id)
          .single();

        if (error) throw error;

        if (!data.is_active) {
          throw new Error(
            "This account is inactive. Contact an administrator."
          );
        }

        if (isMounted) {
          setProfile(data);
        }
      } catch (error) {
        if (isMounted) {
          setAuthError(
            error instanceof Error
              ? error.message
              : "Could not load your account profile."
          );
        }
      } finally {
        if (isMounted) {
          setProfileLoading(false);
        }
      }
    }

    loadProfile();

    return () => {
      isMounted = false;
    };
  }, [session, isPasswordRecovery]);

  // SIGN OUT
  async function handleSignOut() {
    if (!supabase) return;

    const { error } = await supabase.auth.signOut();

    if (error) {
      setAuthError(error.message);
    }
  }

  // PASSWORD RECOVERY SCREEN
  if (isPasswordRecovery) {
    return <Login />;
  }

  // LOADING
  if (session === undefined || (session && profileLoading)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#171515] px-4 text-sm text-[#c9c1bb]">
        Loading your account...
      </main>
    );
  }

  // LOGIN
  if (!session) {
    return <Login />;
  }

  // PROFILE ERROR
  if (authError || !profile) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#171515] px-4 text-[#f5eee5]">
        <section className="w-full max-w-md rounded-xl border border-white/[0.08] bg-[#201d1d] p-6">
          <h1 className="text-lg font-semibold">
            Unable to load your account
          </h1>

          <p
            className="mt-3 text-sm leading-6 text-[#ddbd91]"
            role="alert"
          >
            {authError || "Your profile is not available."}
          </p>

          <button
            className="mt-5 rounded-lg border border-white/[0.12] px-4 py-2 text-sm text-[#d6cec8] hover:border-white/20 hover:text-white"
            onClick={handleSignOut}
            type="button"
          >
            Sign out
          </button>
        </section>
      </main>
    );
  }

  const username = profile.full_name || profile.username;

  // ADMIN AND MAIN ADMIN
  if (
    profile.role === "admin" ||
    profile.role === "main_admin"
  ) {
    return (
      <AdminLayout
        username={username}
        onSignOut={handleSignOut}
        role={profile.role}
      >
        <AdminDashboard username={username} />
      </AdminLayout>
    );
  }

  // MEMBER
  if (profile.role === "member") {
    return (
      <UserLayout
        username={username}
        onSignOut={handleSignOut}
      >
        <UserDashboard username={username} />
      </UserLayout>
    );
  }

  // UNKNOWN ROLE
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#171515] px-4 text-[#f5eee5]">
      <section className="rounded-xl border border-white/10 bg-[#201d1d] p-6">
        <h1 className="text-lg font-semibold">
          Invalid account role
        </h1>

        <p className="mt-3 text-sm text-[#c9c1bb]">
          Contact your Main Admin for assistance.
        </p>

        <button
          onClick={handleSignOut}
          className="mt-5 rounded-lg border border-white/10 px-4 py-2"
        >
          Sign out
        </button>
      </section>
    </main>
  );
}
