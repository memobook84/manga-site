const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://manga-site-three.vercel.app';
const dataPath = path.join(__dirname, '..', 'data', 'manga-all.json');
const outputPath = path.join(__dirname, '..', 'sitemap.xml');

const mangaAll = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

const today = new Date().toISOString().split('T')[0];

// 静的ページ
const staticPages = [
    { loc: '/', priority: '1.0', changefreq: 'daily' },
    { loc: '/index.html', priority: '0.9', changefreq: 'daily' },
    { loc: '/new-releases.html', priority: '0.8', changefreq: 'daily' },
    { loc: '/ranking.html', priority: '0.8', changefreq: 'daily' },
    { loc: '/follow.html', priority: '0.5', changefreq: 'weekly' },
];

// 動的ページ（各作品の詳細）
const detailPages = mangaAll.map(manga => ({
    loc: `/detail.html?title=${encodeURIComponent(manga.title)}`,
    priority: '0.6',
    changefreq: 'weekly',
}));

const allPages = [...staticPages, ...detailPages];

const urlEntries = allPages.map(page => `  <url>
    <loc>${BASE_URL}${page.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`).join('\n');

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>
`;

fs.writeFileSync(outputPath, sitemap, 'utf-8');
console.log(`sitemap.xml generated: ${allPages.length} URLs (${staticPages.length} static + ${detailPages.length} detail)`);
