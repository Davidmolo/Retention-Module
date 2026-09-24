import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, WidthType, BorderStyle, AlignmentType } from 'docx';
import fs from 'fs';

const border = { style: BorderStyle.SINGLE, size: 4, color: '999999' };
const borders = { top: border, bottom: border, left: border, right: border };
const shade = { type: 'clear', fill: 'F0F0F0' };

function cell(text, opts = {}) {
  const { bold, align, header, width = 1400 } = opts;
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    shading: header ? shade : undefined,
    children: [
      new Paragraph({
        alignment: align === 'right' ? AlignmentType.RIGHT : AlignmentType.LEFT,
        children: [
          new TextRun({
            text: String(text ?? ''),
            bold: !!bold || !!header,
            size: 18,
            font: 'Calibri',
          }),
        ],
      }),
    ],
  });
}

function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120 },
    ...opts,
    children: [
      new TextRun({ text, size: opts.size || 22, font: 'Calibri', bold: opts.bold }),
    ],
  });
}

function h(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({
    heading: level,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, font: 'Calibri' })],
  });
}

function row(vals, opts = {}) {
  return new TableRow({
    children: vals.map((v, i) =>
      cell(v, {
        header: opts.header,
        align: opts.rightCols?.includes(i) ? 'right' : 'left',
        width: opts.widths?.[i] || 1600,
      })
    ),
  });
}

const doc = new Document({
  sections: [
    {
      properties: {},
      children: [
        h('Week 34 Gross Profit Reconciliation Report'),
        p('Period: Tuesday 11 August 2026 – Monday 17 August 2026 (business week 34)', { size: 20 }),
        p('Prepared for: XXII Century / client review', { size: 20 }),
        p('Date: 14 September 2026', { size: 20 }),
        p('Subject: Comparison of client Gross Profit sheet vs system (OpenRoad-sourced) weekly report', { size: 20 }),

        h('1. Executive summary', HeadingLevel.HEADING_2),
        p('We compared every driver card on the client workbook sheet “W34 (2026)” against our live weekly Gross Profit calculation for the same Tuesday–Monday week.'),
        p('• 77 driver cards on the client sheet'),
        p('• 68 matched to drivers in our W34 active set'),
        p('• 63 of 68 (93%) match on mileage within ±1 mile'),
        p('• 48 of 68 (71%) match on total gross income within ±$1'),
        p('• 48 of 68 match on both miles and gross'),
        p('• 5 drivers have material mileage gaps'),
        p('• 20 drivers have gross gaps (often with miles already matching)'),
        p('• 9 sheet cards were not present in our W34 active report set'),
        p('Conclusion: This is not a random field-mapping error. Mileage alignment is strong. Remaining differences are concentrated in (1) split-haul / multi-driver revenue allocation, (2) a small set of drivers with different load coverage inside the week window, and (3) secondary expense lines (pay, fuel, PrePass).'),
        p('The previously disputed example — Abdullahi Daud, unit 245 — now matches the client sheet on both mileage and total gross.'),

        h('2. Scope and method', HeadingLevel.HEADING_2),
        p('Client source: workbook sheet W34 (2026) (77 GP cards).'),
        p('System source: live weekly summary from synced OpenRoad loads + driver_routes, assignments, compensations, fuel, Samsara MPG, and PrePass tolls.'),
        p('Week rule: Tuesday → Monday (W34 = 2026-08-11 → 2026-08-17).'),
        p('Match keys: truck unit where available, otherwise driver name.'),
        p('Tolerance: ±1.0 mile for mileage; ±$1.00 for gross income.'),

        h('3. Headline results', HeadingLevel.HEADING_2),
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [3600, 1600, 4160],
          rows: [
            row(['Metric', 'Count', 'Notes'], { header: true, widths: [3600, 1600, 4160] }),
            row(['Client cards', '77', 'Full W34 card grid'], { widths: [3600, 1600, 4160], rightCols: [1] }),
            row(['Matched to our roster / week set', '68', 'Unit or name match'], { widths: [3600, 1600, 4160], rightCols: [1] }),
            row(['Mileage match (±1 mi)', '63 / 68', '93% of matched drivers'], { widths: [3600, 1600, 4160], rightCols: [1] }),
            row(['Gross income match (±$1)', '48 / 68', '71% of matched drivers'], { widths: [3600, 1600, 4160], rightCols: [1] }),
            row(['Both miles and gross match', '48', ''], { widths: [3600, 1600, 4160], rightCols: [1] }),
            row(['Mileage mismatches', '5', 'See section 5'], { widths: [3600, 1600, 4160], rightCols: [1] }),
            row(['Gross mismatches', '20', 'See section 6'], { widths: [3600, 1600, 4160], rightCols: [1] }),
            row(['On client sheet only', '9', 'See section 7'], { widths: [3600, 1600, 4160], rightCols: [1] }),
          ],
        }),

        h('4. Proof case — Abdullahi Daud (unit 245)', HeadingLevel.HEADING_2),
        p('This driver was the primary example of a miles/gross gap earlier. After attributing solo loads by delivery week and multi-driver helper segments from OpenRoad driver_routes, the card matches the client sheet:'),
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [2200, 1800, 1800, 1600, 1960],
          rows: [
            row(['Field', 'Client sheet', 'Our system', 'Difference', 'Result'], {
              header: true,
              widths: [2200, 1800, 1800, 1600, 1960],
            }),
            row(['Mileage', '4,843.7', '4,843.65', '−0.05', 'MATCH'], {
              widths: [2200, 1800, 1800, 1600, 1960],
              rightCols: [1, 2, 3],
            }),
            row(['Total gross income', '$12,007.60', '$12,007.60', '$0.00', 'MATCH'], {
              widths: [2200, 1800, 1800, 1600, 1960],
              rightCols: [1, 2, 3],
            }),
            row(["Driver's pay", '$3,248.39', '$3,148.37', '−$100.02', 'Secondary'], {
              widths: [2200, 1800, 1800, 1600, 1960],
              rightCols: [1, 2, 3],
            }),
            row(['PrePass', '$83.64', '$66.74', '−$16.90', 'Secondary'], {
              widths: [2200, 1800, 1800, 1600, 1960],
              rightCols: [1, 2, 3],
            }),
          ],
        }),

        h('4.1 How Daud’s miles and gross are built', HeadingLevel.HEADING_3),
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [2200, 3960, 1600, 1600],
          rows: [
            row(['Component', 'Detail', 'Miles', 'Gross'], {
              header: true,
              widths: [2200, 3960, 1600, 1600],
            }),
            row(
              [
                'Solo loads (delivery in W34)',
                '2608-00313, 00406, 00502, 00536, 00531 — full load credit',
                '4,508.29',
                '$11,007.60',
              ],
              { widths: [2200, 3960, 1600, 1600], rightCols: [2, 3] }
            ),
            row(
              [
                'Helper route share',
                '2608-00582 (load 2229817): Daud ≠ final delivery driver; segment + $1,000; week by route date',
                '335.36',
                '$1,000.00',
              ],
              { widths: [2200, 3960, 1600, 1600], rightCols: [2, 3] }
            ),
            row(['Total', 'Solo + helper', '4,843.65', '$12,007.60'], {
              widths: [2200, 3960, 1600, 1600],
              rightCols: [2, 3],
            }),
            row(['Client sheet', 'W34 card for Daud / 245', '4,843.7', '$12,007.60'], {
              widths: [2200, 3960, 1600, 1600],
              rightCols: [2, 3],
            }),
          ],
        }),
        p('Helper segment from OpenRoad driver_routes: loaded 327.16 + empty 8.2; revenue share $1,000 (aligned with client payroll flat for that piece).'),

        h('5. Mileage mismatches (5 drivers)', HeadingLevel.HEADING_2),
        p('These are the only matched drivers outside ±1 mile:'),
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [1600, 800, 1100, 1100, 1100, 1200, 1200, 2260],
          rows: [
            row(
              ['Driver', 'Unit', 'Sheet mi', 'Ours mi', 'Δ mi', 'Sheet $', 'Ours $', 'Likely cause'],
              {
                header: true,
                widths: [1600, 800, 1100, 1100, 1100, 1200, 1200, 2260],
              }
            ),
            row(
              [
                'Travis Sadler',
                '688',
                '1,538.4',
                '426.6',
                '−1,111.8',
                '$4,323',
                '$1,300',
                'Fewer loads/routes in our W34 bucket',
              ],
              {
                widths: [1600, 800, 1100, 1100, 1100, 1200, 1200, 2260],
                rightCols: [1, 2, 3, 4, 5, 6],
              }
            ),
            row(
              [
                'Calvin Chambers',
                '256',
                '3,000.5',
                '1,915.08',
                '−1,085.4',
                '$8,200',
                '$4,400',
                '3 solo loads in API; sheet implies more',
              ],
              {
                widths: [1600, 800, 1100, 1100, 1100, 1200, 1200, 2260],
                rightCols: [1, 2, 3, 4, 5, 6],
              }
            ),
            row(
              [
                'Pablo Viera',
                '246',
                '2,205.9',
                '3,119.03',
                '+913.1',
                '$6,180',
                '$8,530',
                'Extra route/load credit in our week',
              ],
              {
                widths: [1600, 800, 1100, 1100, 1100, 1200, 1200, 2260],
                rightCols: [1, 2, 3, 4, 5, 6],
              }
            ),
            row(
              [
                'Rashard Morgan',
                '268',
                '2,930.7',
                '2,933.68',
                '+3.0',
                '$7,750',
                '$8,379',
                'Miles nearly OK; gross share differs',
              ],
              {
                widths: [1600, 800, 1100, 1100, 1100, 1200, 1200, 2260],
                rightCols: [1, 2, 3, 4, 5, 6],
              }
            ),
            row(
              [
                'Audrius Labaciauskas',
                '654',
                '2,674.7',
                '2,675.82',
                '+1.1',
                '$8,750',
                '$8,581',
                'Miles at edge; gross −$169',
              ],
              {
                widths: [1600, 800, 1100, 1100, 1100, 1200, 1200, 2260],
                rightCols: [1, 2, 3, 4, 5, 6],
              }
            ),
          ],
        }),

        h('6. Gross gaps when mileage already matches', HeadingLevel.HEADING_2),
        p('Most remaining differences are gross-only: miles agree within ±1, but total gross differs by roughly $40–$630. That pattern is characteristic of multi-driver revenue allocation (client payroll rounding / $100-style floors vs our proportional share), not wrong mile totals.'),
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [2400, 1000, 1200, 1600, 1600, 1560],
          rows: [
            row(['Driver', 'Unit', 'Δ miles', 'Sheet gross', 'Ours', 'Δ $'], {
              header: true,
              widths: [2400, 1000, 1200, 1600, 1600, 1560],
            }),
            ...[
              ['Jeffery Roberson', '281', '−0.01', '$10,229.30', '$10,859.21', '+$629.91'],
              ['Rakeem Norton', '254', '−0.05', '$8,000.00', '$8,514.00', '+$514.00'],
              ['Ronnie Sieg', '263*', '+0.03', '$7,370.00', '$7,849.00', '+$479.00'],
              ['Leonard Washington', '264', '−0.02', '$7,024.08', '$7,419.08', '+$395.00'],
              ['Robert Wagner', '212', '−0.01', '$9,772.70', '$10,158.70', '+$386.00'],
              ['Abraham Lanz', '215', '−0.09', '$6,495.00', '$6,795.00', '+$300.00'],
              ['Cheryl Day', '623', '−0.08', '$5,560.00', '$5,860.00', '+$300.00'],
              ['Lucian Cantus', '678', '−0.07', '$10,304.87', '$10,504.87', '+$200.00'],
              ['Raymond Malisa', '667', '+0.02', '$8,406.99', '$8,606.99', '+$200.00'],
              ['Rodney Coleman', '280', '−0.05', '$7,110.00', '$7,310.00', '+$200.00'],
            ].map((r) =>
              row(r, {
                widths: [2400, 1000, 1200, 1600, 1600, 1560],
                rightCols: [1, 2, 3, 4, 5],
              })
            ),
          ],
        }),
        p('*Sieg: sheet unit 263; our current assignment unit may differ (name match used).', { size: 18 }),

        h('7. On the client sheet but not in our W34 set (9)', HeadingLevel.HEADING_2),
        p('These cards appear on the client sheet but were not in our active W34 report population:'),
        new Table({
          width: { size: 4000, type: WidthType.DXA },
          columnWidths: [2800, 1200],
          rows: [
            row(['Sheet name', 'Unit'], { header: true, widths: [2800, 1200] }),
            ...[
              ['Liobikas', '250'],
              ['El-Haji', '265'],
              ['Simpson', '188'],
              ['Campbell', '182'],
              ['Walker', '199'],
              ['Dorisme', '690'],
              ['Biskis', '675'],
              ['Petrov', '694'],
              ['C. Smith', '692'],
            ].map((r) => row(r, { widths: [2800, 1200], rightCols: [1] })),
          ],
        }),

        h('8. Root causes', HeadingLevel.HEADING_2),
        p('1. Split-haul / helper attribution (resolved for Daud-style cases). Multi-driver loads are credited from OpenRoad driver_routes: solo = full load by delivery date; helper = route share by route date; owner on a multi-driver load = route share by delivery date.'),
        p('2. Revenue allocation on split loads. When miles match but gross differs by round amounts ($100 / $200 / $300 / ~$500–$630), client payroll and our proportional revenue share use different rounding rules.'),
        p('3. Week-boundary / load coverage (Sadler, Chambers, Viera). Large mile gaps mean the set of loads/routes inside Tue–Mon differs between systems.'),
        p('4. Secondary lines (pay, fuel, PrePass). Pay uses TMS compensation × loaded/empty split. Fuel uses (miles ÷ MPG) × PPG. PrePass uses tolls on assigned trucks. Client green inputs can differ.'),

        h('9. Bottom line for stakeholders', HeadingLevel.HEADING_2),
        p('For Week 34, mileage reconciles for 63 of 68 matched drivers (93%). The former flagship discrepancy (Daud / unit 245) now matches the client sheet on both miles and total gross.'),
        p('Remaining gaps are mostly explained by multi-driver revenue sharing rules and a small number of drivers with different load coverage — not by incorrect API field mapping for miles/revenue columns.'),
        p('Recommended next step (if closer payroll parity is required): align split-load revenue rounding with the client’s $100-floor / remainder rules, then re-check the 20 gross-only gaps and the 5 mileage outliers load-by-load.'),

        p('End of report — Week 34 2026 Gross Profit reconciliation', { size: 18 }),
      ],
    },
  ],
});

const out1 = 'docs/W34_Gross_Profit_Reconciliation_Report.docx';
const out2 = 'C:/Users/HP/Desktop/W34_Gross_Profit_Reconciliation_Report.docx';
const buf = await Packer.toBuffer(doc);
fs.writeFileSync(out1, buf);
fs.writeFileSync(out2, buf);
console.log('Wrote', out1, out2, buf.length);
