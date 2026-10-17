import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

import { Icon, type IconName } from './Icon';
import { formatRupees } from './money';

/* ---------------------------------------------------------------- text --- */

/** Display or title text with one emphasised run: "Namaste, <b>Sharma ji</b>". */
export function Display({
  children,
  emphasis,
  as: Tag = 'h1',
  size = 'display',
}: {
  children: ReactNode;
  emphasis?: ReactNode;
  as?: 'h1' | 'h2' | 'p';
  size?: 'display' | 'title';
}) {
  return (
    <Tag className={`eb-${size}`}>
      {children}
      {emphasis ? <span className="eb-emph">{emphasis}</span> : null}
    </Tag>
  );
}

export function Meta({ children }: { children: ReactNode }) {
  return <p className="eb-meta">{children}</p>;
}

/** Hero money: regular Urbanist figures, a lighter ₹ at ~55 %. */
export function MoneyHero({ paise, whole = true }: { paise: number; whole?: boolean }) {
  return (
    <span className="eb-money-hero">
      <span className="eb-money-hero__rupee">₹</span>
      <span className="eb-money-hero__figure eb-num">{formatRupees(paise, { whole })}</span>
    </span>
  );
}

export function Money({ paise, whole }: { paise: number; whole?: boolean }) {
  return <span className="eb-money eb-num">₹{formatRupees(paise, { whole })}</span>;
}

/* ------------------------------------------------------------- surfaces --- */

export function Card({
  children,
  title,
  action,
  className = '',
}: {
  children: ReactNode;
  title?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`eb-card ${className}`.trim()}>
      {title || action ? (
        <div className="eb-card__head">
          {title ? <h2 className="eb-card__title">{title}</h2> : <span />}
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** The tile at the top-right of a card: a muted disc with an icon. */
export function IconChip({ name }: { name: IconName }) {
  return (
    <span className="eb-iconchip" aria-hidden="true">
      <Icon name={name} />
    </span>
  );
}

/* -------------------------------------------------------------- buttons --- */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode };

/** The one primary action on a screen (I9). Narangi: accent pill with an ink disc; Harmony: glow pill. */
export function PrimaryCTA({ children, icon = 'arrow-right', ...rest }: ButtonProps & { icon?: IconName }) {
  return (
    <button type="button" className="eb-cta eb-cta--primary" data-primary="true" {...rest}>
      <span className="eb-cta__label">{children}</span>
      <span className="eb-cta__disc" aria-hidden="true">
        <Icon name={icon} size={22} />
      </span>
    </button>
  );
}

/** The door. The only place --eb-whatsapp appears. */
export function WhatsAppButton({ children, ...rest }: ButtonProps) {
  return (
    <button type="button" className="eb-cta eb-cta--whatsapp" data-primary="true" {...rest}>
      <span className="eb-cta__label">{children}</span>
      <span className="eb-cta__disc" aria-hidden="true">
        <Icon name="send" size={22} />
      </span>
    </button>
  );
}

export function InkButton({ children, ...rest }: ButtonProps) {
  return (
    <button type="button" className="eb-btn eb-btn--ink" {...rest}>
      {children}
    </button>
  );
}

export function GhostButton({ children, ...rest }: ButtonProps) {
  return (
    <button type="button" className="eb-btn eb-btn--ghost" {...rest}>
      {children}
    </button>
  );
}

export function AccentButton({ children, small, ...rest }: ButtonProps & { small?: boolean }) {
  return (
    <button type="button" className={`eb-btn eb-btn--accent${small ? ' eb-btn--small' : ''}`} {...rest}>
      {children}
    </button>
  );
}

export function OutlineButton({ children, small, ...rest }: ButtonProps & { small?: boolean }) {
  return (
    <button type="button" className={`eb-btn eb-btn--outline${small ? ' eb-btn--small' : ''}`} {...rest}>
      {children}
    </button>
  );
}

export function IconButton({
  name,
  label,
  className = '',
  ...rest
}: { name: IconName; label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`eb-iconbtn ${className}`.trim()} aria-label={label} {...rest}>
      <Icon name={name} size={22} />
    </button>
  );
}

/* --------------------------------------------------------------- fields --- */

export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="eb-field">
      <label className="eb-label" htmlFor={id}>
        {label}
      </label>
      {children}
      {error ? (
        <span className="eb-field__error" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="eb-field__hint">{hint}</span>
      ) : null}
    </div>
  );
}

export function Input({
  numeric,
  large,
  className = '',
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { numeric?: boolean; large?: boolean }) {
  return (
    <input
      className={`eb-input${numeric ? ' eb-input--num eb-num' : ''}${large ? ' eb-input--large' : ''} ${className}`.trim()}
      {...rest}
    />
  );
}

/* ---------------------------------------------------------------- pills --- */

export type Status = 'sent' | 'paid' | 'due' | 'cancelled' | 'partial';

/** Always a word plus a colour, never colour alone. */
export function StatusPill({ status, label }: { status: Status; label: string }) {
  return (
    <span className={`eb-pill eb-pill--${status}`}>
      {status === 'paid' ? <Icon name="check" size={12} /> : null}
      {label}
    </span>
  );
}

export function Avatar({ name, index, size = 'row' }: { name: string; index: number; size?: 'row' | 'chip' | 'big' }) {
  // The first letter as read (a grapheme): "क्" of "क्षितिज", "ஸ்ரீ" whole, never half a letter.
  const first = new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(name.trim())[Symbol.iterator]().next();
  const initial = (first.done ? '' : first.value.segment).toUpperCase() || '?';
  return (
    <span
      className={`eb-avatar eb-avatar--${size}`}
      style={{ background: `var(--eb-avatar-${((index % 4) + 4) % 4})` }}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}

/** Segmented control: tone, PDF/Photo, language, theme. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  onHero,
}: {
  options: Array<{ value: T; label: ReactNode }>;
  value: T;
  onChange: (v: T) => void;
  label: string;
  onHero?: boolean;
}) {
  return (
    <div className={`eb-seg${onHero ? ' eb-seg--hero' : ''}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className="eb-seg__opt"
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: Array<{ value: T; label: ReactNode }>;
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="eb-chips" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className="eb-chip"
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SeriesChip({ children }: { children: ReactNode }) {
  return <span className="eb-chip eb-chip--static">{children}</span>;
}
