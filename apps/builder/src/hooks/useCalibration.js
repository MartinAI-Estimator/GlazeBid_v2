import { useState } from 'react';

export const useCalibration = (viewer) => {
    const [points, setPoints] = useState([]); // Stores [{x, y}, {x, y}]

    const handleCanvasClick = (event) => {
        const viewportPoint = viewer.viewport.pointFromPixel(event.position);
        
        if (points.length === 2) {
            setPoints([viewportPoint]); // Start over
        } else {
            setPoints([...points, viewportPoint]);
        }
    };

    const calculatePixelDistance = () => {
        if (points.length !== 2) return 0;
        const dx = points[1].x - points[0].x;
        const dy = points[1].y - points[0].y;
        return Math.sqrt(dx * dx + dy * dy); // Return normalized distance
    };

    return { points, handleCanvasClick, dist: calculatePixelDistance() };
};
