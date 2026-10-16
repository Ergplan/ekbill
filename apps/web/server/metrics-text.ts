/** Prometheus text exposition (0.0.4), gauges only. */
type Sample = { value: number; labels?: Record<string, string> };

/** One metric family: its HELP and TYPE once, then a sample per label set (Stage 10 review: once per queue was invalid). */
export function family(name: string, help: string, samples: Sample[]): string {
  const rows = samples.map(({ value, labels }) => {
    const l = labels
      ? `{${Object.entries(labels)
          .map(([k, v]) => `${k}="${v.replace(/["\\\n]/g, '_')}"`)
          .join(',')}}`
      : '';
    return `${name}${l} ${Number.isFinite(value) ? value : 0}`;
  });
  return [`# HELP ${name} ${help}`, `# TYPE ${name} gauge`, ...rows].join('\n');
}
