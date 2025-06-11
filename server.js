const express = require('express');
const fs = require('fs');
const path = require('path');
const chromeLauncher = require('chrome-launcher');
const { URL } = require('url');

const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static('public'));
app.use('/reports', express.static(path.join(__dirname, 'reports')));

const REPORTS_DIR = path.join(__dirname, 'reports');
if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR);

/**
 * Loads Lighthouse on the fly (ESM dynamic import)
 * and returns the reference to the module.
 */
async function loadLighthouse() {
    const { default: lighthouse } = await import('lighthouse');
    return lighthouse;
}

app.post('/audit', async (req, res) => {
    const urls = req.body.urls || [];
    const reports = [];

    // Load Lighthouse ONLY ONCE (on the first call)
    const lighthouse = await loadLighthouse();

    for (const rawUrl of urls) {
        const url = rawUrl.trim();
        if (!url) continue;

        try {
            const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless'] });
            const options = {
                port: chrome.port,
                output: 'html',
                onlyCategories: ['performance', 'seo', 'accessibility'],
            };

            const runnerResult = await lighthouse(url, options);

            const parsedUrl = new URL(url);
            const safeName = parsedUrl.hostname.replace(/\./g, '_');
            const fileName = `report_${safeName}_${Date.now()}.html`;
            const filePath = path.join(REPORTS_DIR, fileName);

            fs.writeFileSync(filePath, runnerResult.report);
            await chrome.kill();

            reports.push(`/reports/${fileName}`);
        } catch (err) {
            console.error('❌ Audit error:', err.message);
        }
    }

    res.json({ reports });
});

app.listen(port, () => {
    console.log(`✅ Server listening on http://localhost:${port}`);
});
