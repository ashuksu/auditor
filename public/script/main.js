document.addEventListener('DOMContentLoaded', () => {
    const auditForm = document.getElementById('audit-form');
    const loader = document.getElementById('loader');
    const resultsContainer = document.getElementById('results-container');
    const errorContainer = document.getElementById('error-container');
    const CLIENT_TIMEOUT = 330000; // 5.5 minutes

    const formatMs = (ms) => {
        if (ms === null || isNaN(ms)) return '—';
        return ms > 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`;
    };

    const formatCls = (value) => {
        if (value === null || isNaN(value)) return '—';
        return value.toFixed(3);
    };

    const displayError = (message) => {
        errorContainer.textContent = message;
        errorContainer.style.display = 'block';
    };

    const clearResultsAndErrors = () => {
        resultsContainer.innerHTML = '';
        errorContainer.innerHTML = '';
        errorContainer.style.display = 'none';
    };

    auditForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearResultsAndErrors();

        const textarea = e.target.elements.urls;
        const urls = textarea.value
            .trim()
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean)
            .map(url => !/^https?:\/\//i.test(url) ? `https://${url}` : url);

        if (!urls.length) {
            displayError('Please enter at least one URL.');
            return;
        }

        loader.style.display = 'grid';
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CLIENT_TIMEOUT);

        try {
            const response = await fetch('/audit', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({urls}),
                signal: controller.signal, // Link controller to the fetch request
            });

            clearTimeout(timeoutId); // Clear timeout if the request succeeds

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'An unknown error occurred.');
            }

            if (!data.results || data.results.length === 0) {
                displayError('No audit results were returned from the server.');
                return;
            }

            renderTable(data.results);

        } catch (error) {
            if (error.name === 'AbortError') {
                console.error('Fetch aborted due to timeout.');
                displayError('Request timed out. The server took too long to respond.');
            } else {
                console.error('Error:', error);
                displayError(`Error during audit: ${error.message}`);
            }
        } finally {
            loader.style.display = 'none';
            clearTimeout(timeoutId);
        }
    });

    function renderTable(data) {
        const table = document.createElement('table');
        table.innerHTML = `
            <caption>Average Lighthouse Audit Results (3 passes)</caption>
            <thead>
                <tr>
                    <th>URL</th>
                    <th>Device</th>
                    <th>Perf. (μ ± σ)</th>
                    <th>SEO (μ ± σ)</th>
                    <th>Access. (μ ± σ)</th>
                    <th>Best Practices (μ ± σ)</th>
                    <th>FCP</th>
                    <th>LCP</th>
                    <th>TBT</th>
                    <th>SI</th>
                    <th>CLS</th>
                    <th>Reports</th>
                </tr>
            </thead>
            <tbody></tbody>
        `;

        const tbody = table.querySelector('tbody');
        const fmtScore = (mean, std) => `${mean.toFixed(1)}% ± ${std.toFixed(1)}`;

        data.forEach(item => {
            const tr = document.createElement('tr');
            const reportsLinks = item.reports
                .map((r, i) => `<a class="report-link" href="${r}" target="_blank">Report ${i + 1}</a>`)
                .join('<br>');

            tr.innerHTML = `
                <td>${item.url}</td>
                <td>${item.device}</td>
                <td>${fmtScore(item.averageScores.performance, item.stdScores.performance)}</td>
                <td>${fmtScore(item.averageScores.seo, item.stdScores.seo)}</td>
                <td>${fmtScore(item.averageScores.accessibility, item.stdScores.accessibility)}</td>
                <td>${fmtScore(item.averageScores.bestPractices, item.stdScores.bestPractices)}</td>
                <td>${formatMs(item.averageMetrics.fcp)} ± ${formatMs(item.stdMetrics.fcp)}</td>
                <td>${formatMs(item.averageMetrics.lcp)} ± ${formatMs(item.stdMetrics.lcp)}</td>
                <td>${formatMs(item.averageMetrics.tbt)} ± ${formatMs(item.stdMetrics.tbt)}</td>
                <td>${formatMs(item.averageMetrics.si)} ± ${formatMs(item.stdMetrics.si)}</td>
                <td>${formatCls(item.averageMetrics.cls)} ± ${formatCls(item.stdMetrics.cls)}</td>
                <td>${reportsLinks}</td>
            `;
            tbody.appendChild(tr);
        });

        resultsContainer.appendChild(table);
    }
});