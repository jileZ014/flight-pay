export interface Player {
  id: string;
  name: string;
  team: string;
  isCoach: boolean;
  parentId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Parent {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string;
  players: string[]; // Array of player IDs
  squareCustomerId: string | null;
  notes: string;
  doNotInvoice: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Invoice {
  id: string;
  parentId: string;
  month: string; // Format: '2025-12'
  amount: number;
  status: 'pending' | 'sent' | 'paid' | 'partial';
  paymentMethod: 'square' | 'zelle' | 'cash' | 'check' | null;
  squareInvoiceId: string | null;
  description: string;
  paidAt: Date | null;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentRecord {
  id: string;
  parentId: string;
  invoiceId: string | null;
  amount: number;
  method: 'square' | 'zelle' | 'cash' | 'check';
  receivedAt: Date;
  notes: string;
  createdAt: Date;
}

export interface MonthlyStatus {
  month: string;
  amountDue: number;
  amountPaid: number;
  status: 'paid' | 'partial' | 'unpaid';
}

// Pricing constants
export const PRICING = {
  SINGLE_PLAYER: 95,
  SIBLINGS: 170,
};
