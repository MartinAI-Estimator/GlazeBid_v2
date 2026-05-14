import React, { useState } from 'react';
import useRevisionStore from '../../store/useRevisionStore';
import useFrameBuilderStore from '../../store/useFrameBuilderStore';
import { Menu, Trash2, Check, Copy } from 'lucide-react';

export default function RevisionTracker() {
  const {
    revisions,
    activeRevisionId,
    compareRevisionId,
    takeSnapshot,
    acceptRevision,
    updateRevisionNotes,
    deleteRevision,
    setActiveRevision,
    setCompareRevision,
    computeDiff,
  } = useRevisionStore();

  const [snapshotLabel, setSnapshotLabel] = useState('');
  const [showSnapshotInput, setShowSnapshotInput] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [menuOpen, setMenuOpen] = useState(null);

  const handleTakeSnapshot = () => {
    const finalLabel = snapshotLabel.trim() || undefined;
    takeSnapshot(finalLabel);
    setSnapshotLabel('');
    setShowSnapshotInput(false);
  };

  const handleRevisionClick = (revisionId) => {
    if (compareMode) {
      if (activeRevisionId === revisionId) {
        setActiveRevision(null);
      } else if (!activeRevisionId) {
        setActiveRevision(revisionId);
      } else if (!compareRevisionId || compareRevisionId === revisionId) {
        setCompareRevision(revisionId);
      } else {
        setActiveRevision(revisionId);
        setCompareRevision(null);
      }
    } else {
      setActiveRevision(revisionId);
      setCompareRevision(null);
    }
  };

  const formatTimestamp = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const handleMenuAction = (action, revisionId) => {
    if (action === 'delete') {
      deleteRevision(revisionId);
      setMenuOpen(null);
    } else if (action === 'compare') {
      setCompareMode(true);
      setCompareRevision(revisionId);
      setMenuOpen(null);
    } else if (action === 'accept') {
      acceptRevision(revisionId);
      setMenuOpen(null);
    }
  };

  const activeRevision = revisions.find(r => r.revisionId === activeRevisionId);
  const compareRevision = revisions.find(r => r.revisionId === compareRevisionId);

  const shouldShowDiff = compareMode && activeRevisionId && compareRevisionId;
  const diffs = shouldShowDiff ? computeDiff(activeRevisionId, compareRevisionId) : [];

  const addedCount = diffs.filter(d => d.changeType === 'added').length;
  const removedCount = diffs.filter(d => d.changeType === 'removed').length;
  const modifiedCount = diffs.filter(d => d.changeType === 'modified').length;

  return (
    <div className="flex h-full bg-[#09090b]">
      {/* Left Panel: Revision List */}
      <div className="w-[280px] bg-[#1a1a1f] border-r border-[#27272a] flex flex-col overflow-hidden">
        {/* Action Buttons */}
        <div className="p-4 border-b border-[#27272a] space-y-2">
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => setShowSnapshotInput(true)}
              className="flex-1 px-3 py-2 bg-[#1e3a5f] hover:bg-[#1e4a7f] text-[#e4e4e7] rounded text-sm font-medium transition"
            >
              📸 Snapshot Now
            </button>
            <button
              onClick={() => setCompareMode(!compareMode)}
              className={`flex-1 px-3 py-2 rounded text-sm font-medium transition ${
                compareMode
                  ? 'bg-[#1e2a1e] text-[#a6e3a1]'
                  : 'bg-[#1a1a1f] border border-[#27272a] text-[#e4e4e7] hover:bg-[#27272a]'
              }`}
            >
              Compare
            </button>
          </div>

          {/* Inline Snapshot Input */}
          {showSnapshotInput && (
            <div className="flex gap-2">
              <input
                autoFocus
                type="text"
                value={snapshotLabel}
                onChange={e => setSnapshotLabel(e.target.value)}
                onKeyPress={e => {
                  if (e.key === 'Enter') handleTakeSnapshot();
                }}
                placeholder="e.g. Bid Day, ASI-1"
                className="flex-1 px-2 py-1 bg-[#27272a] text-[#e4e4e7] border border-[#3f3f46] rounded text-sm"
              />
              <button
                onClick={handleTakeSnapshot}
                className="px-2 py-1 bg-green-900 hover:bg-green-800 text-green-100 rounded text-sm"
              >
                OK
              </button>
              <button
                onClick={() => {
                  setShowSnapshotInput(false);
                  setSnapshotLabel('');
                }}
                className="px-2 py-1 bg-[#27272a] hover:bg-[#3f3f46] text-[#e4e4e7] rounded text-sm"
              >
                X
              </button>
            </div>
          )}
        </div>

        {/* Revisions List */}
        <div className="flex-1 overflow-y-auto">
          {revisions.length === 0 ? (
            <div className="p-4">
              <p className="text-[#71717a] text-sm">No revisions yet.</p>
            </div>
          ) : (
            revisions.map(rev => (
              <div key={rev.revisionId} className="relative">
                <button
                  onClick={() => handleRevisionClick(rev.revisionId)}
                  className={`w-full px-4 py-3 border-b border-[#27272a] text-left hover:bg-[#27272a] transition ${
                    activeRevisionId === rev.revisionId
                      ? 'bg-[#1e3a5f] border-l-2 border-l-[#3b82f6]'
                      : compareRevisionId === rev.revisionId
                      ? 'bg-[#1e2a1e] border-l-2 border-l-[#22c55e]'
                      : ''
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-[#e4e4e7] font-medium text-sm truncate">
                        {rev.label}
                      </p>
                      <p className="text-[#71717a] text-xs mt-1">
                        {formatTimestamp(rev.timestamp)}
                      </p>
                      <p className="text-[#71717a] text-xs mt-1">
                        {rev.frameCount} frames
                      </p>
                    </div>
                    <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                      {rev.accepted && (
                        <Check size={14} className="text-green-500" />
                      )}
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          setMenuOpen(
                            menuOpen === rev.revisionId ? null : rev.revisionId
                          );
                        }}
                        className="p-1 hover:bg-[#3f3f46] rounded"
                      >
                        <Menu size={16} className="text-[#a1a1a6]" />
                      </button>
                    </div>
                  </div>
                </button>

                {/* Kebab Menu */}
                {menuOpen === rev.revisionId && (
                  <div className="absolute right-0 top-full mt-1 bg-[#27272a] border border-[#3f3f46] rounded shadow-lg z-10 min-w-[160px]">
                    <button
                      onClick={() => handleMenuAction('accept', rev.revisionId)}
                      className="w-full px-3 py-2 text-left text-[#e4e4e7] hover:bg-[#3f3f46] text-sm"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => handleMenuAction('compare', rev.revisionId)}
                      className="w-full px-3 py-2 text-left text-[#e4e4e7] hover:bg-[#3f3f46] text-sm"
                    >
                      Set as Compare
                    </button>
                    <hr className="border-[#3f3f46]" />
                    <button
                      onClick={() => handleMenuAction('delete', rev.revisionId)}
                      className="w-full px-3 py-2 text-left text-red-400 hover:bg-[#3f3f46] text-sm"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right Panel: Detail or Diff View */}
      <div className="flex-1 bg-[#09090b] border-l border-[#27272a] overflow-hidden flex flex-col">
        {revisions.length === 0 ? (
          // Empty State
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-[#71717a] mb-6">
                No revisions yet. Take a snapshot before making changes to
                capture the current state.
              </p>
              <button
                onClick={() => setShowSnapshotInput(true)}
                className="px-6 py-3 bg-[#1e3a5f] hover:bg-[#1e4a7f] text-[#e4e4e7] rounded font-medium transition"
              >
                Take First Snapshot
              </button>
            </div>
          </div>
        ) : !activeRevisionId ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-[#71717a]">Select a revision to view</p>
          </div>
        ) : shouldShowDiff ? (
          <DiffView
            revA={activeRevision}
            revB={compareRevision}
            diffs={diffs}
            addedCount={addedCount}
            removedCount={removedCount}
            modifiedCount={modifiedCount}
          />
        ) : (
          <DetailView
            revision={activeRevision}
            onUpdateNotes={updateRevisionNotes}
            onAccept={acceptRevision}
          />
        )}
      </div>
    </div>
  );
}

function DetailView({ revision, onUpdateNotes, onAccept }) {
  const [notes, setNotes] = useState(revision.notes || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveNotes = () => {
    setIsSaving(true);
    onUpdateNotes(revision.revisionId, notes);
    setTimeout(() => setIsSaving(false), 300);
  };

  const totalAluminum = revision.frameSnapshot.reduce(
    (sum, f) => sum + (f.totalAluminumLF || 0),
    0
  );
  const totalGlass = revision.frameSnapshot.reduce(
    (sum, f) => sum + (f.totalGlassSqFt || 0),
    0
  );
  const totalLabor = revision.frameSnapshot.reduce(
    (sum, f) => sum + (f.laborHours || 0),
    0
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-[#27272a] bg-[#1a1a1f]">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-[#e4e4e7] font-semibold text-lg">
              {revision.label}
            </h3>
            <p className="text-[#71717a] text-sm mt-1">
              {new Date(revision.timestamp).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
              })}
            </p>
            <span className="inline-block mt-2 px-2 py-1 bg-[#27272a] text-[#a1a1a6] text-xs rounded">
              {revision.source}
            </span>
          </div>
          <button
            onClick={() => onAccept(revision.revisionId)}
            className={`px-3 py-2 rounded text-sm font-medium transition ${
              revision.accepted
                ? 'bg-green-900 text-green-100'
                : 'bg-[#27272a] text-[#e4e4e7] hover:bg-[#3f3f46]'
            }`}
          >
            {revision.accepted ? '✓ Accepted' : 'Accept'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Notes */}
        <div>
          <label className="block text-[#e4e4e7] font-medium text-sm mb-2">
            Notes
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Add revision notes here..."
            className="w-full h-24 px-3 py-2 bg-[#1a1a1f] border border-[#27272a] text-[#e4e4e7] rounded text-sm placeholder-[#71717a] focus:outline-none focus:border-[#3b82f6]"
          />
          <button
            onClick={handleSaveNotes}
            disabled={notes === revision.notes}
            className="mt-2 px-3 py-1 bg-[#1e3a5f] hover:bg-[#1e4a7f] disabled:opacity-50 disabled:cursor-not-allowed text-[#e4e4e7] rounded text-sm transition"
          >
            {isSaving ? 'Saving...' : 'Save Notes'}
          </button>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-[#1a1a1f] border border-[#27272a] p-3 rounded">
            <p className="text-[#71717a] text-xs">Total Frames</p>
            <p className="text-[#e4e4e7] font-semibold text-lg">
              {revision.frameCount}
            </p>
          </div>
          <div className="bg-[#1a1a1f] border border-[#27272a] p-3 rounded">
            <p className="text-[#71717a] text-xs">Total Aluminum (LF)</p>
            <p className="text-[#e4e4e7] font-semibold text-lg">
              {totalAluminum.toFixed(0)}
            </p>
          </div>
          <div className="bg-[#1a1a1f] border border-[#27272a] p-3 rounded">
            <p className="text-[#71717a] text-xs">Total Glass (SF)</p>
            <p className="text-[#e4e4e7] font-semibold text-lg">
              {totalGlass.toFixed(0)}
            </p>
          </div>
        </div>

        {/* Frame Table */}
        <div>
          <h4 className="text-[#e4e4e7] font-medium text-sm mb-2">
            Frames in Revision
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-[#27272a]">
                  <th className="px-3 py-2 text-left text-[#a1a1a6]">Mark</th>
                  <th className="px-3 py-2 text-left text-[#a1a1a6]">
                    Size
                  </th>
                  <th className="px-3 py-2 text-center text-[#a1a1a6]">Qty</th>
                  <th className="px-3 py-2 text-right text-[#a1a1a6]">
                    Aluminum (LF)
                  </th>
                  <th className="px-3 py-2 text-right text-[#a1a1a6]">
                    Glass (SF)
                  </th>
                </tr>
              </thead>
              <tbody>
                {revision.frameSnapshot.map(frame => (
                  <tr key={frame.frameId} className="border-b border-[#27272a]">
                    <td className="px-3 py-2 text-[#e4e4e7]">{frame.mark}</td>
                    <td className="px-3 py-2 text-[#e4e4e7]">
                      {frame.widthInches.toFixed(1)}" x{' '}
                      {frame.heightInches.toFixed(1)}"
                    </td>
                    <td className="px-3 py-2 text-center text-[#e4e4e7]">
                      {frame.quantity}
                    </td>
                    <td className="px-3 py-2 text-right text-[#e4e4e7]">
                      {frame.totalAluminumLF.toFixed(1)}
                    </td>
                    <td className="px-3 py-2 text-right text-[#e4e4e7]">
                      {frame.totalGlassSqFt.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function DiffView({
  revA,
  revB,
  diffs,
  addedCount,
  removedCount,
  modifiedCount,
}) {
  const handleExportCsv = () => {
    const rows = [['Mark', 'Change Type', 'Width Delta', 'Height Delta', 'Qty Delta']];

    diffs.forEach(d => {
      if (d.changeType === 'added') {
        rows.push([d.frameB.mark, 'Added', '—', '—', '—']);
      } else if (d.changeType === 'removed') {
        rows.push([d.frameA.mark, 'Removed', '—', '—', '—']);
      } else if (d.changeType === 'modified') {
        rows.push([
          d.mark,
          'Modified',
          `${d.widthDelta > 0 ? '+' : ''}${d.widthDelta.toFixed(2)}"`,
          `${d.heightDelta > 0 ? '+' : ''}${d.heightDelta.toFixed(2)}"`,
          `${d.qtyDelta > 0 ? '+' : ''}${d.qtyDelta}`,
        ]);
      }
    });

    const csv = rows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diff-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-[#27272a] bg-[#1a1a1f]">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[#e4e4e7] font-semibold text-lg">
            {revA.label} → {revB.label}
          </h3>
          <button
            onClick={handleExportCsv}
            className="px-3 py-2 bg-[#1e3a5f] hover:bg-[#1e4a7f] text-[#e4e4e7] rounded text-sm font-medium transition flex items-center gap-2"
          >
            <Copy size={14} />
            Export CSV
          </button>
        </div>
        <div className="flex gap-4 text-sm">
          <span className="text-green-400">
            +{addedCount} added
          </span>
          <span className="text-red-400">
            -{removedCount} removed
          </span>
          <span className="text-yellow-400">
            {modifiedCount} modified
          </span>
        </div>
      </div>

      {/* Diff Table */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[#27272a]">
                <th className="px-3 py-2 text-left text-[#a1a1a6]">Mark</th>
                <th className="px-3 py-2 text-left text-[#a1a1a6]">Change</th>
                <th className="px-3 py-2 text-left text-[#a1a1a6]">
                  Width
                </th>
                <th className="px-3 py-2 text-left text-[#a1a1a6]">
                  Height
                </th>
                <th className="px-3 py-2 text-center text-[#a1a1a6]">Qty</th>
              </tr>
            </thead>
            <tbody>
              {diffs.map((d, idx) => {
                let bgClass = '';
                if (d.changeType === 'added') bgClass = 'bg-[#052e16]';
                else if (d.changeType === 'removed') bgClass = 'bg-[#3b0a0a]';
                else if (d.changeType === 'modified') bgClass = 'bg-[#3b2a00]';

                return (
                  <tr key={idx} className={`border-b border-[#27272a] ${bgClass}`}>
                    <td className="px-3 py-2 text-[#e4e4e7]">
                      {d.changeType === 'added'
                        ? d.frameB.mark
                        : d.frameA.mark}
                    </td>
                    <td className="px-3 py-2 text-[#e4e4e7]">
                      {d.changeType === 'added' && (
                        <span className="px-2 py-1 bg-green-900 text-green-100 rounded text-xs">
                          Added
                        </span>
                      )}
                      {d.changeType === 'removed' && (
                        <span className="px-2 py-1 bg-red-900 text-red-100 rounded text-xs">
                          Removed
                        </span>
                      )}
                      {d.changeType === 'modified' && (
                        <span className="px-2 py-1 bg-yellow-900 text-yellow-100 rounded text-xs">
                          Modified
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[#e4e4e7]">
                      {d.changeType === 'modified' && (
                        <>
                          <span className="text-red-400">
                            {d.frameA.widthInches.toFixed(1)}"
                          </span>
                          {' → '}
                          <span className="text-green-400">
                            {d.frameB.widthInches.toFixed(1)}"
                          </span>
                          {' '}
                          <span className={d.widthDelta > 0 ? 'text-green-400' : 'text-red-400'}>
                            ({d.widthDelta > 0 ? '+' : ''}{d.widthDelta.toFixed(2)}")
                          </span>
                        </>
                      )}
                      {d.changeType === 'added' && '—'}
                      {d.changeType === 'removed' && '—'}
                    </td>
                    <td className="px-3 py-2 text-[#e4e4e7]">
                      {d.changeType === 'modified' && (
                        <>
                          <span className="text-red-400">
                            {d.frameA.heightInches.toFixed(1)}"
                          </span>
                          {' → '}
                          <span className="text-green-400">
                            {d.frameB.heightInches.toFixed(1)}"
                          </span>
                          {' '}
                          <span className={d.heightDelta > 0 ? 'text-green-400' : 'text-red-400'}>
                            ({d.heightDelta > 0 ? '+' : ''}{d.heightDelta.toFixed(2)}")
                          </span>
                        </>
                      )}
                      {d.changeType === 'added' && '—'}
                      {d.changeType === 'removed' && '—'}
                    </td>
                    <td className="px-3 py-2 text-center text-[#e4e4e7]">
                      {d.changeType === 'modified' && (
                        <>
                          <span className="text-red-400">
                            {d.frameA.quantity}
                          </span>
                          {' → '}
                          <span className="text-green-400">
                            {d.frameB.quantity}
                          </span>
                          {' '}
                          <span className={d.qtyDelta > 0 ? 'text-green-400' : 'text-red-400'}>
                            ({d.qtyDelta > 0 ? '+' : ''}{d.qtyDelta})
                          </span>
                        </>
                      )}
                      {d.changeType === 'added' && '—'}
                      {d.changeType === 'removed' && '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
