// The /exec link Accounting already has (deployment AKfycbzwyVcF…, kept forever) now only sends
// people to the web app. Apps Script serves the page inside a sandboxed iframe that may leave the
// top window only after a click, so the automatic jump is tried and the button covers the rest.
var WEB_APP_URL = 'https://inroconta.vercel.app';

function doGet() {
    var html =
        '<!doctype html><html><head><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;margin:0;color:#1f2937}' +
        'main{text-align:center;padding:24px}a{display:inline-block;margin-top:16px;padding:12px 24px;border-radius:8px;' +
        'background:#0f766e;color:#fff;text-decoration:none;font-weight:600}</style></head><body><main>' +
        '<h1>InroConta se mudó</h1><p>La app ahora está en <b>inroconta.vercel.app</b>.</p>' +
        '<a href="' +
        WEB_APP_URL +
        '" target="_top">Abrir InroConta</a></main>' +
        '<script>try{window.top.location.href=' +
        JSON.stringify(WEB_APP_URL) +
        '}catch(e){}</script>' +
        '</body></html>';
    return HtmlService.createHtmlOutput(html).setTitle('InroConta').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}
