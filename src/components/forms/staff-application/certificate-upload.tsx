"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, FileUp, Loader2, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";

const ACCEPT = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

type State =
  | { status: "empty" }
  | { status: "uploading"; fileName: string; progress: number }
  | { status: "done"; fileName?: string }
  | { status: "error"; message: string };

type Target = { url: string; headers: Record<string, string>; key: string; completeUrl?: string };

/**
 * One certificate slot for an education row. Same flow as registration documents: ask the API for a signed target,
 * PUT the file straight to storage with progress, then hand the storage key back to the form.
 */
export function CertificateUpload({
  id,
  name,
  slot,
  label,
  applicationId,
  token,
  storedKey,
  onChange,
  onBusyChange,
}: {
  id: string;
  /** Form field this slot fills; on the file input so a failed validation can focus it. */
  name: string;
  /** Upload slot the API accepts, for example "education-0". */
  slot: string;
  label: string;
  applicationId: string;
  token: string;
  storedKey: string | undefined;
  onChange: (key: string) => void;
  /** Called with true while a file is uploading, and with false when it stops (or this slot goes away). */
  onBusyChange: (busy: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>(storedKey ? { status: "done" } : { status: "empty" });

  const upload = async (file: File) => {
    if (!ACCEPT.includes(file.type))
      return setState({ status: "error", message: "Use a PDF, JPG, PNG or WebP file." });
    if (file.size > MAX_BYTES)
      return setState({ status: "error", message: "Files must be 5 MB or smaller." });
    setState({ status: "uploading", fileName: file.name, progress: 0 });
    try {
      const res = await fetch(`/api/staff-applications/${encodeURIComponent(applicationId)}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-resume-token": token },
        body: JSON.stringify({ slot, fileName: file.name, mime: file.type, size: file.size }),
      });
      const target = (await res.json()) as Partial<Target> & { error?: { message?: string } };
      if (!res.ok || !target.url || !target.key)
        throw new Error(target.error?.message ?? "We couldn't start the upload.");
      await put(target as Target, file, (progress) =>
        setState((s) => (s.status === "uploading" ? { ...s, progress } : s)),
      );
      if (target.completeUrl) {
        // Uploaded straight to the object store: the server now checks the file it received
        const done = await fetch(target.completeUrl, { method: "POST" });
        if (!done.ok) {
          const body = (await done.json().catch(() => null)) as { error?: { message?: string } } | null;
          throw new Error(body?.error?.message ?? "The file couldn't be verified.");
        }
      }
      setState({ status: "done", fileName: file.name });
      onChange(target.key);
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : "The upload failed." });
    }
  };

  const hintId = `${id}-hint`;
  const busy = state.status === "uploading";
  useEffect(() => {
    if (!busy) return;
    onBusyChange(true);
    return () => onBusyChange(false);
  }, [busy, onBusyChange]);
  return (
    <div
      className={cn(
        "min-w-0 rounded-lg border p-4 sm:col-span-2",
        state.status === "done" ? "border-success/40 bg-success-bg/40" : "border-dashed border-line-strong",
      )}
    >
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <p id={hintId} className="mt-0.5 min-w-0 text-xs break-words text-muted">
        {state.status === "done"
          ? `Certificate attached${state.fileName ? `: ${state.fileName}` : ""}`
          : state.status === "uploading"
            ? `Uploading ${state.fileName}`
            : "Optional. PDF, JPG, PNG or WebP, up to 5 MB."}
      </p>
      <input
        ref={input}
        id={id}
        name={name}
        type="file"
        accept={ACCEPT.join(",")}
        className="sr-only"
        aria-describedby={hintId}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = "";
        }}
      />
      {busy && (
        <div
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-sunken"
          role="progressbar"
          aria-label={`Uploading ${label}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={state.progress}
        >
          <div className="h-full bg-primary transition-all" style={{ width: `${state.progress}%` }} />
        </div>
      )}
      {state.status === "error" && (
        <p role="alert" className="mt-2 text-xs font-medium text-danger">
          {state.message}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          className="inline-flex min-h-11 items-center gap-2 rounded-md border border-line-strong px-4 text-sm hover:bg-sunken focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-50"
        >
          {state.status === "done" ? (
            <RotateCcw className="size-4" aria-hidden />
          ) : (
            <FileUp className="size-4" aria-hidden />
          )}
          {state.status === "done" ? "Replace file" : "Choose file"}
        </button>
        {state.status === "done" && (
          <button
            type="button"
            onClick={() => {
              setState({ status: "empty" });
              onChange("");
            }}
            className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm text-muted hover:bg-sunken hover:text-fg focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <X className="size-4" aria-hidden /> Remove file
          </button>
        )}
        {state.status === "done" && <CheckCircle2 className="size-5 text-success" aria-label="Uploaded" />}
        {busy && <Loader2 className="size-5 animate-spin text-muted" aria-label="Uploading" />}
      </div>
    </div>
  );
}

function put(target: Target, file: File, onProgress: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", target.url);
    for (const [k, v] of Object.entries(target.headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () =>
      xhr.status < 300
        ? resolve()
        : reject(new Error(messageFrom(xhr.responseText) ?? `Upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(file);
  });
}

function messageFrom(text: string): string | null {
  try {
    return (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? null;
  } catch {
    return null;
  }
}
