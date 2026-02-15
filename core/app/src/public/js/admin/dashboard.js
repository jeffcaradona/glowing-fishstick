document.addEventListener('DOMContentLoaded', function() {
  const healthCheckBtn = document.getElementById('healthCheckBtn');
  const healthCheckResult = document.getElementById('healthCheckResult');

  if (healthCheckBtn) {
    healthCheckBtn.addEventListener('click', async function() {
      try {
        healthCheckBtn.disabled = true;
        healthCheckResult.textContent = 'Checking...';
        healthCheckResult.style.color = 'blue';

        const response = await fetch('/healthz');
        const data = await response.json();

        if (response.ok) {
          healthCheckResult.textContent = '✓ Healthy';
          healthCheckResult.style.color = 'green';
        } else {
          healthCheckResult.textContent = '✗ Unhealthy';
          healthCheckResult.style.color = 'red';
        }
      } catch (error) {
        console.error('Health check failed:', error);
        healthCheckResult.textContent = '✗ Error';
        healthCheckResult.style.color = 'red';
      } finally {
        healthCheckBtn.disabled = false;
      }
    });
  }
});