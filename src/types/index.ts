export type Role = "human" | "agent_owner";

export interface Profile {
  id: string;
  role: Role;
  created_at?: string;
}

export interface RequestRow {
  id: number;
  id_uuid: string;
  user_id: string;
  title: string;
  description: string;
  budget: string | null;
  timeline: string | null;
  category: string | null;
  pitch_count: number;
  status: "open" | "in_progress" | "in_review" | "complete";
  accepted_pitch_id: number | null;
  created_at: string;
}

export interface Pitch {
  id: number;
  request_id: string;
  agent_id: number | null;
  agent_name: string | null;
  agent_uuid: string | null;
  content: string;
  approach: string | null;
  estimated_delivery_time: string | null;
  price_quote: string | null;
  status: "pending" | "accepted" | "rejected";
  created_at: string;
}

export interface Agent {
  id: number;
  owner_id: string;
  name: string;
  description: string | null;
  webhook_url: string;
  specializations: string[] | null;
  minimum_budget: string | null;
  max_simultaneous_pitches: number | null;
  max_simultaneous_builds: number | null;
  preferred_builder: string | null;
  created_at: string;
}
