'use client';

import { useCallback, useEffect, useState } from 'react';
import { Navigation } from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { weekOf } from '@/lib/week';
import {
  formatDriverTypeLabel,
  isOwnerOperator,
  ooFuelMode,
  ooFuelUsesTwoFields,
  ownerOperatorVisibleTotals,
  ownerOperatorXxiiFee,
} from '@/lib/sources/driverTypeGroups';

interface SummaryDriver {
  driverId: number;
  name: string;
  driverStatus: string | null;
  driverType: string | null;
  unit: string | null;
  compensationName: string | null;
  linehaulPct: number | null;
  xxiiFeePct?: number | null;
  trips: number;
  rate: number;
  mileage: number;
  grossIncome: number;
  driversPay: number;
  fuel: number;
  fuelGross: number | null;
  fuelDiscounted: number | null;
  fuelMpg: number | null;
  fuelPpg: number | null;
  prepass: number;
  monitoringLogs: number;
  rm: number;
  equipmentLease: number;
  equipmentLease2: number;
  liabilityInsurance: number;
  scale: number;
  factoringFee: number;
  samsara: number;
  cargoInsurance: number;
  pdInsurance: number;
  totalExpenses: number;
  grossProfit: number;
}

interface WeeklySummary {
  year: number;
  week: number;
  start: string;
  end: string;
  drivers: SummaryDriver[];
  driverTypes: string[];
}

const money = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const moneyParen = (n: number) => {
  const abs = Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `(${abs})` : `$${abs}`;
};
const num1 = (n: number) =>
  n.toLocaleString('en-US', { maximumFractionDigits: 1 });

const GREEN =
  'bg-[#c6efce] text-black border border-[#a9d08e] px-1 py-0.5 text-right tabular-nums w-full min-w-0';

/** MPG / Net P/G: wide enough to show hundredths (e.g. 7.14, 4.90). */
const GREEN_FUEL =
  'bg-[#c6efce] text-black border border-[#a9d08e] px-1 py-0.5 text-right tabular-nums w-full min-w-[3.25rem]';

// Previous completed week (the default selection).
function previousWeek() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 7);
  return weekOf(d);
}

type FuelDrafts = Record<number, { mpg?: string; ppg?: string }>;
type MileageDrafts = Record<number, string>;
type GrossIncomeDrafts = Record<number, string>;
type DriversPayDrafts = Record<number, string>;
type PrepassDrafts = Record<number, string>;

function DriverCard({
  driver: d,
  mpgDraft,
  ppgDraft,
  mileageDraft,
  grossIncomeDraft,
  driversPayDraft,
  prepassDraft,
  saving,
  onMpgChange,
  onPpgChange,
  onMileageChange,
  onGrossIncomeChange,
  onDriversPayChange,
  onPrepassChange,
  onFuelBlur,
  onMileageBlur,
  onGrossIncomeBlur,
  onDriversPayBlur,
  onPrepassBlur,
  onFuelEscape,
  onMileageEscape,
  onGrossIncomeEscape,
  onDriversPayEscape,
  onPrepassEscape,
}: {
  driver: SummaryDriver;
  mpgDraft: string | undefined;
  ppgDraft: string | undefined;
  mileageDraft: string | undefined;
  grossIncomeDraft: string | undefined;
  driversPayDraft: string | undefined;
  prepassDraft: string | undefined;
  saving: boolean;
  onMpgChange: (v: string) => void;
  onPpgChange: (v: string) => void;
  onMileageChange: (v: string) => void;
  onGrossIncomeChange: (v: string) => void;
  onDriversPayChange: (v: string) => void;
  onPrepassChange: (v: string) => void;
  onFuelBlur: () => void;
  onMileageBlur: () => void;
  onGrossIncomeBlur: () => void;
  onDriversPayBlur: () => void;
  onPrepassBlur: () => void;
  onFuelEscape: () => void;
  onMileageEscape: () => void;
  onGrossIncomeEscape: () => void;
  onDriversPayEscape: () => void;
  onPrepassEscape: () => void;
}) {
  const rateText = d.mileage > 0 ? d.rate.toFixed(2) : '—';
  const oo = isOwnerOperator(d);
  const fuelMode = oo ? ooFuelMode(d.name) : null;
  const ooTotals = oo ? ownerOperatorVisibleTotals(d) : null;
  const totalExpenses = ooTotals?.totalExpenses ?? d.totalExpenses;
  const grossProfit = ooTotals?.grossProfit ?? d.grossProfit;
  const liabilityAndCargo = d.liabilityInsurance + d.cargoInsurance;
  const xxiiFee = oo
    ? ownerOperatorXxiiFee(d.linehaulPct, d.grossIncome, d.xxiiFeePct)
    : null;

  const fuelRow = oo ? (
    fuelMode && ooFuelUsesTwoFields(fuelMode) ? (
          <tr className="border-b border-neutral-300">
            <td className="px-1.5 py-1 font-medium align-middle">Fuel</td>
            <td className="px-1 py-1">
              <div className="flex gap-0.5">
                <div
                  className={`${GREEN} px-1 tabular-nums`}
                  title="Without driver discount"
                >
                  {(d.fuelGross ?? 0).toFixed(2)}
                </div>
                <div
                  className={`${GREEN} px-1 tabular-nums`}
                  title={
                    fuelMode === 'wagner'
                      ? 'Paid + (diesel gal × $0.20)'
                      : 'With driver discount'
                  }
                >
                  {(d.fuelDiscounted ?? 0).toFixed(2)}
                </div>
              </div>
            </td>
            <td
              className="px-1.5 py-1 text-right tabular-nums align-middle"
              title={
                fuelMode === 'wagner'
                  ? 'Retail − (paid + diesel gal × $0.20)'
                  : 'Discount savings (without − with)'
              }
            >
              {money(d.fuel)}
            </td>
          </tr>
    ) : (
          <tr className="border-b border-neutral-300">
            <td className="px-1.5 py-1 font-medium align-middle">Fuel</td>
            <td className="px-1 py-1">
              <div
                className={`${GREEN} px-1 tabular-nums`}
                title={
                  fuelMode === 'zero'
                    ? 'No fuel charge (client)'
                    : 'Diesel gallons × $0.12'
                }
              >
                {d.fuel.toFixed(2)}
              </div>
            </td>
            <td className="px-1.5 py-1 text-right tabular-nums align-middle">
              {money(d.fuel)}
            </td>
          </tr>
    )
  ) : (
          <tr className="border-b border-neutral-300">
            <td className="px-1.5 py-1 font-medium align-middle">Fuel</td>
            <td className="px-1 py-1">
              <div className="flex gap-1">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={
                    mpgDraft ?? (d.fuelMpg == null ? '' : d.fuelMpg.toFixed(2))
                  }
                  placeholder="MPG"
                  disabled={saving}
                  onChange={(e) => onMpgChange(e.target.value)}
                  onBlur={onFuelBlur}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                    if (e.key === 'Escape') onFuelEscape();
                  }}
                  aria-label={`Fuel MPG for ${d.name}`}
                  title="MPG (2 decimals)"
                  className={`${GREEN_FUEL} outline-none disabled:opacity-50`}
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={
                    ppgDraft ?? (d.fuelPpg == null ? '' : d.fuelPpg.toFixed(2))
                  }
                  placeholder="P/G"
                  disabled={saving}
                  onChange={(e) => onPpgChange(e.target.value)}
                  onBlur={onFuelBlur}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                    if (e.key === 'Escape') onFuelEscape();
                  }}
                  aria-label={`Net P/G for ${d.name}`}
                  title="Net P/G (2 decimals)"
                  className={`${GREEN_FUEL} outline-none disabled:opacity-50`}
                />
              </div>
            </td>
            <td className="px-1.5 py-1 text-right tabular-nums align-middle">
              {money(d.fuel)}
            </td>
          </tr>
  );

  return (
    <div className="shrink-0 w-[280px] border border-neutral-400 bg-white text-[11px] text-black shadow-sm">
      {/* Header: name + unit */}
      <div className="grid grid-cols-[1fr_auto] border-b border-neutral-400 bg-neutral-100">
        <div className="px-2 py-1.5 font-semibold truncate" title={d.name}>
          {d.name}
        </div>
        <div className="px-2 py-1.5 font-semibold tabular-nums border-l border-neutral-400">
          {d.unit ?? '—'}
        </div>
      </div>

      <table className="w-full border-collapse table-fixed">
        <colgroup>
          <col className="w-[34%]" />
          <col className="w-[40%]" />
          <col className="w-[26%]" />
        </colgroup>
        <tbody>
          <tr className="border-b border-neutral-300">
            <td className="px-1.5 py-1 font-medium">RATE $</td>
            <td className="px-1 py-1">
              <div className={GREEN}>{rateText}</div>
            </td>
            <td className="px-1.5 py-1 text-right tabular-nums">{rateText}</td>
          </tr>
          <tr className="border-b border-neutral-300">
            <td className="px-1.5 py-1 font-medium">MILEAGE</td>
            <td className="px-1 py-1">
              <input
                type="number"
                step="0.1"
                min="0"
                value={mileageDraft ?? String(d.mileage)}
                disabled={saving}
                onChange={(e) => onMileageChange(e.target.value)}
                onBlur={onMileageBlur}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  if (e.key === 'Escape') onMileageEscape();
                }}
                aria-label={`Mileage for ${d.name}`}
                title="Mileage"
                className={`${GREEN} outline-none disabled:opacity-50`}
              />
            </td>
            <td className="px-1.5 py-1 text-right tabular-nums">
              {num1(d.mileage)}
            </td>
          </tr>
          <tr className="border-b border-neutral-400">
            <td className="px-1.5 py-1 font-medium leading-tight">
              TOTAL GROSS IN
            </td>
            <td className="px-1 py-1">
              <input
                type="number"
                step="0.01"
                min="0"
                value={
                  grossIncomeDraft ??
                  d.grossIncome.toFixed(2)
                }
                disabled={saving}
                onChange={(e) => onGrossIncomeChange(e.target.value)}
                onBlur={onGrossIncomeBlur}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  if (e.key === 'Escape') onGrossIncomeEscape();
                }}
                aria-label={`Total gross income for ${d.name}`}
                title="Total Gross Income"
                className={`${GREEN} outline-none disabled:opacity-50`}
              />
            </td>
            <td className="px-1.5 py-1 text-right tabular-nums font-semibold">
              {money(d.grossIncome)}
            </td>
          </tr>

          {oo ? (
            <tr className="border-b border-neutral-300">
              <td className="px-1.5 py-1 font-medium">XXI Fee</td>
              <td className="px-1 py-1">
                <div
                  className={`${GREEN} text-left truncate`}
                  title={
                    xxiiFee
                      ? `${xxiiFee.feePct.toFixed(2)}%`
                      : (d.compensationName ?? undefined)
                  }
                >
                  {xxiiFee
                    ? `${xxiiFee.feePct.toFixed(2)}%`
                    : d.compensationName?.trim() || '—'}
                </div>
              </td>
              <td className="px-1.5 py-1 text-right tabular-nums">
                {xxiiFee ? money(xxiiFee.feeAmount) : '—'}
              </td>
            </tr>
          ) : null}

          {oo ? fuelRow : null}

          <tr className="bg-neutral-200 border-b border-neutral-400">
            <td colSpan={3} className="px-1.5 py-1 font-bold tracking-wide">
              EXPENSES
            </td>
          </tr>

          {!oo ? (
            <tr className="border-b border-neutral-300">
              <td className="px-1.5 py-1 font-medium">Driver&apos;s pay</td>
              <td className="px-1 py-1">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={driversPayDraft ?? d.driversPay.toFixed(2)}
                  disabled={saving}
                  onChange={(e) => onDriversPayChange(e.target.value)}
                  onBlur={onDriversPayBlur}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                    if (e.key === 'Escape') onDriversPayEscape();
                  }}
                  aria-label={`Driver's pay for ${d.name}`}
                  title="Driver's pay"
                  className={`${GREEN} outline-none disabled:opacity-50`}
                />
              </td>
              <td className="px-1.5 py-1 text-right tabular-nums">
                {money(d.driversPay)}
              </td>
            </tr>
          ) : null}

          {!oo ? fuelRow : null}

          {!oo ? (
            <tr className="border-b border-neutral-300">
              <td className="px-1.5 py-1 font-medium">PREPASS</td>
              <td className="px-1 py-1">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={prepassDraft ?? d.prepass.toFixed(2)}
                  disabled={saving}
                  onChange={(e) => onPrepassChange(e.target.value)}
                  onBlur={onPrepassBlur}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                    if (e.key === 'Escape') onPrepassEscape();
                  }}
                  aria-label={`PREPASS for ${d.name}`}
                  title="PREPASS"
                  className={`${GREEN} outline-none disabled:opacity-50`}
                />
              </td>
              <td className="px-1.5 py-1 text-right tabular-nums">
                {moneyParen(d.prepass)}
              </td>
            </tr>
          ) : null}

          {(oo
            ? ([
                ['R & M', d.rm],
                ['Equipment Lease', d.equipmentLease],
                ['Liability and cargo insurance', liabilityAndCargo],
                ['Factoring fee', d.factoringFee],
                ['Samsara', d.samsara],
                ['PD insurance', d.pdInsurance],
              ] as const)
            : ([
                ['Monitoring Logs', d.monitoringLogs],
                ['R & M', d.rm],
                ['Equipment Lease', d.equipmentLease],
                ['Equipment Lease', d.equipmentLease2],
                ['Liability insurance', d.liabilityInsurance],
                ['SCALE', d.scale],
                ['Factoring fee', d.factoringFee],
                ['Samsara', d.samsara],
                ['Cargo insurance', d.cargoInsurance],
                ['PD insurance', d.pdInsurance],
              ] as const)
          ).map(([label, val], i) => (
            <tr key={`${label}-${i}`} className="border-b border-neutral-300">
              <td className="px-1.5 py-1">{label}</td>
              <td className="px-1 py-1" />
              <td className="px-1.5 py-1 text-right tabular-nums">
                {oo && label === 'PD insurance' && !(val > 0)
                  ? ''
                  : moneyParen(val)}
              </td>
            </tr>
          ))}

          <tr className="border-b border-neutral-400 bg-neutral-50">
            <td className="px-1.5 py-1 font-bold">TOTAL EXPENSES</td>
            <td />
            <td className="px-1.5 py-1 text-right tabular-nums font-bold">
              {money(totalExpenses)}
            </td>
          </tr>
          <tr>
            <td className="px-1.5 py-1.5 font-bold">GROSS PROFIT</td>
            <td />
            <td
              className={`px-1.5 py-1.5 text-right tabular-nums font-bold ${
                grossProfit >= 0 ? 'text-green-700' : 'text-red-600'
              }`}
            >
              {money(grossProfit)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function GrossProfitPage() {
  const [year, setYear] = useState(() => previousWeek().year);
  const [week, setWeek] = useState(() => previousWeek().week);
  const [driverType, setDriverType] = useState('company_driver');
  const [driverTypes, setDriverTypes] = useState<string[]>([]);
  const [summary, setSummary] = useState<WeeklySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [fuelDrafts, setFuelDrafts] = useState<FuelDrafts>({});
  const [mileageDrafts, setMileageDrafts] = useState<MileageDrafts>({});
  const [grossIncomeDrafts, setGrossIncomeDrafts] =
    useState<GrossIncomeDrafts>({});
  const [driversPayDrafts, setDriversPayDrafts] =
    useState<DriversPayDrafts>({});
  const [prepassDrafts, setPrepassDrafts] = useState<PrepassDrafts>({});
  const [savingFuel, setSavingFuel] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        year: String(year),
        week: String(week),
      });
      if (driverType) params.set('driverType', driverType);
      const res = await fetch(`/api/gross-profit?${params.toString()}`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as WeeklySummary;
      setSummary(data);
      if (Array.isArray(data.driverTypes)) setDriverTypes(data.driverTypes);
      setFuelDrafts({});
      setMileageDrafts({});
      setGrossIncomeDrafts({});
      setDriversPayDrafts({});
      setPrepassDrafts({});
      setError('');
    } catch {
      setError('Failed to load summary');
    } finally {
      setLoading(false);
    }
  }, [year, week, driverType]);

  useEffect(() => {
    load();
  }, [load]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams({
        year: String(year),
        week: String(week),
      });
      if (driverType) params.set('driverType', driverType);
      const res = await fetch(`/api/gross-profit/export?${params.toString()}`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Gross-Profit-W${week}-${year}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      alert('Export failed');
    } finally {
      setExporting(false);
    }
  };

  const clearFuelDraft = (driverId: number) =>
    setFuelDrafts((m) => {
      if (!(driverId in m)) return m;
      const next = { ...m };
      delete next[driverId];
      return next;
    });

  const clearMileageDraft = (driverId: number) =>
    setMileageDrafts((m) => {
      if (!(driverId in m)) return m;
      const next = { ...m };
      delete next[driverId];
      return next;
    });

  const clearGrossIncomeDraft = (driverId: number) =>
    setGrossIncomeDrafts((m) => {
      if (!(driverId in m)) return m;
      const next = { ...m };
      delete next[driverId];
      return next;
    });

  const clearDriversPayDraft = (driverId: number) =>
    setDriversPayDrafts((m) => {
      if (!(driverId in m)) return m;
      const next = { ...m };
      delete next[driverId];
      return next;
    });

  const clearPrepassDraft = (driverId: number) =>
    setPrepassDrafts((m) => {
      if (!(driverId in m)) return m;
      const next = { ...m };
      delete next[driverId];
      return next;
    });

  const savePrepass = async (driver: SummaryDriver) => {
    const raw = prepassDrafts[driver.driverId];
    if (raw === undefined) return;
    const trimmed = raw.trim();
    if (trimmed === '') {
      clearPrepassDraft(driver.driverId);
      return;
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0 || n >= 100_000_000) {
      clearPrepassDraft(driver.driverId);
      return;
    }
    const next = Math.round(n * 100) / 100;
    if (next === driver.prepass) {
      clearPrepassDraft(driver.driverId);
      return;
    }

    setSavingFuel(driver.driverId);
    try {
      const res = await fetch('/api/gross-profit/prepass', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year,
          week,
          driverId: driver.driverId,
          prepass: next,
        }),
      });
      if (!res.ok) throw new Error();
      const saved = (await res.json()) as {
        prepass: number;
        totalExpenses: number;
        grossProfit: number;
      };
      setSummary((s) =>
        s
          ? {
              ...s,
              drivers: s.drivers.map((x) =>
                x.driverId === driver.driverId
                  ? {
                      ...x,
                      prepass: saved.prepass,
                      totalExpenses: saved.totalExpenses,
                      grossProfit: saved.grossProfit,
                    }
                  : x
              ),
            }
          : s
      );
      clearPrepassDraft(driver.driverId);
    } catch {
      alert(`Failed to save PREPASS for ${driver.name}`);
    } finally {
      setSavingFuel(null);
    }
  };

  const saveDriversPay = async (driver: SummaryDriver) => {
    const raw = driversPayDrafts[driver.driverId];
    if (raw === undefined) return;
    const trimmed = raw.trim();
    if (trimmed === '') {
      clearDriversPayDraft(driver.driverId);
      return;
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0 || n >= 100_000_000) {
      clearDriversPayDraft(driver.driverId);
      return;
    }
    const next = Math.round(n * 100) / 100;
    if (next === driver.driversPay) {
      clearDriversPayDraft(driver.driverId);
      return;
    }

    setSavingFuel(driver.driverId);
    try {
      const res = await fetch('/api/gross-profit/drivers-pay', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year,
          week,
          driverId: driver.driverId,
          driversPay: next,
        }),
      });
      if (!res.ok) throw new Error();
      const saved = (await res.json()) as {
        driversPay: number;
        totalExpenses: number;
        grossProfit: number;
      };
      setSummary((s) =>
        s
          ? {
              ...s,
              drivers: s.drivers.map((x) =>
                x.driverId === driver.driverId
                  ? {
                      ...x,
                      driversPay: saved.driversPay,
                      totalExpenses: saved.totalExpenses,
                      grossProfit: saved.grossProfit,
                    }
                  : x
              ),
            }
          : s
      );
      clearDriversPayDraft(driver.driverId);
    } catch {
      alert(`Failed to save driver's pay for ${driver.name}`);
    } finally {
      setSavingFuel(null);
    }
  };

  const saveGrossIncome = async (driver: SummaryDriver) => {
    const raw = grossIncomeDrafts[driver.driverId];
    if (raw === undefined) return;
    const trimmed = raw.trim();
    if (trimmed === '') {
      clearGrossIncomeDraft(driver.driverId);
      return;
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0 || n >= 100_000_000) {
      clearGrossIncomeDraft(driver.driverId);
      return;
    }
    const next = Math.round(n * 100) / 100;
    if (next === driver.grossIncome) {
      clearGrossIncomeDraft(driver.driverId);
      return;
    }

    setSavingFuel(driver.driverId);
    try {
      const res = await fetch('/api/gross-profit/gross-income', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year,
          week,
          driverId: driver.driverId,
          grossIncome: next,
        }),
      });
      if (!res.ok) throw new Error();
      const saved = (await res.json()) as {
        grossIncome: number;
        rate: number;
        driversPay: number;
        factoringFee: number;
        totalExpenses: number;
        grossProfit: number;
      };
      setSummary((s) =>
        s
          ? {
              ...s,
              drivers: s.drivers.map((x) =>
                x.driverId === driver.driverId
                  ? {
                      ...x,
                      grossIncome: saved.grossIncome,
                      rate: saved.rate,
                      driversPay: saved.driversPay,
                      factoringFee: saved.factoringFee,
                      totalExpenses: saved.totalExpenses,
                      grossProfit: saved.grossProfit,
                    }
                  : x
              ),
            }
          : s
      );
      clearGrossIncomeDraft(driver.driverId);
    } catch {
      alert(`Failed to save gross income for ${driver.name}`);
    } finally {
      setSavingFuel(null);
    }
  };

  const saveMileage = async (driver: SummaryDriver) => {
    const raw = mileageDrafts[driver.driverId];
    if (raw === undefined) return;
    const trimmed = raw.trim();
    if (trimmed === '') {
      clearMileageDraft(driver.driverId);
      return;
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0 || n >= 1_000_000) {
      clearMileageDraft(driver.driverId);
      return;
    }
    const next = Math.round(n * 100) / 100;
    if (next === driver.mileage) {
      clearMileageDraft(driver.driverId);
      return;
    }

    setSavingFuel(driver.driverId);
    try {
      const res = await fetch('/api/gross-profit/mileage', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year,
          week,
          driverId: driver.driverId,
          mileage: next,
        }),
      });
      if (!res.ok) throw new Error();
      const saved = (await res.json()) as {
        mileage: number;
        rate: number;
        rm: number;
        liabilityInsurance: number;
        equipmentLease: number;
        equipmentLease2: number;
        cargoInsurance: number;
        factoringFee: number;
        fuel: number;
        driversPay: number;
        totalExpenses: number;
        grossProfit: number;
      };
      setSummary((s) =>
        s
          ? {
              ...s,
              drivers: s.drivers.map((x) =>
                x.driverId === driver.driverId
                  ? {
                      ...x,
                      mileage: saved.mileage,
                      rate: saved.rate,
                      rm: saved.rm,
                      liabilityInsurance: saved.liabilityInsurance,
                      equipmentLease: saved.equipmentLease,
                      equipmentLease2: saved.equipmentLease2,
                      cargoInsurance: saved.cargoInsurance,
                      factoringFee: saved.factoringFee,
                      fuel: saved.fuel,
                      driversPay: saved.driversPay,
                      totalExpenses: saved.totalExpenses,
                      grossProfit: saved.grossProfit,
                    }
                  : x
              ),
            }
          : s
      );
      clearMileageDraft(driver.driverId);
    } catch {
      alert(`Failed to save mileage for ${driver.name}`);
    } finally {
      setSavingFuel(null);
    }
  };

  const saveFuelInputs = async (driver: SummaryDriver) => {
    const draft = fuelDrafts[driver.driverId];
    if (!draft || (draft.mpg === undefined && draft.ppg === undefined)) return;

    const parseField = (
      raw: string | undefined,
      current: number | null,
      allowZero: boolean
    ): number | null | 'invalid' | 'unchanged' => {
      if (raw === undefined) return 'unchanged';
      const trimmed = raw.trim();
      if (trimmed === '') return null;
      const n = Number(trimmed);
      if (!Number.isFinite(n)) return 'invalid';
      if (allowZero ? n < 0 || n >= 100 : n <= 0 || n >= 1000) return 'invalid';
      return n;
    };

    const mpgParsed = parseField(draft.mpg, driver.fuelMpg, false);
    const ppgParsed = parseField(draft.ppg, driver.fuelPpg, true);
    if (mpgParsed === 'invalid' || ppgParsed === 'invalid') {
      clearFuelDraft(driver.driverId);
      return;
    }

    const nextMpg = mpgParsed === 'unchanged' ? driver.fuelMpg : mpgParsed;
    const nextPpg = ppgParsed === 'unchanged' ? driver.fuelPpg : ppgParsed;

    if (nextMpg === driver.fuelMpg && nextPpg === driver.fuelPpg) {
      clearFuelDraft(driver.driverId);
      return;
    }

    setSavingFuel(driver.driverId);
    try {
      const res = await fetch('/api/gross-profit/mpg', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year,
          week,
          driverId: driver.driverId,
          fuelMpg: nextMpg,
          fuelPpg: nextPpg,
        }),
      });
      if (!res.ok) throw new Error();
      const saved = (await res.json()) as {
        fuelMpg: number | null;
        fuelPpg: number | null;
        fuel: number;
        totalExpenses: number;
        grossProfit: number;
      };
      setSummary((s) =>
        s
          ? {
              ...s,
              drivers: s.drivers.map((x) =>
                x.driverId === driver.driverId
                  ? {
                      ...x,
                      fuelMpg: saved.fuelMpg,
                      fuelPpg: saved.fuelPpg,
                      fuel: saved.fuel,
                      totalExpenses: saved.totalExpenses,
                      grossProfit: saved.grossProfit,
                    }
                  : x
              ),
            }
          : s
      );
      clearFuelDraft(driver.driverId);
    } catch {
      alert(`Failed to save fuel inputs for ${driver.name}`);
    } finally {
      setSavingFuel(null);
    }
  };

  const stepWeek = (delta: number) => {
    let w = week + delta;
    let y = year;
    if (w < 1) {
      w = 52;
      y -= 1;
    } else if (w > 52) {
      w = 1;
      y += 1;
    }
    setWeek(w);
    setYear(y);
  };

  const blocks: SummaryDriver[][] = [];
  if (summary?.drivers.length) {
    for (let i = 0; i < summary.drivers.length; i += 5) {
      blocks.push(summary.drivers.slice(i, i + 5));
    }
  }

  return (
    <div className="min-h-screen bg-background md:pl-60 pt-14 md:pt-0">
      <Navigation currentPage="gross-profit" />

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-4xl font-bold text-foreground">
              Gross Profit Sheet — W{week} ({year})
            </h1>
            {summary && (
              <p className="text-sm text-muted-foreground mt-1">
                {summary.start} → {summary.end} · {summary.drivers.length}{' '}
                drivers
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <select
              value={driverType}
              onChange={(e) => setDriverType(e.target.value)}
              className="px-3 py-2 border border-input rounded-md bg-background text-foreground"
              aria-label="Filter by driver type"
            >
              {(driverTypes.includes('company_driver')
                ? driverTypes
                : ['company_driver', ...driverTypes]
              ).map((t) => (
                <option key={t} value={t}>
                  {formatDriverTypeLabel(t)}
                </option>
              ))}
            </select>
            <Button variant="outline" onClick={() => stepWeek(-1)}>
              ← Prev
            </Button>
            <input
              type="number"
              value={week}
              min={1}
              max={53}
              onChange={(e) => setWeek(Number(e.target.value))}
              className="w-16 px-2 py-2 border border-input rounded-md bg-background text-foreground"
              aria-label="Week"
            />
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-24 px-2 py-2 border border-input rounded-md bg-background text-foreground"
              aria-label="Year"
            />
            <Button variant="outline" onClick={() => stepWeek(1)}>
              Next →
            </Button>
            <Button
              onClick={handleExport}
              disabled={exporting || loading || !summary?.drivers.length}
            >
              {exporting ? 'Exporting…' : 'Export to Excel'}
            </Button>
          </div>
        </div>

        {loading ? (
          <p className="text-muted-foreground py-12 text-center">Loading…</p>
        ) : error ? (
          <p className="text-destructive py-12 text-center">{error}</p>
        ) : !summary || summary.drivers.length === 0 ? (
          <p className="text-muted-foreground py-12 text-center">
            No fuel or trip data for this week.
          </p>
        ) : (
          <div className="space-y-8 overflow-x-auto pb-4">
            {blocks.map((block, bi) => (
              <div key={bi} className="flex gap-3 min-w-min">
                {block.map((d) => (
                  <DriverCard
                    key={d.driverId}
                    driver={d}
                    mpgDraft={fuelDrafts[d.driverId]?.mpg}
                    ppgDraft={fuelDrafts[d.driverId]?.ppg}
                    mileageDraft={mileageDrafts[d.driverId]}
                    grossIncomeDraft={grossIncomeDrafts[d.driverId]}
                    driversPayDraft={driversPayDrafts[d.driverId]}
                    prepassDraft={prepassDrafts[d.driverId]}
                    saving={savingFuel === d.driverId}
                    onMpgChange={(v) =>
                      setFuelDrafts((m) => ({
                        ...m,
                        [d.driverId]: { ...m[d.driverId], mpg: v },
                      }))
                    }
                    onPpgChange={(v) =>
                      setFuelDrafts((m) => ({
                        ...m,
                        [d.driverId]: { ...m[d.driverId], ppg: v },
                      }))
                    }
                    onMileageChange={(v) =>
                      setMileageDrafts((m) => ({
                        ...m,
                        [d.driverId]: v,
                      }))
                    }
                    onGrossIncomeChange={(v) =>
                      setGrossIncomeDrafts((m) => ({
                        ...m,
                        [d.driverId]: v,
                      }))
                    }
                    onDriversPayChange={(v) =>
                      setDriversPayDrafts((m) => ({
                        ...m,
                        [d.driverId]: v,
                      }))
                    }
                    onPrepassChange={(v) =>
                      setPrepassDrafts((m) => ({
                        ...m,
                        [d.driverId]: v,
                      }))
                    }
                    onFuelBlur={() => saveFuelInputs(d)}
                    onMileageBlur={() => saveMileage(d)}
                    onGrossIncomeBlur={() => saveGrossIncome(d)}
                    onDriversPayBlur={() => saveDriversPay(d)}
                    onPrepassBlur={() => savePrepass(d)}
                    onFuelEscape={() => clearFuelDraft(d.driverId)}
                    onMileageEscape={() => clearMileageDraft(d.driverId)}
                    onGrossIncomeEscape={() => clearGrossIncomeDraft(d.driverId)}
                    onDriversPayEscape={() => clearDriversPayDraft(d.driverId)}
                    onPrepassEscape={() => clearPrepassDraft(d.driverId)}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
