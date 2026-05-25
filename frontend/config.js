const BACKEND_URL = "http://localhost:5000";

// Dynamic backend URL resolution - probes ports to find the actual running server
async function resolveBackendUrl() {
    const candidates = [
        'http://localhost:5000',
        'http://localhost:5001',
        'http://localhost:5002',
        'http://localhost:5003',
        'http://localhost:5004',
        'http://localhost:5005',
        'http://localhost:5006',
        'http://localhost:5007',
        'http://localhost:5008',
        'http://localhost:5009',
        'http://localhost:5010',
        'http://localhost:5011',
        'http://localhost:5012',
        'http://localhost:5013',
        'http://localhost:5014',
        'http://localhost:5015',
        'http://localhost:5016',
        'http://localhost:5017',
        'http://localhost:5018',
        'http://localhost:5019',
        'http://localhost:5020'
    ];

    if (window.__backendHost) return window.__backendHost;

    for (const host of candidates) {
        try {
            const response = await fetch(`${host}/api/ping`, { method: 'GET', timeout: 2000 });
            if (response.ok) {
                window.__backendHost = host;
                return host;
            }
        } catch (_) {
            // ignore unreachable host
        }
    }

    return candidates[0];
}