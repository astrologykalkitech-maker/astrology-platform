"use client";

import { useState } from "react";
import {
  getMyAssignedLeads,
  getMyAssignedLeadById,
  updateAssignmentStatus,
} from "@/app/actions/astrologer-leads";
import type {
  AssignmentStatus,
  AstrologerLeadItem,
} from "@/lib/types/lead.types";

type Filter = AssignmentStatus | "all";

export default function AssignedLeadsTest() {
  const [filter, setFilter] = useState<Filter>("all");
  const [leads, setLeads] = useState<AstrologerLeadItem[]>([]);
  const [selected, setSelected] = useState<AstrologerLeadItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [hasFetched, setHasFetched] = useState(false);
  const [total, setTotal] = useState(0);

  async function fetchLeads(status: Filter = filter) {
    setLoading(true);
    setMessage("");
    setSelected(null);

    try {
      const result = await getMyAssignedLeads({
        status,
        limit: 20,
        offset: 0,
      });

      if (!result.success || !result.data) {
        setMessage(result.error ?? "Failed to load leads.");
        return;
      }

      setLeads(result.data.leads);
      setTotal(result.data.totalCount ?? result.data.leads.length);
      setHasFetched(true);
    } catch {
      setMessage("Unexpected error while loading leads.");
    } finally {
      setLoading(false);
    }
  }

  async function viewDetails(id: string) {
    setLoading(true);
    setMessage("");

    try {
      const result = await getMyAssignedLeadById(id);

      if (result.success && result.data) {
        setSelected(result.data);
      } else {
        setMessage(result.error ?? "Unable to fetch lead details.");
      }
    } catch {
      setMessage("Unexpected error while fetching details.");
    } finally {
      setLoading(false);
    }
  }

  async function changeStatus(
    assignmentId: string,
    status: AssignmentStatus
  ) {
    if (!window.confirm(`Change assignment status to ${status}?`)) {
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const result = await updateAssignmentStatus({
        assignment_id: assignmentId,
        status,
      });

      if (!result.success) {
        setMessage(result.error ?? "Status update failed.");
        return;
      }

      setMessage(`Assignment successfully marked ${status}.`);
      await fetchLeads(filter);
    } catch {
      setMessage("Unexpected error while updating status.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-xl border border-zinc-700 bg-zinc-900 p-5 space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-white">
          Phase 4 — Assigned Leads Testing
        </h3>
        <p className="text-xs text-zinc-400">
          Test astrologer lead access, enquiry details and status transitions.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Assignment status filter"
          value={filter}
          disabled={loading}
          onChange={(e) => setFilter(e.target.value as Filter)}
          className="rounded border border-zinc-700 bg-zinc-950 p-2 text-sm text-white"
        >
          <option value="all">All</option>
          <option value="assigned">Assigned</option>
          <option value="contacted">Contacted</option>
          <option value="closed">Closed</option>
        </select>

        <button
          type="button"
          disabled={loading}
          onClick={() => fetchLeads()}
          className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {loading ? "Loading..." : "Fetch Assigned Leads"}
        </button>
      </div>

      {message && (
        <p role="status" className="rounded border border-zinc-700 p-3 text-sm text-amber-300">
          {message}
        </p>
      )}

      {hasFetched && (
        <p className="text-xs text-zinc-400">
          Showing {leads.length} of {total} matching assignments
          {total > leads.length ? " (first page only)" : ""}
        </p>
      )}

      {hasFetched && leads.length === 0 && (
        <p className="text-sm text-zinc-400">
          No assignments found for the selected filter.
        </p>
      )}

      <div className="space-y-3">
        {leads.map((item) => (
          <div
            key={item.id}
            className="rounded-lg border border-zinc-700 bg-zinc-950 p-4 space-y-2"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="text-white">{item.lead.subject}</strong>
              <span className="text-xs text-cyan-300">
                {item.status}
              </span>
            </div>

            <p className="text-xs text-zinc-400">
              Customer: {item.lead.customer?.full_name ?? "Unknown"}
            </p>

            <p className="text-xs text-zinc-400">
              Assigned: {new Date(item.created_at).toLocaleString()}
            </p>

            <p className="text-sm text-zinc-300">
              {item.lead.message.slice(0, 160)}
            </p>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => viewDetails(item.id)}
                className="rounded bg-zinc-700 px-3 py-2 text-xs text-white disabled:opacity-50"
              >
                View Details
              </button>

              {item.status === "assigned" && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => changeStatus(item.id, "contacted")}
                  className="rounded bg-blue-700 px-3 py-2 text-xs text-white disabled:opacity-50"
                >
                  Mark Contacted
                </button>
              )}

              {item.status !== "closed" && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => changeStatus(item.id, "closed")}
                  className="rounded bg-emerald-700 px-3 py-2 text-xs text-white disabled:opacity-50"
                >
                  Close Lead
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <div className="rounded-lg border border-blue-700 p-4 space-y-2">
          <div className="flex justify-between gap-3">
            <h4 className="font-semibold text-white">Lead Details</h4>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-sm text-zinc-400"
            >
              Close
            </button>
          </div>

          <p className="text-sm text-white">
            Subject: {selected.lead.subject}
          </p>

          <p className="text-sm text-zinc-300 whitespace-pre-wrap">
            {selected.lead.message}
          </p>

          <p className="text-xs text-zinc-400">
            Customer: {selected.lead.customer?.full_name ?? "Unknown"}
          </p>

          <p className="text-xs text-zinc-400">
            Assignment ID: {selected.id}
          </p>

          <p className="text-xs text-zinc-400">
            Lead ID: {selected.lead_id}
          </p>

          <p className="text-xs text-zinc-400">
            Lead status: {selected.lead.status}
          </p>
        </div>
      )}
    </section>
  );
}
