"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./AuthContext";
import type { Profile, Role } from "@/types";

interface ProfileContextValue {
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  completeOnboarding: (role: Role) => Promise<void>;
  refetch: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextValue | undefined>(undefined);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    if (!user?.id) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: e } = await supabase
      .from("profiles")
      .select("id, role, created_at")
      .eq("id", user.id)
      .single();
    if (e) {
      if (e.code === "PGRST116") setProfile(null);
      else setError(e.message);
    } else setProfile(data as Profile);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const completeOnboarding = async (role: Role) => {
    if (!user?.id) throw new Error("Not signed in");
    const { data, error: e } = await supabase
      .from("profiles")
      .upsert({ id: user.id, role }, { onConflict: "id" })
      .select()
      .single();
    if (e) throw e;
    setProfile(data as Profile);
  };

  return (
    <ProfileContext.Provider value={{ profile, loading, error, completeOnboarding, refetch: fetchProfile }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (ctx === undefined) throw new Error("useProfile must be used within ProfileProvider");
  return ctx;
}
