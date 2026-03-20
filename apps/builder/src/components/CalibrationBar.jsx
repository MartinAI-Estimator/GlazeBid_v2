import React, { useState } from 'react';

const CalibrationBar = ({ normalizedDist, onSave }) => {
    const [realInches, setRealInches] = useState("");

    const handleConfirm = () => {
        // The Scale Factor = Real Inches / Normalized Distance
        const scaleFactor = parseFloat(realInches) / normalizedDist;
        onSave(scaleFactor);
    };

    return (
        <div style={{ position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)', 
                      backgroundColor: '#333', padding: '10px', borderRadius: '8px', zIndex: 2000 }}>
            <span style={{color: 'white', marginRight: '10px'}}>Enter Known Distance (Inches):</span>
            <input 
                type="number" 
                value={realInches} 
                onChange={(e) => setRealInches(e.target.value)}
                style={{ width: '80px', marginRight: '10px' }}
            />
            <button onClick={handleConfirm} style={{backgroundColor: '#4caf50', color: 'white'}}>Set Scale</button>
        </div>
    );
};

export default CalibrationBar;
