import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Download } from 'lucide-react';
import useFrameBuilderStore from '../../store/useFrameBuilderStore';
import { ARCHETYPE_CATALOG, VENDOR_CATALOG } from '@glazebid/frame-engine';

const FINISH_OPTIONS = [
  { id: 'clear-anod', label: 'Clear Anod' },
  { id: 'dark-bronze', label: 'Dark Bronze' },
  { id: 'black-anod', label: 'Black Anod' },
  { id: '2-coat-paint', label: '2-Coat Paint' },
  { id: '3-coat-kynar', label: '3-Coat Kynar' },
];

const MANUFACTURER_OPTIONS = [
  'Kawneer',
  'Tubelite',
  'Oldcastle',
  'YKK AP',
  'EFCO',
];

const CONNECTION_TYPES = [
  { id: '', label: 'Any' },
  { id: 'screw-spline', label: 'Screw Spline' },
  { id: 'shear-block', label: 'Shear Block' },
];

const ScopeComplianceChecker = () => {
  const { groups, frames } = useFrameBuilderStore();

  const [specReqs, setSpecReqs] = useState({
    specSection: '',
    requiredArchetypeId: '',
    requiredProfileDepthMin: 0,
    requiredThermalBreak: false,
    requiredFinishes: [],
    requiredGlassSpecIds: [],
    requiredConnectionType: '',
    requiredManufacturers: [],
    minSpanMullionIn: 0,
    notes: '',
  });

  const [complianceResults, setComplianceResults] = useState(null);
  const [expandedFrameId, setExpandedFrameId] = useState(null);

  // Check a single frame against spec requirements
  function checkFrameCompliance(frame, group) {
    const results = [];

    // Resolve effective values
    const vendorSystemId = frame.vendorSystemId || group?.vendorSystemId || '';
    const vendor = VENDOR_CATALOG[vendorSystemId];
    const vendorSystem = vendor ? VENDOR_CATALOG[vendorSystemId] : null;
    const archetype = vendorSystem ? ARCHETYPE_CATALOG[vendorSystem.archetypeId] : null;
    const finishType = frame.finishType || group?.finishType || 'clear-anod';

    // Check 1: Profile depth
    if (specReqs.requiredProfileDepthMin > 0 && archetype) {
      const passes = archetype.profileDepth >= specReqs.requiredProfileDepthMin;
      results.push({
        check: 'Profile Depth',
        required: `≥ ${specReqs.requiredProfileDepthMin}"`,
        actual: archetype ? `${archetype.profileDepth}"` : 'Unknown',
        passes,
      });
    }

    // Check 2: Thermal break
    if (specReqs.requiredThermalBreak) {
      const passes = archetype?.thermalBreak === true;
      results.push({
        check: 'Thermal Break',
        required: 'Required',
        actual: archetype?.thermalBreak ? 'Yes' : 'No',
        passes,
      });
    }

    // Check 3: Finish
    if (specReqs.requiredFinishes.length > 0) {
      const passes = specReqs.requiredFinishes.includes(finishType);
      results.push({
        check: 'Finish',
        required: specReqs.requiredFinishes.join(' or '),
        actual: finishType,
        passes,
      });
    }

    // Check 4: Manufacturer
    if (specReqs.requiredManufacturers.length > 0 && vendorSystem) {
      const passes = specReqs.requiredManufacturers.includes(vendorSystem.manufacturer);
      results.push({
        check: 'Manufacturer',
        required: specReqs.requiredManufacturers.join(' or '),
        actual: vendorSystem?.manufacturer || 'Unknown',
        passes,
      });
    }

    // Check 5: Connection type
    if (specReqs.requiredConnectionType) {
      const frameConn = frame.connectionType || group?.connectionType || 'screw-spline';
      const passes = frameConn === specReqs.requiredConnectionType;
      results.push({
        check: 'Connection Type',
        required: specReqs.requiredConnectionType,
        actual: frameConn,
        passes,
      });
    }

    return results;
  }

  // Run compliance check on all frames
  function runComplianceCheck() {
    const results = [];

    frames.forEach((frame) => {
      const group = groups.find((g) => g.groupId === frame.groupId);
      const frameChecks = checkFrameCompliance(frame, group);

      const allPass = frameChecks.length === 0 || frameChecks.every((c) => c.passes !== false);

      results.push({
        frameId: frame.frameId,
        mark: frame.mark,
        allPass,
        checks: frameChecks,
      });
    });

    setComplianceResults(results);
  }

  // Export mismatch report as CSV
  function exportReport() {
    if (!complianceResults) return;

    const rows = [['Frame', 'Check', 'Required', 'Actual', 'Pass/Fail']];

    complianceResults.forEach((result) => {
      if (!result.allPass) {
        result.checks.forEach((check) => {
          rows.push([
            result.mark,
            check.check,
            check.required,
            check.actual,
            check.passes ? 'PASS' : 'FAIL',
          ]);
        });
      }
    });

    const csv = rows.map((r) => r.map((cell) => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compliance-mismatch-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  const passCount = complianceResults?.filter((r) => r.allPass).length || 0;
  const failCount = (complianceResults?.length || 0) - passCount;

  return (
    <div style={styles.container}>
      {/* Input Panel */}
      <div style={styles.inputPanel}>
        <h3 style={styles.sectionTitle}>Spec Requirements</h3>

        <div style={styles.formGroup}>
          <label style={styles.label}>Spec Section</label>
          <input
            type="text"
            placeholder="e.g., 08 41 13"
            value={specReqs.specSection}
            onChange={(e) => setSpecReqs({ ...specReqs, specSection: e.target.value })}
            style={styles.input}
          />
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>Min Profile Depth (inches)</label>
          <input
            type="number"
            min="0"
            step="0.1"
            value={specReqs.requiredProfileDepthMin}
            onChange={(e) =>
              setSpecReqs({ ...specReqs, requiredProfileDepthMin: parseFloat(e.target.value) || 0 })
            }
            style={styles.input}
          />
        </div>

        <div style={styles.formGroup}>
          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={specReqs.requiredThermalBreak}
              onChange={(e) =>
                setSpecReqs({ ...specReqs, requiredThermalBreak: e.target.checked })
              }
              style={styles.checkbox}
            />
            Thermal Break Required
          </label>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>Allowed Finishes</label>
          <div style={styles.checkboxGroup}>
            {FINISH_OPTIONS.map((finish) => (
              <label key={finish.id} style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={specReqs.requiredFinishes.includes(finish.id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSpecReqs({
                        ...specReqs,
                        requiredFinishes: [...specReqs.requiredFinishes, finish.id],
                      });
                    } else {
                      setSpecReqs({
                        ...specReqs,
                        requiredFinishes: specReqs.requiredFinishes.filter((f) => f !== finish.id),
                      });
                    }
                  }}
                  style={styles.checkbox}
                />
                {finish.label}
              </label>
            ))}
          </div>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>Required Connection Type</label>
          <select
            value={specReqs.requiredConnectionType}
            onChange={(e) => setSpecReqs({ ...specReqs, requiredConnectionType: e.target.value })}
            style={styles.select}
          >
            {CONNECTION_TYPES.map((ct) => (
              <option key={ct.id} value={ct.id}>
                {ct.label}
              </option>
            ))}
          </select>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>Allowed Manufacturers</label>
          <div style={styles.checkboxGroup}>
            {MANUFACTURER_OPTIONS.map((mfr) => (
              <label key={mfr} style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={specReqs.requiredManufacturers.includes(mfr)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSpecReqs({
                        ...specReqs,
                        requiredManufacturers: [...specReqs.requiredManufacturers, mfr],
                      });
                    } else {
                      setSpecReqs({
                        ...specReqs,
                        requiredManufacturers: specReqs.requiredManufacturers.filter(
                          (m) => m !== mfr
                        ),
                      });
                    }
                  }}
                  style={styles.checkbox}
                />
                {mfr}
              </label>
            ))}
          </div>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>Special Requirements Notes</label>
          <textarea
            value={specReqs.notes}
            onChange={(e) => setSpecReqs({ ...specReqs, notes: e.target.value })}
            style={styles.textarea}
            placeholder="Any additional spec requirements..."
          />
        </div>

        <button onClick={runComplianceCheck} style={styles.runButton}>
          Run Compliance Check
        </button>
      </div>

      {/* Results Panel */}
      {complianceResults && (
        <div style={styles.resultsPanel}>
          <div style={styles.resultsHeader}>
            <h3 style={styles.resultsTitle}>Compliance Check Results</h3>
            <div style={styles.resultsSummary}>
              <span style={styles.passCount}>✓ {passCount} Pass</span>
              <span style={styles.failCount}>✗ {failCount} Fail</span>
            </div>
          </div>

          <div style={styles.resultsList}>
            {complianceResults.map((result) => (
              <div key={result.frameId} style={styles.resultItem}>
                <div
                  style={{
                    ...styles.resultHeader,
                    backgroundColor: result.allPass ? '#10b981' : '#ef4444',
                    cursor: 'pointer',
                  }}
                  onClick={() =>
                    setExpandedFrameId(expandedFrameId === result.frameId ? null : result.frameId)
                  }
                >
                  {expandedFrameId === result.frameId ? (
                    <ChevronDown size={14} />
                  ) : (
                    <ChevronRight size={14} />
                  )}
                  <span style={styles.resultFrameMark}>{result.mark}</span>
                  <span style={styles.resultStatus}>
                    {result.allPass ? '[PASS ✓]' : '[FAIL ✗]'}
                  </span>
                </div>

                {expandedFrameId === result.frameId && result.checks.length > 0 && (
                  <div style={styles.checksList}>
                    {result.checks.map((check, idx) => (
                      <div key={idx} style={styles.checkItem}>
                        <span
                          style={{
                            ...styles.checkIcon,
                            color: check.passes ? '#10b981' : '#ef4444',
                          }}
                        >
                          {check.passes ? '✓' : '✗'}
                        </span>
                        <div style={styles.checkDetails}>
                          <div style={styles.checkName}>{check.check}</div>
                          <div style={styles.checkValues}>
                            {check.required} → {check.actual}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {failCount > 0 && (
            <button onClick={exportReport} style={styles.exportButton}>
              <Download size={14} />
              Export Mismatch Report
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    height: '100%',
    gap: '16px',
    padding: '16px',
    overflow: 'hidden',
  },

  inputPanel: {
    width: '280px',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    borderRight: '1px solid #27272a',
    paddingRight: '16px',
  },

  sectionTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#e4e4e7',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    margin: '0 0 8px 0',
  },

  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },

  label: {
    fontSize: '12px',
    fontWeight: 500,
    color: '#a1a1aa',
  },

  input: {
    padding: '6px 8px',
    fontSize: '12px',
    border: '1px solid #27272a',
    borderRadius: '4px',
    backgroundColor: '#18181b',
    color: '#e4e4e7',
    fontFamily: 'inherit',
  },

  select: {
    padding: '6px 8px',
    fontSize: '12px',
    border: '1px solid #27272a',
    borderRadius: '4px',
    backgroundColor: '#18181b',
    color: '#e4e4e7',
    fontFamily: 'inherit',
  },

  textarea: {
    padding: '6px 8px',
    fontSize: '12px',
    border: '1px solid #27272a',
    borderRadius: '4px',
    backgroundColor: '#18181b',
    color: '#e4e4e7',
    fontFamily: 'inherit',
    minHeight: '60px',
    resize: 'vertical',
  },

  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    color: '#a1a1aa',
    cursor: 'pointer',
  },

  checkbox: {
    width: '14px',
    height: '14px',
    cursor: 'pointer',
  },

  checkboxGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    paddingLeft: '4px',
  },

  runButton: {
    padding: '8px 12px',
    marginTop: '8px',
    fontSize: '12px',
    fontWeight: 600,
    border: 'none',
    borderRadius: '4px',
    backgroundColor: '#0ea5e9',
    color: '#ffffff',
    cursor: 'pointer',
    transition: 'opacity 0.15s',
  },

  resultsPanel: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },

  resultsHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: '1px solid #27272a',
    paddingBottom: '12px',
  },

  resultsTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#e4e4e7',
    margin: 0,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },

  resultsSummary: {
    display: 'flex',
    gap: '12px',
    fontSize: '12px',
    fontWeight: 600,
  },

  passCount: {
    color: '#10b981',
  },

  failCount: {
    color: '#ef4444',
  },

  resultsList: {
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },

  resultItem: {
    borderRadius: '4px',
    overflow: 'hidden',
    border: '1px solid #27272a',
  },

  resultHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 12px',
    cursor: 'pointer',
    transition: 'opacity 0.15s',
  },

  resultFrameMark: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#ffffff',
    minWidth: '40px',
  },

  resultStatus: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#ffffff',
    marginLeft: '8px',
  },

  checksList: {
    backgroundColor: '#1a1a1f',
    padding: '8px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    borderTop: '1px solid #27272a',
  },

  checkItem: {
    display: 'flex',
    gap: '8px',
    fontSize: '11px',
    alignItems: 'flex-start',
  },

  checkIcon: {
    fontWeight: 600,
    minWidth: '12px',
  },

  checkDetails: {
    flex: 1,
  },

  checkName: {
    color: '#e4e4e7',
    fontWeight: 500,
    marginBottom: '2px',
  },

  checkValues: {
    color: '#52525b',
    fontSize: '10px',
  },

  exportButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '8px 12px',
    fontSize: '12px',
    fontWeight: 600,
    border: 'none',
    borderRadius: '4px',
    backgroundColor: '#fb923c',
    color: '#ffffff',
    cursor: 'pointer',
    transition: 'opacity 0.15s',
  },
};

export default ScopeComplianceChecker;
