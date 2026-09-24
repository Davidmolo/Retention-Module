'use client';

import { useEffect, useState } from 'react';
import { Navigation } from '@/components/Navigation';
import { GrossProfitData, Driver } from '@/lib/excelParser';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line, ResponsiveContainer } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Button } from '@/components/ui/button';

export default function DashboardPage() {
  const [data, setData] = useState<GrossProfitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [generating, setGenerating] = useState(false);
  // Trip counts come from the DB (trips table), not the sheet.
  const [tripCounts, setTripCounts] = useState<
    { driverName: string; tripCount: number }[]
  >([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/api/data');
        if (!response.ok) throw new Error('Failed to fetch data');
        const result = await response.json();
        setData(result);
      } catch (err) {
        setError('Failed to load data');
        console.error('[v0] Error loading dashboard data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    fetch('/api/trips')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('trips fetch failed'))))
      .then((res) => setTripCounts(res.drivers ?? []))
      .catch((err) => console.error('[dashboard] Error loading trips:', err));
  }, []);

  const getTopDrivers = (metric: 'trips' | 'salary' | 'mileage'): Driver[] => {
    if (!data?.drivers) return [];

    const sorted = [...data.drivers].sort((a, b) => {
      if (metric === 'salary') return b.driversPay - a.driversPay;
      if (metric === 'mileage') return b.mileage - a.mileage;
      return b.tripCount - a.tripCount;
    });

    return sorted.slice(0, 3);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background md:pl-60 pt-14 md:pt-0">
        <Navigation currentPage="dashboard" />
        <div className="flex items-center justify-center h-96">
          <p className="text-muted-foreground">Loading data...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background md:pl-60 pt-14 md:pt-0">
        <Navigation currentPage="dashboard" />
        <div className="flex items-center justify-center h-96">
          <p className="text-destructive">{error || 'No data available'}</p>
        </div>
      </div>
    );
  }

  // Top 3 by trips, sourced from the DB (already ordered desc by the API).
  const topByTrips = tripCounts
    .slice(0, 3)
    .map((t) => ({ name: t.driverName, trips: t.tripCount }));
  const topBySalary = getTopDrivers('salary');
  const topByMileage = getTopDrivers('mileage');

  // Generate the exact-replica Gross Profit Sheet from the current data.
  // Uses POST /api/sheets with an explicit payload (works before TMS is wired).
  // NOTE: the current flat data has no fuel MPG/PPG, so the Fuel line is left
  // blank here; the GET /api/sheets flow (fuel DB + TMS) fills it.
  const handleGenerate = async () => {
    if (!data) return;
    setGenerating(true);
    try {
      const payload = {
        year: 2026,
        week: 27,
        block1: data.drivers.map((d) => ({
          name: d.name,
          trips: d.tripCount,
          mileage: d.mileage,
          grossIncome: d.totalGrossIncome,
          driversPay: d.driversPay,
          prepass: d.prepass,
          monitoringLogs: d.monitoringLogs,
        })),
      };
      const res = await fetch('/api/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to generate sheet');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Gross-Profit-Sheet-W${payload.week}-${payload.year}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[dashboard] generate error:', err);
      alert('Could not generate the sheet. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background md:pl-60 pt-14 md:pt-0">
      <Navigation currentPage="dashboard" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-4xl font-bold text-foreground">Dashboard</h1>
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? 'Generating…' : 'Generate Gross Profit Sheet'}
          </Button>
        </div>

        {/* Date Range Filter */}
        <div className="bg-card border border-border rounded-lg p-4 mb-8">
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-muted-foreground mb-2">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-muted-foreground mb-2">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <Button
              onClick={() => {
                setStartDate('');
                setEndDate('');
              }}
              variant="outline"
            >
              Reset
            </Button>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <MetricCard
            title="Total Drivers"
            value={data.drivers.length.toString()}
            subtitle="Active drivers"
          />
          <MetricCard
            title="Total Mileage"
            value={data.totalMileage.toLocaleString('en-US', { maximumFractionDigits: 1 })}
            subtitle="miles"
          />
          <MetricCard
            title="Total Gross Income"
            value={`$${data.totalGrossIncome.toLocaleString('en-US', { maximumFractionDigits: 2 })}`}
            subtitle="revenue"
          />
          <MetricCard
            title="Total Net Profit"
            value={`$${data.totalNetProfit.toLocaleString('en-US', { maximumFractionDigits: 2 })}`}
            subtitle={
              data.totalNetProfit > 0
                ? 'profit'
                : 'loss'
            }
            isPositive={data.totalNetProfit > 0}
          />
        </div>

        {/* Top Performers Charts */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <TopTripsChart data={topByTrips} />
          <TopSalaryChart drivers={topBySalary} />
          <TopMileageChart drivers={topByMileage} />
        </div>

        {/* Financial KPI Charts */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <TotalCostChart drivers={data.drivers} />
          <RevenueChart drivers={data.drivers} />
          <MarginPercentageChart drivers={data.drivers} />
        </div>

        {/* Drivers Table */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-2xl font-bold text-card-foreground">All Drivers</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold text-muted-foreground">Driver</th>
                  <th className="px-6 py-3 text-left font-semibold text-muted-foreground">Trips</th>
                  <th className="px-6 py-3 text-left font-semibold text-muted-foreground">Mileage</th>
                  <th className="px-6 py-3 text-left font-semibold text-muted-foreground">Gross Income</th>
                  <th className="px-6 py-3 text-left font-semibold text-muted-foreground">Salary</th>
                  <th className="px-6 py-3 text-left font-semibold text-muted-foreground">Net Profit</th>
                </tr>
              </thead>
              <tbody>
                {data.drivers.map((driver, idx) => (
                  <tr
                    key={driver.id}
                    className={idx % 2 === 0 ? 'bg-background' : 'bg-muted'}
                  >
                    <td className="px-6 py-4 font-medium text-card-foreground">{driver.name}</td>
                    <td className="px-6 py-4 text-card-foreground">{driver.tripCount}</td>
                    <td className="px-6 py-4 text-card-foreground">
                      {driver.mileage.toLocaleString('en-US', { maximumFractionDigits: 1 })} mi
                    </td>
                    <td className="px-6 py-4 text-card-foreground">
                      ${driver.totalGrossIncome.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 text-card-foreground">
                      ${driver.driversPay.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                    </td>
                    <td
                      className={`px-6 py-4 font-medium ${
                        driver.netProfit > 0 ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      ${driver.netProfit.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

function MetricCard({
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
    <div className="bg-card border border-border rounded-lg p-6">
      <p className="text-sm font-medium text-muted-foreground mb-2">{title}</p>
      <p className={`text-3xl font-bold ${isPositive === false ? 'text-red-600' : 'text-green-600'}`}>
        {value}
      </p>
      <p className="text-xs text-muted-foreground mt-2">{subtitle}</p>
    </div>
  );
}

function TopTripsChart({ data }: { data: { name: string; trips: number }[] }) {
  const chartData = data;

  const chartConfig = {
    trips: {
      label: 'Trips',
      color: '#3b82f6',
    },
  };

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <h3 className="text-lg font-semibold text-card-foreground mb-4">Top by Trips</h3>
      <ChartContainer config={chartConfig} className="h-80 w-full">
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--muted)" />
          <XAxis dataKey="name" stroke="var(--muted-foreground)" />
          <YAxis stroke="var(--muted-foreground)" />
          <Tooltip content={<ChartTooltipContent />} />
          <Bar dataKey="trips" fill="#3b82f6" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ChartContainer>
    </div>
  );
}

function TopSalaryChart({ drivers }: { drivers: Driver[] }) {
  const chartData = drivers.map((driver) => ({
    name: driver.name,
    salary: Math.round(driver.driversPay * 100) / 100,
  }));

  const chartConfig = {
    salary: {
      label: 'Salary',
      color: '#10b981',
    },
  };

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <h3 className="text-lg font-semibold text-card-foreground mb-4">Top by Salary</h3>
      <ChartContainer config={chartConfig} className="h-80 w-full">
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--muted)" />
          <XAxis dataKey="name" stroke="var(--muted-foreground)" />
          <YAxis stroke="var(--muted-foreground)" />
          <Tooltip content={<ChartTooltipContent />} />
          <Bar dataKey="salary" fill="#10b981" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ChartContainer>
    </div>
  );
}

function TopMileageChart({ drivers }: { drivers: Driver[] }) {
  const chartData = drivers.map((driver) => ({
    name: driver.name,
    mileage: Math.round(driver.mileage * 10) / 10,
  }));

  const chartConfig = {
    mileage: {
      label: 'Mileage',
      color: '#f59e0b',
    },
  };

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <h3 className="text-lg font-semibold text-card-foreground mb-4">Top by Mileage</h3>
      <ChartContainer config={chartConfig} className="h-80 w-full">
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--muted)" />
          <XAxis dataKey="name" stroke="var(--muted-foreground)" />
          <YAxis stroke="var(--muted-foreground)" />
          <Tooltip content={<ChartTooltipContent />} />
          <Bar dataKey="mileage" fill="#f59e0b" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ChartContainer>
    </div>
  );
}

function TotalCostChart({ drivers }: { drivers: Driver[] }) {
  const chartData = drivers.map((driver) => ({
    name: driver.name,
    cost: Math.round(driver.totalExpenses * 100) / 100,
  }));

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <h3 className="text-lg font-semibold text-card-foreground mb-4">Total Cost by Driver</h3>
      <ChartContainer config={{ cost: { label: 'Cost', color: '#ef4444' } }} className="h-80 w-full">
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--muted)" />
          <XAxis dataKey="name" stroke="var(--muted-foreground)" />
          <YAxis stroke="var(--muted-foreground)" />
          <Tooltip content={<ChartTooltipContent />} />
          <Bar dataKey="cost" fill="#ef4444" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ChartContainer>
    </div>
  );
}

function RevenueChart({ drivers }: { drivers: Driver[] }) {
  const chartData = drivers.map((driver) => ({
    name: driver.name,
    revenue: Math.round(driver.totalGrossIncome * 100) / 100,
  }));

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <h3 className="text-lg font-semibold text-card-foreground mb-4">Total Revenue by Driver</h3>
      <ChartContainer config={{ revenue: { label: 'Revenue', color: '#8b5cf6' } }} className="h-80 w-full">
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--muted)" />
          <XAxis dataKey="name" stroke="var(--muted-foreground)" />
          <YAxis stroke="var(--muted-foreground)" />
          <Tooltip content={<ChartTooltipContent />} />
          <Bar dataKey="revenue" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ChartContainer>
    </div>
  );
}

function MarginPercentageChart({ drivers }: { drivers: Driver[] }) {
  const chartData = drivers.map((driver) => ({
    name: driver.name,
    margin: driver.totalGrossIncome > 0 ? ((driver.netProfit / driver.totalGrossIncome) * 100) : 0,
  }));

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <h3 className="text-lg font-semibold text-card-foreground mb-4">Profit Margin % by Driver</h3>
      <ChartContainer config={{ margin: { label: 'Margin %', color: '#06b6d4' } }} className="h-80 w-full">
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--muted)" />
          <XAxis dataKey="name" stroke="var(--muted-foreground)" />
          <YAxis stroke="var(--muted-foreground)" />
          <Tooltip content={<ChartTooltipContent />} />
          <Bar dataKey="margin" fill="#06b6d4" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ChartContainer>
    </div>
  );
}
