"use client";

import { track } from "@/lib/analytics";
import { school } from "@/config/school";

/** Floating WhatsApp button with UTM-tagged click-to-chat link built from config. */
export function WhatsAppButton() {
  const text = encodeURIComponent(`Hello ${school.shortName}! I'd like to know more about admissions.`);
  const utm = "utm_source=website&utm_medium=whatsapp_float&utm_campaign=admissions";
  const href = `https://wa.me/${school.contact.whatsapp}?text=${text}&${utm}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => track("whatsapp_click", { placement: "float" })}
      className="no-print fixed right-4 bottom-4 z-40 grid size-14 place-items-center rounded-full bg-[#1f8a4c] text-white shadow-lift transition-transform hover:scale-105 focus-visible:scale-105 sm:right-6 sm:bottom-6"
      aria-label="Chat with admissions on WhatsApp (opens in a new tab)"
    >
      <svg viewBox="0 0 24 24" className="size-7" fill="currentColor" aria-hidden>
        <path d="M12.04 2C6.6 2 2.18 6.42 2.18 11.86c0 1.74.46 3.44 1.32 4.94L2 22l5.34-1.4a9.82 9.82 0 0 0 4.7 1.2h.01c5.43 0 9.86-4.42 9.86-9.86A9.86 9.86 0 0 0 12.04 2Zm0 18.13h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.17.83.85-3.09-.2-.32a8.17 8.17 0 0 1-1.25-4.36c0-4.52 3.68-8.2 8.27-8.2a8.2 8.2 0 0 1 8.2 8.2c0 4.53-3.68 8.27-8.21 8.27Zm4.5-6.14c-.25-.12-1.46-.72-1.69-.8-.23-.08-.39-.12-.55.12-.17.25-.64.8-.78.97-.14.16-.29.18-.53.06-.25-.12-1.04-.38-1.98-1.22-.73-.65-1.23-1.46-1.37-1.7-.14-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.12-.15.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.55-1.33-.76-1.82-.2-.48-.4-.42-.55-.42h-.47c-.16 0-.43.06-.66.31-.23.25-.86.84-.86 2.05 0 1.21.88 2.38 1 2.54.12.16 1.74 2.65 4.21 3.72.59.25 1.05.4 1.4.52.59.19 1.13.16 1.55.1.47-.07 1.46-.6 1.66-1.17.21-.58.21-1.07.14-1.17-.06-.1-.22-.16-.47-.29Z" />
      </svg>
    </a>
  );
}
