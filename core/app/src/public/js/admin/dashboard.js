document.addEventListener('DOMContentLoaded', () => {
  const healthCheckBtn = document.getElementById('healthCheckBtn');
  const healthCheckResult = document.getElementById('healthCheckResult');

  const getStatus = async (url) => {
    const response = await fetch(url);
    let payload;

    try {
      payload = await response.json();
    } catch {
      payload = {};
    }

    return { ok: response.ok, payload };
  };

  if (healthCheckBtn) {
    healthCheckBtn.addEventListener('click', async () => {
      try {
        healthCheckBtn.disabled = true;
        healthCheckResult.textContent = 'Checking...';
        healthCheckResult.style.color = 'blue';

        const [appCheck, apiCheck] = await Promise.allSettled([
          getStatus('/healthz'),
          getStatus('/admin/api-health'),
        ]);

        const appHealthy =
          appCheck.status === 'fulfilled' &&
          appCheck.value.ok &&
          appCheck.value.payload?.status === 'ok';
        const apiHealthy =
          apiCheck.status === 'fulfilled' &&
          apiCheck.value.ok &&
          apiCheck.value.payload?.status === 'healthy';

        const appLabel = appHealthy ? 'Healthy' : 'Unhealthy';
        const apiLabel = apiHealthy ? 'Healthy' : 'Unhealthy';

        healthCheckResult.textContent = `App: ${appLabel} | API: ${apiLabel}`;
        healthCheckResult.style.color = appHealthy && apiHealthy ? 'green' : 'red';
      } catch {
        healthCheckResult.textContent = 'Unhealthy';
        healthCheckResult.style.color = 'red';
      } finally {
        healthCheckBtn.disabled = false;
      }
    });
  }
});
