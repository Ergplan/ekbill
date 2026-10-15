import type { ReactNode } from 'react';

import { Icon } from './Icon';
import { formatRupees } from './money';
import { Field, GhostButton, IconButton, Input, Money, MoneyHero, PrimaryCTA, Segmented } from './primitives';

/* ------------------------------------------------------------ RepeatCard --- */

export function RepeatCard({
  title,
  summary,
  fillLabel,
  freshLabel,
  doneLabel,
  filled,
  onFill,
  onFresh,
  guide,
}: {
  title: ReactNode;
  summary: ReactNode;
  fillLabel: string;
  freshLabel: string;
  doneLabel: string;
  filled: boolean;
  onFill: () => void;
  onFresh: () => void;
  guide?: string;
}) {
  return (
    <section className="eb-repeat" data-guide={guide}>
      <div className="eb-repeat__head">
        <span className="eb-iconchip eb-iconchip--onpanel" aria-hidden="true">
          <Icon name="refresh" />
        </span>
        <h2 className="eb-repeat__title">{title}</h2>
      </div>
      <p className="eb-repeat__summary">{summary}</p>
      <div className="eb-repeat__actions">
        <button
          type="button"
          className={`eb-btn ${filled ? 'eb-btn--white' : 'eb-btn--accent'}`}
          onClick={onFill}
          aria-pressed={filled}
        >
          {filled ? (
            <>
              <Icon name="check" size={16} /> {doneLabel}
            </>
          ) : (
            fillLabel
          )}
        </button>
        <GhostButton onClick={onFresh}>{freshLabel}</GhostButton>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------- LineItemCard --- */

export interface LineValue {
  what: string;
  qty: string;
  rate: string;
}

export function LineItemCard({
  index,
  value,
  labels,
  onChange,
  onRemove,
  removable,
  amountPaise,
  gstSlot,
  guide,
}: {
  index: number;
  value: LineValue;
  labels: { kaam: string; what: string; whatHint?: string; qty: string; rate: string; amount: string; remove: string };
  onChange: (patch: Partial<LineValue>) => void;
  onRemove?: () => void;
  removable?: boolean;
  amountPaise: number;
  gstSlot?: ReactNode;
  guide?: string;
}) {
  const id = `line-${index}`;
  return (
    <section className="eb-line" data-guide={guide}>
      <div className="eb-line__head">
        <span className="eb-line__label">
          {labels.kaam} {String(index + 1).padStart(2, '0')}
        </span>
        {removable ? (
          <IconButton name="close" label={labels.remove} onClick={onRemove} className="eb-iconbtn--small" />
        ) : null}
      </div>
      <Field id={`${id}-what`} label={labels.what}>
        <Input
          id={`${id}-what`}
          value={value.what}
          placeholder={labels.whatHint}
          onChange={(e) => onChange({ what: e.target.value })}
          maxLength={300}
        />
      </Field>
      <div className="eb-line__nums">
        <Field id={`${id}-qty`} label={labels.qty}>
          <Input
            id={`${id}-qty`}
            numeric
            inputMode="decimal"
            value={value.qty}
            onChange={(e) => onChange({ qty: e.target.value })}
            maxLength={10}
          />
        </Field>
        <Field id={`${id}-rate`} label={labels.rate}>
          <Input
            id={`${id}-rate`}
            numeric
            inputMode="decimal"
            value={value.rate}
            onChange={(e) => onChange({ rate: e.target.value })}
            maxLength={14}
          />
        </Field>
        <div className="eb-line__amount">
          <span className="eb-label">{labels.amount}</span>
          <Money paise={amountPaise} whole />
        </div>
      </div>
      {gstSlot}
    </section>
  );
}

export function AddLineButton({
  children,
  onClick,
  guide,
}: {
  children: ReactNode;
  onClick: () => void;
  guide?: string;
}) {
  return (
    <button type="button" className="eb-addline" onClick={onClick} data-guide={guide}>
      <Icon name="plus" size={18} />
      {children}
    </button>
  );
}

/* ------------------------------------------------------------- TotalCard --- */

export function TotalCard({
  label,
  paise,
  count,
  note,
  children,
}: {
  label: ReactNode;
  paise: number;
  count?: ReactNode;
  note?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="eb-total">
      <span className="eb-total__label">{label}</span>
      <div className="eb-total__row">
        <MoneyHero paise={paise} />
        {count ? <span className="eb-total__count">{count}</span> : null}
      </div>
      {children}
      {note ? (
        <p className="eb-total__note">
          <Icon name="globe" size={16} />
          {note}
        </p>
      ) : null}
    </section>
  );
}

/** The sticky primary with the amount in it: "Bill banao · ₹6,200". */
export function MakeBar({
  label,
  paise,
  disabled,
  onClick,
  guide,
  sample,
}: {
  label: string;
  paise: number;
  disabled?: boolean;
  onClick: () => void;
  guide?: string;
  /** On the kit page only: a sample, not a screen's primary action (I9 counts data-primary="true"). */
  sample?: boolean;
}) {
  return (
    <div className="eb-makebar" data-guide={guide}>
      <PrimaryCTA onClick={onClick} disabled={disabled} data-primary={sample ? 'kit' : 'true'}>
        {label} · <span className="eb-num">₹{formatRupees(paise, { whole: true })}</span>
      </PrimaryCTA>
    </div>
  );
}

/* ----------------------------------------------------------- CheckStrip --- */

export interface CheckItem {
  id: string;
  text: ReactNode;
  action?: ReactNode;
}

/** The GST intelligence strip: only visible when a check fails; one tap to fix. */
export function CheckStrip({ items, guide }: { items: CheckItem[]; guide?: string }) {
  if (!items.length) return null;
  return (
    <ul className="eb-checks" data-guide={guide} role="status">
      {items.map((c) => (
        <li key={c.id} className="eb-checks__item">
          <span className="eb-checks__text">{c.text}</span>
          {c.action}
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------- ShareToggle --- */

export function ShareToggle({
  value,
  onChange,
  labels,
}: {
  value: 'pdf' | 'jpg';
  onChange: (v: 'pdf' | 'jpg') => void;
  labels: { pdf: string; jpg: string; group: string };
}) {
  return (
    <Segmented
      label={labels.group}
      value={value}
      onChange={onChange}
      options={[
        { value: 'pdf', label: labels.pdf },
        { value: 'jpg', label: labels.jpg },
      ]}
    />
  );
}

/* ---------------------------------------------------------- SuccessHeader --- */

export function SuccessHeader({ title, sub }: { title: ReactNode; sub?: ReactNode }) {
  return (
    <div className="eb-success">
      <span className="eb-success__disc" aria-hidden="true">
        <span className="eb-success__halo" />
        <span className="eb-success__halo eb-success__halo--outer" />
        <Icon name="check" size={34} />
      </span>
      <h1 className="eb-success__title">{title}</h1>
      {sub ? <p className="eb-success__sub">{sub}</p> : null}
    </div>
  );
}

/* --------------------------------------------------------- InvoicePaper --- */

export interface PaperLine {
  description: string;
  qty: string;
  rate: number;
  amount: number;
}

export interface PaperData {
  title: string;
  seller: { name: string; gstin?: string | null; address?: string | null };
  number: string;
  date: string;
  customer: { name: string; gstin?: string | null };
  lines: PaperLine[];
  taxLines?: Array<{ label: string; paise: number }>;
  totalPaise: number;
  upiId?: string | null;
  legend?: string | null;
}

/**
 * The bill the customer gets, previewed on screen. Theme-independent by
 * design: white paper, ink text, formal English (listed in tokens-allow.txt
 * for its two fixed colours). Stage 6 renders the real PDF from the same data.
 */
export function InvoicePaper({ data }: { data: PaperData }) {
  return (
    <article className="eb-paper" lang="en-IN">
      <header className="eb-paper__head">
        <div>
          <div className="eb-paper__seller">{data.seller.name}</div>
          {data.seller.gstin ? <div className="eb-paper__muted">GSTIN {data.seller.gstin}</div> : null}
          {data.seller.address ? <div className="eb-paper__muted">{data.seller.address}</div> : null}
        </div>
        <div className="eb-paper__doc">
          <div className="eb-paper__title">{data.title}</div>
          <div className="eb-paper__muted">
            {data.number} · {data.date}
          </div>
        </div>
      </header>
      <div className="eb-paper__to">
        <span className="eb-paper__muted">Bill to</span>
        <div>{data.customer.name}</div>
        {data.customer.gstin ? <div className="eb-paper__muted">GSTIN {data.customer.gstin}</div> : null}
      </div>
      <table className="eb-paper__table">
        <thead>
          <tr>
            <th>Description</th>
            <th className="eb-paper__num">Qty</th>
            <th className="eb-paper__num">Rate</th>
            <th className="eb-paper__num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {data.lines.map((l, i) => (
            <tr key={i}>
              <td>{l.description}</td>
              <td className="eb-paper__num">{l.qty}</td>
              <td className="eb-paper__num">{formatRupees(l.rate)}</td>
              <td className="eb-paper__num">{formatRupees(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.taxLines?.length ? (
        <dl className="eb-paper__tax">
          {data.taxLines.map((t) => (
            <div key={t.label}>
              <dt>{t.label}</dt>
              <dd className="eb-paper__num">{formatRupees(t.paise)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <div className="eb-paper__total">
        <span>Total</span>
        <span className="eb-paper__num">₹{formatRupees(data.totalPaise)}</span>
      </div>
      {data.legend ? <p className="eb-paper__legend">{data.legend}</p> : null}
      {data.upiId ? (
        <footer className="eb-paper__foot">
          <span className="eb-paper__qr" aria-label="UPI QR code" />
          <span>
            <span className="eb-paper__muted">Pay by UPI</span>
            <br />
            {data.upiId}
          </span>
        </footer>
      ) : null}
    </article>
  );
}
