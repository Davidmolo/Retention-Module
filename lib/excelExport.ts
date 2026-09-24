import { GrossProfitData, Driver } from './excelParser';

export function generateExcelData(data: GrossProfitData): { [key: string]: any[] } {
  const sheets: { [key: string]: any[] } = {};

  // Summary Sheet
  sheets['Summary'] = [
    ['Gross Profit Summary'],
    ['Week 27, 2026'],
    [],
    ['Metric', 'Value'],
    ['Total Drivers', data.drivers.length],
    ['Total Mileage', data.totalMileage],
    ['Total Gross Income', data.totalGrossIncome],
    ['Total Expenses', data.totalExpenses],
    ['Total Net Profit', data.totalNetProfit],
  ];

  // Drivers Details Sheet
  sheets['Drivers'] = [
    ['Driver Name', 'Trips', 'Rate ($/mi)', 'Mileage', 'Gross Income', 'Driver Pay', 'Fuel', 'PREPASS', 'Monitoring Logs', 'R & M', 'Equipment Lease', 'Liability Insurance', 'Total Expenses', 'Net Profit'],
    ...data.drivers.map((driver) => [
      driver.name,
      driver.tripCount,
      driver.rate,
      driver.mileage,
      driver.totalGrossIncome,
      driver.driversPay,
      driver.fuel,
      driver.prepass,
      driver.monitoringLogs,
      driver.rm,
      driver.equipmentLease,
      driver.liabilityInsurance,
      driver.totalExpenses,
      driver.netProfit,
    ]),
  ];

  // Trips Sheet
  const allTrips = data.drivers.flatMap((driver) =>
    driver.trips.map((trip) => [driver.name, trip.tripNumber])
  );
  sheets['Trips'] = [
    ['Driver Name', 'Trip Number'],
    ...allTrips,
  ];

  return sheets;
}

export async function downloadExcel(data: GrossProfitData) {
  try {
    // Dynamically import xlsx to avoid issues in edge environments
    const xlsx = await import('xlsx');

    const sheetData = generateExcelData(data);
    const workbook = xlsx.utils.book_new();

    // Add each sheet to the workbook
    for (const [sheetName, sheetContent] of Object.entries(sheetData)) {
      const worksheet = xlsx.utils.aoa_to_sheet(sheetContent);
      xlsx.utils.book_append_sheet(workbook, worksheet, sheetName);
    }

    // Write the file
    xlsx.writeFile(workbook, 'Gross-Profit-Sheet-W27-2026.xlsx');
  } catch (error) {
    console.error('[v0] Error exporting Excel:', error);
    throw error;
  }
}
