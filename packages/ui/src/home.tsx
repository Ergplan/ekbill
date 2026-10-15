import type { ReactNode } from 'react';

import { Icon } from './Icon';
import { Avatar, Money, StatusPill, type Status } from './primitives';

/* ------------------------------------------------------ HeroPanel/Folder --- */

export type HeroTone = 'hero' | 'panel' | 'gst';

export interface Peek {
  title: string;
  sub: string;
  amount: ReactNode;
}

/**
 * One gradient hero per screen. Narangi draws a gradient card with three wave
 * lines; Harmony draws a folder: a back plate, two or three peeking glass
 * bills, and a tabbed front. Both are the same component; CSS branches on
 * data-theme (the one place the pack allows it).
 */
export function HeroPanel({
  tone = 'hero',
  eyebrow,
  chip,
  title,
  emphasis,
  sub,
  peeks = [],
  children,
  guide,
}: {
  tone?: HeroTone;
  eyebrow?: ReactNode;
  chip?: ReactNode;
  title?: ReactNode;
  emphasis?: ReactNode;
  sub?: ReactNode;
  peeks?: Peek[];
  children?: ReactNode;
  guide?: string;
}) {
  return (
    <section className={`eb-hero eb-hero--${tone}`} data-guide={guide}>
      <div className="eb-hero__back" aria-hidden="true" />
      <ul className="eb-hero__peeks" aria-hidden="true">
        {peeks.slice(0, 3).map((p, i) => (
          <li key={i} className="eb-hero__peek">
            <span className="eb-hero__peek-tag">Bill</span>
            <span className="eb-hero__peek-title">{p.title}</span>
            <span className="eb-hero__peek-sub">{p.sub}</span>
            <span className="eb-hero__peek-amount eb-num">{p.amount}</span>
          </li>
        ))}
      </ul>
      <div className="eb-hero__front">
        <svg className="eb-hero__waves" viewBox="0 0 360 120" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 70 C60 30 110 100 180 60 S300 30 360 70" />
          <path d="M0 80 C70 50 120 110 190 70 S300 40 360 80" />
          <path d="M0 95 C60 60 120 120 200 85 S310 55 360 95" />
        </svg>
        <div className="eb-hero__body">
          {eyebrow || chip ? (
            <div className="eb-hero__top">
              {eyebrow ? <span className="eb-hero__eyebrow">{eyebrow}</span> : <span />}
              {chip ? <span className="eb-hero__chip">{chip}</span> : null}
            </div>
          ) : null}
          {title ? (
            <h2 className="eb-hero__title">
              {title}
              {emphasis ? (
                <>
                  <br />
                  <span className="eb-emph">{emphasis}</span>
                </>
              ) : null}
            </h2>
          ) : null}
          {sub ? <p className="eb-hero__sub">{sub}</p> : null}
          {children}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- chips --- */

export function ClientChip({
  name,
  index,
  onClick,
  href,
  guide,
}: {
  name: string;
  index: number;
  onClick?: () => void;
  href?: string;
  guide?: string;
}) {
  const inner = (
    <>
      <Avatar name={name} index={index} size="chip" />
      <span className="eb-clientchip__name">{name}</span>
    </>
  );
  if (href) {
    return (
      <a href={href} className="eb-clientchip" data-guide={guide}>
        {inner}
      </a>
    );
  }
  return (
    <button type="button" className="eb-clientchip" onClick={onClick} data-guide={guide}>
      {inner}
    </button>
  );
}

export function NewCustomerChip({
  label,
  onClick,
  href,
  icon = 'plus',
  guide,
}: {
  label: string;
  onClick?: () => void;
  href?: string;
  icon?: 'plus' | 'camera';
  guide?: string;
}) {
  const inner = (
    <>
      <span className="eb-clientchip__disc" aria-hidden="true">
        <Icon name={icon} size={18} />
      </span>
      <span className="eb-clientchip__name">{label}</span>
    </>
  );
  if (href) {
    return (
      <a href={href} className="eb-clientchip eb-clientchip--new" data-guide={guide}>
        {inner}
      </a>
    );
  }
  return (
    <button type="button" className="eb-clientchip eb-clientchip--new" onClick={onClick} data-guide={guide}>
      {inner}
    </button>
  );
}

/* ------------------------------------------------------------------ rows --- */

export function BillRow({
  name,
  index,
  meta,
  amountPaise,
  status,
  statusLabel,
  href,
  onClick,
}: {
  name: string;
  index: number;
  meta: ReactNode;
  amountPaise: number;
  status: Status;
  statusLabel: string;
  href?: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <Avatar name={name} index={index} />
      <span className="eb-billrow__text">
        <span className="eb-billrow__name">{name}</span>
        <span className="eb-billrow__meta">{meta}</span>
      </span>
      <span className="eb-billrow__right">
        <Money paise={amountPaise} whole />
        <StatusPill status={status} label={statusLabel} />
      </span>
    </>
  );
  if (href) {
    return (
      <a href={href} className="eb-billrow">
        {body}
      </a>
    );
  }
  return (
    <button type="button" className="eb-billrow" onClick={onClick}>
      {body}
    </button>
  );
}

export function OwedRow({
  name,
  age,
  overdue,
  amountPaise,
  action,
  oldest,
  guide,
  href,
}: {
  name: string;
  age: ReactNode;
  overdue?: boolean;
  amountPaise: number;
  action: ReactNode;
  oldest?: boolean;
  guide?: string;
  /** The row itself opens the bill (8.0: Home → dues row → Paise aa gaye). */
  href?: string;
}) {
  const text = (
    <>
      <span className="eb-owedrow__text">
        <span className="eb-owedrow__name">{name}</span>
        <span className={`eb-owedrow__age${overdue ? ' eb-owedrow__age--due' : ''}`}>{age}</span>
      </span>
      <Money paise={amountPaise} whole />
    </>
  );
  return (
    <li className={`eb-owedrow${oldest ? ' eb-owedrow--oldest' : ''}`} data-guide={guide}>
      {href ? (
        <a href={href} className="eb-owedrow__link" aria-label={name}>
          {text}
        </a>
      ) : (
        text
      )}
      {action}
    </li>
  );
}

export function StatTile({
  title,
  value,
  sub,
  icon,
}: {
  title: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="eb-stat">
      <div className="eb-stat__head">
        <span className="eb-stat__title">{title}</span>
        {icon}
      </div>
      <div className="eb-stat__value">
        <span className="eb-stat__figure eb-num">{value}</span>
        {sub ? <span className="eb-stat__sub">{sub}</span> : null}
      </div>
    </div>
  );
}

/** Eight weeks of bars. Values are counts; height scales to the max. */
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  const max = Math.max(1, ...values);
  const w = 8;
  const gap = 8;
  return (
    <svg className="eb-spark" role="img" aria-label={label} viewBox={`0 0 ${values.length * (w + gap)} 28`} height={28}>
      {values.map((v, i) => {
        const h = Math.max(2, Math.round((v / max) * 24));
        return <rect key={i} x={i * (w + gap)} y={28 - h} width={2} height={h} rx={1} />;
      })}
    </svg>
  );
}

/**
 * Unpaid bills by age. Narangi: a dotted baseline with arcs between dots;
 * Harmony: a solid line to "now" with a ▼ marker and a dotted remainder.
 * Both from the same data; CSS picks the drawing.
 */
export function AgeingIndicator({
  ages,
  todayLabel,
  dayLabel,
}: {
  ages: number[];
  todayLabel: string;
  dayLabel: (d: number) => string;
}) {
  const sorted = [...ages].sort((a, b) => b - a);
  const maxAge = Math.max(30, sorted[0] ?? 0);
  const x = (age: number) => 20 + Math.round(((maxAge - age) / maxAge) * 300);
  const pts = sorted.map((a) => ({ a, x: x(a) }));
  return (
    <svg
      className="eb-ageing"
      role="img"
      aria-label={`${sorted.map((a) => dayLabel(a)).join(', ')} · ${todayLabel}`}
      viewBox="0 0 340 74"
    >
      <path className="eb-ageing__base" d="M6 54H334" />
      <path className="eb-ageing__solid" d={`M${pts[0]?.x ?? 20} 54H320`} />
      {pts.slice(0, -1).map((p, i) => {
        const next = pts[i + 1]!;
        const r = (next.x - p.x) / 2;
        return (
          <path
            key={i}
            className="eb-ageing__arc"
            d={`M${p.x} 54 A${r} ${Math.min(52, r * 0.65)} 0 0 1 ${next.x} 54`}
            style={{ opacity: 1 - i * 0.25 }}
          />
        );
      })}
      {pts.length ? (
        <path
          className="eb-ageing__arc"
          d={`M${pts[pts.length - 1]!.x} 54 A${(320 - pts[pts.length - 1]!.x) / 2} 14 0 0 1 320 54`}
          style={{ opacity: 0.3 }}
        />
      ) : null}
      {pts.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={54}
          r={i === 0 ? 5 : 4.5}
          className={i === 0 ? 'eb-ageing__dot--oldest' : 'eb-ageing__dot'}
        />
      ))}
      <circle cx={320} cy={54} r={4} className="eb-ageing__dot--today" />
      <path className="eb-ageing__marker" d={`M${pts[0]?.x ?? 20} 44l5 8h-10z`} />
      {pts.map((p, i) => (
        <text key={`t${i}`} x={p.x} y={71} textAnchor="middle" className="eb-ageing__label">
          {dayLabel(p.a)}
        </text>
      ))}
      <text x={320} y={71} textAnchor="middle" className="eb-ageing__label">
        {todayLabel}
      </text>
    </svg>
  );
}
