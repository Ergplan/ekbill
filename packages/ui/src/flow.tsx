'use client';

import { useEffect, useRef, type ReactNode } from 'react';

import { Icon, type IconName } from './Icon';

/* ------------------------------------------------------------------ Sheet --- */

/**
 * A bottom sheet for the one follow-up question a screen may ask (Poore /
 * Kuch hissa, Doosra size, Galti ho gayi?). One at a time; the backdrop and
 * Escape close it; focus starts inside.
 */
export function Sheet({
  open,
  title,
  onClose,
  closeLabel,
  children,
  guide,
}: {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  closeLabel: string;
  children: ReactNode;
  guide?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // The latest onClose, read by the key handler, so a parent's inline callback never re-runs the focus.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
    };
    window.addEventListener('keydown', onKey);
    // Focus the first control once, when the sheet opens; typing in it must not be interrupted.
    ref.current?.querySelector<HTMLElement>('input, button:not(.eb-iconbtn), [tabindex]')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  if (!open) return null;
  return (
    <div className="eb-sheet" role="presentation">
      <button type="button" className="eb-sheet__backdrop" aria-label={closeLabel} onClick={onClose} />
      <div
        className="eb-sheet__panel"
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        ref={ref}
        data-guide={guide}
      >
        <div className="eb-sheet__grip" aria-hidden="true" />
        <div className="eb-sheet__head">
          <h2 className="eb-sheet__title">{title}</h2>
          <button type="button" className="eb-iconbtn eb-iconbtn--small" aria-label={closeLabel} onClick={onClose}>
            <Icon name="close" size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- ChoiceList --- */

export interface Choice<T extends string> {
  value: T;
  label: ReactNode;
  sub?: ReactNode;
  icon?: IconName;
}

/** Big, thumb-sized options for a one-question screen; tapping one answers it. */
export function ChoiceList<T extends string>({
  choices,
  value,
  onChoose,
  label,
  guide,
}: {
  choices: Choice<T>[];
  value?: T | null;
  onChoose: (v: T) => void;
  label: string;
  guide?: string;
}) {
  return (
    <div className="eb-choices" role="radiogroup" aria-label={label} data-guide={guide}>
      {choices.map((c) => (
        <button
          key={c.value}
          type="button"
          role="radio"
          aria-checked={value === c.value}
          className="eb-choice"
          onClick={() => onChoose(c.value)}
        >
          {c.icon ? (
            <span className="eb-choice__icon" aria-hidden="true">
              <Icon name={c.icon} size={20} />
            </span>
          ) : null}
          <span className="eb-choice__text">
            <span className="eb-choice__label">{c.label}</span>
            {c.sub ? <span className="eb-choice__sub">{c.sub}</span> : null}
          </span>
          <span className="eb-choice__tick" aria-hidden="true">
            <Icon name="check" size={16} />
          </span>
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- SettingRow --- */

/** One line on Aap or a folder: label, current value, chevron or control. */
export function SettingRow({
  label,
  value,
  onClick,
  href,
  control,
  guide,
  locked,
}: {
  label: ReactNode;
  value?: ReactNode;
  onClick?: () => void;
  href?: string;
  control?: ReactNode;
  guide?: string;
  locked?: boolean;
}) {
  const body = (
    <>
      <span className="eb-setting__label">{label}</span>
      {control ? (
        <span className="eb-setting__control">{control}</span>
      ) : (
        <span className="eb-setting__value">
          <span>{value}</span>
          {locked ? <Icon name="lock" size={16} /> : onClick || href ? <Icon name="arrow-right" size={18} /> : null}
        </span>
      )}
    </>
  );
  if (href) {
    return (
      <a href={href} className="eb-setting" data-guide={guide}>
        {body}
      </a>
    );
  }
  if (onClick) {
    return (
      <button type="button" className="eb-setting" onClick={onClick} data-guide={guide}>
        {body}
      </button>
    );
  }
  return (
    <div className="eb-setting" data-guide={guide}>
      {body}
    </div>
  );
}

export function SettingGroup({ title, children, guide }: { title?: ReactNode; children: ReactNode; guide?: string }) {
  return (
    <section className="eb-settings" data-guide={guide}>
      {title ? <h2 className="eb-settings__title">{title}</h2> : null}
      <div className="eb-settings__rows">{children}</div>
    </section>
  );
}

/* --------------------------------------------------------------- OtpInput --- */

/** Six boxes; one hidden input behind them so the SMS autofill lands in one go. */
export function OtpInput({
  value,
  onChange,
  label,
  guide,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  guide?: string;
}) {
  const digits = value.replace(/\D/g, '').slice(0, 6);
  return (
    <label className="eb-otp" data-guide={guide}>
      <span className="eb-label">{label}</span>
      <span className="eb-otp__boxes" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <span
            key={i}
            className={`eb-otp__box${digits.length === i ? ' eb-otp__box--active' : ''}${digits[i] ? ' eb-otp__box--filled' : ''}`}
          >
            {digits[i] ?? ''}
          </span>
        ))}
      </span>
      <input
        className="eb-otp__input"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={digits}
        aria-label={label}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      />
    </label>
  );
}

/* ------------------------------------------------------------ SearchInput --- */

export function SearchInput({
  value,
  onChange,
  placeholder,
  label,
  guide,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
  guide?: string;
}) {
  return (
    <label className="eb-search" data-guide={guide}>
      <Icon name="search" size={18} />
      <input
        type="search"
        className="eb-search__input"
        value={value}
        placeholder={placeholder}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

/* ------------------------------------------------------------- EmptyState --- */

export function EmptyState({
  icon = 'file',
  title,
  sub,
  action,
}: {
  icon?: IconName;
  title: ReactNode;
  sub?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="eb-empty">
      <span className="eb-empty__icon" aria-hidden="true">
        <Icon name={icon} size={26} />
      </span>
      <p className="eb-empty__title">{title}</p>
      {sub ? <p className="eb-empty__sub">{sub}</p> : null}
      {action}
    </div>
  );
}

/* ---------------------------------------------------------------- Progress --- */

/** A reading-progress line ("Padh rahe hain…"). */
export function ProgressLine({ label, guide }: { label: ReactNode; guide?: string }) {
  return (
    <div className="eb-progress" role="status" data-guide={guide}>
      <span className="eb-progress__bar" aria-hidden="true">
        <span className="eb-progress__fill" />
      </span>
      <span className="eb-progress__label">{label}</span>
    </div>
  );
}
