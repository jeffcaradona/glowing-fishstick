/**
 * @module utils/formatters
 * @description Pure formatting functions for human-readable output.
 */

/**
 * Format seconds into human-readable uptime string.
 * Automatically selects appropriate units based on duration.
 *
 * @param {number} seconds - Duration in seconds (e.g., from process.uptime())
 * @returns {string} Formatted string (e.g., "45s", "5m 23s", "2h 15m", "3d 5h 30m")
 *
 * @example
 * formatUptime(45);        // "45s"
 * formatUptime(323);       // "5m 23s"
 * formatUptime(8130);      // "2h 15m"
 * formatUptime(277530);    // "3d 5h 12m"
 */
export function formatUptime(seconds) {
  // Input validation: handle negative, NaN, Infinity, non-numbers
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
    return '0s';
  }

  const totalSeconds = Math.floor(seconds);

  // Less than 60 seconds: show seconds only
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;

  // Less than 60 minutes: show minutes and seconds
  if (totalSeconds < 3600) {
    return `${minutes}m ${remainingSeconds}s`;
  }

  const hours = Math.floor(totalSeconds / 3600);
  const remainingMinutes = Math.floor((totalSeconds % 3600) / 60);

  // Less than 24 hours: show hours and minutes
  if (totalSeconds < 86400) {
    return `${hours}h ${remainingMinutes}m`;
  }

  // 24 hours or more: show days, hours, and minutes
  const days = Math.floor(totalSeconds / 86400);
  const remainingHours = Math.floor((totalSeconds % 86400) / 3600);
  const finalMinutes = Math.floor(((totalSeconds % 86400) % 3600) / 60);

  return `${days}d ${remainingHours}h ${finalMinutes}m`;
}
