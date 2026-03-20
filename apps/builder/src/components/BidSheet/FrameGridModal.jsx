/**
 * Frame Grid Modal Component
 * Collapsible panel that expands into full-screen modal for data input
 * Matches Labor Summary and Hr Function Rates styling when collapsed
 */
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Minus } from 'lucide-react';
import FrameGrid from './FrameGrid';
import './FrameGridModal.css';

export default function FrameGridModal({ systemId, systemConfig, frames, loading }) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const handleExpand = () => {
    setIsExpanded(true);
  };
  
  const handleCollapse = () => {
    setIsExpanded(false);
  };
  
  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isExpanded) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = 'auto';
      };
    }
  }, [isExpanded]);
  
  return (
    <>
      {/* Collapsed Panel Header */}
      {!isExpanded && (
        <div className="frame-grid-collapsed-panel">
          <div className="frame-grid-collapsed-header">
            <h3 className="panel-title">Frame Data Grid</h3>
            <button
              className="expand-toggle"
              onClick={handleExpand}
              title="Expand to full screen"
            >
              <Plus size={20} />
            </button>
          </div>
        </div>
      )}
      
      {/* Full Screen Modal - Rendered at body level via Portal */}
      {isExpanded && createPortal(
        <div className="frame-grid-modal-overlay" onClick={handleCollapse}>
          <div className="frame-grid-modal" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="frame-grid-modal-header">
              <h2 className="modal-title">Frame Data Grid - Input Mode</h2>
              <button
                className="collapse-toggle"
                onClick={handleCollapse}
                title="Close full screen"
              >
                <Minus size={24} />
              </button>
            </div>
            
            {/* Modal Content */}
            <div className="frame-grid-modal-content">
              <FrameGrid 
                systemId={systemId}
                systemConfig={systemConfig}
                frames={frames}
                loading={loading}
              />
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
