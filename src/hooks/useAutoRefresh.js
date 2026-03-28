import { useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';

/**
 * Custom hook to automatically poll a fetch function when the screen is focused.
 * @param {Function} fetchFn - The function to call to refresh data. Should ideally accept a boolean to suppress loading spinners.
 * @param {number} intervalMs - Polling interval in milliseconds (default 10000ms = 10s).
 */
export const useAutoRefresh = (fetchFn, intervalMs = 10000) => {
  const intervalRef = useRef(null);

  useFocusEffect(
    useCallback(() => {
      // Fetch immediately on focus
      fetchFn(false);

      // Set up polling interval
      intervalRef.current = setInterval(() => {
        // Pass true to indicate a silent refresh
        fetchFn(true);
      }, intervalMs);

      // Clean up on blur or unmount
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    }, [fetchFn, intervalMs])
  );
};

export default useAutoRefresh;
