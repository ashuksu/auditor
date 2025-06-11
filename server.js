const express = require('express');
const fs = require('fs');
const path = require('path');
const chromeLauncher = require('chrome-launcher');
const {URL} = require('url');

const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static('public'));
app.use('/reports', express.static(path.join(__dirname, 'reports')));

const REPORTS_DIR = path.join(__dirname, 'reports');
if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR);

async function loadLighthouse() {
    const {default: lighthouse} = await import('lighthouse');
    return lighthouse;
}

// ✅ CONFIGURATION adapted to manual behavior
const config = {
    extends: 'lighthouse:default',
    settings: {
        emulatedFormFactor: 'desktop', // or 'mobile' as needed
        throttlingMethod: 'provided', // ✅ NO throttling
        disableStorageReset: true, // ✅ Keeps cache, IndexedDB, cookies
        onlyCategories: ['performance', 'seo', 'accessibility', 'best-practices'],
    }
};

app.post('/audit', async (req, res) => {
    const urls = req.body.urls || [];
    const results = [];

    const lighthouse = await loadLighthouse();

    for (const rawUrl of urls) {
        const url = rawUrl.trim();
        if (!url) continue;

        const scores = {
            performance: [],
            seo: [],
            accessibility: [],
            bestPractices: []
        };
        const metrics = {fcp: [], lcp: [], tbt: [], si: [], cls: []};
        const reportLinks = [];

        for (let i = 0; i < 3; i++) {
            try {
                const chrome = await chromeLauncher.launch({
                    chromeFlags: [
                        '--headless=new', // or remove completely to see the rendering
                        '--no-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-gpu',
                        '--disable-setuid-sandbox',
                        '--window-size=1920,1080'
                    ]
                });

                const options = {
                    port: chrome.port,
                    output: 'html',
                    logLevel: 'info'
                };

                const runnerResult = await lighthouse(url, options, config);
                const audit = runnerResult.lhr;

                // Collect scores
                scores.performance.push(audit.categories.performance.score * 100);
                scores.seo.push(audit.categories.seo.score * 100);
                scores.accessibility.push(audit.categories.accessibility.score * 100);
                scores.bestPractices.push(audit.categories['best-practices'].score * 100);

                // Collect metrics
                metrics.fcp.push(audit.audits['first-contentful-paint'].numericValue);
                metrics.lcp.push(audit.audits['largest-contentful-paint'].numericValue);
                metrics.tbt.push(audit.audits['total-blocking-time'].numericValue);
                metrics.si.push(audit.audits['speed-index'].numericValue);
                metrics.cls.push(audit.audits['cumulative-layout-shift'].numericValue);

                // Save report
                const parsedUrl = new URL(url);
                const safeName = parsedUrl.hostname.replace(/\./g, '_');
                const fileName = `report_${safeName}_${Date.now()}_${i + 1}.html`;
                const filePath = path.join(REPORTS_DIR, fileName);
                fs.writeFileSync(filePath, runnerResult.report);

                reportLinks.push(`/reports/${fileName}`);

                await chrome.kill();
            } catch (err) {
                console.error(`❌ Audit error (${url}):`, err.message);
            }
        }

// Average helper    const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

        results.push({
            url,
            averageScores: {
                performance: avg(scores.performance),
                seo: avg(scores.seo),
                accessibility: avg(scores.accessibility),
                bestPractices: avg(scores.bestPractices)
            },
            averageMetrics: {
                fcp: avg(metrics.fcp),
                lcp: avg(metrics.lcp),
                tbt: avg(metrics.tbt),
                si: avg(metrics.si),
                cls: avg(metrics.cls)
            },
            reports: reportLinks
        });
    }

    res.json({results});
});

app.listen(port, () => {
    console.log(`✅ Server listening on http://localhost:${port}`);
});
