import React, { useMemo, useState } from 'react';
import useFrameBuilderStore from '../../store/useFrameBuilderStore';

const CutListOptimizer = () => {
  const { frames } = useFrameBuilderStore();
  const [stockLengthFt, setStockLengthFt] = useState(21);
  const [selectedPartNumber, setSelectedPartNumber] = useState('all');
  const [avgLbsPerFt, setAvgLbsPerFt] = useState(1.2);
  const [truckCapacityLbs, setTruckCapacityLbs] = useState(40000);

  const KERF_IN = 0.125;
  const colors = ['#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

  // Build piece list from all frames
  const piecesByPart = useMemo(() => {
    const map = {};
    frames.forEach(frame => {
      if (!frame.lastBOM || !frame.lastBOM.bomLines) return;
      frame.lastBOM.bomLines.forEach(line => {
        const { partNumber, description, cutLengthInches, piecesPerFrame, qty } = line;
        const piecesNeeded = (piecesPerFrame || 0) * (frame.quantity || 1);
        if (piecesNeeded <= 0) return;

        if (!map[partNumber]) {
          map[partNumber] = {
            partNumber,
            description,
            pieces: [],
          };
        }

        for (let i = 0; i < piecesNeeded; i++) {
          map[partNumber].pieces.push({
            partNumber,
            description,
            cutLengthInches,
          });
        }
      });
    });
    return map;
  }, [frames]);

  // First-Fit-Decreasing bin packing per part
  const packBars = (pieces, usableLengthIn) => {
    const bars = [];
    const sorted = [...pieces].sort((a, b) => b.cutLengthInches - a.cutLengthInches);

    for (const piece of sorted) {
      let placed = false;
      for (const bar of bars) {
        if (bar.remainingIn >= piece.cutLengthInches + KERF_IN) {
          bar.cuts.push(piece);
          bar.usedIn += piece.cutLengthInches + KERF_IN;
          bar.remainingIn -= piece.cutLengthInches + KERF_IN;
          placed = true;
          break;
        }
      }

      if (!placed) {
        bars.push({
          barIndex: bars.length + 1,
          cuts: [piece],
          usedIn: piece.cutLengthInches + KERF_IN,
          remainingIn: usableLengthIn - piece.cutLengthInches - KERF_IN,
        });
      }
    }

    return bars;
  };

  // Optimize all parts
  const optimized = useMemo(() => {
    const usableLengthIn = stockLengthFt * 12 - KERF_IN;
    const result = [];

    Object.values(piecesByPart).forEach(({ partNumber, description, pieces }) => {
      if (selectedPartNumber !== 'all' && partNumber !== selectedPartNumber) {
        return;
      }

      const bars = packBars(pieces, usableLengthIn);
      const totalPiecesLF = pieces.reduce((sum, p) => sum + p.cutLengthInches, 0) / 12;
      const naiveBars = Math.ceil(totalPiecesLF / stockLengthFt);
      const savedBars = Math.max(0, naiveBars - bars.length);
      const totalScrapIn = bars.reduce((sum, bar) => sum + bar.remainingIn, 0);
      const scrapPercent = (totalScrapIn / (bars.length * usableLengthIn)) * 100;

      result.push({
        partNumber,
        description,
        bars,
        totalBars: bars.length,
        naiveBars,
        savedBars,
        scrapPercent,
        totalPiecesLF,
      });
    });

    return result;
  }, [piecesByPart, stockLengthFt, selectedPartNumber]);

  // Weight and shipping calculations
  const weightStats = useMemo(() => {
    let totalAluminumLF = 0;
    let totalGlassSqFt = 0;

    frames.forEach(frame => {
      if (frame.lastBOM) {
        totalAluminumLF += (frame.lastBOM.totalAluminumLF || 0) * (frame.quantity || 1);
        if (frame.lastBOM.glassSchedule) {
          frame.lastBOM.glassSchedule.forEach(row => {
            totalGlassSqFt += (row.areaSqFt || 0) * (frame.quantity || 1);
          });
        }
      }
    });

    const aluminumWeightLbs = totalAluminumLF * avgLbsPerFt;
    const glassWeightLbs = totalGlassSqFt * 3.5;
    const totalWeightLbs = aluminumWeightLbs + glassWeightLbs;
    const trucksRequired = Math.ceil(totalWeightLbs / truckCapacityLbs);

    const needsLiftEquipment =
      frames.some(f => (f.heightInches || 0) > 240) ||
      totalWeightLbs > 15000;

    return {
      totalAluminumLF,
      totalGlassSqFt,
      aluminumWeightLbs,
      glassWeightLbs,
      totalWeightLbs,
      trucksRequired,
      needsLiftEquipment,
    };
  }, [frames, avgLbsPerFt, truckCapacityLbs]);

  // Export handlers
  const exportCSV = () => {
    const rows = [['PartNumber', 'BarIndex', 'Description', 'CutLengthInches']];
    optimized.forEach(({ partNumber, bars }) => {
      bars.forEach(bar => {
        bar.cuts.forEach(cut => {
          rows.push([
            partNumber,
            bar.barIndex,
            cut.description,
            cut.cutLengthInches.toFixed(3),
          ]);
        });
      });
    });
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cut-list.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportSawSheet = () => {
    let txt = `CUT LIST OPTIMIZER - SAW SCHEDULE\n`;
    txt += `Stock Length: ${stockLengthFt} ft\n`;
    txt += `Generated: ${new Date().toLocaleString()}\n`;
    txt += `\n${'='.repeat(80)}\n\n`;

    optimized.forEach(({ partNumber, description, bars, totalBars, naiveBars, savedBars, scrapPercent }) => {
      txt += `PART: ${partNumber} - ${description}\n`;
      txt += `Bars Needed: ${totalBars} (naive: ${naiveBars}, saved: ${savedBars})\n`;
      txt += `Scrap: ${scrapPercent.toFixed(1)}%\n\n`;

      bars.forEach(bar => {
        txt += `  Bar ${bar.barIndex}:\n`;
        let pos = 0;
        bar.cuts.forEach((cut, idx) => {
          txt += `    Cut ${idx + 1}: ${cut.cutLengthInches.toFixed(3)}" @ ${pos.toFixed(3)}"\n`;
          pos += cut.cutLengthInches + KERF_IN;
        });
        txt += `    Remaining: ${bar.remainingIn.toFixed(3)}"\n\n`;
      });

      txt += `${'-'.repeat(80)}\n\n`;
    });

    txt += `\nWEIGHT & SHIPPING\n`;
    txt += `Aluminum: ${weightStats.totalAluminumLF.toFixed(1)} LF × ${avgLbsPerFt} lbs/LF = ${weightStats.aluminumWeightLbs.toFixed(0)} lbs\n`;
    txt += `Glass: ${weightStats.totalGlassSqFt.toFixed(1)} sqft × 3.5 lbs/sqft = ${weightStats.glassWeightLbs.toFixed(0)} lbs\n`;
    txt += `Total: ${weightStats.totalWeightLbs.toFixed(0)} lbs\n`;
    txt += `Trucks Required: ${weightStats.trucksRequired}\n`;
    if (weightStats.needsLiftEquipment) {
      txt += `⚠️  LIFT EQUIPMENT REQUIRED\n`;
    }

    const blob = new Blob([txt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'saw-schedule.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Empty state
  if (frames.length === 0 || Object.keys(piecesByPart).length === 0) {
    return (
      <div className="bg-slate-950 rounded-lg p-6 border border-slate-700">
        <p className="text-slate-300">
          No BOM data yet — select a frame and set dimensions to generate a BOM first.
        </p>
      </div>
    );
  }

  const usableLengthIn = stockLengthFt * 12 - KERF_IN;
  const partNumbers = Object.keys(piecesByPart);

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="bg-slate-900 rounded-lg p-4 border border-slate-700 space-y-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex gap-2">
            <button
              onClick={() => setStockLengthFt(21)}
              className={`px-3 py-2 rounded font-medium transition ${
                stockLengthFt === 21
                  ? 'bg-cyan-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              21 ft
            </button>
            <button
              onClick={() => setStockLengthFt(24)}
              className={`px-3 py-2 rounded font-medium transition ${
                stockLengthFt === 24
                  ? 'bg-cyan-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              24 ft
            </button>
          </div>

          <select
            value={selectedPartNumber}
            onChange={e => setSelectedPartNumber(e.target.value)}
            className="px-3 py-2 rounded bg-slate-800 text-slate-100 border border-slate-600 text-sm"
          >
            <option value="all">All Parts</option>
            {partNumbers.map(pn => (
              <option key={pn} value={pn}>{pn}</option>
            ))}
          </select>

          <button
            onClick={exportCSV}
            className="px-3 py-2 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition"
          >
            Export CSV
          </button>
          <button
            onClick={exportSawSheet}
            className="px-3 py-2 rounded bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition"
          >
            Export Saw Sheet TXT
          </button>
        </div>
      </div>

      {/* Cut List Diagrams */}
      <div className="space-y-6">
        {optimized.map(part => (
          <CutListSection
            key={part.partNumber}
            part={part}
            usableLengthIn={usableLengthIn}
            colors={colors}
            stockLengthFt={stockLengthFt}
          />
        ))}
      </div>

      {/* Weight & Shipping */}
      <div className="bg-slate-900 rounded-lg p-6 border border-slate-700 space-y-6">
        <h3 className="text-lg font-semibold text-cyan-400">Weight & Shipping</h3>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Aluminum */}
          <div className="bg-slate-800 rounded p-4 border border-slate-700">
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">Aluminum</p>
            <p className="text-2xl font-bold text-slate-100 mb-2">
              {weightStats.aluminumWeightLbs.toFixed(0)} lbs
            </p>
            <p className="text-xs text-slate-500">
              {weightStats.totalAluminumLF.toFixed(1)} LF × {avgLbsPerFt} lbs/LF
            </p>
            <input
              type="number"
              step="0.1"
              value={avgLbsPerFt}
              onChange={e => setAvgLbsPerFt(parseFloat(e.target.value))}
              className="mt-2 w-full px-2 py-1 rounded bg-slate-700 text-slate-100 border border-slate-600 text-xs"
              placeholder="lbs/LF"
            />
          </div>

          {/* Glass */}
          <div className="bg-slate-800 rounded p-4 border border-slate-700">
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">Glass</p>
            <p className="text-2xl font-bold text-slate-100 mb-2">
              {weightStats.glassWeightLbs.toFixed(0)} lbs
            </p>
            <p className="text-xs text-slate-500">
              {weightStats.totalGlassSqFt.toFixed(1)} sqft × 3.5 lbs/sqft
            </p>
          </div>

          {/* Total Weight */}
          <div className="bg-slate-800 rounded p-4 border border-slate-700">
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">Total Weight</p>
            <p className="text-2xl font-bold text-slate-100 mb-2">
              {weightStats.totalWeightLbs.toFixed(0)} lbs
            </p>
            <p className="text-xs text-slate-500">
              {(weightStats.totalWeightLbs / 1000).toFixed(1)}K lbs
            </p>
          </div>

          {/* Trucks */}
          <div className="bg-slate-800 rounded p-4 border border-slate-700">
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">Trucks Required</p>
            <div className="flex items-baseline gap-2 mb-2">
              <p className="text-2xl font-bold text-slate-100">
                {weightStats.trucksRequired}
              </p>
              {weightStats.needsLiftEquipment && (
                <span className="px-2 py-1 rounded bg-orange-600 text-white text-xs font-medium">
                  ⚠️ Lift
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              @ {truckCapacityLbs.toLocaleString()} lbs/truck
            </p>
            <input
              type="number"
              step="1000"
              value={truckCapacityLbs}
              onChange={e => setTruckCapacityLbs(parseInt(e.target.value))}
              className="mt-2 w-full px-2 py-1 rounded bg-slate-700 text-slate-100 border border-slate-600 text-xs"
              placeholder="lbs/truck"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

// Cut List Section Component
const CutListSection = ({ part, usableLengthIn, colors, stockLengthFt }) => {
  const [expanded, setExpanded] = useState(true);
  const KERF_IN = 0.125;

  const scrapColor =
    part.scrapPercent < 8
      ? 'text-emerald-400'
      : part.scrapPercent < 10
        ? 'text-amber-400'
        : 'text-red-400';

  return (
    <div className="bg-slate-900 rounded-lg border border-slate-700 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-800 transition bg-slate-850"
      >
        <div className="text-left">
          <h4 className="text-sm font-bold text-cyan-400">{part.partNumber}</h4>
          <p className="text-xs text-slate-400">{part.description}</p>
        </div>
        <div className="flex items-center gap-6 text-right">
          <div>
            <p className="text-xs text-slate-400">BARS</p>
            <p className="text-lg font-bold text-slate-100">
              {part.totalBars}
              <span className="text-xs text-slate-500 ml-1">({part.naiveBars} naive)</span>
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400">SAVED</p>
            <p className="text-lg font-bold text-emerald-400">{part.savedBars}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">SCRAP</p>
            <p className={`text-lg font-bold ${scrapColor}`}>
              {part.scrapPercent.toFixed(1)}%
            </p>
          </div>
          <svg
            className={`w-4 h-4 transition ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </div>
      </button>

      {/* Bar Diagrams */}
      {expanded && (
        <div className="px-6 py-4 space-y-4 bg-slate-950">
          {part.bars.map((bar, barIdx) => (
            <BarDiagram
              key={barIdx}
              bar={bar}
              stockLengthFt={stockLengthFt}
              usableLengthIn={usableLengthIn}
              colors={colors}
              KERF_IN={KERF_IN}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// Bar Diagram Component
const BarDiagram = ({ bar, stockLengthFt, usableLengthIn, colors, KERF_IN }) => {
  const scale = 580 / usableLengthIn;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-400">Bar {bar.barIndex}</p>
        <p className="text-xs text-slate-500">
          Used: {bar.usedIn.toFixed(2)}" / {usableLengthIn.toFixed(2)}"
          {bar.remainingIn > 0 && ` (Scrap: ${bar.remainingIn.toFixed(2)}")`}
        </p>
      </div>

      <svg
        width="100%"
        height="26"
        viewBox="0 0 600 26"
        className="bg-slate-800 rounded border border-slate-700"
      >
        {/* Cut segments */}
        {bar.cuts.map((cut, idx) => {
          const xStart = bar.cuts
            .slice(0, idx)
            .reduce((sum, c) => sum + c.cutLengthInches + KERF_IN, 0) * scale;
          const width = cut.cutLengthInches * scale;
          const color = colors[idx % colors.length];

          return (
            <g key={`cut-${idx}`}>
              <rect
                x={xStart}
                y="2"
                width={width}
                height="22"
                fill={color}
                opacity="0.8"
                rx="2"
                title={`${cut.cutLengthInches.toFixed(3)}"`}
              />
              <text
                x={xStart + width / 2}
                y="15"
                textAnchor="middle"
                fontSize="10"
                fill="white"
                fontWeight="bold"
              >
                {cut.cutLengthInches.toFixed(1)}"
              </text>
            </g>
          );
        })}

        {/* Scrap section */}
        {bar.remainingIn > 0 && (
          <g>
            <rect
              x={bar.usedIn * scale}
              y="2"
              width={bar.remainingIn * scale}
              height="22"
              fill="#64748b"
              opacity="0.4"
              rx="2"
              pattern="crosshatch"
              title={`Scrap: ${bar.remainingIn.toFixed(3)}"`}
            />
            <text
              x={bar.usedIn * scale + (bar.remainingIn * scale) / 2}
              y="15"
              textAnchor="middle"
              fontSize="9"
              fill="#94a3b8"
              opacity="0.6"
            >
              Scrap
            </text>
          </g>
        )}

        {/* Border */}
        <rect
          x="0"
          y="2"
          width="580"
          height="22"
          fill="none"
          stroke="#475569"
          strokeWidth="1"
          rx="2"
        />
      </svg>
    </div>
  );
};

export default CutListOptimizer;
