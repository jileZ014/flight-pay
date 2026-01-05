'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Parent, PRICING } from '@/types';

interface ParentWithBalance extends Parent {
  currentBalance: number;
  lastPaymentDate: string | null;
  playerNames: string[];
  monthlyRate: number;
}

export default function Dashboard() {
  const [parents, setParents] = useState<ParentWithBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'owes' | 'paid'>('all');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const mockParents = await fetchParentsFromFirestore();
      setParents(mockParents);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchParentsFromFirestore = async (): Promise<ParentWithBalance[]> => {
    try {
      const parentsRef = collection(db, 'parents');
      const snapshot = await getDocs(parentsRef);
      
      if (snapshot.empty) {
        return [];
      }

      return snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id,
      })) as ParentWithBalance[];
    } catch (error) {
      console.error('Firestore error:', error);
      return [];
    }
  };

  const markAsPaid = async (parentId: string, method: 'square' | 'zelle' | 'cash' | 'check') => {
    try {
      const parentRef = doc(db, 'parents', parentId);
      await updateDoc(parentRef, {
        [`payments.${selectedMonth}`]: {
          status: 'paid',
          method,
          paidAt: new Date().toISOString(),
        },
        currentBalance: 0,
      });
      
      setParents(prev => prev.map(p => 
        p.id === parentId 
          ? { ...p, currentBalance: 0, lastPaymentDate: new Date().toISOString() }
          : p
      ));
    } catch (error) {
      console.error('Error marking as paid:', error);
    }
  };

  const syncWithSquare = async () => {
    setSyncing(true);
    try {
      const response = await fetch('/api/square/sync', { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        loadData();
      }
    } catch (error) {
      console.error('Error syncing with Square:', error);
    } finally {
      setSyncing(false);
    }
  };

  const filteredParents = parents.filter(p => {
    if (p.doNotInvoice) return false;
    if (filter === 'owes') return p.currentBalance > 0;
    if (filter === 'paid') return p.currentBalance === 0;
    return true;
  });

  const totalOwed = filteredParents.reduce((sum, p) => sum + p.currentBalance, 0);
  const totalParents = filteredParents.length;
  const paidCount = filteredParents.filter(p => p.currentBalance === 0).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-orange-500">Flight Pay</h1>
            <p className="text-gray-400 text-sm">AZ Flight Basketball Payment Tracker</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={syncWithSquare}
              disabled={syncing}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition disabled:opacity-50"
            >
              {syncing ? 'Syncing...' : '🔄 Sync Square'}
            </button>
            <a
              href="/import"
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition"
            >
              📥 Import Data
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <p className="text-gray-400 text-sm">Total Families</p>
            <p className="text-3xl font-bold">{totalParents}</p>
          </div>
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <p className="text-gray-400 text-sm">Paid This Month</p>
            <p className="text-3xl font-bold text-green-500">{paidCount}</p>
          </div>
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <p className="text-gray-400 text-sm">Outstanding</p>
            <p className="text-3xl font-bold text-orange-500">{totalParents - paidCount}</p>
          </div>
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <p className="text-gray-400 text-sm">Total Owed</p>
            <p className="text-3xl font-bold text-red-500">${totalOwed.toLocaleString()}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4 mb-6 items-center">
          <div className="flex bg-gray-800 rounded-lg p-1">
            {(['all', 'owes', 'paid'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-md font-medium transition ${
                  filter === f 
                    ? 'bg-orange-500 text-white' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {f === 'all' ? 'All' : f === 'owes' ? 'Owes' : 'Paid'}
              </button>
            ))}
          </div>
          
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white"
          />
        </div>

        {/* Parent List */}
        {parents.length === 0 ? (
          <div className="bg-gray-800 rounded-xl p-12 text-center border border-gray-700">
            <p className="text-gray-400 text-lg mb-4">No data imported yet</p>
            <a
              href="/import"
              className="inline-block px-6 py-3 bg-orange-500 hover:bg-orange-600 rounded-lg font-medium transition"
            >
              Import Your Excel Tracker
            </a>
          </div>
        ) : (
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700 bg-gray-800">
                  <th className="text-left px-6 py-4 text-gray-400 font-medium">Parent</th>
                  <th className="text-left px-6 py-4 text-gray-400 font-medium">Players</th>
                  <th className="text-left px-6 py-4 text-gray-400 font-medium">Phone</th>
                  <th className="text-right px-6 py-4 text-gray-400 font-medium">Balance</th>
                  <th className="text-center px-6 py-4 text-gray-400 font-medium">Status</th>
                  <th className="text-right px-6 py-4 text-gray-400 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredParents.map((parent) => (
                  <tr key={parent.id} className="border-b border-gray-700 hover:bg-gray-700/50">
                    <td className="px-6 py-4">
                      <p className="font-medium">{parent.firstName} {parent.lastName}</p>
                      {parent.email && (
                        <p className="text-gray-400 text-sm">{parent.email}</p>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-gray-300">{parent.playerNames?.join(', ') || '-'}</p>
                      <p className="text-gray-500 text-sm">
                        ${parent.monthlyRate}/mo
                      </p>
                    </td>
                    <td className="px-6 py-4 text-gray-300">{parent.phone || '-'}</td>
                    <td className="px-6 py-4 text-right">
                      <span className={`font-bold ${
                        parent.currentBalance > 0 ? 'text-red-500' : 'text-green-500'
                      }`}>
                        ${parent.currentBalance}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {parent.currentBalance === 0 ? (
                        <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-sm">
                          Paid
                        </span>
                      ) : (
                        <span className="px-3 py-1 bg-red-500/20 text-red-400 rounded-full text-sm">
                          Owes
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {parent.currentBalance > 0 && (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => markAsPaid(parent.id, 'zelle')}
                            className="px-3 py-1 bg-purple-600 hover:bg-purple-700 rounded text-sm transition"
                          >
                            Zelle
                          </button>
                          <button
                            onClick={() => markAsPaid(parent.id, 'cash')}
                            className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm transition"
                          >
                            Cash
                          </button>
                          <button
                            onClick={() => markAsPaid(parent.id, 'square')}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm transition"
                          >
                            Square
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
