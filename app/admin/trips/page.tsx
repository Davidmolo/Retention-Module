'use client';

import { useEffect, useState } from 'react';
import { Navigation } from '@/components/Navigation';
import { GrossProfitData } from '@/lib/excelParser';
import { Button } from '@/components/ui/button';

export default function TripsPage() {
  const [data, setData] = useState<GrossProfitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterDriver, setFilterDriver] = useState<string>('all');
  const [newTrip, setNewTrip] = useState({ driverName: '', tripNumber: 0 });
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/api/data');
        if (!response.ok) throw new Error('Failed to fetch data');
        const result = await response.json();
        setData(result);
      } catch (err) {
        setError('Failed to load data');
        console.error('[v0] Error loading trips data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleAddTrip = () => {
    if (!newTrip.driverName || newTrip.tripNumber === 0 || !data) return;

    const updatedDrivers = data.drivers.map((d) => {
      if (d.name === newTrip.driverName) {
        return {
          ...d,
          trips: [
            ...d.trips,
            { tripNumber: newTrip.tripNumber, driverName: newTrip.driverName },
          ],
        };
      }
      return d;
    });

    setData({ ...data, drivers: updatedDrivers });
    setNewTrip({ driverName: '', tripNumber: 0 });
    setShowAddForm(false);
  };

  const handleDeleteTrip = (driverName: string, tripNumber: number) => {
    if (!data) return;

    const updatedDrivers = data.drivers.map((d) => {
      if (d.name === driverName) {
        return {
          ...d,
          trips: d.trips.filter((t) => t.tripNumber !== tripNumber),
        };
      }
      return d;
    });

    setData({ ...data, drivers: updatedDrivers });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background md:pl-60 pt-14 md:pt-0">
        <Navigation currentPage="trips" />
        <div className="flex items-center justify-center h-96">
          <p className="text-muted-foreground">Loading data...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background md:pl-60 pt-14 md:pt-0">
        <Navigation currentPage="trips" />
        <div className="flex items-center justify-center h-96">
          <p className="text-destructive">{error || 'No data available'}</p>
        </div>
      </div>
    );
  }

  const allTrips = data.drivers.flatMap((driver) =>
    driver.trips.map((trip) => ({ ...trip, driver: driver.name }))
  );

  const filteredTrips =
    filterDriver === 'all' ? allTrips : allTrips.filter((t) => t.driver === filterDriver);

  return (
    <div className="min-h-screen bg-background md:pl-60 pt-14 md:pt-0">
      <Navigation currentPage="trips" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold text-foreground">Trips Management</h1>
          <Button onClick={() => setShowAddForm(!showAddForm)}>
            {showAddForm ? 'Cancel' : 'Add Trip'}
          </Button>
        </div>

        {showAddForm && (
          <div className="bg-card border border-border rounded-lg p-6 mb-8">
            <h3 className="text-lg font-semibold text-card-foreground mb-6">Add New Trip</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  Driver *
                </label>
                <select
                  value={newTrip.driverName}
                  onChange={(e) => setNewTrip({ ...newTrip, driverName: e.target.value })}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">Select a driver</option>
                  {data.drivers.map((d) => (
                    <option key={d.id} value={d.name}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  Trip Number *
                </label>
                <input
                  type="number"
                  value={newTrip.tripNumber || ''}
                  onChange={(e) =>
                    setNewTrip({ ...newTrip, tripNumber: parseInt(e.target.value) || 0 })
                  }
                  placeholder="Enter trip number"
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div className="flex items-end gap-2">
                <Button onClick={handleAddTrip} className="flex-1">
                  Add Trip
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowAddForm(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex justify-between items-center">
            <h2 className="text-xl font-bold text-card-foreground">All Trips ({filteredTrips.length})</h2>
            <select
              value={filterDriver}
              onChange={(e) => setFilterDriver(e.target.value)}
              className="px-3 py-2 border border-input rounded-md bg-background text-foreground text-sm"
            >
              <option value="all">All Drivers</option>
              {data.drivers.map((d) => (
                <option key={d.id} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold text-muted-foreground">Trip Number</th>
                  <th className="px-6 py-3 text-left font-semibold text-muted-foreground">Driver</th>
                  <th className="px-6 py-3 text-left font-semibold text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTrips.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-6 py-8 text-center text-muted-foreground">
                      No trips found
                    </td>
                  </tr>
                ) : (
                  filteredTrips.map((trip, idx) => (
                  <tr
                    key={`${trip.driver}-${trip.tripNumber}`}
                    className={idx % 2 === 0 ? 'bg-background' : 'bg-muted'}
                  >
                      <td className="px-6 py-4 font-medium text-card-foreground">
                        #{trip.tripNumber}
                      </td>
                      <td className="px-6 py-4 text-card-foreground">{trip.driver}</td>
                      <td className="px-6 py-4">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive border-destructive hover:bg-destructive/10"
                          onClick={() =>
                            handleDeleteTrip(trip.driver, trip.tripNumber)
                          }
                        >
                          Delete
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Trip Summary by Driver */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.drivers.map((driver) => (
            <div key={driver.id} className="bg-card border border-border rounded-lg p-4">
              <h3 className="font-semibold text-card-foreground mb-2">{driver.name}</h3>
              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Trips:</span>
                  <span className="font-medium">{driver.tripCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Trip IDs:</span>
                  <span className="font-medium text-xs">
                    {driver.trips.length === 0
                      ? 'None'
                      : driver.trips.map((t) => t.tripNumber).join(', ')}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
