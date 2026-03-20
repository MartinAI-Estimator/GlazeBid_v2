import { useState } from 'react';

export const useHardwareCapture = (activeSheet) => {
    const [pendingHardwareSet, setPendingHardwareSet] = useState(null);
    const [isCapturing, setIsCapturing] = useState(false);

    const onCaptureHardware = async (geometry) => {
        setIsCapturing(true);
        
        try {
            // 1. Backend grabs the text inside these coordinates
            const response = await fetch('/parse-hardware-selection', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sheet_id: activeSheet,
                    coords: geometry
                })
            });
            
            if (!response.ok) {
                throw new Error('Failed to parse hardware selection');
            }
            
            const hardwareSet = await response.json();
            
            // 2. Open a modal with the organized data for user confirmation
            setPendingHardwareSet(hardwareSet);
        } catch (error) {
            console.error('Hardware capture error:', error);
        } finally {
            setIsCapturing(false);
        }
    };

    const confirmHardwareSet = async (confirmedSet) => {
        // Save the confirmed hardware set to project_brain.json
        await fetch('/save-hardware-set', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sheet_id: activeSheet,
                hardware_set: confirmedSet
            })
        });
        
        setPendingHardwareSet(null);
    };

    const cancelCapture = () => {
        setPendingHardwareSet(null);
    };

    return {
        pendingHardwareSet,
        isCapturing,
        onCaptureHardware,
        confirmHardwareSet,
        cancelCapture
    };
};
