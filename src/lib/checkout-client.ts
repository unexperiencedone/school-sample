"use client";

import type { Checkout } from "@/integrations/payments/types";

type W = Window & {
  Razorpay?: new (o: unknown) => { open: () => void };
  Cashfree?: (o: { mode: string }) => { checkout: (o: unknown) => void };
};

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

/** Starts any provider's checkout: plain redirect (mock), form POST redirect (PayU) or inline JS (Razorpay, Cashfree). */
export async function startCheckout(checkout: Checkout): Promise<void> {
  if (checkout.type === "redirect" && checkout.method === "POST" && checkout.url) {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = checkout.url;
    for (const [k, v] of Object.entries(checkout.params ?? {})) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = k;
      input.value = String(v);
      form.appendChild(input);
    }
    document.body.appendChild(form);
    form.submit();
    return;
  }
  if (checkout.type === "redirect" && checkout.url) {
    window.location.assign(checkout.url);
    return;
  }
  if (checkout.type === "inline" && checkout.scriptSrc) {
    await loadScript(checkout.scriptSrc);
    const w = window as W;
    if (w.Razorpay) return new w.Razorpay(checkout.params).open();
    if (w.Cashfree) {
      const p = checkout.params as { mode: string; paymentSessionId: string; redirectTarget: string };
      return w
        .Cashfree({ mode: p.mode })
        .checkout({ paymentSessionId: p.paymentSessionId, redirectTarget: p.redirectTarget });
    }
  }
  throw new Error("Unsupported checkout");
}
