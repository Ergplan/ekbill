import type { ReactNode } from 'react';

import { Icon, type IconName } from './Icon';
import { IconButton } from './primitives';

/* --------------------------------------------------------------- TopBar --- */

export function TopBar({
  back,
  onBack,
  title,
  sub,
  actions,
  logo,
}: {
  back?: boolean;
  onBack?: () => void;
  title?: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  logo?: boolean;
}) {
  return (
    <header className="eb-topbar">
      <div className="eb-topbar__left">
        {back ? <IconButton name="back" label="Peeche" onClick={onBack} data-guide="back" /> : null}
        {logo ? <Logo /> : null}
        {title ? (
          <div className="eb-topbar__titles">
            <div className="eb-topbar__title">{title}</div>
            {sub ? <div className="eb-topbar__sub">{sub}</div> : null}
          </div>
        ) : null}
      </div>
      <div className="eb-topbar__right">{actions}</div>
    </header>
  );
}

export function Logo() {
  return (
    <span className="eb-logo">
      <span className="eb-logo__mark" aria-hidden="true">
        e₹
      </span>
      <span className="eb-logo__name">EkBill</span>
    </span>
  );
}

/** The person at the top right: a ring in the hero gradient around an initial. */
export function ProfileRing({ initial, label, onClick }: { initial: string; label: string; onClick?: () => void }) {
  return (
    <button type="button" className="eb-ring" aria-label={label} onClick={onClick}>
      <span className="eb-ring__in">{initial}</span>
    </button>
  );
}

/* --------------------------------------------------------------- TabBar --- */

export interface TabItem {
  key: string;
  label: string;
  icon: IconName;
  href: string;
}

/**
 * Floating pill 26px from the bottom. Ghar · Bills · [GST] · Aap, with the mic
 * as the centre action (master prompt 8.0). Links are plain anchors so the
 * shell works before any router is wired; the app passes a LinkComponent.
 */
export function TabBar({
  items,
  current,
  onMic,
  micLabel,
  renderLink,
}: {
  items: TabItem[];
  current: string;
  onMic?: () => void;
  micLabel: string;
  renderLink?: (item: TabItem, children: ReactNode, active: boolean) => ReactNode;
}) {
  const half = Math.ceil(items.length / 2);
  const left = items.slice(0, half);
  const right = items.slice(half);
  const render = (item: TabItem) => {
    const active = item.key === current;
    const inner = (
      <>
        <Icon name={item.icon} size={20} />
        <span>{item.label}</span>
      </>
    );
    if (renderLink) return <span key={item.key}>{renderLink(item, inner, active)}</span>;
    return (
      <a key={item.key} href={item.href} className="eb-tab" aria-current={active ? 'page' : undefined}>
        {inner}
      </a>
    );
  };
  return (
    <nav className="eb-tabbar" aria-label="Tabs">
      {left.map(render)}
      <button type="button" className="eb-tabbar__mic" aria-label={micLabel} onClick={onMic} data-guide="mic">
        <Icon name="mic" size={22} />
      </button>
      {right.map(render)}
    </nav>
  );
}
