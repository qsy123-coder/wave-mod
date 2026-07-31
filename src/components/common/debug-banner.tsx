"use client";

export function DebugBanner() {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 99999,
        background: "red",
        color: "white",
        padding: "8px 16px",
        fontSize: 14,
        fontWeight: 900,
        fontFamily: "monospace",
        textAlign: "center",
      }}
    >
      DEPLOY: {Date.now()} | HOST: {typeof window !== "undefined" ? window.location.hostname : "SSR"} | COMMIT: 8a4da23
    </div>
  );
}
