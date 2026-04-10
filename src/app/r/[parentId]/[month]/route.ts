import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, increment } from 'firebase/firestore';

// Public redirect that:
//  1. Records a "viewed" event for the parent's invoice for the given month
//  2. 302-forwards to the actual Square hosted invoice page
//
// URL shape: /r/{parentId}/{month}   e.g.  /r/abc123/2026-04
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ parentId: string; month: string }> }
) {
  const { parentId, month } = await params;

  try {
    const parentRef = doc(db, 'parents', parentId);
    const snap = await getDoc(parentRef);

    if (!snap.exists()) {
      return new NextResponse('Invoice not found', { status: 404 });
    }

    const data = snap.data();
    const activity = data.invoiceActivity?.[month];
    const publicUrl: string | undefined = activity?.publicUrl;

    if (!publicUrl) {
      return new NextResponse('Invoice link unavailable', { status: 404 });
    }

    // Stamp viewedAt + bump viewCount (best-effort, don't block redirect on failure)
    const now = new Date().toISOString();
    updateDoc(parentRef, {
      [`invoiceActivity.${month}.viewedAt`]: now,
      [`invoiceActivity.${month}.viewCount`]: increment(1),
    }).catch(err => console.error('Failed to log invoice view:', err));

    return NextResponse.redirect(publicUrl, 302);
  } catch (err) {
    console.error('Redirect error:', err);
    return new NextResponse('Server error', { status: 500 });
  }
}
