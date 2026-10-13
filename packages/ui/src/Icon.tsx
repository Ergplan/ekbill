import type { SVGProps } from 'react';

/**
 * The icon set from design/components.md: 24px grid, 1.6 stroke, round caps
 * and joins, currentColor. One path set per name; nothing imported.
 */
export type IconName =
  | 'home'
  | 'receipt'
  | 'user'
  | 'folder'
  | 'bell'
  | 'search'
  | 'back'
  | 'close'
  | 'plus'
  | 'arrow-right'
  | 'arrow-up-right'
  | 'send'
  | 'chat'
  | 'file'
  | 'download'
  | 'calendar'
  | 'clock'
  | 'globe'
  | 'lock'
  | 'pen'
  | 'check'
  | 'coins'
  | 'percent'
  | 'refresh'
  | 'mic'
  | 'camera'
  | 'users';

const PATHS: Record<IconName, string> = {
  home: 'M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  back: 'M15 5l-7 7 7 7',
  close: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  'arrow-right': 'M5 12h14M13 6l6 6-6 6',
  'arrow-up-right': 'M7 17L17 7M9 7h8v8',
  send: 'M4 12l16-8-6 16-2-7z',
  chat: 'M4 5h16v11H9l-5 4z',
  file: 'M6 3h8l4 4v14H6zM14 3v4h4',
  download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  lock: 'M6 11h12v10H6zM9 11V8a3 3 0 0 1 6 0v3',
  pen: 'M4 20l4-1 11-11-3-3L5 16zM13 7l3 3',
  check: 'M5 12l5 5 9-10',
  coins:
    'M12 8.5c3.3 0 6-1.1 6-2.5S15.3 3.5 12 3.5 6 4.6 6 6s2.7 2.5 6 2.5zM6 6v6c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V6M6 12v6c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-6',
  percent: 'M19 5L5 19M7.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM16.5 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  refresh: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5',
  mic: 'M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zM6 11a6 6 0 0 0 12 0M12 17v4M9 21h6',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  users: 'M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M16 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-5-6.7',
};

export function Icon({ name, size = 20, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg className="eb-ico" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" {...rest}>
      <path d={PATHS[name]} />
    </svg>
  );
}
