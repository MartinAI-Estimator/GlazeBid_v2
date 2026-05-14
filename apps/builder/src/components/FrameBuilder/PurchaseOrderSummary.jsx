import React, { useState, useMemo } from 'react';
import useFrameBuilderStore from '../../store/useFrameBuilderStore';

const VENDOR_MAPPING = {
  'kawneer': 'Kawneer',
  'k-': 'Kawneer',
  'tubelite': 'Tubelite',
  'tl-': 'Tubelite',
  'ykk': 'YKK AP',
  'ykk-': 'YKK AP',
  'efco': 'EFCO',
  'ef-': 'EFCO',
  'oldcastle': 'Oldcastle FG',
  'oldcastle-': 'Oldcastle FG',
};

const extractVendor = (partNumber = '', vendorSystemId = '') => {
  const searchStr = `${partNumber}${vendorSystemId}`.toLowerCase();
  for (const [key, vendor] of Object.entries(VENDOR_MAPPING)) {
    if (searchStr.includes(key)) return vendor;
  }
  return 'Unknown Vendor';
};

const PurchaseOrderSummary = () => {
  const { frames } = useFrameBuilderStore();
  const [unitPrices, setUnitPrices] = useState(new Map());
  const [projectName, setProjectName] = useState('GlazeBid Project');
  const [activeVendorTab, setActiveVendorTab] = useState(null);

  // Aggregate all BOM lines across all frames
  const allLineItems = useMemo(() => {
    const lines = [];
    frames.forEach((frame) => {
      if (!frame.lastBOM?.bomLines) return;
      frame.lastBOM.bomLines.forEach((line) => {
        lines.push({
          ...line,
          frameMark: frame.mark,
          frameQuantity: frame.quantity || 1,
          vendor: extractVendor(line.partNumber, frame.vendorSystemId),
        });
      });
    });
    return lines;
  }, [frames]);

  // Group by vendor and part number (aggregate quantities)
  const vendorGroups = useMemo(() => {
    const groups = {};
    allLineItems.forEach((line) => {
      if (!groups[line.vendor]) groups[line.vendor] = {};
      const key = `${line.partNumber}|${line.description}|${line.role}`;
      if (!groups[line.vendor][key]) {
        groups[line.vendor][key] = {
          partNumber: line.partNumber,
          description: line.description,
          role: line.role,
          qty: 0,
          totalLF: 0,
          unit: line.totalLF ? 'LF' : 'EA',
        };
      }
      groups[line.vendor][key].qty += line.qty * line.frameQuantity;
      if (line.totalLF) {
        groups[line.vendor][key].totalLF += line.totalLF * line.frameQuantity;
      }
    });

    const formatted = {};
    Object.keys(groups).forEach((vendor) => {
      formatted[vendor] = Object.values(groups[vendor]);
    });
    return formatted;
  }, [allLineItems]);

  const vendors = Object.keys(vendorGroups).sort();
  const activeVendor = activeVendorTab || vendors[0];

  // Calculate totals
  const totalValue = useMemo(() => {
    let total = 0;
    vendors.forEach((vendor) => {
      vendorGroups[vendor].forEach((line) => {
        const price = unitPrices.get(`${vendor}|${line.partNumber}`) || 0;
        const extPrice = (line.qty * line.totalLF) * price;
        total += extPrice;
      });
    });
    return total;
  }, [unitPrices, vendors, vendorGroups]);

  const handlePriceChange = (vendor, partNumber, price) => {
    const key = `${vendor}|${partNumber}`;
    setUnitPrices((prev) => {
      const next = new Map(prev);
      next.set(key, parseFloat(price) || 0);
      return next;
    });
  };

  const exportCSV = () => {
    const rows = [
      ['Vendor', 'Part Number', 'Description', 'Role', 'Qty', 'Total LF', 'Unit Price', 'Ext. Price'],
    ];
    vendors.forEach((vendor) => {
      vendorGroups[vendor].forEach((line) => {
        const price = unitPrices.get(`${vendor}|${line.partNumber}`) || 0;
        const extPrice = (line.qty * line.totalLF) * price;
        rows.push([
          vendor,
          line.partNumber,
          line.description,
          line.role,
          line.qty,
          line.totalLF.toFixed(2),
          price.toFixed(2),
          extPrice.toFixed(2),
        ]);
      });
    });
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `purchase-order-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportVendorCSV = (vendor) => {
    const rows = [
      [`${vendor} Quote Request`, projectName],
      ['Part Number', 'Description', 'Role', 'Qty', 'Total LF', 'Unit Price', 'Ext. Price'],
    ];
    vendorGroups[vendor].forEach((line) => {
      const price = unitPrices.get(`${vendor}|${line.partNumber}`) || 0;
      const extPrice = (line.qty * line.totalLF) * price;
      rows.push([
        line.partNumber,
        line.description,
        line.role,
        line.qty,
        line.totalLF.toFixed(2),
        price.toFixed(2),
        extPrice.toFixed(2),
      ]);
    });
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `po-${vendor.toLowerCase().replace(/ /g, '-')}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyQuoteEmail = (vendor) => {
    const lines = vendorGroups[vendor]
      .map((l) => `${l.partNumber} — ${l.description} (${l.qty} EA)`)
      .join('\n');
    const email = `Subject: Material Quote Request — ${projectName} — ${vendor}\n\nPlease provide pricing for the following items:\n\n${lines}`;
    navigator.clipboard.writeText(email);
    alert('Email template copied to clipboard!');
  };

  const vendorSubtotal = (vendor) => {
    let total = 0;
    vendorGroups[vendor].forEach((line) => {
      const price = unitPrices.get(`${vendor}|${line.partNumber}`) || 0;
      total += (line.qty * line.totalLF) * price;
    });
    return total;
  };

  if (frames.length === 0 || vendors.length === 0) {
    return (
      <div style={{
        padding: '2rem',
        backgroundColor: '#09090b',
        borderRadius: '0.5rem',
        color: '#e4e4e7',
        textAlign: 'center',
      }}>
        <p>No frames or BOM data available. Add frames and resolve BOMs to generate purchase orders.</p>
      </div>
    );
  }

  return (
    <div style={{
      padding: '1.5rem',
      backgroundColor: '#09090b',
      borderRadius: '0.5rem',
      color: '#e4e4e7',
    }}>
      {/* Header Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '1rem',
        marginBottom: '2rem',
      }}>
        <div style={{
          padding: '1rem',
          backgroundColor: '#111113',
          borderRadius: '0.5rem',
          border: '1px solid #27272a',
        }}>
          <div style={{ fontSize: '0.75rem', color: '#a1a1a6', fontWeight: 600, marginBottom: '0.5rem' }}>
            Total PO Value
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#10b981' }}>
            ${totalValue.toFixed(2)}
          </div>
        </div>
        <div style={{
          padding: '1rem',
          backgroundColor: '#111113',
          borderRadius: '0.5rem',
          border: '1px solid #27272a',
        }}>
          <div style={{ fontSize: '0.75rem', color: '#a1a1a6', fontWeight: 600, marginBottom: '0.5rem' }}>
            Vendors
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0ea5e9' }}>
            {vendors.length}
          </div>
        </div>
        <div style={{
          padding: '1rem',
          backgroundColor: '#111113',
          borderRadius: '0.5rem',
          border: '1px solid #27272a',
        }}>
          <div style={{ fontSize: '0.75rem', color: '#a1a1a6', fontWeight: 600, marginBottom: '0.5rem' }}>
            Line Items
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0ea5e9' }}>
            {allLineItems.length}
          </div>
        </div>
        <div style={{
          padding: '1rem',
          backgroundColor: '#111113',
          borderRadius: '0.5rem',
          border: '1px solid #27272a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          cursor: 'pointer',
        }} onClick={exportCSV}>
          <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>📥 Export CSV</span>
        </div>
      </div>

      {/* Project Name */}
      <div style={{ marginBottom: '2rem' }}>
        <label style={{ fontSize: '0.85rem', color: '#a1a1a6', fontWeight: 600, marginRight: '0.5rem' }}>
          Project Name:
        </label>
        <input
          type="text"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          style={{
            padding: '0.5rem',
            backgroundColor: '#111113',
            border: '1px solid #27272a',
            borderRadius: '0.375rem',
            color: '#e4e4e7',
            fontSize: '0.9rem',
            width: '100%',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Vendor Tabs */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        marginBottom: '1.5rem',
        flexWrap: 'wrap',
      }}>
        {vendors.map((vendor) => (
          <button
            key={vendor}
            onClick={() => setActiveVendorTab(vendor)}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: activeVendor === vendor ? '#0ea5e9' : '#27272a',
              color: activeVendor === vendor ? '#09090b' : '#e4e4e7',
              border: 'none',
              borderRadius: '9999px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.85rem',
              transition: 'all 0.15s ease',
            }}
          >
            {vendor}
          </button>
        ))}
      </div>

      {/* Vendor Table */}
      {activeVendor && (
        <div style={{ marginBottom: '2rem' }}>
          <div style={{
            overflowX: 'auto',
            backgroundColor: '#111113',
            borderRadius: '0.5rem',
            border: '1px solid #27272a',
          }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.85rem',
            }}>
              <thead>
                <tr style={{ backgroundColor: '#1a1a1d' }}>
                  <th style={{
                    padding: '0.75rem',
                    textAlign: 'left',
                    fontWeight: 600,
                    color: '#0ea5e9',
                    borderBottom: '1px solid #27272a',
                  }}>Part Number</th>
                  <th style={{
                    padding: '0.75rem',
                    textAlign: 'left',
                    fontWeight: 600,
                    color: '#0ea5e9',
                    borderBottom: '1px solid #27272a',
                  }}>Description</th>
                  <th style={{
                    padding: '0.75rem',
                    textAlign: 'left',
                    fontWeight: 600,
                    color: '#0ea5e9',
                    borderBottom: '1px solid #27272a',
                  }}>Role</th>
                  <th style={{
                    padding: '0.75rem',
                    textAlign: 'right',
                    fontWeight: 600,
                    color: '#0ea5e9',
                    borderBottom: '1px solid #27272a',
                  }}>Qty</th>
                  <th style={{
                    padding: '0.75rem',
                    textAlign: 'right',
                    fontWeight: 600,
                    color: '#0ea5e9',
                    borderBottom: '1px solid #27272a',
                  }}>Total LF</th>
                  <th style={{
                    padding: '0.75rem',
                    textAlign: 'right',
                    fontWeight: 600,
                    color: '#0ea5e9',
                    borderBottom: '1px solid #27272a',
                  }}>Unit Price</th>
                  <th style={{
                    padding: '0.75rem',
                    textAlign: 'right',
                    fontWeight: 600,
                    color: '#0ea5e9',
                    borderBottom: '1px solid #27272a',
                  }}>Ext. Price</th>
                </tr>
              </thead>
              <tbody>
                {vendorGroups[activeVendor].map((line, idx) => {
                  const price = unitPrices.get(`${activeVendor}|${line.partNumber}`) || 0;
                  const extPrice = (line.qty * line.totalLF) * price;
                  return (
                    <tr key={idx} style={{
                      backgroundColor: idx % 2 === 0 ? '#111113' : '#0f0f12',
                      borderBottom: '1px solid #27272a',
                    }}>
                      <td style={{ padding: '0.75rem', fontFamily: 'monospace' }}>{line.partNumber}</td>
                      <td style={{ padding: '0.75rem' }}>{line.description}</td>
                      <td style={{ padding: '0.75rem', color: '#a1a1a6', fontSize: '0.8rem' }}>{line.role}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'right' }}>{line.qty}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                        {line.totalLF.toFixed(2)}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                        <input
                          type="number"
                          step="0.01"
                          value={price || ''}
                          onChange={(e) => handlePriceChange(activeVendor, line.partNumber, e.target.value)}
                          placeholder="Enter price"
                          style={{
                            width: '100px',
                            padding: '0.35rem',
                            backgroundColor: '#1a1a1d',
                            border: '1px solid #27272a',
                            borderRadius: '0.25rem',
                            color: '#e4e4e7',
                            textAlign: 'right',
                            fontSize: '0.85rem',
                          }}
                        />
                      </td>
                      <td style={{
                        padding: '0.75rem',
                        textAlign: 'right',
                        fontWeight: 600,
                        color: price > 0 ? '#10b981' : '#a1a1a6',
                      }}>
                        ${extPrice.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
                <tr style={{ backgroundColor: '#1a1a1d' }}>
                  <td colSpan="6" style={{
                    padding: '0.75rem',
                    textAlign: 'right',
                    fontWeight: 700,
                    color: '#0ea5e9',
                    borderTop: '2px solid #27272a',
                  }}>
                    {activeVendor} Subtotal:
                  </td>
                  <td style={{
                    padding: '0.75rem',
                    textAlign: 'right',
                    fontWeight: 700,
                    color: '#10b981',
                    borderTop: '2px solid #27272a',
                  }}>
                    ${vendorSubtotal(activeVendor).toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Export Vendor CSV */}
          <button
            onClick={() => exportVendorCSV(activeVendor)}
            style={{
              marginTop: '1rem',
              padding: '0.5rem 1rem',
              backgroundColor: '#0ea5e9',
              color: '#09090b',
              border: 'none',
              borderRadius: '0.375rem',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            📥 Export {activeVendor} PO
          </button>
        </div>
      )}

      {/* Quote Requests Section */}
      <div style={{
        marginTop: '2rem',
        paddingTop: '2rem',
        borderTop: '2px solid #27272a',
      }}>
        <h3 style={{
          fontSize: '1.1rem',
          fontWeight: 700,
          color: '#0ea5e9',
          marginBottom: '1rem',
        }}>
          📧 Quote Requests
        </h3>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '1rem',
        }}>
          {vendors.map((vendor) => (
            <div key={vendor} style={{
              padding: '1rem',
              backgroundColor: '#111113',
              borderRadius: '0.5rem',
              border: '1px solid #27272a',
            }}>
              <div style={{
                fontSize: '0.75rem',
                color: '#a1a1a6',
                fontWeight: 600,
                marginBottom: '0.75rem',
                textTransform: 'uppercase',
              }}>
                {vendor}
              </div>
              <div style={{
                padding: '0.75rem',
                backgroundColor: '#0f0f12',
                borderRadius: '0.375rem',
                fontSize: '0.8rem',
                color: '#a1a1a6',
                marginBottom: '0.75rem',
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap',
                maxHeight: '120px',
                overflowY: 'auto',
              }}>
                Subject: Material Quote Request — {projectName} — {vendor}
                {'\n'}
                {'\n'}
                Please provide pricing for:
                {'\n'}
                {vendorGroups[vendor].map((l) => `${l.partNumber} (${l.qty} EA)`).join('\n')}
              </div>
              <button
                onClick={() => copyQuoteEmail(vendor)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  backgroundColor: '#0ea5e9',
                  color: '#09090b',
                  border: 'none',
                  borderRadius: '0.375rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                }}
              >
                📋 Copy Email
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PurchaseOrderSummary;
