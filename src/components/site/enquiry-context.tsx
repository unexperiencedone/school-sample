"use client";

import dynamic from "next/dynamic";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

const EnquiryDrawer = dynamic(() => import("./enquiry-drawer"), { ssr: false });

type Ctx = { openEnquiry: (from?: string) => void };
const EnquiryCtx = createContext<Ctx>({ openEnquiry: () => {} });

export const useEnquiry = () => useContext(EnquiryCtx);

/** Global "Enquire now" side drawer, available on every public page. Its code loads on first open. */
export function EnquiryProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const openEnquiry = useCallback(() => {
    setMounted(true);
    setOpen(true);
  }, []);
  const value = useMemo(() => ({ openEnquiry }), [openEnquiry]);
  return (
    <EnquiryCtx.Provider value={value}>
      {children}
      {mounted && <EnquiryDrawer open={open} onOpenChange={setOpen} />}
    </EnquiryCtx.Provider>
  );
}

export function EnquireButton({ children, className }: { children: ReactNode; className?: string }) {
  const { openEnquiry } = useEnquiry();
  return (
    <button type="button" className={className} onClick={() => openEnquiry()}>
      {children}
    </button>
  );
}
