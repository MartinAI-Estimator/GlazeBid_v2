import { useState, useEffect } from 'react';

/**
 * useMarkups Hook - For drawing the Orange/Green boxes
 * Manages markup state and synchronization with backend
 */
export const useMarkups = (sheetId) => {
  const [markups, setMarkups] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load existing markups for this sheet
  useEffect(() => {
    if (!sheetId) return;

    const loadMarkups = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/sheets/${sheetId}/markups`);
        if (response.ok) {
          const data = await response.json();
          setMarkups(data.markups || []);
        }
      } catch (error) {
        console.error('Error loading markups:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadMarkups();
  }, [sheetId]);

  // Add new markup
  const addMarkup = async (markupData) => {
    try {
      const response = await fetch(`/api/sheets/${sheetId}/markups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(markupData)
      });

      if (response.ok) {
        const newMarkup = await response.json();
        setMarkups(prev => [...prev, newMarkup]);
        return newMarkup;
      }
    } catch (error) {
      console.error('Error adding markup:', error);
    }
  };

  // Update existing markup
  const updateMarkup = async (markupId, updates) => {
    try {
      const response = await fetch(`/api/markups/${markupId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });

      if (response.ok) {
        const updated = await response.json();
        setMarkups(prev => 
          prev.map(m => m.id === markupId ? updated : m)
        );
        return updated;
      }
    } catch (error) {
      console.error('Error updating markup:', error);
    }
  };

  // Delete markup
  const deleteMarkup = async (markupId) => {
    try {
      const response = await fetch(`/api/markups/${markupId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setMarkups(prev => prev.filter(m => m.id !== markupId));
      }
    } catch (error) {
      console.error('Error deleting markup:', error);
    }
  };

  // Calculate measurements for a markup
  const calculateMeasurements = (markup) => {
    // TODO: Apply scale factor from sheet metadata
    const scaleFactor = 48; // Example: 1/4" = 1'0" means 48 pixels per foot
    
    const widthPx = Math.abs(markup.x2 - markup.x1);
    const heightPx = Math.abs(markup.y2 - markup.y1);
    
    const widthFt = widthPx / scaleFactor;
    const heightFt = heightPx / scaleFactor;
    
    return {
      width: widthFt.toFixed(2),
      height: heightFt.toFixed(2),
      area: (widthFt * heightFt).toFixed(2),
      perimeter: ((widthFt + heightFt) * 2).toFixed(2)
    };
  };

  // Get markups by type
  const getMarkupsByType = (type) => {
    return markups.filter(m => m.type === type);
  };

  // Calculate totals
  const getTotals = () => {
    const totals = {
      storefront: { count: 0, totalArea: 0 },
      curtainwall: { count: 0, totalArea: 0 }
    };

    markups.forEach(markup => {
      const measurements = calculateMeasurements(markup);
      const type = markup.type === 'storefront' ? 'storefront' : 'curtainwall';
      
      totals[type].count += 1;
      totals[type].totalArea += parseFloat(measurements.area);
    });

    return totals;
  };

  return {
    markups,
    isLoading,
    addMarkup,
    updateMarkup,
    deleteMarkup,
    calculateMeasurements,
    getMarkupsByType,
    getTotals
  };
};
