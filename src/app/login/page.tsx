'use client'; 

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
    const router = useRouter();
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setIsLoading(true);
        setError(null);
        const data = Object.fromEntries(new FormData(event.currentTarget).entries());

        const apiPath = `${basePath}/api/auth/login`;

        console.log(`[LOGIN PAGE] Attempting to fetch: ${apiPath}`);
        
        try {
            const response = await fetch(apiPath, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });

            if (response.ok) {
                router.push('/'); 
            } else {
                const errData = await response.json();
                const errorMessage = `Login failed: ${errData.error || response.statusText}`;
                setError(errorMessage);
                console.error('[LOGIN PAGE] Error:', errorMessage);
            }
        } catch (err) {
            const connectErrorMessage = 'Could not connect to the server. See browser console for details.';
            setError(connectErrorMessage);
            console.error('[LOGIN PAGE] Network or fetch error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div dir="rtl" className="flex items-center justify-center min-h-screen bg-gray-50 text-gray-800 font-sans">
            <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-lg">
                <h1 className="text-3xl font-bold text-center text-gray-900">نظام أرشفة الموظفين Employee Archiving System</h1>
                <p className="text-center text-gray-600">
                    الرجاء تسجيل الدخول باستخدام بيانات DMS الخاصة بك
                    <br />
                    Please log in with your DMS credentials
                </p>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label htmlFor="username" className="text-sm font-semibold text-gray-700 block mb-2">المستخدم / User</label>
                        <input id="username" name="username" type="text" required className="w-full px-4 py-2 border border-gray-300 rounded-md" />
                    </div>
                    <div>
                        <label htmlFor="password" className="text-sm font-semibold text-gray-700 block mb-2">كلمة المرور / Password</label>
                        <input id="password" name="password" type="password" required className="w-full px-4 py-2 border border-gray-300 rounded-md" />
                    </div>
                    {error && <div className="p-3 text-sm text-red-700 bg-red-100 rounded-md">{error}</div>}
                    <button type="submit" disabled={isLoading} className="w-full flex justify-center py-2 px-4 border rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300">
                        {isLoading ? 'جاري تسجيل الدخول... / Logging in...' : 'تسجيل الدخول / Login'}
                    </button>
                </form>
            </div>
        </div>
    );
}