import Link from "next/link";
import type { ReactNode } from "react";
import { highlight, type LanguageName } from "sugar-high";
import { CopyButton } from "@/components/copy-button";
import { UsdcMark } from "@/components/debugger-kit";
import { Logo } from "@/components/logo";
import { API_URL } from "@/lib/docs";

/*
 * The docs' building blocks: a page's head, sections with anchors, code, the field lists API
 * references are made of, endpoints, steps, notes and links onward.
 */

export function DocHead({ eyebrow, title, children }: { eyebrow?: string; title: ReactNode; children?: ReactNode }) {
  return (
    <header className="doc-head">
      {eyebrow && <p className="doc-eyebrow">{eyebrow}</p>}
      <h1 className="doc-title">{title}</h1>
      {children && <div className="doc-lede">{children}</div>}
    </header>
  );
}

/** A section heading that links to itself. */
export function H2({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="doc-h2">
      <a href={`#${id}`}>{children}</a>
    </h2>
  );
}

export function H3({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h3 id={id} className="doc-h3">
      {children}
    </h3>
  );
}

const LANG_LABELS: Partial<Record<LanguageName, string>> = {
  shell: "Shell",
  json: "JSON",
  typescript: "TypeScript",
  rust: "Rust",
  plaintext: "Text",
};

/** Code, highlighted on the server, with a copy button. */
export function Code({ code, lang = "json", title }: { code: string; lang?: LanguageName; title?: string }) {
  const text = code.replace(/^\n+|\s+$/g, "");
  return (
    <figure className="doc-code">
      <figcaption className="doc-code-head">
        <span>{title ?? LANG_LABELS[lang] ?? lang}</span>
        <CopyButton value={text} className="doc-code-copy" />
      </figcaption>
      <pre>
        <code dangerouslySetInnerHTML={{ __html: highlight(text, { lang }) }} />
      </pre>
    </figure>
  );
}

// ---- Fields ------------------------------------------------------------------------------------------

export type FieldSpec = {
  name: string;
  type: string;
  description: ReactNode;
  example?: string;
  fields?: FieldSpec[];
};

/** A request's or a response's fields: name and type, what it means, and an example. */
export function Fields({ fields }: { fields: FieldSpec[] }) {
  return (
    <dl className="doc-fields">
      {fields.map((f) => (
        <div key={f.name} className="doc-field">
          <dt>
            <code className="doc-field-name">{f.name}</code>
            <span className="doc-field-type">{f.type}</span>
          </dt>
          <dd>
            <div className="doc-field-desc">{f.description}</div>
            {f.example !== undefined && (
              <p className="doc-field-example">
                <span>Example</span>
                <code>{f.example}</code>
              </p>
            )}
            {f.fields && (
              <div className="doc-field-children">
                <Fields fields={f.fields} />
              </div>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** A route, whole: method, URL and what it takes to call it. */
export function Endpoint({ method, path, auth }: { method: "GET" | "POST"; path: string; auth: string }) {
  return (
    <div className="doc-endpoint">
      <span className="doc-method" data-method={method}>
        {method}
      </span>
      <code className="doc-endpoint-url">
        <span>{API_URL}</span>
        <wbr />
        {path}
      </code>
      <span className="doc-endpoint-auth">{auth}</span>
    </div>
  );
}

// ---- Steps, notes, links -------------------------------------------------------------------------------

export function Steps({ children }: { children: ReactNode }) {
  return <ol className="doc-steps">{children}</ol>;
}

export function Step({ id, title, children }: { id: string; title: ReactNode; children: ReactNode }) {
  return (
    <li className="doc-step">
      <h2 id={id} className="doc-step-title">
        <a href={`#${id}`}>{title}</a>
      </h2>
      <div className="doc-step-body">{children}</div>
    </li>
  );
}

export function Note({ children, tone = "note" }: { children: ReactNode; tone?: "note" | "warn" }) {
  return (
    <aside className="doc-note" data-tone={tone}>
      <svg viewBox="0 0 16 16" aria-hidden="true">
        {tone === "warn" ? (
          <path d="M8 2.2 14.3 13H1.7L8 2.2ZM8 6.4v3M8 11.2v.1" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
        ) : (
          <>
            <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <path d="M8 7.3v3.6M8 5v.1" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </>
        )}
      </svg>
      <div>{children}</div>
    </aside>
  );
}

/** A way onward: a title, a line about it, and an arrow. */
export function LinkCard({ href, title, children, icon }: { href: string; title: string; children: ReactNode; icon?: ReactNode }) {
  const external = href.startsWith("http");
  const inner = (
    <>
      {icon && <span className="doc-card-icon">{icon}</span>}
      <span className="doc-card-text">
        <span className="doc-card-title">{title}</span>
        <span className="doc-card-body">{children}</span>
      </span>
      <svg className="doc-card-arrow" viewBox="0 0 16 16" aria-hidden="true">
        {external ? (
          <path d="M5.5 10.5 10.5 5.5M6.5 5.5h4v4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M3.5 8h9M8.5 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
    </>
  );
  return external ? (
    <a href={href} className="doc-card" target="_blank" rel="noopener noreferrer">
      {inner}
    </a>
  ) : (
    <Link href={href} className="doc-card">
      {inner}
    </Link>
  );
}

export function Cards({ children }: { children: ReactNode }) {
  return <div className="doc-cards">{children}</div>;
}

// ---- Marks in running text ------------------------------------------------------------------------

const PROTOCOL_LOGOS = { morpho: "/protocols/morpho.png", spark: "/protocols/spark.png", aave: "/protocols/aave.svg" } as const;

/** A logo set into a sentence, the size of its letters. */
export function Mark({ of }: { of: "execute" | "usdc" | keyof typeof PROTOCOL_LOGOS }) {
  if (of === "execute") {
    return (
      <span className="doc-mark" data-of="execute">
        <Logo title="" aria-hidden="true" />
      </span>
    );
  }
  if (of === "usdc") {
    return (
      <span className="doc-mark" data-of="usdc">
        <UsdcMark />
      </span>
    );
  }
  return (
    <span className="doc-mark" data-of={of}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={PROTOCOL_LOGOS[of]} alt="" width={20} height={20} />
    </span>
  );
}

/** An address or other long hex value, shortened, with the whole of it on hover. */
export function Hex({ value }: { value: string }) {
  return (
    <code className="doc-hex" title={value}>
      {value.slice(0, 6)}…{value.slice(-4)}
    </code>
  );
}
