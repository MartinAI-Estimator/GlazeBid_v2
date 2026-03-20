import { useState, useEffect } from 'react';
import OpenSeadragon from 'openseadragon';

export const useDrawingTool = (viewer, onDrawComplete) => {
    const [isDrawing, setIsDrawing] = useState(false);
    const [startPoint, setStartPoint] = useState(null); // OSD Normalized coordinates
    const [currentRect, setCurrentRect] = useState(null);

    useEffect(() => {
        if (!viewer) return;

        // 1. Mouse Down: Start the markup
        const onCanvasPress = (event) => {
            if (event.originalEvent.shiftKey) { // Only draw if Shift is held
                setIsDrawing(true);
                const webPoint = event.position; 
                const viewportPoint = viewer.viewport.pointFromPixel(webPoint);
                setStartPoint(viewportPoint);
            }
        };

        // 2. Mouse Move: Update the "Ghost" box
        const onCanvasDrag = (event) => {
            if (!isDrawing) return;
            const webPoint = event.position;
            const endPoint = viewer.viewport.pointFromPixel(webPoint);
            
            // Round coordinates to 4 decimal places
            const snappedX = Math.round(endPoint.x * 10000) / 10000;
            const snappedY = Math.round(endPoint.y * 10000) / 10000;
            const startX = Math.round(startPoint.x * 10000) / 10000;
            const startY = Math.round(startPoint.y * 10000) / 10000;
            
            setCurrentRect({
                x: Math.round(Math.min(startX, snappedX) * 10000) / 10000,
                y: Math.round(Math.min(startY, snappedY) * 10000) / 10000,
                width: Math.round(Math.abs(snappedX - startX) * 10000) / 10000,
                height: Math.round(Math.abs(snappedY - startY) * 10000) / 10000
            });
            
            // Prevent OSD from panning while we draw
            event.preventDefaultAction = true;
        };

        // 3. Mouse Up: Finish and Trigger HUD
        const onCanvasRelease = (event) => {
            if (isDrawing && currentRect) {
                setIsDrawing(false);
                
                // Get pixel position for HUD placement
                const pixelPos = event.position;
                
                // Call the callback with final rect and pixel position
                if (onDrawComplete) {
                    onDrawComplete(currentRect, { x: pixelPos.x, y: pixelPos.y });
                }
                
                // Clear the drawing
                setCurrentRect(null);
            }
        };

        viewer.addHandler('canvas-press', onCanvasPress);
        viewer.addHandler('canvas-drag', onCanvasDrag);
        viewer.addHandler('canvas-release', onCanvasRelease);

        return () => {
            viewer.removeHandler('canvas-press', onCanvasPress);
            viewer.removeHandler('canvas-drag', onCanvasDrag);
            viewer.removeHandler('canvas-release', onCanvasRelease);
        };
    }, [viewer, isDrawing, startPoint, currentRect, onDrawComplete]);

    return { currentRect, isDrawing };
};
