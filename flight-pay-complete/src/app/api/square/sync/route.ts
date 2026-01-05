import { NextRequest, NextResponse } from 'next/server';
import { SquareClient, SquareEnvironment } from 'square';

const isProduction = process.env.SQUARE_ENVIRONMENT === 'production';

const squareClient = new SquareClient({
  token: isProduction 
    ? process.env.SQUARE_ACCESS_TOKEN 
    : process.env.SQUARE_SANDBOX_ACCESS_TOKEN,
  environment: isProduction ? SquareEnvironment.Production : SquareEnvironment.Sandbox,
});

export async function POST(request: NextRequest) {
  try {
    // Get locations first to get locationId
    const locationsResult = await squareClient.locations.list();
    const locationId = locationsResult.locations?.[0]?.id;

    if (!locationId) {
      return NextResponse.json({ 
        success: false, 
        error: 'No Square location found' 
      }, { status: 400 });
    }

    // Get invoices from Square 
    const result = await squareClient.invoices.list({ locationId });
    const invoices = result.data || [];
    
    // Get paid invoices
    const paidInvoices = invoices.filter(inv => inv.status === 'PAID');

    // Return summary
    return NextResponse.json({
      success: true,
      summary: {
        totalInvoices: invoices.length,
        paidCount: paidInvoices.length,
        pending: invoices.filter(i => i.status === 'UNPAID' || i.status === 'SCHEDULED').length,
      },
      invoices: invoices.slice(0, 50).map(inv => ({
        id: inv.id,
        status: inv.status,
        customerId: inv.primaryRecipient?.customerId,
        amount: inv.paymentRequests?.[0]?.computedAmountMoney?.amount,
        createdAt: inv.createdAt,
      })),
    });
  } catch (error) {
    console.error('Square sync error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to sync with Square' 
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    // Get customers from Square
    const result = await squareClient.customers.list();
    const customers = result.data || [];
    
    return NextResponse.json({
      success: true,
      customers: customers.map(c => ({
        id: c.id,
        name: `${c.givenName || ''} ${c.familyName || ''}`.trim(),
        email: c.emailAddress,
        phone: c.phoneNumber,
      })),
    });
  } catch (error) {
    console.error('Square customers error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to fetch customers' 
    }, { status: 500 });
  }
}
