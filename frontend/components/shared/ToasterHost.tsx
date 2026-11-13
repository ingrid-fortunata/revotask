"use client";

import { Toaster } from "react-hot-toast";

// The single Toaster, mounted once in the root layout. The max width keeps a toast inside a
// 320 px screen (AUTH-AC13.5).
export function ToasterHost() {
  return <Toaster position="top-center" toastOptions={{ style: { maxWidth: "calc(100vw - 2rem)" } }} />;
}
