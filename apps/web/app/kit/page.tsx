import demo from '@ekbill/design/fixtures/demo.json';
import { t } from '@ekbill/copy';
import {
  AgeingIndicator,
  BillRow,
  Card,
  ClientChip,
  Display,
  HeroPanel,
  IconChip,
  Logo,
  Meta,
  MoneyHero,
  NewCustomerChip,
  OwedRow,
  OutlineButton,
  AccentButton,
  ProfileRing,
  Sparkline,
  StatTile,
  StatusPill,
  ThemeSwitch,
  WhatsAppButton,
  InvoicePaper,
  SuccessHeader,
  Stack,
  type Status,
} from '@ekbill/ui';

import { KitInteractive } from './KitInteractive';

export const dynamic = 'force-static';

type Bill = {
  number: string;
  customer: string;
  date: string;
  total: number;
  status: string;
  paidOn?: string;
  method?: string;
};
const customers = demo.customers as Array<{
  id: string;
  name: string;
  contact: string;
  gstin: string | null;
  avatar: number;
}>;
const bills = demo.bills as Bill[];
const byId = (id: string) => customers.find((c) => c.id === id)!;
const status = (s: string): Status => (s === 'paid' ? 'paid' : s === 'due' ? 'due' : 'sent');
const statusLabel = (s: Status) => t(s === 'paid' ? 'status.paid' : s === 'due' ? 'status.due' : 'status.sent');
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const daysSince = (iso: string) => Math.round((new Date(demo.today).getTime() - new Date(iso).getTime()) / 86_400_000);

/**
 * /kit: every component, with the pack's demo data, in the current theme.
 * The visual baseline for Stage 0 and the parts bin for Stage 1.
 */
export default function KitPage() {
  const recent = bills.slice(-3).reverse();
  const owed = bills.filter((b) => b.status === 'due').sort((a, b) => a.date.localeCompare(b.date));
  const owedTotal = owed.reduce((s, b) => s + b.total, 0);
  const oldest = owed[0];
  return (
    <main className="eb-screen" style={{ padding: '0 var(--eb-space-gutter) 120px' }}>
      <header className="eb-topbar">
        <Logo />
        <div className="eb-topbar__right">
          <ThemeSwitch labels={{ narangi: 'Narangi', harmony: 'Harmony', group: 'Theme' }} />
          <ProfileRing initial="S" label="Profile" />
        </div>
      </header>

      <section style={{ padding: '26px 10px 18px' }}>
        <Display emphasis={demo.business.owner}>Namaste, </Display>
        <Meta>
          {demo.business.name} · {demo.business.city}
        </Meta>
      </section>

      <Stack>
        <HeroPanel
          eyebrow="01 / Kiska bill"
          chip={t('home.bill.count', { n: customers.length })}
          title="Chalo,"
          emphasis="bill banate hain"
          sub={t('home.bill.sub')}
          guide="kiska-bill"
        >
          <div className="eb-hero__chips">
            {customers.map((c) => (
              <ClientChip key={c.id} name={c.name} index={c.avatar} href="#" />
            ))}
            <NewCustomerChip label={t('home.bill.new')} href="#" />
            <NewCustomerChip label="Photo se bill" icon="camera" href="#" />
          </div>
        </HeroPanel>

        <Card title={t('home.sent.title')} action={<IconChip name="receipt" />}>
          <div className="eb-stat__value">
            <span className="eb-stat__figure eb-num">04</span>
            <span className="eb-stat__sub">{t('home.sent.count')}</span>
          </div>
          <Sparkline values={[1, 3, 2, 1, 1, 2, 4, 2]} label="Bills per week" />
          <ul className="eb-rows">
            {recent.map((b) => (
              <li key={b.number}>
                <BillRow
                  name={byId(b.customer).name}
                  index={byId(b.customer).avatar}
                  meta={`${b.number} · ${shortDate(b.date)}`}
                  amountPaise={b.total}
                  status={status(b.status)}
                  statusLabel={statusLabel(status(b.status))}
                  href="#"
                />
              </li>
            ))}
          </ul>
          <a href="#" className="eb-card__more">
            {t('home.sent.all')} →
          </a>
        </Card>

        <HeroPanel
          tone="panel"
          title={t('home.owed.title')}
          sub={t('home.owed.sub', { n: owed.length, days: oldest ? daysSince(oldest.date) : 0 })}
          peeks={owed.slice(0, 3).map((b) => ({
            title: byId(b.customer).name,
            sub: `${b.number} · ${shortDate(b.date)}`,
            amount: `₹${(b.total / 100).toLocaleString('en-IN')}`,
          }))}
          guide="paise"
        >
          <div style={{ marginTop: 8 }}>
            <MoneyHero paise={owedTotal} />
          </div>
          <AgeingIndicator
            ages={owed.map((b) => daysSince(b.date))}
            todayLabel={t('status.today')}
            dayLabel={(d) => t('status.days', { days: d })}
          />
          <ul className="eb-owedlist">
            {owed.map((b, i) => (
              <OwedRow
                key={b.number}
                name={byId(b.customer).name}
                age={
                  i === 0
                    ? t('home.owed.age', { days: daysSince(b.date) })
                    : t('status.days', { days: daysSince(b.date) })
                }
                overdue={daysSince(b.date) > 14}
                amountPaise={b.total}
                oldest={i === 0}
                action={
                  i === 0 ? (
                    <AccentButton small>{t('action.remind')}</AccentButton>
                  ) : (
                    <OutlineButton small>{t('action.remind')}</OutlineButton>
                  )
                }
              />
            ))}
          </ul>
        </HeroPanel>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <StatTile title="Bills" value="14" sub="is quarter" icon={<IconChip name="receipt" />} />
          <StatTile title="GST" value="₹19,392" icon={<IconChip name="percent" />} />
        </div>

        <HeroPanel tone="gst" eyebrow="GST" title="Jul–Sep" emphasis="ka hisaab" sub="14 bills · ₹1,12,400 bikri">
          <div className="eb-hero__chips">
            <StatusPill status="sent" label="B2B 6" />
            <StatusPill status="paid" label="B2C 8" />
          </div>
        </HeroPanel>

        <KitInteractive customerName={byId('mehta').name} />

        <SuccessHeader title={t('bill.done')} sub="INV-043 · Mehta Traders · ₹6,200" />
        <WhatsAppButton data-primary="kit">{t('action.whatsapp')}</WhatsAppButton>

        <InvoicePaper
          data={{
            title: 'Tax Invoice',
            seller: { name: demo.business.name, gstin: demo.business.gstin, address: demo.business.city },
            number: 'INV-043',
            date: shortDate(demo.today),
            customer: { name: byId('mehta').name, gstin: byId('mehta').gstin },
            lines: [
              { description: 'AMC visit — September', qty: '1', rate: 350000, amount: 350000 },
              { description: 'Ceiling fan install', qty: '2', rate: 135000, amount: 270000 },
            ],
            taxLines: [
              { label: 'Taxable value', paise: 620000 },
              { label: 'CGST 9%', paise: 55800 },
              { label: 'SGST 9%', paise: 55800 },
            ],
            totalPaise: 731600,
            upiId: demo.business.upi,
          }}
        />
      </Stack>
    </main>
  );
}
