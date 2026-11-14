import { useEffect, useState } from "react";
import Logo from "../components/Logo";
import {
  supabase,
  supabaseConfigError,
  testSupabaseConnection,
} from "../lib/supabase";

const initialForm = {
  fullName: "",
  username: "",
  email: "",
  password: "",
  confirmPassword: "",
};

const inputClassName =
  "w-full rounded-lg border border-white/[0.11] bg-[#151313] px-4 py-3 text-sm text-[#f5eee5] outline-none transition placeholder:text-[#625d59] focus:border-[#a83245] focus:ring-2 focus:ring-[#a83245]/15";

export default function Login() {
  const [mode, setMode] = useState("signin");
  const [form, setForm] = useState(initialForm);
  const [message, setMessage] = useState(null);
  const [connectionResult, setConnectionResult] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);

  // PASSWORD RECOVERY DETECTION
  useEffect(() => {
    if (!supabase) return;

    let active = true;
    let recoveryHandled = false;

    function showResetScreen() {
      if (!active) return;

      recoveryHandled = true;

      setMode("reset");
      setMessage({
        type: "success",
        text: "Enter and confirm your new password below.",
      });
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        showResetScreen();
      }
    });

    async function handleRecovery() {
      try {
        const url = new URL(window.location.href);

        const code = url.searchParams.get("code");

        const hashParams = new URLSearchParams(
          url.hash.substring(1)
        );

        const recoveryType =
          url.searchParams.get("type") ||
          hashParams.get("type");

        // PKCE recovery link
        if (code) {
          const { data, error } =
            await supabase.auth.exchangeCodeForSession(code);

          if (error) throw error;

          if (data.session) {
            showResetScreen();
            return;
          }
        }

        // Access token recovery link
        if (
          hashParams.get("access_token") &&
          hashParams.get("refresh_token")
        ) {
          const { data, error } = await supabase.auth.setSession({
            access_token: hashParams.get("access_token"),
            refresh_token: hashParams.get("refresh_token"),
          });

          if (error) throw error;

          if (data.session) {
            showResetScreen();
            return;
          }
        }

        // Check existing session
        const { data, error } = await supabase.auth.getSession();

        if (error) throw error;

        if (data.session && recoveryType === "recovery") {
          showResetScreen();
        } else if (recoveryType === "recovery") {
          if (active) {
            setMessage({
              type: "error",
              text: "Reset link is invalid or expired. Please request a new password reset link.",
            });
          }
        }
      } catch (error) {
        console.error("Password recovery error:", error);

        if (active && !recoveryHandled) {
          setMessage({
            type: "error",
            text:
              error instanceof Error
                ? error.message
                : "Unable to verify reset link. Please request a new link.",
          });
        }
      }
    }

    handleRecovery();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  function updateField(event) {
    const { name, value } = event.target;

    setForm((currentForm) => ({
      ...currentForm,
      [name]: value,
    }));
  }

  function changeMode(nextMode) {
    setMode(nextMode);
    setMessage(null);

    setForm((currentForm) => ({
      ...currentForm,
      password: "",
      confirmPassword: "",
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage(null);

    if (!supabase) {
      setMessage({
        type: "error",
        text: supabaseConfigError ?? "Supabase is not configured.",
      });
      return;
    }

    const email = form.email.trim().toLowerCase();
    const password = form.password;

    // FORGOT PASSWORD
    if (mode === "forgot") {
      if (!email) {
        setMessage({
          type: "error",
          text: "Please enter your registered email.",
        });
        return;
      }

      setIsSubmitting(true);

      try {
        const { error } = await supabase.auth.resetPasswordForEmail(
          email,
          {
            redirectTo: `${window.location.origin}/`,
          }
        );

        if (error) throw error;

        setMessage({
          type: "success",
          text: "If an account exists with this email, a password reset link has been sent. Please check your inbox.",
        });
      } catch (error) {
        setMessage({
          type: "error",
          text:
            error instanceof Error
              ? error.message
              : "Unable to send reset email.",
        });
      } finally {
        setIsSubmitting(false);
      }

      return;
    }

    // RESET PASSWORD
    if (mode === "reset") {
      if (password.length < 8) {
        setMessage({
          type: "error",
          text: "New password must be at least 8 characters long.",
        });
        return;
      }

      if (password !== form.confirmPassword) {
        setMessage({
          type: "error",
          text: "Passwords do not match.",
        });
        return;
      }

      setIsSubmitting(true);

      try {
        // Verify that recovery session exists
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) throw sessionError;

        if (!session) {
          throw new Error(
            "Your reset session has expired. Please request a new password reset link."
          );
        }

        // Update password
        const { error } = await supabase.auth.updateUser({
          password,
        });

        if (error) throw error;

        // Sign out after successful password update
        const { error: signOutError } =
          await supabase.auth.signOut();

        if (signOutError) {
          console.error("Sign out error:", signOutError);
        }

        // Clear form
        setForm(initialForm);
        setMode("signin");

        // Remove recovery tokens and query parameters
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname
        );

        setMessage({
          type: "success",
          text: "Password updated successfully. Please sign in with your new password.",
        });
      } catch (error) {
        console.error("Password update error:", error);

        setMessage({
          type: "error",
          text:
            error instanceof Error
              ? error.message
              : "Unable to update password.",
        });
      } finally {
        setIsSubmitting(false);
      }

      return;
    }

    // SIGN UP VALIDATION
    if (mode === "signup") {
      const fullName = form.fullName.trim();
      const username = form.username.trim().toLowerCase();

      if (fullName.length < 2 || fullName.length > 100) {
        setMessage({
          type: "error",
          text: "Full name must be between 2 and 100 characters.",
        });
        return;
      }

      if (!/^[a-z0-9][a-z0-9_]{2,29}$/.test(username)) {
        setMessage({
          type: "error",
          text: "Username must be 3–30 characters: letters, numbers, and underscores; it must start with a letter or number.",
        });
        return;
      }

      if (password.length < 8) {
        setMessage({
          type: "error",
          text: "Password must be at least 8 characters long.",
        });
        return;
      }

      if (password !== form.confirmPassword) {
        setMessage({
          type: "error",
          text: "Passwords do not match.",
        });
        return;
      }
    }

    // SIGN IN / SIGN UP
    setIsSubmitting(true);

    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        setMessage({
          type: "success",
          text: "Signed in. Loading your dashboard...",
        });
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: form.fullName.trim(),
              username: form.username.trim().toLowerCase(),
            },
          },
        });

        if (error) throw error;

        if (data.session) {
          setMessage({
            type: "success",
            text: "Account created. Loading your dashboard...",
          });
        } else {
          setMessage({
            type: "success",
            text: "Account created. Check your email to confirm your account before signing in.",
          });
        }
      }
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Authentication request failed. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  // SUPABASE CONNECTION TEST
  async function handleTestConnection() {
    setIsTestingConnection(true);
    setConnectionResult(null);

    try {
      await testSupabaseConnection();

      setConnectionResult({
        isError: false,
        text: "Connected to the Supabase REST API.",
      });
    } catch (error) {
      setConnectionResult({
        isError: true,
        text:
          error instanceof Error
            ? error.message
            : "Supabase connection test failed.",
      });
    } finally {
      setIsTestingConnection(false);
    }
  }

  const isSignup = mode === "signup";
  const isForgot = mode === "forgot";
  const isReset = mode === "reset";

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#171515] px-4 py-12 text-[#f5eee5]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-40 top-[-12rem] h-[32rem] w-[32rem] rounded-full bg-[#8f2638]/10 blur-[110px]"
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-56 -right-36 h-[32rem] w-[32rem] rounded-full bg-[#9c733b]/[0.07] blur-[120px]"
      />

      <div className="relative grid w-full max-w-[1020px] overflow-hidden rounded-2xl border border-white/[0.09] bg-[#1c1a1a] shadow-2xl shadow-black/30 md:grid-cols-[1fr_0.92fr]">
        <section className="flex min-h-[280px] flex-col justify-between border-b border-white/[0.07] bg-[radial-gradient(ellipse_at_top_left,_rgba(168,50,69,0.14),_transparent_55%)] p-7 sm:p-10 md:min-h-[600px] md:border-b-0 md:border-r md:p-12">
          <Logo />

          <div className="py-9 md:py-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#bd6875]">
              GWE salary management
            </p>

            <h1 className="mt-5 max-w-md text-4xl font-semibold leading-[1.12] tracking-[-0.04em] text-[#f5eee5] sm:text-5xl">
              Built for the
              <br />
              <span className="text-[#cc6979]">grind.</span>
            </h1>

            <p className="mt-5 max-w-sm text-sm leading-6 text-[#938c87]">
              A focused workspace for GWE ESPORTS members and administrators.
            </p>
          </div>

          <p className="hidden text-[10px] font-medium uppercase tracking-[0.22em] text-[#67615e] md:block">
            GRIND WITH EXP
          </p>
        </section>

        <section className="flex flex-col justify-center p-6 sm:p-10 md:p-12">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#bc6976]">
              {isSignup
                ? "Join GWE ESPORTS"
                : isForgot
                  ? "Account recovery"
                  : isReset
                    ? "Create new password"
                    : "Welcome back"}
            </p>

            <h2 className="mt-3 text-2xl font-semibold tracking-tight">
              {isSignup
                ? "Create your account"
                : isForgot
                  ? "Forgot your password?"
                  : isReset
                    ? "Reset your password"
                    : "Sign in to your account"}
            </h2>

            <p className="mt-2 text-sm text-[#8d8681]">
              {isSignup
                ? "Create a member account to get started."
                : isForgot
                  ? "Enter your registered email to receive a password reset link."
                  : isReset
                    ? "Choose a strong new password for your account."
                    : "Use your GWE ESPORTS account credentials."}
            </p>
          </div>

          {!isForgot && !isReset && (
            <div
              aria-label="Authentication mode"
              className="mt-6 grid grid-cols-2 rounded-lg border border-white/[0.08] bg-[#151313]/70 p-1"
              role="tablist"
            >
              <button
                aria-selected={!isSignup}
                className={`rounded-md px-3 py-2.5 text-xs font-medium transition ${
                  !isSignup
                    ? "bg-[#a83245]/20 text-[#f0b6bd]"
                    : "text-[#89817c] hover:text-[#d6cec8]"
                }`}
                onClick={() => changeMode("signin")}
                role="tab"
                type="button"
              >
                Sign In
              </button>

              <button
                aria-selected={isSignup}
                className={`rounded-md px-3 py-2.5 text-xs font-medium transition ${
                  isSignup
                    ? "bg-[#a83245]/20 text-[#f0b6bd]"
                    : "text-[#89817c] hover:text-[#d6cec8]"
                }`}
                onClick={() => changeMode("signup")}
                role="tab"
                type="button"
              >
                Sign Up
              </button>
            </div>
          )}

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            {isSignup && (
              <>
                <label className="block">
                  <span className="mb-2 block text-xs font-medium text-[#c9c1bb]">
                    Full Name
                  </span>

                  <input
                    autoComplete="name"
                    className={inputClassName}
                    maxLength={100}
                    name="fullName"
                    onChange={updateField}
                    placeholder="Enter your full name"
                    required
                    value={form.fullName}
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-medium text-[#c9c1bb]">
                    Username
                  </span>

                  <input
                    autoComplete="username"
                    className={inputClassName}
                    maxLength={30}
                    minLength={3}
                    name="username"
                    onChange={updateField}
                    pattern="[A-Za-z0-9][A-Za-z0-9_]{2,29}"
                    placeholder="Choose a username"
                    required
                    title="Use 3–30 letters, numbers, or underscores; start with a letter or number."
                    value={form.username}
                  />
                </label>
              </>
            )}

            {!isReset && (
              <label className="block">
                <span className="mb-2 block text-xs font-medium text-[#c9c1bb]">
                  Email
                </span>

                <input
                  autoComplete="email"
                  className={inputClassName}
                  name="email"
                  onChange={updateField}
                  placeholder="Enter your email"
                  required
                  type="email"
                  value={form.email}
                />
              </label>
            )}

            {!isForgot && (
              <label className="block">
                <span className="mb-2 block text-xs font-medium text-[#c9c1bb]">
                  {isReset ? "New Password" : "Password"}
                </span>

                <input
                  autoComplete={
                    isSignup || isReset
                      ? "new-password"
                      : "current-password"
                  }
                  className={inputClassName}
                  minLength={isSignup || isReset ? 8 : undefined}
                  name="password"
                  onChange={updateField}
                  placeholder={
                    isReset
                      ? "Enter your new password"
                      : "Enter your password"
                  }
                  required
                  type="password"
                  value={form.password}
                />
              </label>
            )}

            {(isSignup || isReset) && (
              <label className="block">
                <span className="mb-2 block text-xs font-medium text-[#c9c1bb]">
                  Confirm Password
                </span>

                <input
                  autoComplete="new-password"
                  className={inputClassName}
                  name="confirmPassword"
                  onChange={updateField}
                  placeholder="Confirm your password"
                  required
                  type="password"
                  value={form.confirmPassword}
                />
              </label>
            )}

            {!isSignup && !isForgot && !isReset && (
              <div className="flex justify-end">
                <button
                  className="text-xs font-medium text-[#cc6979] transition hover:text-[#f0b6bd]"
                  onClick={() => changeMode("forgot")}
                  type="button"
                >
                  Forgot Password?
                </button>
              </div>
            )}

            <button
              className="w-full rounded-lg bg-[#a83245] px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-[#b93c50] focus:outline-none focus:ring-2 focus:ring-[#d47a88] focus:ring-offset-2 focus:ring-offset-[#1c1a1a] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!supabase || isSubmitting}
              type="submit"
            >
              {isSubmitting
                ? "Please wait..."
                : isSignup
                  ? "Create account"
                  : isForgot
                    ? "Send Reset Link"
                    : isReset
                      ? "Update Password"
                      : "Sign in"}
            </button>
          </form>

          {(isForgot || isReset) && (
            <button
              className="mt-4 text-center text-xs font-medium text-[#cc6979] transition hover:text-[#f0b6bd]"
              onClick={() => changeMode("signin")}
              type="button"
            >
              ← Back to Sign In
            </button>
          )}

          {message && (
            <p
              aria-live="polite"
              className={`mt-4 rounded-lg border px-3 py-2.5 text-xs leading-5 ${
                message.type === "error"
                  ? "border-[#bd8b55]/25 bg-[#bd8b55]/[0.08] text-[#ddbd91]"
                  : "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300"
              }`}
              role={message.type === "error" ? "alert" : "status"}
            >
              {message.text}
            </p>
          )}

          {!isForgot && !isReset && (
            <section
              aria-label="Supabase connection test"
              className="mt-5 rounded-lg border border-white/[0.08] bg-[#151313]/70 p-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-medium text-[#d6cec8]">
                    Supabase connection
                  </p>

                  <p className="mt-1 text-[11px] leading-5 text-[#817b77]">
                    Checks that the project REST API is reachable.
                  </p>
                </div>

                <button
                  className="shrink-0 rounded-lg border border-white/[0.12] px-3 py-2 text-xs font-medium text-[#d6cec8] transition hover:border-[#a83245]/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!supabase || isTestingConnection}
                  onClick={handleTestConnection}
                  type="button"
                >
                  {isTestingConnection ? "Testing..." : "Test connection"}
                </button>
              </div>

              {supabaseConfigError && (
                <p
                  aria-live="polite"
                  className="mt-3 text-xs leading-5 text-[#ddbd91]"
                  role="alert"
                >
                  {supabaseConfigError}
                </p>
              )}

              {connectionResult && (
                <p
                  aria-live="polite"
                  className={`mt-3 text-xs leading-5 ${
                    connectionResult.isError
                      ? "text-[#ddbd91]"
                      : "text-emerald-300"
                  }`}
                  role={connectionResult.isError ? "alert" : "status"}
                >
                  {connectionResult.text}
                </p>
              )}
            </section>
          )}
        </section>
      </div>
    </main>
  );
}