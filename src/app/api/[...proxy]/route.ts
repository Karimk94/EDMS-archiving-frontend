import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL;

async function proxyHandler(req: NextRequest): Promise<NextResponse> {
  const path = req.nextUrl.pathname;

  if (!BACKEND_URL) {
    return NextResponse.json({ error: 'Backend API URL is not configured on the server.' }, { status: 500 });
  }

  const targetUrl = `${BACKEND_URL}${path}${req.nextUrl.search}`;

  // Forward all headers from the original request, including the cookie
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
    console.error('API proxy error:', error);
    return NextResponse.json({ error: 'Error forwarding request to the backend.' }, { status: 502 });
  }
}

export async function GET(req: NextRequest) {
  return proxyHandler(req);
}

export async function POST(req: NextRequest) {
  return proxyHandler(req);
}

export async function PUT(req: NextRequest) {
    return proxyHandler(req);
}

export async function DELETE(req: NextRequest) {
    return proxyHandler(req);
}