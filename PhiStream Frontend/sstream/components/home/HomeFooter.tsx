"use client";

import { footerData, contactEmail as defaultEmail } from "@/lib/content-home";

interface HomeFooterProps {
  email?: string;
  /** Social links from the backend API — note the field is `url`, not `href`. */
  socialLinks?: { label: string; url: string }[];
}

/**
 * HomeFooter — ink footer with back-to-top button.
 * §4.8 — client component (only for the back-to-top scrollTo call).
 *
 * 4-column mono grid: brand | Studio | Services | Contact.
 * Bottom rail: legal links left, back-to-top right.
 */
export function HomeFooter({ email, socialLinks }: HomeFooterProps) {
  const mail = email ?? defaultEmail;

  // Patch the contact column to use the live email
  const columns = [
    ...footerData.columns.slice(0, 2),
    {
      title: "Contact",
      links: [
        { label: mail, href: `mailto:${mail}` },
        { label: "Islamabad", href: null },
        ...(socialLinks ?? []).map((s) => ({ label: s.label, href: s.url })),
      ],
    },
  ];

  return (
    <footer className="pf-footer">
      <div className="pf-tp">
        {/* Col 1: brand */}
        <div>
          <strong>{footerData.brand}</strong>
          <span className="pf-copy">{footerData.copy}</span>
        </div>

        {/* Cols 2–4: link columns */}
        {columns.map((col) => (
          <div key={col.title}>
            <h4>{col.title}</h4>
            <ul>
              {col.links.map((link) => (
                <li key={link.label}>
                  {link.href ? <a href={link.href}>{link.label}</a> : <span>{link.label}</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Bottom rail */}
      <div className="pf-ru">
        {/* Legal links on the left (A-footer addition) */}
        <div className="pf-ru-legal">
          {footerData.legal.map((l) => (
            <a key={l.href} href={l.href}>
              {l.label}
            </a>
          ))}
        </div>

        {/* Back to top on the right */}
        <button
          type="button"
          onClick={() => scrollTo({ top: 0, behavior: "smooth" })}
        >
          Back to top
          <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 14V3M4 7l4-4 4 4" />
          </svg>
        </button>
      </div>
    </footer>
  );
}
