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
    const body = await request.json();
    const { 
      customerId, 
      phone,
      amount, 
      description,
      playerName,
      dueDate 
    } = body;

    // If no customerId, create customer first
    let finalCustomerId = customerId;
    
    if (!finalCustomerId && phone) {
      // Search for existing customer by phone
      const searchResult = await squareClient.customers.search({
        query: {
          filter: {
            phoneNumber: {
              exact: phone,
            },
          },
        },
      });

      if (searchResult.customers && searchResult.customers.length > 0) {
        finalCustomerId = searchResult.customers[0].id;
      }
    }

    if (!finalCustomerId) {
      return NextResponse.json({ 
        success: false, 
        error: 'Customer not found. Please create customer in Square first.' 
      }, { status: 400 });
    }

    // Get location ID
    const locationsResult = await squareClient.locations.list();
    const locationId = locationsResult.locations?.[0]?.id;

    if (!locationId) {
      return NextResponse.json({ 
        success: false, 
        error: 'No Square location found' 
      }, { status: 400 });
    }

    // Create invoice
    const invoiceResult = await squareClient.invoices.create({
      invoice: {
        locationId,
        primaryRecipient: {
          customerId: finalCustomerId,
        },
        paymentRequests: [
          {
            requestType: 'BALANCE',
            dueDate: dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            automaticPaymentSource: 'NONE',
          },
        ],
        deliveryMethod: 'SMS',
        title: `AZ Flight Basketball - ${playerName || 'Monthly Fee'}`,
        description: description || `Monthly club fee for ${playerName}`,
      },
      idempotencyKey: `${finalCustomerId}-${Date.now()}`,
    });

    return NextResponse.json({
      success: true,
      invoiceId: invoiceResult.invoice?.id,
    });
  } catch (error) {
    console.error('Create invoice error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to create invoice' 
    }, { status: 500 });
  }
}
