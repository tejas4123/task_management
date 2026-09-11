import { useId, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { Icon } from "./Icon";

/**
 * The top of every page, in one place.
 *
 * Each page previously hand-assembled its own eyebrow/title/subtitle/action
 * block, so placement and spacing drifted. Routing every page through this
 * makes the pattern in section 24 actually hold.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  backTo,
  backLabel,
  actions,
  meta,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  backTo?: string;
  backLabel?: string;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header className="page-header">
      {backTo ? (
        <p className="crumbs">
          <Link to={backTo}>
            <Icon name="arrow-left" /> {backLabel ?? "Back"}
          </Link>
        </p>
      ) : null}

      <div className="page-header__row">
        <div className="page-header__copy">
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h1>{title}</h1>
          {description ? <p className="subtitle">{description}</p> : null}
        </div>
        {actions || meta ? (
          <div className="page-header__actions">
            {meta}
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}

export interface TabItem {
  id: string;
  label: string;
  /** Rendered beside the label - a count, usually. Omit when zero is noise. */
  badge?: number;
}

/**
 * Tabs following the WAI-ARIA tabs pattern: roving focus with arrow keys,
 * `aria-selected`, and panels wired by id. The active tab is underlined *and*
 * weighted, so it does not rely on colour alone.
 */
export function Tabs({
  items,
  active,
  onChange,
}: {
  items: TabItem[];
  active: string;
  onChange: (id: string) => void;
}) {
  const base = useId();

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const index = items.findIndex((item) => item.id === active);
    if (index < 0) return;

    const offset =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (offset === 0) return;

    event.preventDefault();
    onChange(items[(index + offset + items.length) % items.length].id);
  }

  return (
    <div className="tabs" role="tablist">
      {items.map((item) => {
        const selected = item.id === active;
        return (
          <button
            key={item.id}
            id={`${base}-tab-${item.id}`}
            role="tab"
            type="button"
            aria-selected={selected}
            aria-controls={`${base}-panel-${item.id}`}
            tabIndex={selected ? 0 : -1}
            className={`tabs__tab ${selected ? "tabs__tab--active" : ""}`}
            onClick={() => onChange(item.id)}
            onKeyDown={onKeyDown}
          >
            {item.label}
            {item.badge !== undefined && item.badge > 0 ? (
              <span className="tabs__badge">{item.badge}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  id,
  active,
  children,
}: {
  id: string;
  active: string;
  children: ReactNode;
}) {
  if (id !== active) return null;
  return <div role="tabpanel">{children}</div>;
}

/**
 * A removable filter chip. Makes an applied filter visible as an object the
 * user can dismiss, rather than a select they have to hunt back through.
 */
export function Chip({ label, value, onRemove }: { label: string; value: string; onRemove: () => void }) {
  return (
    <span className="chip">
      <span className="chip__label">{label}</span>
      <span className="chip__value">{value}</span>
      <button type="button" onClick={onRemove} aria-label={`Remove ${label} filter: ${value}`}>
        <Icon name="close" />
      </button>
    </span>
  );
}
