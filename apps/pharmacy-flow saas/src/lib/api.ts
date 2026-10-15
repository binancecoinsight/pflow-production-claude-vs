
import { handleLocalRequest } from './localApi';

export async function apiFetch(resource: string | Request, config?: RequestInit) {
  const url = resource instanceof Request ? resource.url : resource;
  const urlObj = new URL(url.toString(), window.location.origin);
  const pathname = urlObj.pathname;
  
  // Intercept database routes to handle them locally
  const localRoutes = [
    '/api/auth/login',
    '/api/auth/signup',
    '/api/auth/me',
    '/api/auth/send-otp',
    '/api/auth/verify-otp',
    '/api/auth/check-pharmacy',
    '/api/auth/has-users',
    '/api/auth/check-signup-data',
    '/api/roles',
    '/api/products',
    '/api/sales',
    '/api/users',
    '/api/accounts',
    '/api/stats',
    '/api/settings',
    '/api/reports',
    '/api/expenses',
    '/api/returns',
    '/api/suppliers',
    '/api/purchases',
    '/api/market-list',
    '/api/calendar-events',
    '/api/invoices',
    '/api/branches',
    '/api/employees',
    '/api/payroll',
    '/api/notifications',
    '/api/activities',
    '/api/backup',
    '/api/restore',
    '/api/referrals',
    '/api/subscriptions'
  ];

  if (localRoutes.some(route => pathname.startsWith(route))) {
    try {
      const storedUser = localStorage.getItem('store_user');
      const user = storedUser ? JSON.parse(storedUser) : null;
      
      const headers = new Headers(config?.headers || {});
      if (user?.id) {
        headers.set('x-user-id', user.id);
      }
      
      const updatedConfig = { ...config, headers };
      
      const result = await handleLocalRequest(pathname + urlObj.search, updatedConfig);
      
      // Mock a Response object
      // Ensure we don't use data 'status' (like invoice status 'unpaid') as HTTP status
      const resultStatus = (result as any)?.status;
      const httpStatus = typeof resultStatus === 'number' && resultStatus >= 200 && resultStatus <= 599 
        ? resultStatus 
        : 200;

      return new Response(JSON.stringify(result), {
        status: httpStatus,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error: any) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
  
  // For other routes (like Google Drive OAuth), use the server
  if (pathname.startsWith('/api/')) {
    const storedUser = localStorage.getItem('store_user');
    const user = storedUser ? JSON.parse(storedUser) : null;
    
    if (user?.id) {
      const headers = new Headers(config?.headers || {});
      headers.set('x-user-id', user.id);
      
      return fetch(resource, {
        ...config,
        headers
      });
    }
  }
  
  return fetch(resource, config);
}
