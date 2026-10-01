"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics";

export function ClearDraft() {
  useEffect(() => {
    try {
      sessionStorage.removeItem("ah_registration_draft");
    } catch {
      /* ignore */
    }
    track("payment_success", { purpose: "registration" });
  }, []);
  return null;
}
