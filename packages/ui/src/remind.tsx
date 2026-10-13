import type { ReactNode } from 'react';

import { Icon } from './Icon';
import { IconButton, Segmented } from './primitives';

export type Tone = 'gentle' | 'direct' | 'second';

export function ToneSegmented({
  value,
  onChange,
  labels,
  onHero,
}: {
  value: Tone;
  onChange: (t: Tone) => void;
  labels: { gentle: string; direct: string; second: string; group: string };
  onHero?: boolean;
}) {
  return (
    <Segmented
      label={labels.group}
      value={value}
      onChange={onChange}
      onHero={onHero}
      options={[
        { value: 'gentle', label: labels.gentle },
        { value: 'direct', label: labels.direct },
        { value: 'second', label: labels.second },
      ]}
    />
  );
}

/** The message as it will arrive: a speech bubble (Narangi) or a glass card (Harmony). */
export function MessagePreview({ text, attachment, guide }: { text: string; attachment?: ReactNode; guide?: string }) {
  return (
    <div className="eb-msg" data-guide={guide}>
      <p className="eb-msg__text">{text}</p>
      {attachment}
    </div>
  );
}

export function AttachmentRow({
  kind,
  name,
  note,
  onEdit,
  editLabel,
}: {
  kind: 'pdf' | 'jpg';
  name: string;
  note: ReactNode;
  onEdit?: () => void;
  editLabel?: string;
}) {
  return (
    <div className="eb-attach">
      <span className="eb-attach__thumb" aria-hidden="true">
        {kind.toUpperCase()}
      </span>
      <span className="eb-attach__text">
        <span className="eb-attach__name">{name}</span>
        <span className="eb-attach__note">{note}</span>
      </span>
      {onEdit && editLabel ? (
        <IconButton name="pen" label={editLabel} onClick={onEdit} className="eb-iconbtn--small" />
      ) : null}
    </div>
  );
}

/** A timeline entry on the customer folder: a file icon on a dashed rail. */
export function TimelineEntry({
  title,
  meta,
  children,
  latest,
  paid,
}: {
  title: ReactNode;
  meta: ReactNode;
  children?: ReactNode;
  latest?: boolean;
  paid?: boolean;
}) {
  return (
    <li className={`eb-tl${latest ? ' eb-tl--latest' : ''}`}>
      <span className="eb-tl__icon" aria-hidden="true">
        <Icon name={paid ? 'check' : 'file'} size={18} />
      </span>
      <div className="eb-tl__body">
        <div className="eb-tl__title">{title}</div>
        <div className="eb-tl__meta">{meta}</div>
        {children}
      </div>
    </li>
  );
}
