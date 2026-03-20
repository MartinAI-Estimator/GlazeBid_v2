import React from 'react';

const ActionHUD = ({ position, onSelect, onClose }) => {
    if (!position) return null;

    const styles = {
        container: {
            position: 'absolute',
            left: position.x + 10,
            top: position.y + 10,
            backgroundColor: '#1e1e1e',
            border: '1px solid #444',
            borderRadius: '6px',
            padding: '8px',
            boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            gap: '5px'
        },
        button: (color) => ({
            padding: '6px 12px',
            backgroundColor: 'transparent',
            border: `1px solid ${color}`,
            color: color,
            borderRadius: '4px',
            cursor: 'pointer',
            textAlign: 'left',
            fontWeight: 'bold',
            fontSize: '12px'
        })
    };

    return (
        <div style={styles.container}>
            <div style={{color: '#aaa', fontSize: '10px', marginBottom: '4px'}}>ASSIGN SYSTEM</div>
            <button style={styles.button('#ffa500')} onClick={() => onSelect('SF')}>STOREFRONT (ORANGE)</button>
            <button style={styles.button('#4caf50')} onClick={() => onSelect('CW')}>CURTAIN WALL (GREEN)</button>
            <button style={styles.button('#2196f3')} onClick={() => onSelect('WW')}>WINDOW WALL (BLUE)</button>
            <button 
                style={{...styles.button('#ff4444'), marginTop: '5px'}} 
                onClick={onClose}
            >
                CANCEL
            </button>
        </div>
    );
};

export default ActionHUD;
