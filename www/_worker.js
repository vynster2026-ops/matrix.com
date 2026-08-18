export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const hostname = url.hostname.toLowerCase();
        const pathname = url.pathname;

        // Serve static asset files directly from Cloudflare ASSETS storage
        if (/\.(css|js|png|jpg|jpeg|gif|svg|ico|json|xml|xls|csv|woff|woff2|ttf|eot)$/i.test(pathname)) {
            return env.ASSETS.fetch(request);
        }

        // Subdomain dynamic edge routing & path resolution
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
        } else if (pathname === '/matrix' || pathname === '/matrix.html') {
            targetFile = '/matrix.html';
        } else if (pathname === '/bd' || pathname === '/bd.html') {
            targetFile = '/bd.html';
        } else if (pathname === '/superadmin' || pathname === '/superadmin_login' || pathname === '/superadmin_login.html') {
            targetFile = '/superadmin_login.html';
        } else if (pathname === '/admin' || pathname === '/salon' || pathname === '/vynster-salon' || pathname === '/vynster-salon.html') {
            targetFile = '/vynster-salon.html';
        } else if (pathname === '/staff' || pathname === '/vynster-staff' || pathname === '/vynster-staff.html') {
            targetFile = '/vynster-staff.html';
        } else if (pathname === '/booking' || pathname === '/reception' || pathname === '/vynster-booking' || pathname === '/vynster-booking.html') {
            targetFile = '/vynster-booking.html';
        }

        // Helper function to safely fetch asset without triggering Cloudflare Clean URL redirect loops
        async function fetchAssetSafely(filePath) {
            const rewriteUrl = new URL(filePath, request.url);
            let res = await env.ASSETS.fetch(new Request(rewriteUrl, request));

            // If Cloudflare Pages asset handler returns a 301/302/307/308 redirect (e.g. stripping .html),
            // catch it internally on the edge worker and return the target asset directly with 200 OK.
            if (res.status >= 300 && res.status < 400) {
                const location = res.headers.get('Location');
                if (location) {
                    const cleanUrl = new URL(location, request.url);
                    res = await env.ASSETS.fetch(new Request(cleanUrl, request));
                }
            }
            return res;
        }

        if (targetFile) {
            return await fetchAssetSafely(targetFile);
        }

        return await fetchAssetSafely(pathname);
    }
};
