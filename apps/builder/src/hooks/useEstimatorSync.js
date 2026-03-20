// useEstimatorSync.js
// BroadcastChannel listener — receives frames pushed from GlazeBid Studio
// and injects them directly into the Zustand bid store.
import { useEffect } from 'react';
import useBidStore from '../store/useBidStore';

export function useEstimatorSync() {
  const addFrame = useBidStore((state) => state.addFrame);

  useEffect(() => {
    // Must match the channel name used in GlazeBid Studio exactly
    const channel = new BroadcastChannel('glazebid-estimator');

    channel.onmessage = (event) => {
      const { type, payload } = event.data;

      if (type === 'BATCH_READY' && payload) {
        console.log('🔗 Builder: Received frame from Studio →', payload.elevationTag);
        addFrame(payload);
      }
    };

    return () => {
      channel.close();
    };
  }, [addFrame]);
}
