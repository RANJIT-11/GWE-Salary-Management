import Logo from "./Logo";

export default function Navbar({ username, role, onSignOut }) {
  return (
    <header className="sticky top-0 z-20 border-b border-white/[0.08] bg-[#171515]/95 backdrop-blur">
      <div className="mx-auto flex h-[76px] max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
        <Logo />
        <div className="flex items-center gap-3 sm:gap-5">
          <span className="hidden rounded-full border border-[#a83245]/35 bg-[#a83245]/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#e69aa5] sm:inline-flex">
            Supabase session
          </span>
          {username && (
            <div className="hidden text-right sm:block">
              <p className="max-w-36 truncate text-sm font-medium text-[#f5eee5]">
                {username}
              </p>
              <p className="mt-0.5 text-[11px] capitalize text-[#89837f]">
                {role} account
              </p>
            </div>
          )}
          {onSignOut && (
            <button
              className="rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-[#c7c0bb] transition hover:border-white/20 hover:text-white sm:px-4 sm:text-sm"
              onClick={onSignOut}
              type="button"
            >
              Sign out
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
