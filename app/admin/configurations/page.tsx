'use client';

import { useCallback, useEffect, useState } from 'react';
import { Navigation } from '@/components/Navigation';
import { Button } from '@/components/ui/button';

interface GpRates {
  companyRmPerMile: number;
  ooRmPerMile: number;
  companyLiabilityPerMile: number;
  ooLiabilityPerMile: number;
  ooLiabilityFlat: number;
  factoringRate: number;
  ooEquipmentLeaseDefault: number;
}

interface OoOverride {
  driverId: number;
  driverName: string;
  equipmentLease: number | null;
  pdInsurance: number | null;
  liabilityCredit: number | null;
  xxiiFeePct: number | null;
}

interface OoDriverConfig {
  driverId: number;
  driverName: string;
  driverType: string | null;
  equipmentLease: number | null;
  pdInsurance: number | null;
  liabilityCredit: number | null;
  xxiiFeePct: number | null;
  linehaulPct: number | null;
  effectiveEquipmentLease: number;
  equipmentLeaseSource: 'override' | 'default';
  effectiveXxiiFeePct: number | null;
  xxiiFeeSource: 'override' | 'tms' | 'none';
  hasOverrideRow: boolean;
}

interface DriverOption {
  id: number;
  name: string;
  driverType: string | null;
}

interface CronJobMeta {
  id: string;
  label: string;
  script: string;
  schedule: string;
  scheduleLabel: string;
  needsWeek?: boolean;
  longRunning?: boolean;
}

function emptyRates(): GpRates {
  return {
    companyRmPerMile: 0.19,
    ooRmPerMile: 0.04,
    companyLiabilityPerMile: 0.15,
    ooLiabilityPerMile: 0.15,
    ooLiabilityFlat: 16,
    factoringRate: 0.012,
    ooEquipmentLeaseDefault: -35,
  };
}

export default function ConfigurationsPage() {
  const [rates, setRates] = useState<GpRates>(emptyRates);
  const [factoringPct, setFactoringPct] = useState('1.2');
  const [overrides, setOverrides] = useState<OoOverride[]>([]);
  const [ooDrivers, setOoDrivers] = useState<OoDriverConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingRates, setSavingRates] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const [addDriverId, setAddDriverId] = useState('');
  const [addXxii, setAddXxii] = useState('');
  const [addLease, setAddLease] = useState('');
  const [addPd, setAddPd] = useState('');
  const [addCredit, setAddCredit] = useState('');
  const [savingOverride, setSavingOverride] = useState(false);
  const [driverOptions, setDriverOptions] = useState<DriverOption[]>([]);
  const [driverSearch, setDriverSearch] = useState('');

  const [cronJobs, setCronJobs] = useState<CronJobMeta[]>([]);
  const [cronTz, setCronTz] = useState('America/New_York');
  const [syncAllOrder, setSyncAllOrder] = useState<string[]>([]);
  const [jobYear, setJobYear] = useState('');
  const [jobWeek, setJobWeek] = useState('');
  const [runningJobId, setRunningJobId] = useState<string | null>(null);
  const [jobLog, setJobLog] = useState('');
  const [syncProgress, setSyncProgress] = useState<{
    total: number;
    done: number;
    remaining: number;
    currentId: string | null;
    currentLabel: string;
    failed: boolean;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [res, jobsRes] = await Promise.all([
        fetch('/api/configurations'),
        fetch('/api/configurations/jobs'),
      ]);
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      const r = data.rates as GpRates;
      setRates(r);
      setFactoringPct(String(Math.round(r.factoringRate * 10000) / 100));
      setOverrides(data.ooOverrides ?? []);
      setOoDrivers(data.ooDrivers ?? []);

      if (jobsRes.ok) {
        const j = await jobsRes.json();
        setCronJobs(j.jobs ?? []);
        setCronTz(j.timezone ?? 'America/New_York');
        if (Array.isArray(j.syncAllOrder) && j.syncAllOrder.length) {
          setSyncAllOrder(j.syncAllOrder);
        }
        if (j.defaultWeek?.year && j.defaultWeek?.week) {
          setJobYear(String(j.defaultWeek.year));
          setJobWeek(String(j.defaultWeek.week));
        }
      }
    } catch (err) {
      console.error('[configurations]', err);
      setError('Failed to load configurations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const t = setTimeout(async () => {
      const q = driverSearch.trim();
      if (q.length < 2) {
        setDriverOptions([]);
        return;
      }
      try {
        const params = new URLSearchParams({
          search: q,
          status: 'active',
          page: '1',
          pageSize: '20',
        });
        const res = await fetch(`/api/drivers?${params}`);
        if (!res.ok) return;
        const data = await res.json();
        setDriverOptions(data.drivers ?? []);
      } catch {
        /* ignore search errors */
      }
    }, 300);
    return () => clearTimeout(t);
  }, [driverSearch]);

  const saveRates = async () => {
    setSavingRates(true);
    setMsg('');
    setError('');
    const factoringRate = Number(factoringPct) / 100;
    try {
      const res = await fetch('/api/configurations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyRmPerMile: rates.companyRmPerMile,
          ooRmPerMile: rates.ooRmPerMile,
          companyLiabilityPerMile: rates.companyLiabilityPerMile,
          ooLiabilityPerMile: rates.ooLiabilityPerMile,
          ooLiabilityFlat: rates.ooLiabilityFlat,
          ooEquipmentLeaseDefault: rates.ooEquipmentLeaseDefault,
          factoringRate,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Save failed');
      }
      const data = await res.json();
      setRates(data.rates);
      setFactoringPct(
        String(Math.round(data.rates.factoringRate * 10000) / 100)
      );
      setMsg(
        'Rates saved. Applies to new report generation and mileage/gross edits going forward.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save rates');
    } finally {
      setSavingRates(false);
    }
  };

  const saveOverride = async () => {
    const driverId = Number(addDriverId);
    if (!driverId) {
      setError('Select a driver');
      return;
    }
    setSavingOverride(true);
    setError('');
    setMsg('');
    try {
      const body: Record<string, unknown> = { driverId };
      if (addXxii.trim() !== '') {
        const n = parseNonNeg(addXxii);
        if (n == null) throw new Error('XXII fee must be a positive number');
        body.xxiiFeePct = n;
      }
      if (addLease.trim() !== '') {
        const n = evalSimpleMath(addLease);
        if (n == null) throw new Error('Invalid lease expression');
        body.equipmentLease = n;
      }
      if (addPd.trim() !== '') {
        const n = parseNonNeg(addPd);
        if (n == null) throw new Error('PD must be a non-negative number');
        body.pdInsurance = n;
      }
      if (addCredit.trim() !== '') {
        const n = parseNonNeg(addCredit);
        if (n == null)
          throw new Error('Liability credit must be a non-negative number');
        body.liabilityCredit = n;
      }

      const res = await fetch('/api/configurations/oo-overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Save failed');
      }
      setAddDriverId('');
      setAddXxii('');
      setAddLease('');
      setAddPd('');
      setAddCredit('');
      setDriverSearch('');
      setDriverOptions([]);
      setMsg('OO override saved. Applies going forward.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save override');
    } finally {
      setSavingOverride(false);
    }
  };

  const updateOverrideField = async (
    o: { driverId: number },
    field: 'xxiiFeePct' | 'equipmentLease' | 'pdInsurance' | 'liabilityCredit',
    raw: string
  ) => {
    setError('');
    const body: Record<string, unknown> = { driverId: o.driverId };
    if (raw.trim() === '') body[field] = null;
    else if (field === 'equipmentLease') {
      const n = evalSimpleMath(raw);
      if (n == null) {
        setError('Invalid lease number or expression (e.g. 1119.42-1125)');
        return;
      }
      body[field] = n;
    } else {
      const n = parseNonNeg(raw);
      if (n == null) {
        setError('Enter a non-negative number (negatives only for Equipment Lease)');
        return;
      }
      body[field] = n;
    }
    try {
      const res = await fetch('/api/configurations/oo-overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Update failed');
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  const removeOverride = async (driverId: number) => {
    if (!confirm('Clear all custom overrides for this driver?')) return;
    setError('');
    try {
      const res = await fetch(
        `/api/configurations/oo-overrides?driverId=${driverId}`,
        { method: 'DELETE' }
      );
      if (!res.ok) throw new Error('Delete failed');
      setMsg('Override removed.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const postJob = async (job: CronJobMeta) => {
    const body: Record<string, unknown> = { id: job.id };
    if (job.needsWeek) {
      if (jobYear.trim()) body.year = Number(jobYear);
      if (jobWeek.trim()) body.week = Number(jobWeek);
    }
    const res = await fetch('/api/configurations/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    const result = data.result as
      | {
          ok?: boolean;
          summary?: string;
          error?: string;
          durationMs?: number;
          detail?: { steps?: string[] };
        }
      | undefined;
    return { res, data, result };
  };

  const runSyncAll = async () => {
    const order =
      syncAllOrder.length > 0
        ? syncAllOrder
        : cronJobs.filter((j) => j.id !== 'sync-all').map((j) => j.id);
    const total = order.length;
    if (total === 0) {
      setError('No sync order loaded');
      return;
    }
    if (
      !confirm(
        `Run ALL ${total} jobs in order (tolls → TMS → fuel → MPG → relay → generate report)? Progress updates after each job.`
      )
    ) {
      return;
    }

    setRunningJobId('sync-all');
    setError('');
    setJobLog('');
    setMsg(`Running all syncs (0/${total})…`);
    setSyncProgress({
      total,
      done: 0,
      remaining: total,
      currentId: order[0] ?? null,
      currentLabel:
        cronJobs.find((j) => j.id === order[0])?.label ?? order[0] ?? '',
      failed: false,
    });

    const lines: string[] = [];
    let failed = false;

    try {
      for (let i = 0; i < order.length; i++) {
        const stepId = order[i];
        const job = cronJobs.find((j) => j.id === stepId);
        if (!job) {
          lines.push(`FAIL ${stepId}: unknown job`);
          failed = true;
          setSyncProgress({
            total,
            done: i,
            remaining: total - i,
            currentId: stepId,
            currentLabel: stepId,
            failed: true,
          });
          break;
        }

        setSyncProgress({
          total,
          done: i,
          remaining: total - i,
          currentId: job.id,
          currentLabel: job.label,
          failed: false,
        });
        setMsg(
          `Running ${job.label}… (${i + 1}/${total}, ${total - i} remaining)`
        );
        setRunningJobId(job.id);

        const { res, data, result } = await postJob(job);
        if (!res.ok || !result?.ok) {
          const errMsg =
            result?.error || data.error || `Job failed (${res.status})`;
          lines.push(`FAIL ${job.id}: ${errMsg}`);
          failed = true;
          setError(errMsg);
          setSyncProgress({
            total,
            done: i,
            remaining: total - i,
            currentId: job.id,
            currentLabel: job.label,
            failed: true,
          });
          setJobLog(lines.join('\n'));
          setMsg('');
          break;
        }

        const secs =
          result.durationMs != null
            ? ` (${Math.round(result.durationMs / 1000)}s)`
            : '';
        lines.push(`OK ${job.id}: ${result.summary ?? ''}${secs}`);
        setJobLog(lines.join('\n'));
        setSyncProgress({
          total,
          done: i + 1,
          remaining: total - (i + 1),
          currentId: order[i + 1] ?? null,
          currentLabel:
            cronJobs.find((j) => j.id === order[i + 1])?.label ??
            order[i + 1] ??
            '',
          failed: false,
        });
      }

      if (!failed) {
        setMsg(`All ${total} jobs completed`);
        setJobLog(lines.join('\n'));
        setSyncProgress({
          total,
          done: total,
          remaining: 0,
          currentId: null,
          currentLabel: 'Done',
          failed: false,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Job failed');
      setMsg('');
      setSyncProgress((p) => (p ? { ...p, failed: true } : p));
    } finally {
      setRunningJobId(null);
    }
  };

  const runCronJob = async (job: CronJobMeta) => {
    if (runningJobId) return;
    if (job.id === 'sync-all') {
      await runSyncAll();
      return;
    }
    const warn = job.longRunning
      ? `Run "${job.label}"? This may take several minutes.`
      : `Run "${job.label}" now?`;
    if (!confirm(warn)) return;
    setRunningJobId(job.id);
    setError('');
    setJobLog('');
    setSyncProgress(null);
    setMsg(`Running ${job.label}…`);
    try {
      const { res, data, result } = await postJob(job);
      if (!res.ok || !result?.ok) {
        const errMsg =
          result?.error || data.error || `Job failed (${res.status})`;
        setError(errMsg);
        setJobLog(
          `${job.id}: FAILED — ${errMsg}${
            result?.summary ? ` | ${result.summary}` : ''
          }`
        );
        setMsg('');
        return;
      }
      const secs =
        result.durationMs != null
          ? ` (${Math.round(result.durationMs / 1000)}s)`
          : '';
      setMsg(`${job.label} OK${secs}: ${result.summary ?? ''}`);
      setJobLog(`${job.id}: OK — ${result.summary ?? ''}${secs}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Job failed');
      setMsg('');
    } finally {
      setRunningJobId(null);
    }
  };

  const setRate =
    (key: keyof Omit<GpRates, 'factoringRate'>) =>
    (v: string) => {
      const n = Number(v);
      setRates((r) => ({ ...r, [key]: Number.isFinite(n) ? n : r[key] }));
    };

  return (
    <div className="min-h-screen bg-background md:pl-60 pt-14 md:pt-0">
      <Navigation currentPage="configurations" />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-4xl font-bold text-foreground mb-2">
          Configurations
        </h1>
        <p className="text-muted-foreground mb-6">
          Edit gross-profit formulas (R&amp;M, liability, factoring) and
          owner-operator overrides including XXII fee. For OO drivers, lease /
          XXII / PD / liability / factoring apply on the Gross Profit page as
          soon as you refresh — no week regenerate needed.
        </p>

        {error ? <p className="text-destructive mb-4">{error}</p> : null}
        {msg ? <p className="text-sm text-muted-foreground mb-4">{msg}</p> : null}

        {loading ? (
          <p className="text-muted-foreground py-8">Loading…</p>
        ) : (
          <>
            <section className="bg-card border border-border rounded-lg p-6 mb-8">
              <h2 className="text-xl font-bold text-card-foreground mb-4">
                Global rates
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground">
                    Company drivers
                  </h3>
                  <Field
                    label="R&M ($ / mile)"
                    value={rates.companyRmPerMile}
                    onChange={setRate('companyRmPerMile')}
                    min={0}
                  />
                  <Field
                    label="Liability ($ / mile)"
                    value={rates.companyLiabilityPerMile}
                    onChange={setRate('companyLiabilityPerMile')}
                    min={0}
                  />
                </div>
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground">
                    Owner operators (defaults)
                  </h3>
                  <Field
                    label="R&M ($ / mile)"
                    value={rates.ooRmPerMile}
                    onChange={setRate('ooRmPerMile')}
                    min={0}
                  />
                  <Field
                    label="Liability ($ / mile)"
                    value={rates.ooLiabilityPerMile}
                    onChange={setRate('ooLiabilityPerMile')}
                    min={0}
                  />
                  <Field
                    label="Liability flat ($)"
                    value={rates.ooLiabilityFlat}
                    onChange={setRate('ooLiabilityFlat')}
                    min={0}
                  />
                  <Field
                    label="Equipment Lease ($)"
                    value={rates.ooEquipmentLeaseDefault}
                    onChange={setRate('ooEquipmentLeaseDefault')}
                  />
                  <p className="text-xs text-muted-foreground">
                    Default for all OO without a per-driver override. Negative =
                    credit (e.g. -35).
                  </p>
                </div>
              </div>
              <div className="max-w-xs mb-4">
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Factoring (% of gross)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={factoringPct}
                  onChange={(e) => setFactoringPct(e.target.value)}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Stored as decimal (e.g. 1.2% → 0.012)
                </p>
              </div>
              <Button onClick={saveRates} disabled={savingRates}>
                {savingRates ? 'Saving…' : 'Save global rates'}
              </Button>
            </section>

            <section className="bg-card border border-border rounded-lg p-6">
              <h2 className="text-xl font-bold text-card-foreground mb-2">
                OO drivers — Equipment Lease &amp; overrides
              </h2>
              <p className="text-sm text-muted-foreground mb-4">
                Every active owner-operator is listed. XXII fee shows the value
                used on reports: <strong>custom</strong> override, or{' '}
                <strong>tms</strong> (100 − compensation keep %). Equipment Lease
                shows <strong>default</strong> ({rates.ooEquipmentLeaseDefault}) or
                a <strong>custom</strong> per-driver override — only lease allows
                negatives / expressions (e.g.{' '}
                <code className="text-xs">1119.42-1125</code>). XXII, PD, and
                liability credit are non-negative numbers only. Clear a field to
                fall back (lease → global default; XXII → TMS). After save,
                refresh Gross Profit — values update live.
              </p>

              <div className="border border-border rounded-md p-4 mb-6 space-y-3 bg-muted/30">
                <h3 className="text-sm font-semibold">Quick add override fields</h3>
                <div>
                  <label className="block text-sm text-muted-foreground mb-1">
                    Search driver
                  </label>
                  <input
                    type="search"
                    value={driverSearch}
                    onChange={(e) => setDriverSearch(e.target.value)}
                    placeholder="Type name…"
                    className="w-full max-w-md px-3 py-2 border border-input rounded-md bg-background"
                  />
                  {driverOptions.length > 0 ? (
                    <select
                      value={addDriverId}
                      onChange={(e) => setAddDriverId(e.target.value)}
                      className="mt-2 w-full max-w-md px-3 py-2 border border-input rounded-md bg-background"
                    >
                      <option value="">Select driver…</option>
                      {driverOptions.map((d) => (
                        <option key={d.id} value={String(d.id)}>
                          {d.name}
                          {d.driverType ? ` (${d.driverType})` : ''}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <SmallField
                    label="XXII fee %"
                    value={addXxii}
                    onChange={setAddXxii}
                    placeholder="e.g. 15"
                  />
                  <SmallField
                    label="Equipment lease $"
                    value={addLease}
                    onChange={setAddLease}
                    placeholder="e.g. -70 or 100-105"
                  />
                  <SmallField
                    label="PD insurance $"
                    value={addPd}
                    onChange={setAddPd}
                    placeholder="e.g. 50"
                  />
                  <SmallField
                    label="Liability credit $"
                    value={addCredit}
                    onChange={setAddCredit}
                    placeholder="e.g. 100"
                  />
                </div>
                <Button
                  onClick={saveOverride}
                  disabled={savingOverride || !addDriverId}
                >
                  {savingOverride ? 'Saving…' : 'Save OO override'}
                </Button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted border-b border-border">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground">
                        Driver
                      </th>
                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground">
                        XXII fee % (effective)
                      </th>
                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground">
                        Equip. lease (effective)
                      </th>
                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground">
                        PD
                      </th>
                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground">
                        Liab. credit
                      </th>
                      <th className="px-3 py-2 text-right font-semibold text-muted-foreground">
                        {' '}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {ooDrivers.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-3 py-8 text-center text-muted-foreground"
                        >
                          No active OO drivers found.
                        </td>
                      </tr>
                    ) : (
                      ooDrivers.map((o) => (
                        <tr
                          key={o.driverId}
                          className="border-b border-border"
                        >
                          <td className="px-3 py-2 font-medium">
                            {o.driverName}
                            {o.driverType ? (
                              <span className="block text-xs font-normal text-muted-foreground">
                                {o.driverType}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <InlineNum
                                value={o.effectiveXxiiFeePct}
                                onCommit={(v) =>
                                  updateOverrideField(o, 'xxiiFeePct', v)
                                }
                              />
                              <span
                                className={`text-[10px] uppercase tracking-wide ${
                                  o.xxiiFeeSource === 'override'
                                    ? 'text-foreground font-semibold'
                                    : 'text-muted-foreground'
                                }`}
                                title={
                                  o.xxiiFeeSource === 'override'
                                    ? 'Custom per-driver override'
                                    : o.xxiiFeeSource === 'tms'
                                      ? `From TMS keep ${o.linehaulPct ?? '—'}% → fee = 100 − keep`
                                      : 'No override and no TMS linehaul %'
                                }
                              >
                                {o.xxiiFeeSource === 'override'
                                  ? 'custom'
                                  : o.xxiiFeeSource === 'tms'
                                    ? 'tms'
                                    : '—'}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <InlineNum
                                value={o.effectiveEquipmentLease}
                                allowLeaseExpr
                                onCommit={(v) =>
                                  updateOverrideField(o, 'equipmentLease', v)
                                }
                              />
                              <span
                                className={`text-[10px] uppercase tracking-wide ${
                                  o.equipmentLeaseSource === 'override'
                                    ? 'text-foreground font-semibold'
                                    : 'text-muted-foreground'
                                }`}
                                title={
                                  o.equipmentLeaseSource === 'override'
                                    ? 'Custom per-driver override'
                                    : `Using global default (${rates.ooEquipmentLeaseDefault})`
                                }
                              >
                                {o.equipmentLeaseSource === 'override'
                                  ? 'custom'
                                  : 'default'}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <InlineNum
                              value={o.pdInsurance}
                              onCommit={(v) =>
                                updateOverrideField(o, 'pdInsurance', v)
                              }
                            />
                          </td>
                          <td className="px-3 py-2">
                            <InlineNum
                              value={o.liabilityCredit}
                              onCommit={(v) =>
                                updateOverrideField(o, 'liabilityCredit', v)
                              }
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            {o.hasOverrideRow ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => removeOverride(o.driverId)}
                              >
                                Clear custom
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                —
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {overrides.length > 0 ? (
                <p className="text-xs text-muted-foreground mt-3">
                  {overrides.length} driver(s) have at least one custom override
                  row stored.
                </p>
              ) : null}
            </section>

            <section className="bg-card border border-border rounded-lg p-6 mt-8">
              <h2 className="text-xl font-bold text-card-foreground mb-2">
                Manual run — cron jobs
              </h2>
              <p className="text-sm text-muted-foreground mb-4">
                Production crontab has{' '}
                <strong>
                  {cronJobs.filter((j) => j.id !== 'sync-all').length}
                </strong>{' '}
                scheduled jobs (timezone <code className="text-xs">{cronTz}</code>
                ). Use <strong>Run all syncs</strong> for the full pipeline, or
                run one job. Week-scoped steps use Year/Week below (default =
                previous completed week). Full pipeline can take a long time.
              </p>

              <div className="flex flex-wrap gap-3 mb-4 items-end">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">
                    Year (week jobs)
                  </label>
                  <input
                    type="number"
                    value={jobYear}
                    onChange={(e) => setJobYear(e.target.value)}
                    className="w-28 px-2 py-1.5 border border-input rounded-md bg-background text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">
                    Week (week jobs)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={53}
                    value={jobWeek}
                    onChange={(e) => setJobWeek(e.target.value)}
                    className="w-24 px-2 py-1.5 border border-input rounded-md bg-background text-sm"
                  />
                </div>
                {cronJobs.some((j) => j.id === 'sync-all') ? (
                  <Button
                    disabled={runningJobId !== null}
                    onClick={() => {
                      const all = cronJobs.find((j) => j.id === 'sync-all');
                      if (all) runCronJob(all);
                    }}
                  >
                    {syncProgress && runningJobId
                      ? `Running… ${syncProgress.done}/${syncProgress.total}`
                      : runningJobId === 'sync-all'
                        ? 'Running all…'
                        : 'Run all syncs'}
                  </Button>
                ) : null}
              </div>

              {syncProgress ? (
                <div className="mb-4 rounded-md border border-border bg-muted/40 px-3 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                    <p className="text-sm font-medium text-foreground">
                      {syncProgress.failed
                        ? 'Stopped'
                        : syncProgress.remaining === 0
                          ? 'All done'
                          : `Now: ${syncProgress.currentLabel}`}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {syncProgress.done}/{syncProgress.total} done
                      {syncProgress.remaining > 0
                        ? ` · ${syncProgress.remaining} remaining`
                        : ''}
                    </p>
                  </div>
                  <div
                    className="h-2 w-full overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={syncProgress.total}
                    aria-valuenow={syncProgress.done}
                  >
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        syncProgress.failed
                          ? 'bg-destructive'
                          : syncProgress.remaining === 0
                            ? 'bg-emerald-600'
                            : 'bg-foreground'
                      }`}
                      style={{
                        width: `${
                          syncProgress.total
                            ? Math.round(
                                (syncProgress.done / syncProgress.total) * 100
                              )
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                  {syncProgress.remaining > 0 && !syncProgress.failed ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {syncProgress.remaining} reh gaye
                      {syncProgress.currentLabel
                        ? ` — ab chal raha: ${syncProgress.currentLabel}`
                        : ''}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {jobLog ? (
                <p className="text-xs font-mono bg-muted/50 border border-border rounded-md px-3 py-2 mb-4 whitespace-pre-wrap break-all">
                  {jobLog}
                </p>
              ) : null}

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted border-b border-border">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground">
                        Job
                      </th>
                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground">
                        Schedule
                      </th>
                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground">
                        Script
                      </th>
                      <th className="px-3 py-2 text-right font-semibold text-muted-foreground">
                        {' '}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {cronJobs.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-3 py-6 text-center text-muted-foreground"
                        >
                          No jobs loaded.
                        </td>
                      </tr>
                    ) : (
                      cronJobs.map((job) => {
                        const isCurrent =
                          syncProgress?.currentId === job.id &&
                          runningJobId !== null;
                        const stepIdx =
                          syncAllOrder.length > 0
                            ? syncAllOrder.indexOf(job.id)
                            : -1;
                        const isDoneStep =
                          syncProgress != null &&
                          stepIdx >= 0 &&
                          stepIdx < syncProgress.done;
                        return (
                        <tr
                          key={job.id}
                          className={`border-b border-border ${
                            isCurrent
                              ? 'bg-amber-500/10'
                              : isDoneStep
                                ? 'bg-emerald-500/5'
                                : ''
                          }`}
                        >
                          <td className="px-3 py-2 font-medium">
                            {job.label}
                            {isCurrent ? (
                              <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-400">
                                running
                              </span>
                            ) : isDoneStep ? (
                              <span className="ml-2 text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                                done
                              </span>
                            ) : null}
                            {job.needsWeek ? (
                              <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                                week
                              </span>
                            ) : null}
                            {job.longRunning ? (
                              <span className="ml-1 text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-400">
                                long
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            <span className="block">{job.scheduleLabel}</span>
                            <code className="text-[10px]">{job.schedule}</code>
                          </td>
                          <td className="px-3 py-2">
                            <code className="text-xs">{job.script}</code>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={runningJobId !== null}
                              onClick={() => runCronJob(job)}
                            >
                              {runningJobId === job.id ||
                              (job.id === 'sync-all' &&
                                syncProgress &&
                                runningJobId)
                                ? 'Running…'
                                : 'Run'}
                            </Button>
                          </td>
                        </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  min,
}: {
  label: string;
  value: number;
  onChange: (v: string) => void;
  /** When set, browser blocks values below this (omit for Equipment Lease). */
  min?: number;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-muted-foreground mb-1">
        {label}
      </label>
      <input
        type="number"
        step="0.01"
        min={min}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-input rounded-md bg-background"
      />
    </div>
  );
}

function SmallField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-muted-foreground mb-1">{label}</label>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2 py-1.5 border border-input rounded-md bg-background text-sm"
      />
    </div>
  );
}

/** Non-negative plain number (no expressions). */
function parseNonNeg(raw: string): number | null {
  const s = raw.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

/** Safe + - * / ( ) decimal expression → number, or null if invalid. Lease only. */
function evalSimpleMath(raw: string): number | null {
  const s = raw.trim().replace(/\s+/g, '');
  if (!s) return null;
  if (!/^[-+*/().0-9]+$/.test(s)) return null;
  try {
    // eslint-disable-next-line no-new-func
    const n = Function(`"use strict"; return (${s})`)() as unknown;
    const num = typeof n === 'number' ? n : Number(n);
    if (!Number.isFinite(num)) return null;
    return Math.round(num * 100) / 100;
  } catch {
    return null;
  }
}

function InlineNum({
  value,
  onCommit,
  allowLeaseExpr = false,
}: {
  value: number | null;
  onCommit: (raw: string) => void;
  /** Equipment Lease only: negatives + math expressions. */
  allowLeaseExpr?: boolean;
}) {
  const [draft, setDraft] = useState(
    value == null ? '' : String(value)
  );
  useEffect(() => {
    setDraft(value == null ? '' : String(value));
  }, [value]);

  const commit = () => {
    const next = draft.trim();
    if (next === '') {
      const prev = value == null ? '' : String(value);
      if (prev !== '') onCommit('');
      return;
    }
    const evaluated = allowLeaseExpr
      ? evalSimpleMath(next)
      : parseNonNeg(next);
    if (evaluated == null) {
      setDraft(value == null ? '' : String(value));
      onCommit(next); // parent shows error for invalid
      return;
    }
    const rounded = String(evaluated);
    setDraft(rounded);
    const prev = value == null ? '' : String(value);
    if (rounded !== prev) onCommit(rounded);
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
        }
      }}
      placeholder={allowLeaseExpr ? 'e.g. 100-105' : '0'}
      title={
        allowLeaseExpr
          ? 'Number or expression, e.g. 1119.42-1125 (negatives OK)'
          : 'Non-negative number only'
      }
      className="w-28 px-2 py-1 border border-input rounded-md bg-background tabular-nums"
    />
  );
}
