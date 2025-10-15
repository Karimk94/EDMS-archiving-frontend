import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL;

async function proxyHandler(req: NextRequest, { params }: { params: { proxy: string[] } }): Promise<NextResponse> {
  const apiPath = `/api/${params.proxy.join('/')}`;

  if (!BACKEND_URL) {
    return NextResponse.json({ error: 'Backend API URL is not configured on the server.' }, { status: 500 });
  }

  const targetUrl = `${BACKEND_URL}${apiPath}${req.nextUrl.search}`;
  console.log(`[API PROXY] Forwarding request to: ${targetUrl}`);

  const headers = new Headers(req.headers);

  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
      // @ts-ignore - duplex is required for streaming bodies
      duplex: 'half',
    });

    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (error) {
    console.error('[API PROXY] Error forwarding request:', error);
    return NextResponse.json({ error: 'Error forwarding request to the backend.' }, { status: 502 });
  }
}

// Ensure all exported methods pass the `params` object to the handler.
export async function GET(req: NextRequest, { params }: { params: { proxy: string[] } }) {
  return proxyHandler(req, { params });
}
export async function POST(req: NextRequest, { params }: { params: { proxy: string[] } }) {
  return proxyHandler(req, { params });
}
export async function PUT(req: NextRequest, { params }: { params: { proxy: string[] } }) {
    return proxyHandler(req, { params });
}
export async function DELETE(req: NextRequest, { params }: { params: { proxy: string[] } }) {
    return proxyHandler(req, { params });
}