"use client";

/**
 * Last resort: the root layout failed, so none of the site's styles can be
 * trusted. Everything here is inline and uses no site components.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "2rem",
          background: "#2A201A",
          color: "#ECE9DF",
          fontFamily: 'Georgia, "Times New Roman", serif',
        }}
      >
        <main style={{ maxWidth: "34rem" }}>
          <h1 style={{ fontSize: "2.5rem", fontWeight: 400, margin: "0 0 1rem" }}>Something went wrong.</h1>
          <p style={{ fontSize: "1.125rem", lineHeight: 1.6, margin: "0 0 2rem", color: "#A69376" }}>
            That is on our side, not yours. Try again in a moment.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              background: "#C89B3B",
              color: "#2A201A",
              border: 0,
              borderRadius: 999,
              padding: "0.75rem 1.5rem",
              fontSize: "1rem",
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
