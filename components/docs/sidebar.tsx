"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { DOC_PAGES, DOC_SECTIONS } from "@/lib/docs";

/** The docs' pages, the current one marked. On a phone it folds into a menu under the bar. */
export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const current = DOC_PAGES.find((p) => p.href === pathname);

  // A page change closes the menu.
  useEffect(() => setOpen(false), [pathname]);

  return (
    <nav className="docs-side" aria-label="Docs" data-open={open ? "" : undefined}>
      <button type="button" className="docs-side-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span>{current?.title ?? "Docs"}</span>
        <svg className="docs-side-chevron" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div className="docs-side-list">
        {DOC_SECTIONS.map((section, i) => (
          <div key={section.title ?? i} className="docs-side-section">
            {section.title && <p className="docs-side-title">{section.title}</p>}
            <ul>
              {section.pages.map((page) => (
                <li key={page.href}>
                  <Link href={page.href} className="docs-side-link" aria-current={page.href === pathname ? "page" : undefined}>
                    {page.method && (
                      <span className="docs-side-method" data-method={page.method}>
                        {page.method}
                      </span>
                    )}
                    {page.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}

/** The pages either side of this one, in reading order. */
export function Pager() {
  const pathname = usePathname();
  const i = DOC_PAGES.findIndex((p) => p.href === pathname);
  if (i < 0) return null;
  const prev = DOC_PAGES[i - 1];
  const next = DOC_PAGES[i + 1];
  return (
    <nav className="doc-pager" aria-label="Previous and next">
      {prev ? (
        <Link href={prev.href} className="doc-pager-link" data-dir="prev">
          <span className="doc-pager-label">Previous</span>
          <span className="doc-pager-title">{prev.title}</span>
        </Link>
      ) : (
        <span />
      )}
      {next && (
        <Link href={next.href} className="doc-pager-link" data-dir="next">
          <span className="doc-pager-label">Next</span>
          <span className="doc-pager-title">{next.title}</span>
        </Link>
      )}
    </nav>
  );
}
