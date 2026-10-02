"use client";

import { Component, type ReactNode } from "react";

/** A draft may reference a component that doesn't exist; that must only hide the preview, never the editor. */
export class SafePreview extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <p role="alert" className="text-sm text-danger">
        The preview couldn&apos;t be drawn — the post uses something the site doesn&apos;t recognise (an
        unknown component or a {"{expression}"}). Fix it in the body above and save again.
      </p>
    ) : (
      this.props.children
    );
  }
}
