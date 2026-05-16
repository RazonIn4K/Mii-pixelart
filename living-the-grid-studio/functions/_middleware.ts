const SOCIAL_CRAWLERS = [
  'facebookexternalhit',
  'Facebot',
  'facebookcatalog',
  'meta-externalagent',
  'FacebookBot',
  'Twitterbot',
  'LinkedInBot',
  'WhatsApp',
  'Slackbot',
  'TelegramBot',
  'Discordbot',
];

const OG_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Tomodachi · Mii Studio &amp; Recovery Guides</title>
  <meta name="description" content="A browser-first Mii pixel-art studio and Tomodachi Life recovery hub." />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Tomodachi" />
  <meta property="og:title" content="Tomodachi · Mii Studio &amp; Recovery Guides" />
  <meta property="og:description" content="A browser-first Mii pixel-art studio and Tomodachi Life recovery hub." />
  <meta property="og:url" content="https://tomodachi.pw/" />
  <meta property="og:image" content="https://tomodachi.pw/og-image.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Tomodachi · Mii Studio &amp; Recovery Guides" />
  <meta name="twitter:description" content="A browser-first Mii pixel-art studio and Tomodachi Life recovery hub." />
  <meta name="twitter:image" content="https://tomodachi.pw/og-image.png" />
  <link rel="canonical" href="https://tomodachi.pw/" />
</head>
<body>
  <h1>Tomodachi · Mii Studio &amp; Recovery Guides</h1>
  <p>A browser-first Mii pixel-art studio and Tomodachi Life recovery hub.</p>
</body>
</html>`;

export async function onRequest(context) {
  const { request, next } = context;
  const ua = (request.headers.get('user-agent') || '').toLowerCase();
  const isCrawler = SOCIAL_CRAWLERS.some((bot) => ua.includes(bot.toLowerCase()));

  if (isCrawler) {
    const url = new URL(request.url);
    if (url.pathname === '/' || url.pathname === '') {
      return new Response(OG_HTML, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=3600',
          'X-Robots-Tag': 'index, follow',
          'X-OG-Middleware': 'hit',
        },
      });
    }
  }

  return next();
}
