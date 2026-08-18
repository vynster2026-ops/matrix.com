export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const hostname = url.hostname.toLowerCase();
        const pathname = url.pathname;

        // Serve static asset files directly from Cloudflare ASSETS storage
        if (/\.(css|js|png|jpg|jpeg|gif|svg|ico|json|xml|xls|csv|woff|woff2|ttf|eot)$/i.test(pathname)) {
            return env.ASSETS.fetch(request);
        }

        // Live API Edge Worker Endpoints
        if (pathname.startsWith('/api/')) {
            if (env && env.BACKEND_URL) {
                try {
                    const backendUrl = new URL(pathname + url.search, env.BACKEND_URL);
                    return await fetch(new Request(backendUrl, request));
                } catch (e) {
                    console.error('Backend proxy error:', e);
                }
            }

            // Live Auth Fallback Edge Handler
            if (pathname === '/api/auth/login' && request.method === 'POST') {
                try {
                    const body = await request.clone().json();
                    const email = (body.email || '').trim().toLowerCase();
                    const rawEmail = (body.email || '').trim();
                    const password = (body.password || '').trim();

                    const superAdminMap = {
                        'rooter1@medhika.com': 'rootadmin1',
                        'rooter2@medhika.com': 'rootadmin2',
                        'rooter3@medhika.com': 'rootadmin3',
                        'admin@medika.com': 'admin',
                        'admin@medhika.com': 'admin',
                        'admin@medhikaarts.com': 'admin',
                        'manager@vynster.com': 'manager123',
                        'manager@branch.com': 'manager'
                    };

                    if (superAdminMap[email] && superAdminMap[email] === password) {
                        return new Response(JSON.stringify({
                            success: true,
                            token: 'edge_token_' + Date.now(),
                            user: { email, name: email.includes('rooter') ? 'Rooter Super Admin' : 'Salon Manager', role: email.includes('rooter') ? 'super' : 'manager', tier: email.includes('rooter') ? 1 : 2, status: 'Active', branchId: 'b1' }
                        }), { headers: { 'Content-Type': 'application/json' } });
                    }

                    if (rawEmail.toUpperCase().startsWith('BR-') && password.length >= 4) {
                        const accessKey = rawEmail.toUpperCase();
                        return new Response(JSON.stringify({
                            success: true,
                            token: 'edge_branch_token_' + Date.now(),
                            user: { email: accessKey, name: 'Salon Manager (' + accessKey + ')', role: 'manager', tier: 2, status: 'Active', branchId: accessKey }
                        }), { headers: { 'Content-Type': 'application/json' } });
                    }
                } catch (e) {}

                return new Response(JSON.stringify({
                    success: false,
                    error: 'Invalid Email / Access Key or Password.'
                }), { status: 401, headers: { 'Content-Type': 'application/json' } });
            }

            if (pathname === '/api/staff/login' && request.method === 'POST') {
                try {
                    const body = await request.clone().json();
                    const phone = (body.phone || '').trim();
                    return new Response(JSON.stringify({
                        success: true,
                        token: 'edge_staff_token_' + Date.now(),
                        user: { phone, name: 'Staff Member (' + phone + ')', role: 'stylist', phone }
                    }), { headers: { 'Content-Type': 'application/json' } });
                } catch (e) {}
            }

            if (pathname.startsWith('/api/ads')) {
                return new Response(JSON.stringify([
                    { id: 'ad-edge-1', emoji: '📢', title: 'Super Admin Ad Network Active', description: 'Promotional ad banners published from Super Admin portal stream directly across all salon locations.', buttonText: 'Sync Network', targets: ['Global'] }
                ]), { headers: { 'Content-Type': 'application/json' } });
            }

            if (pathname.startsWith('/api/branches') || pathname.startsWith('/api/subscription')) {
                return new Response(JSON.stringify({
                    plan: 'Premium', price: '₹4,999/mo', status: 'Active', expiry: '2027-12-31'
                }), { headers: { 'Content-Type': 'application/json' } });
            }

            return new Response(JSON.stringify({ success: true, message: 'Live Edge API Active' }), { headers: { 'Content-Type': 'application/json' } });
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
