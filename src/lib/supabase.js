
import { createClient } from "@supabase/supabase-js";

// Read environment variables from frontend/.env
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

// Check for secret or service-role keys
function isServiceRoleKey(key) {
  if (!key) return false;

  return /^(sb_secret_|service_role)/i.test(key);
}

// Validate Supabase configuration
function getConfigurationError() {
  if (!supabaseUrl) {
    return "Missing VITE_SUPABASE_URL in frontend/.env";
  }

  if (!supabaseAnonKey) {
    return "Missing VITE_SUPABASE_ANON_KEY in frontend/.env";
  }

  try {
    const parsedUrl = new URL(supabaseUrl);

    if (
      parsedUrl.protocol !== "https:" ||
      parsedUrl.pathname !== "/" ||
      parsedUrl.search ||
      parsedUrl.hash
    ) {
      return "Invalid Supabase project URL.";
    }
  } catch {
    return "Invalid Supabase project URL.";
  }

  if (isServiceRoleKey(supabaseAnonKey)) {
    return "Do not use a secret or service-role key in frontend.";
  }

  return null;
}

export const supabaseConfigError = getConfigurationError();

// Create Supabase client
export const supabase = supabaseConfigError
  ? null
  : createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    });

// Test Supabase connection
export async function testSupabaseConnection() {
  if (supabaseConfigError || !supabase) {
    throw new Error(
      supabaseConfigError || "Supabase is not configured."
    );
  }

  try {
    const response = await fetch(
      `${supabaseUrl}/auth/v1/health`,
      {
        method: "GET",
        headers: {
          apikey: supabaseAnonKey,
        },
      }
    );

    if (!response.ok) {
      throw new Error(
        `Supabase connection failed. HTTP ${response.status}`
      );
    }

    return true;
  } catch (error) {
    throw new Error(
      error.message || "Unable to connect to Supabase."
    );
  }
}
