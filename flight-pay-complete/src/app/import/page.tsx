'use client';

import { useState } from 'react';
import { collection, doc, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface ImportedRow {
  playerName: string;
  parentFirst: string;
  parentLast: string;
  team: string;
  email: string;
  phone: string;
  cost: number;
  notes: string;
  currentBalance: number;
  isCoach: boolean;
  doNotInvoice: boolean;
}

export default function ImportPage() {
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<{ success: number; errors: string[] } | null>(null);
  const [preview, setPreview] = useState<ImportedRow[]>([]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/import/parse', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      
      if (data.rows) {
        setPreview(data.rows);
      }
    } catch (error) {
      console.error('Error parsing file:', error);
    }
  };

  const importToFirestore = async () => {
    if (preview.length === 0) return;
    
    setImporting(true);
    const errors: string[] = [];
    let success = 0;

    try {
      const batch = writeBatch(db);
      
      // Group players by parent
      const parentMap = new Map<string, {
        parent: { firstName: string; lastName: string; email: string; phone: string; notes: string; doNotInvoice: boolean };
        players: { name: string; team: string; isCoach: boolean }[];
        totalBalance: number;
        monthlyRate: number;
      }>();

      for (const row of preview) {
        const parentKey = `${row.parentFirst}_${row.parentLast}_${row.phone}`.toLowerCase();
        
        if (parentMap.has(parentKey)) {
          const existing = parentMap.get(parentKey)!;
          existing.players.push({
            name: row.playerName,
            team: row.team,
            isCoach: row.isCoach,
          });
          existing.totalBalance = Math.max(existing.totalBalance, row.currentBalance);
        } else {
          parentMap.set(parentKey, {
            parent: {
              firstName: row.parentFirst,
              lastName: row.parentLast,
              email: row.email,
              phone: row.phone,
              notes: row.notes,
              doNotInvoice: row.doNotInvoice,
            },
            players: [{
              name: row.playerName,
              team: row.team,
              isCoach: row.isCoach,
            }],
            totalBalance: row.currentBalance,
            monthlyRate: row.cost,
          });
        }
      }

      // Create parent documents
      for (const [key, data] of parentMap) {
        const parentId = key.replace(/[^a-z0-9]/g, '_');
        const hasSiblings = data.players.filter(p => !p.isCoach).length > 1;
        const monthlyRate = hasSiblings ? 170 : 95;
        
        const parentRef = doc(db, 'parents', parentId);
        batch.set(parentRef, {
          firstName: data.parent.firstName,
          lastName: data.parent.lastName,
          email: data.parent.email || null,
          phone: data.parent.phone,
          notes: data.parent.notes,
          doNotInvoice: data.parent.doNotInvoice,
          playerNames: data.players.map(p => p.name),
          players: data.players,
          currentBalance: data.totalBalance,
          monthlyRate: data.monthlyRate || monthlyRate,
          squareCustomerId: null,
          payments: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        success++;
      }

      await batch.commit();
      setResults({ success, errors });
    } catch (error) {
      console.error('Import error:', error);
      errors.push(`Import failed: ${error}`);
      setResults({ success, errors });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-orange-500">Import Data</h1>
            <p className="text-gray-400 text-sm">Upload your Excel tracker</p>
          </div>
          <a
            href="/"
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition"
          >
            ← Back to Dashboard
          </a>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Upload Section */}
        <div className="bg-gray-800 rounded-xl p-8 border border-gray-700 mb-8">
          <h2 className="text-xl font-semibold mb-4">Upload Excel File</h2>
          <p className="text-gray-400 mb-6">
            Upload your Square tracker Excel file. The system will parse player and parent information.
          </p>
          
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileUpload}
            className="block w-full text-sm text-gray-400
              file:mr-4 file:py-3 file:px-6
              file:rounded-lg file:border-0
              file:text-sm file:font-medium
              file:bg-orange-500 file:text-white
              hover:file:bg-orange-600
              cursor-pointer"
          />
        </div>

        {/* Preview */}
        {preview.length > 0 && (
          <div className="bg-gray-800 rounded-xl border border-gray-700 mb-8">
            <div className="p-6 border-b border-gray-700 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-semibold">Preview ({preview.length} rows)</h2>
                <p className="text-gray-400 text-sm">Review before importing</p>
              </div>
              <button
                onClick={importToFirestore}
                disabled={importing}
                className="px-6 py-3 bg-green-600 hover:bg-green-700 rounded-lg font-medium transition disabled:opacity-50"
              >
                {importing ? 'Importing...' : '✓ Import to Database'}
              </button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left px-4 py-3 text-gray-400">Player</th>
                    <th className="text-left px-4 py-3 text-gray-400">Parent</th>
                    <th className="text-left px-4 py-3 text-gray-400">Phone</th>
                    <th className="text-right px-4 py-3 text-gray-400">Balance</th>
                    <th className="text-center px-4 py-3 text-gray-400">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 20).map((row, idx) => (
                    <tr key={idx} className={`border-b border-gray-700 ${row.isCoach ? 'bg-orange-500/10' : ''}`}>
                      <td className="px-4 py-3">
                        {row.playerName}
                        {row.isCoach && <span className="ml-2 text-orange-400 text-xs">(Coach)</span>}
                      </td>
                      <td className="px-4 py-3">{row.parentFirst} {row.parentLast}</td>
                      <td className="px-4 py-3 text-gray-400">{row.phone}</td>
                      <td className="px-4 py-3 text-right font-medium">
                        ${row.currentBalance}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {row.doNotInvoice ? (
                          <span className="text-yellow-400 text-xs">Skip</span>
                        ) : row.currentBalance > 0 ? (
                          <span className="text-red-400 text-xs">Owes</span>
                        ) : (
                          <span className="text-green-400 text-xs">Paid</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.length > 20 && (
                <p className="text-center text-gray-400 py-4">
                  ... and {preview.length - 20} more rows
                </p>
              )}
            </div>
          </div>
        )}

        {/* Results */}
        {results && (
          <div className={`rounded-xl p-6 border ${
            results.errors.length > 0 
              ? 'bg-red-500/10 border-red-500/50' 
              : 'bg-green-500/10 border-green-500/50'
          }`}>
            <h3 className="text-lg font-semibold mb-2">
              {results.errors.length > 0 ? 'Import Completed with Errors' : 'Import Successful!'}
            </h3>
            <p className="text-gray-300">
              {results.success} families imported successfully.
            </p>
            {results.errors.length > 0 && (
              <ul className="mt-4 text-red-400 text-sm">
                {results.errors.map((err, idx) => (
                  <li key={idx}>• {err}</li>
                ))}
              </ul>
            )}
            <a
              href="/"
              className="inline-block mt-4 px-6 py-2 bg-orange-500 hover:bg-orange-600 rounded-lg font-medium transition"
            >
              Go to Dashboard
            </a>
          </div>
        )}
      </main>
    </div>
  );
}
