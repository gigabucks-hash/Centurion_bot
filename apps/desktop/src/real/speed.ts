/** Timings and the free RPC list returned by the desktop speed command. */
export interface SpeedLatency {
  quote_ms: number;
  sign_ms: number;
  send_ms: number;
  confirm_ms: number;
}

export interface SpeedStatus {
  endpoints: { url: string; role: "owner" | "extra" | "public"; ms: number | null }[];
  fee_mode: "off" | "auto" | "custom";
  jito: boolean;
  tip_lamports: number;
  priority_cap: number;
  percentile: number;
  last: SpeedLatency | null;
  estimate: SpeedLatency;
}
