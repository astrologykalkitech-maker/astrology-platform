"use client";

import React, { useState } from "react";
import { CheckCircle2, AlertCircle, FileText, Search, Plus } from "lucide-react";
import { addReconciliationNote } from "@/app/actions/super-admin-reconciliation";

export function SuperAdminReconciliationClient({
  initialRuns,
  initialOrders,
}: {
  initialRuns: any[];
  initialOrders: any[];
}) {
  const [orders, setOrders] = useState(initialOrders);
  const [search, setSearch] = useState("");
  const [noteInput, setNoteInput] = useState<{ [key: string]: string }>({});
  const [addingNoteId, setAddingNoteId] = useState<string | null>(null);

  const handleAddNote = async (orderId: string) => {
    const text = (noteInput[orderId] || "").trim();
    if (!text) return;
    setAddingNoteId(orderId);
    try {
      const res = await addReconciliationNote(orderId, text);
      if (res.success) {
        setNoteInput((prev) => ({ ...prev, [orderId]: "" }));
        alert("Reconciliation audit note logged successfully.");
      }
    } finally {
      setAddingNoteId(null);
    }
  };

  const filteredOrders = orders.filter((o) =>
    (o.order_number || "").toLowerCase().includes(search.toLowerCase()) ||
    (o.customer?.email || "").toLowerCase().includes(search.toLowerCase()) ||
    (o.payment_request_id || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* KPI Runs Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {initialRuns.slice(0, 3).map((r) => (
          <div key={r.id} className="rounded-2xl border border-gold/30 bg-white p-4 shadow-xs">
            <span className="text-[11px] font-semibold text-muted block">Run Date: {r.run_date}</span>
            <div className="mt-2 flex items-center justify-between text-xs">
              <span>Settled Paired:</span>
              <span className="font-bold text-emerald-700">{r.total_settled_transactions}</span>
            </div>
            <div className="flex items-center justify-between text-xs mt-1">
              <span>Discrepancies:</span>
              <span className="font-bold text-rose-700">{r.total_discrepancies}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="relative w-full md:w-80">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
        <input
          type="text"
          placeholder="Search order number or customer email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 bg-white outline-none focus:border-gold"
        />
      </div>

      {/* Orders Ledger Reconciliation Table */}
      <div className="overflow-hidden rounded-2xl border border-gold/30 bg-white shadow-xs">
        <table className="w-full text-left text-xs">
          <thead className="bg-parchment/60 border-b border-gold/20 text-midnight font-bold uppercase tracking-wider text-[10px]">
            <tr>
              <th className="p-3.5">Order Ref / Customer</th>
              <th className="p-3.5">Order Type</th>
              <th className="p-3.5">Expected Dakshina</th>
              <th className="p-3.5">Status</th>
              <th className="p-3.5">Payment Provider Ref</th>
              <th className="p-3.5 text-right">Reconciliation Audit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted">
                  No payment orders found.
                </td>
              </tr>
            ) : (
              filteredOrders.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50/60 transition">
                  <td className="p-3.5">
                    <div className="font-mono font-bold text-midnight">{o.order_number}</div>
                    <div className="text-[10px] text-muted">{o.customer?.email}</div>
                  </td>
                  <td className="p-3.5 capitalize font-medium text-slate-700">
                    {o.entity_type}
                  </td>
                  <td className="p-3.5 font-bold text-midnight">
                    ₹{(o.amount_paise / 100).toFixed(2)}
                  </td>
                  <td className="p-3.5">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        ["completed", "successful", "succeeded", "paid"].includes(o.status)
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : o.status === "pending"
                          ? "bg-amber-50 text-amber-800 border border-amber-200"
                          : "bg-rose-50 text-rose-700 border border-rose-200"
                      }`}
                    >
                      {o.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="p-3.5 font-mono text-[10px] text-muted">
                    {o.payment_request_id || "Direct / Gateway"}
                  </td>
                  <td className="p-3.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <input
                        type="text"
                        placeholder="Log note..."
                        value={noteInput[o.id] || ""}
                        onChange={(e) =>
                          setNoteInput((prev) => ({ ...prev, [o.id]: e.target.value }))
                        }
                        className="p-1 px-2 text-[10px] border rounded-lg w-28 outline-none focus:border-gold"
                      />
                      <button
                        onClick={() => handleAddNote(o.id)}
                        disabled={addingNoteId === o.id}
                        className="p-1 rounded-lg bg-midnight text-white hover:bg-slate-800"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

