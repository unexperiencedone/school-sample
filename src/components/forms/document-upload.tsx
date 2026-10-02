"use client";

import { useRef, useState } from "react";
import { CheckCircle2, FileUp, Loader2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

type State = {
  status: "empty" | "uploading" | "done" | "error";
  fileName?: string;
  progress?: number;
  error?: string;
};

const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp";
const MAX = 5 * 1024 * 1024;

/**
 * One document slot: asks the API for a signed upload target, PUTs the file directly to storage (with progress),
 * and reports success. Works with the local adapter and S3 presigned URLs alike.
 */
export function DocumentUpload({
  applicationId,
  kind,
  label,
  hint,
  draftToken,
  initial,
  onUploaded,
}: {
  applicationId: string;
  kind: string;
  label: string;
  hint?: string;
  draftToken?: string;
  initial?: { fileName?: string | null; status?: string };
  onUploaded?: (fileName: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>(
    initial?.fileName ? { status: "done", fileName: initial.fileName } : { status: "empty" },
  );
  const id = `doc-${kind}`;

  const upload = async (file: File) => {
    if (!ACCEPT.split(",").includes(file.type))
      return setState({ status: "error", error: "Use a PDF, JPG, PNG or WebP file." });
    if (file.size > MAX) return setState({ status: "error", error: "Files must be 5 MB or smaller." });
    setState({ status: "uploading", fileName: file.name, progress: 0 });
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(draftToken ? { "x-draft-token": draftToken } : {}),
      };
      const res = await fetch(`/api/registration/${applicationId}/documents`, {
        method: "POST",
        headers,
        body: JSON.stringify({ kind, fileName: file.name, mime: file.type, size: file.size }),
      });
      const target = (await res.json()) as {
        url?: string;
        headers?: Record<string, string>;
        completeUrl?: string;
        error?: { message: string };
      };
      if (!res.ok || !target.url) throw new Error(target.error?.message ?? "Couldn't start the upload");
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", target.url!);
        for (const [k, v] of Object.entries(target.headers ?? {})) xhr.setRequestHeader(k, v);
        xhr.upload.onprogress = (e) =>
          e.lengthComputable && setState((s) => ({ ...s, progress: Math.round((e.loaded / e.total) * 100) }));
        xhr.onload = () =>
          xhr.status < 300
            ? resolve()
            : reject(new Error(safeMessage(xhr.responseText) ?? `Upload failed (${xhr.status})`));
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.send(file);
      });
      if (target.completeUrl) {
        // Uploaded straight to the object store: the server now checks the file it received
        const done = await fetch(target.completeUrl, { method: "POST" });
        if (!done.ok) {
          const body = (await done.json().catch(() => null)) as { error?: { message: string } } | null;
          throw new Error(body?.error?.message ?? "The file couldn't be verified");
        }
      }
      setState({ status: "done", fileName: file.name });
      onUploaded?.(file.name);
    } catch (e) {
      setState({
        status: "error",
        fileName: file.name,
        error: e instanceof Error ? e.message : "Upload failed",
      });
    }
  };

  return (
    <div
      className={cn(
        "rounded-lg border p-4 transition-colors",
        state.status === "done"
          ? "border-success/40 bg-success-bg/40"
          : state.status === "error"
            ? "border-danger/40"
            : "border-dashed border-line-strong",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <label htmlFor={id} className="font-medium">
            {label}
          </label>
          <p className="truncate text-xs text-muted" id={`${id}-hint`}>
            {state.fileName ?? hint}
          </p>
        </div>
        {state.status === "done" ? (
          <CheckCircle2 className="size-5 shrink-0 text-success" aria-label="Uploaded" />
        ) : state.status === "uploading" ? (
          <Loader2 className="size-5 shrink-0 animate-spin text-muted" aria-label="Uploading" />
        ) : null}
      </div>
      <input
        ref={input}
        id={id}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        aria-describedby={`${id}-hint`}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = "";
        }}
      />
      {state.status === "uploading" && (
        <div
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-sunken"
          role="progressbar"
          aria-valuenow={state.progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Uploading ${label}`}
        >
          <div className="h-full bg-primary transition-all" style={{ width: `${state.progress ?? 0}%` }} />
        </div>
      )}
      {state.error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {state.error}
        </p>
      )}
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={state.status === "uploading"}
        className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-line-strong px-3 py-1.5 text-sm hover:bg-sunken disabled:opacity-50"
      >
        {state.status === "done" ? (
          <RotateCcw className="size-3.5" aria-hidden />
        ) : (
          <FileUp className="size-3.5" aria-hidden />
        )}
        {state.status === "done" ? "Replace file" : "Choose file"}
      </button>
    </div>
  );
}

function safeMessage(text: string): string | null {
  try {
    return (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? null;
  } catch {
    return null;
  }
}
