export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const hostname = url.hostname.toLowerCase();
        const pathname = url.pathname;

        // Serve static asset files directly from Cloudflare ASSETS storage
        if (/\.(css|js|png|jpg|jpeg|gif|svg|ico|json|xml|xls|csv|woff|woff2|ttf|eot)$/i.test(pathname)) {
            return env.ASSETS.fetch(request);
        }

        // Subdomain dynamic edge routing
        let targetFile = null;

        if (hostname.startsWith('admin.') || hostname.startsWith('salon.')) {
            targetFile = (pathname === '/' || pathname === '') ? '/vynster-salon.html' : pathname;
        } else if (hostname.startsWith('staff.')) {
            targetFile = (pathname === '/' || pathname === '') ? '/vynster-staff.html' : pathname;
        } else if (hostname.startsWith('reception.') || hostname.startsWith('booking.')) {
            targetFile = (pathname === '/' || pathname === '') ? '/vynster-booking.html' : pathname;
        } else if (hostname.startsWith('matrix.')) {
            targetFile = (pathname === '/' || pathname === '') ? '/matrix.html' : pathname;
        } else if (hostname.startsWith('bd.')) {
            targetFile = (pathname === '/' || pathname === '') ? '/bd.html' : pathname;
        } else if (pathname === '/' || pathname === '' || pathname === '/index.html') {
            targetFile = '/landing.html';
        }

        if (targetFile && targetFile !== pathname) {
            const rewriteUrl = new URL(targetFile, request.url);
            return env.ASSETS.fetch(new Request(rewriteUrl, request));
        }

        return env.ASSETS.fetch(request);
    }
};
