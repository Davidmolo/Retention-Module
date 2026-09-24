'use client';

import { useEffect, useMemo, useState } from 'react';
import { Navigation } from '@/components/Navigation';
import { GrossProfitData } from '@/lib/excelParser';
import { downloadExcel } from '@/lib/excelExport';
import { Button } from '@/components/ui/button';
import { weekOf } from '@/lib/week';
import { isOwnerOperator } from '@/lib/sources/driverTypeGroups';

type SortKey =
  | 'mileage'
  | 'grossIncome'
  | 'totalExpenses'
  | 'netProfit'
  | 'margin';

// Previous completed week (default selection). Current in-progress week is excluded.
function previousWeek() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 7);
  return weekOf(d);
}

/** Highest week number selectable for a year (completed weeks only). */
function maxCompletedWeekForYear(year: number): number {
  const done = previousWeek();
  if (year < done.year) return 52;
  if (year > done.year) return 0;
  return done.week;
}

function marginOf(driver: {
  netProfit: number;
  totalGrossIncome: number;
}): number {
  if (!driver.totalGrossIncome) return 0;
  return (driver.netProfit / driver.totalGrossIncome) * 100;
}

export default function SummaryPage() {
  const [data, setData] = useState<GrossProfitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [selectedYear, setSelectedYear] = useState<string>(() =>
    String(previousWeek().year)
  );
  const [selectedWeek, setSelectedWeek] = useState<string>(() =>
    String(previousWeek().week)
  );
  const [sortKey, setSortKey] = useState<SortKey>('netProfit');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const maxWeek = maxCompletedWeekForYear(Number(selectedYear));
  const weekOptions = useMemo(
    () => Array.from({ length: maxWeek }, (_, i) => i + 1),
    [maxWeek]
  );

  useEffect(() => {
    if (maxWeek > 0 && Number(selectedWeek) > maxWeek) {
      setSelectedWeek(String(maxWeek));
    }
  }, [maxWeek, selectedWeek]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/data?year=${selectedYear}&week=${selectedWeek}`
        );
        if (!response.ok) throw new Error('Failed to fetch data');
        setData(await response.json());
        setError('');
      } catch (err) {
        setError('Failed to load data');
        console.error('[summary] Error loading data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedYear, selectedWeek]);

  const sortedDrivers = useMemo(() => {
    if (!data) return [];
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...data.drivers].sort((a, b) => {
      const av =
        sortKey === 'mileage'
          ? a.mileage
          : sortKey === 'grossIncome'
            ? a.totalGrossIncome
            : sortKey === 'totalExpenses'
              ? a.totalExpenses
              : sortKey === 'netProfit'
                ? a.netProfit
                : marginOf(a);
      const bv =
        sortKey === 'mileage'
          ? b.mileage
          : sortKey === 'grossIncome'
            ? b.totalGrossIncome
            : sortKey === 'totalExpenses'
              ? b.totalExpenses
              : sortKey === 'netProfit'
                ? b.netProfit
                : marginOf(b);
      if (av === bv) return a.name.localeCompare(b.name);
      return av < bv ? -dir : dir;
    });
  }, [data, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sortIndicator = (key: SortKey) =>
    sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  const handleExport = async () => {
    if (!data) return;
    setExporting(true);

    try {
      await downloadExcel(data);
    } catch (err) {
      console.error('[v0] Error exporting data:', err);
      setError('Failed to export data');
    } finally {
      setExporting(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-background md:pl-60 pt-14 md:pt-0">
        <Navigation currentPage="summary" />
        <div className="flex items-center justify-center h-96">
          <p className="text-muted-foreground">Loading data...</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-screen bg-background md:pl-60 pt-14 md:pt-0">
        <Navigation currentPage="summary" />
        <div className="flex items-center justify-center h-96">
          <p className="text-destructive">{error || 'No data available'}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="min-h-screen bg-background md:pl-60 pt-14 md:pt-0">
      <Navigation currentPage="summary" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex justify-between items-start gap-4 mb-8 flex-col lg:flex-row">
          <div>
            <h1 className="text-4xl font-bold text-foreground mb-4">Summary</h1>
            <div className="flex gap-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  Year
                </label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {[2024, 2025, 2026, 2027].map((year) => (
                    <option key={year} value={year.toString()}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  Week
                </label>
                <select
                  value={selectedWeek}
                  onChange={(e) => setSelectedWeek(e.target.value)}
                  className="px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {weekOptions.map((week) => (
                    <option key={week} value={week.toString()}>
                      Week {week}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <Button
            onClick={handleExport}
            disabled={exporting}
            size="lg"
          >
            {exporting ? 'Exporting...' : 'Export to Excel'}
          </Button>
        </div>

        {/* Summary Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <SummaryCard
            title="Period"
            value={`Week ${selectedWeek}, ${selectedYear}`}
            subtitle="Reporting week"
          />
          <SummaryCard
            title="Total Drivers"
            value={data.drivers.length.toString()}
            subtitle="Active drivers"
          />
          <SummaryCard
            title="Total Mileage"
            value={data.totalMileage.toLocaleString('en-US', { maximumFractionDigits: 1 })}
            subtitle="miles"
          />
          <SummaryCard
            title="Gross Revenue"
            value={`$${data.totalGrossIncome.toLocaleString('en-US', { maximumFractionDigits: 2 })}`}
            subtitle="income"
          />
          <SummaryCard
            title="Net Profit"
            value={`$${data.totalNetProfit.toLocaleString('en-US', { maximumFractionDigits: 2 })}`}
            subtitle="profit"
            isPositive={data.totalNetProfit > 0}
          />
        </div>

        {/* Detailed Summary Table */}
        <div className="bg-card border border-border rounded-lg overflow-hidden mb-8">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-2xl font-bold text-card-foreground">Expense Breakdown</h2>
          </div>

          <div className="p-6">
            <div className="space-y-4">
              <div className="flex justify-between items-center py-3 border-b border-border">
                <span className="font-semibold text-card-foreground">Total Gross Income</span>
                <span className="font-bold text-lg text-green-600">
                  ${data.totalGrossIncome.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                </span>
              </div>

              <div className="text-sm space-y-3 py-4">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Driver Pay</span>
                  <span className="font-medium">
                    ${data.drivers.reduce((sum, d) => sum + d.driversPay, 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Fuel Costs</span>
                  <span className="font-medium">
                    ${data.drivers.reduce((sum, d) => sum + d.fuel, 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">PREPASS</span>
                  <span className="font-medium">
                    ${data.drivers.reduce((sum, d) => sum + d.prepass, 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Monitoring Logs</span>
                  <span className="font-medium">
                    ${data.drivers.reduce((sum, d) => sum + d.monitoringLogs, 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">R & M</span>
                  <span className="font-medium">
                    ${data.drivers.reduce((sum, d) => sum + d.rm, 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Equipment Lease</span>
                  <span className="font-medium">
                    ${data.drivers.reduce((sum, d) => sum + d.equipmentLease, 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Liability Insurance</span>
                  <span className="font-medium">
                    ${data.drivers.reduce((sum, d) => sum + d.liabilityInsurance, 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              <div className="flex justify-between items-center py-3 border-b border-border">
                <span className="font-semibold text-card-foreground">Total Expenses</span>
                <span className="font-bold text-lg text-red-600">
                  ${data.totalExpenses.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex justify-between items-center py-4">
                <span className="text-xl font-bold text-card-foreground">Net Profit</span>
                <span
                  className={`text-3xl font-bold ${data.totalNetProfit > 0 ? 'text-green-600' : 'text-red-600'}`}
                >
                  ${data.totalNetProfit.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Profit Margin Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-card border border-border rounded-lg p-6">
            <h3 className="text-lg font-bold text-card-foreground mb-4">Profit Analysis</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Profit Margin %:</span>
                <span className="font-bold">
                  {((data.totalNetProfit / data.totalGrossIncome) * 100).toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Expense Ratio %:</span>
                <span className="font-bold">
                  {((data.totalExpenses / data.totalGrossIncome) * 100).toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Avg Income per Driver:</span>
                <span className="font-bold">
                  ${(data.totalGrossIncome / data.drivers.length).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Avg Profit per Driver:</span>
                <span className="font-bold">
                  ${(data.totalNetProfit / data.drivers.length).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-6">
            <h3 className="text-lg font-bold text-card-foreground mb-4">Mileage Statistics</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Mileage:</span>
                <span className="font-bold">
                  {data.totalMileage.toLocaleString('en-US', { maximumFractionDigits: 1 })} mi
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Avg Mileage per Driver:</span>
                <span className="font-bold">
                  {(data.totalMileage / data.drivers.length).toLocaleString('en-US', { maximumFractionDigits: 1 })} mi
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Revenue per Mile:</span>
                <span className="font-bold">
                  ${(data.totalGrossIncome / data.totalMileage).toLocaleString('en-US', { maximumFractionDigits: 2 })}/mi
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Profit per Mile:</span>
                <span className="font-bold">
                  ${(data.totalNetProfit / data.totalMileage).toLocaleString('en-US', { maximumFractionDigits: 2 })}/mi
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Detailed Driver Summary Table */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-2xl font-bold text-card-foreground">Driver Performance</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold text-muted-foreground">
                    Driver
                  </th>
                  <SortableTh
                    label="Mileage"
                    active={sortKey === 'mileage'}
                    indicator={sortIndicator('mileage')}
                    onClick={() => toggleSort('mileage')}
                  />
                  <SortableTh
                    label="Gross Income"
                    active={sortKey === 'grossIncome'}
                    indicator={sortIndicator('grossIncome')}
                    onClick={() => toggleSort('grossIncome')}
                  />
                  <SortableTh
                    label="Total Expenses"
                    active={sortKey === 'totalExpenses'}
                    indicator={sortIndicator('totalExpenses')}
                    onClick={() => toggleSort('totalExpenses')}
                  />
                  <SortableTh
                    label="Net Profit"
                    active={sortKey === 'netProfit'}
                    indicator={sortIndicator('netProfit')}
                    onClick={() => toggleSort('netProfit')}
                  />
                  <SortableTh
                    label="Margin %"
                    active={sortKey === 'margin'}
                    indicator={sortIndicator('margin')}
                    onClick={() => toggleSort('margin')}
                  />
                </tr>
              </thead>
              <tbody>
                {sortedDrivers.map((driver, idx) => {
                  const marginPercent = marginOf(driver);
                  const oo = isOwnerOperator({
                    driverType: driver.driverType ?? null,
                    name: driver.name,
                  });
                  return (
                    <tr
                      key={driver.id}
                      className={
                        oo
                          ? 'bg-[#faf6e9]'
                          : idx % 2 === 0
                            ? 'bg-background'
                            : 'bg-muted'
                      }
                    >
                      <td className="px-6 py-4 font-medium text-card-foreground">
                        {oo ? `${driver.name} (OO)` : driver.name}
                      </td>
                      <td className="px-6 py-4 text-card-foreground">
                        {driver.mileage.toLocaleString('en-US', {
                          maximumFractionDigits: 1,
                        })}{' '}
                        mi
                      </td>
                      <td className="px-6 py-4 text-card-foreground">
                        $
                        {driver.totalGrossIncome.toLocaleString('en-US', {
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="px-6 py-4 text-card-foreground">
                        $
                        {driver.totalExpenses.toLocaleString('en-US', {
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td
                        className={`px-6 py-4 font-medium ${
                          driver.netProfit > 0 ? 'text-green-600' : 'text-red-600'
                        }`}
                      >
                        $
                        {driver.netProfit.toLocaleString('en-US', {
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="px-6 py-4 text-card-foreground font-medium">
                        {marginPercent.toFixed(2)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

function SortableTh({
  label,
  active,
  indicator,
  onClick,
}: {
  label: string;
  active: boolean;
  indicator: string;
  onClick: () => void;
}) {
  return (
    <th className="px-6 py-3 text-left font-semibold text-muted-foreground">
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-0.5 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded ${
          active ? 'text-foreground' : ''
        }`}
        title={`Sort by ${label}`}
      >
        {label}
        <span className="tabular-nums w-3 inline-block" aria-hidden>
          {indicator}
        </span>
      </button>
    </th>
  );
}

function SummaryCard({
  title,
  value,
  subtitle,
  isPositive,
}: {
  title: string;
  value: string;
  subtitle: string;
  isPositive?: boolean;
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <p className="text-xs font-medium text-muted-foreground mb-1">{title}</p>
      <p className={`text-2xl font-bold ${isPositive === false ? 'text-red-600' : 'text-green-600'}`}>
        {value}
      </p>
      <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
    </div>
  );
}
