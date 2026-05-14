import React, { useState } from 'react';
import useFrameBuilderStore from '../../store/useFrameBuilderStore';

const ADA_CHECKS = [
  {
    id: 'clear-width',
    label: 'Door Clear Width >= 32"',
    check: (bay, frame) => {
      const doorWidth = bay.widthOverride || (frame.widthInches / frame.bays);
      // Clear width = doorWidth - stile widths (assume 1.5" each side for framed)
      const clearWidth = doorWidth - 3.0;
      return {
        passes: clearWidth >= 32,
        actual: clearWidth.toFixed(1) + '"',
        required: '>= 32"',
      };
    },
  },
  {
    id: 'vision-panel',
    label: 'Vision Panel Bottom <= 43" AFF',
    check: (bay, frame) => {
      return {
        passes: null,
        actual: 'Review required',
        required: '<= 43" AFF',
      };
    },
  },
  {
    id: 'maneuvering-clearance',
    label: 'Maneuvering Clearance (60" x 60" min)',
    check: (bay, frame) => {
      return {
        passes: null,
        actual: 'Field verify',
        required: '60" x 60" min',
      };
    },
  },
  {
    id: 'hardware-height',
    label: 'Hardware Mounting Height 34"-48" AFF',
    check: (bay, frame) => {
      return {
        passes: null,
        actual: 'Per door schedule',
        required: '34"-48" AFF',
      };
    },
  },
];

const ADAComplianceChecker = () => {
  const { frames, groups } = useFrameBuilderStore();

  // Get all frames with door bays
  const framesWithDoors = frames.filter((f) => (f.bays || 0) > 0);

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>ADA Compliance Checks</h3>

      {framesWithDoors.length === 0 ? (
        <div style={styles.emptyState}>
          <p style={styles.emptyText}>No frames with door openings found.</p>
        </div>
      ) : (
        <div style={styles.tablesContainer}>
          {framesWithDoors.map((frame) => {
            const group = groups.find((g) => g.groupId === frame.groupId);

            return (
              <div key={frame.frameId} style={styles.frameSection}>
                <h4 style={styles.frameName}>
                  Frame {frame.mark} ({frame.bays} bay{frame.bays !== 1 ? 's' : ''})
                </h4>

                <table style={styles.table}>
                  <thead>
                    <tr style={styles.headerRow}>
                      <th style={styles.headerCell}>Check</th>
                      <th style={styles.headerCell}>Required</th>
                      <th style={styles.headerCell}>Actual</th>
                      <th style={styles.headerCell}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ADA_CHECKS.map((adaCheck, idx) => {
                      const result = adaCheck.check(
                        { widthOverride: null },
                        {
                          widthInches: frame.widthInches,
                          bays: frame.bays,
                          sillAFF: frame.sillAFF || 0,
                        }
                      );

                      let statusColor = '#52525b';
                      let statusText = 'Field Verify';

                      if (result.passes === true) {
                        statusColor = '#10b981';
                        statusText = 'PASS';
                      } else if (result.passes === false) {
                        statusColor = '#ef4444';
                        statusText = 'FAIL';
                      } else if (result.passes === null) {
                        statusColor = '#f59e0b';
                        statusText = 'Review';
                      }

                      return (
                        <tr key={adaCheck.id} style={styles.bodyRow}>
                          <td style={styles.cell}>{adaCheck.label}</td>
                          <td style={styles.cell}>{result.required}</td>
                          <td style={styles.cell}>{result.actual}</td>
                          <td style={{ ...styles.cell, color: statusColor, fontWeight: 600 }}>
                            {statusText}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}

      <div style={styles.referenceSection}>
        <p style={styles.referenceText}>
          Reference:{' '}
          <a
            href="https://www.access-board.gov/ada/"
            target="_blank"
            rel="noopener noreferrer"
            style={styles.referenceLink}
          >
            ADA Standards for Accessible Design, 2010 — Section 404
          </a>
        </p>
      </div>
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    padding: '16px',
    height: '100%',
    overflow: 'auto',
  },

  title: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#e4e4e7',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    margin: 0,
  },

  emptyState: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    padding: '40px 20px',
  },

  emptyText: {
    fontSize: '13px',
    color: '#52525b',
    textAlign: 'center',
  },

  tablesContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },

  frameSection: {
    borderRadius: '4px',
    overflow: 'hidden',
    border: '1px solid #27272a',
  },

  frameName: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#e4e4e7',
    backgroundColor: '#1a1a1f',
    padding: '10px 12px',
    margin: 0,
    borderBottom: '1px solid #27272a',
  },

  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '12px',
  },

  headerRow: {
    backgroundColor: '#1a1a1f',
    borderBottom: '1px solid #27272a',
  },

  headerCell: {
    padding: '8px 10px',
    textAlign: 'left',
    fontWeight: 600,
    color: '#a1a1aa',
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },

  bodyRow: {
    borderBottom: '1px solid #27272a',
    transition: 'background 0.15s',
  },

  cell: {
    padding: '8px 10px',
    color: '#e4e4e7',
    fontSize: '12px',
  },

  referenceSection: {
    paddingTop: '12px',
    borderTop: '1px solid #27272a',
  },

  referenceText: {
    fontSize: '11px',
    color: '#52525b',
    margin: 0,
  },

  referenceLink: {
    color: '#0ea5e9',
    textDecoration: 'none',
    fontWeight: 500,
  },
};

export default ADAComplianceChecker;
