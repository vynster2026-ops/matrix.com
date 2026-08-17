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
            targetFile = pathname === '/' ? '/vynster-salon.html' : pathname;
        } else if (hostname.startsWith('staff.')) {
            targetFile = pathname === '/' ? '/vynster-staff.html' : pathname;
        } else if (hostname.startsWith('reception.') || hostname.startsWith('booking.')) {
            targetFile = pathname === '/' ? '/vynster-booking.html' : pathname;
        } else if (hostname.startsWith('matrix.')) {
            targetFile = pathname === '/' ? '/matrix.html' : pathname;
        } else if (hostname.startsWith('bd.')) {
            targetFile = pathname === '/' ? '/bd.html' : pathname;
        } else if (hostname === 'www.vynster.com' || hostname === 'vynster.com' || pathname === '/') {
            targetFile = pathname === '/' ? '/landing.html' : pathname;
        }

        if (targetFile) {
            const rewriteUrl = new URL(targetFile, request.url);
            return env.ASSETS.fetch(new Request(rewriteUrl, request));
        }

        // Default fallthrough to root assets
        return env.ASSETS.fetch(request);
    }
};
