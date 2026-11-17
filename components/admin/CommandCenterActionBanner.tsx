"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, X, ArrowRight, UserCheck, Users, CalendarCheck, CheckCircle2 } from "lucide-react";
import { ModalBackdrop } from "@/components/admin/ModalBackdrop";

interface TakeActionModalProps {
  unassignedLeads: number;
  pendingListings: number;
  pendingBookings: number;
}

export function CommandCenterActionBanner({
  unassignedLeads,
  pendingListings,
  pendingBookings,
}: TakeActionModalProps) {
  const [isOpen, setIsOpen] = useState(false);

  const totalActions = unassignedLeads + pendingListings + pendingBookings;
  if (totalActions === 0) return null;

  return (
    <>
      <div className="rounded-2xl border border-amber-300 bg-gradient-to-r from-amber-50/90 via-orange-50/60 to-amber-50/40 p-4 shadow-xs">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-xs font-bold text-amber-950 uppercase tracking-wide">
              Immediate Action Required
            </h4>
            <p className="text-xs text-amber-900/90 mt-0.5">
              {unassignedLeads > 0 && (
                <Link
                  href="/super-admin/leads?unassignedOnly=true"
                  className="font-semibold underline decoration-amber-500 hover:text-amber-950 transition-colors cursor-pointer"
                  title="Filter unassigned leads"
                >
                  {unassignedLeads} unassigned lead{unassignedLeads === 1 ? "" : "s"}
                </Link>
              )}
              {unassignedLeads > 0 && (pendingListings > 0 || pendingBookings > 0) && ", "}
              {pendingListings > 0 && (
                <Link
                  href="/super-admin/listings?status=pending"
                  className="font-semibold underline decoration-amber-500 hover:text-amber-950 transition-colors cursor-pointer"
                  title="Filter pending astrologer listings"
                >
                  {pendingListings} pending astrologer application{pendingListings === 1 ? "" : "s"}
                </Link>
              )}
              {pendingListings > 0 && pendingBookings > 0 && ", "}
              {pendingBookings > 0 && (
                <Link
                  href="/super-admin/bookings?status=pending"
                  className="font-semibold underline decoration-amber-500 hover:text-amber-950 transition-colors cursor-pointer"
                  title="Filter pending booking requests"
                >
                  {pendingBookings} pending booking request{pendingBookings === 1 ? "" : "s"}
                </Link>
              )}{" "}
              awaiting review and action.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="shrink-0 rounded-xl bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-amber-800 transition-colors cursor-pointer"
          >
            Take Action
          </button>
        </div>
      </div>

      {/* Action Center Modal / Quick Queue wrapped in Portaled ModalBackdrop */}
      <ModalBackdrop
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        backdropBgClass="bg-midnight/60"
        backdropBlurClass="backdrop-blur-xs"
        ariaLabel="Operations Action Queue"
      >
        <div className="relative w-full max-w-lg rounded-2xl border border-gold/30 bg-white p-6 shadow-2xl space-y-5 my-auto animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between border-b border-gold/20 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
                <AlertCircle className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-display text-base font-bold text-midnight">
                  Operations Action Queue
                </h3>
                <p className="text-xs text-muted">
                  {totalActions} operational item{totalActions === 1 ? "" : "s"} requiring administrative decision
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-lg p-1 text-muted hover:bg-parchment hover:text-midnight transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-3">
            {/* Unassigned Leads item */}
            {unassignedLeads > 0 && (
              <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/60 p-3.5 transition-all hover:bg-amber-50">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-200/80 text-amber-900 shrink-0">
                    <UserCheck className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-midnight">
                      {unassignedLeads} Unassigned Platform Lead{unassignedLeads === 1 ? "" : "s"}
                    </h4>
                    <p className="text-[11px] text-muted">
                      Awaiting consultant assignment and SLA outreach
                    </p>
                  </div>
                </div>
                <Link
                  href="/super-admin/leads?unassignedOnly=true"
                  onClick={() => setIsOpen(false)}
                  className="inline-flex items-center gap-1 rounded-lg bg-midnight px-3 py-1.5 text-xs font-semibold text-champagne shadow-2xs hover:bg-plum transition-colors"
                >
                  <span>Assign Leads</span>
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            )}

            {/* Pending Astrologer Applications item */}
            {pendingListings > 0 && (
              <div className="flex items-center justify-between rounded-xl border border-gold/30 bg-gold/5 p-3.5 transition-all hover:bg-gold/10">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold/20 text-gold-deep shrink-0">
                    <Users className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-midnight">
                      {pendingListings} Astrologer Application{pendingListings === 1 ? "" : "s"}
                    </h4>
                    <p className="text-[11px] text-muted">
                      Awaiting credential and identity verification
                    </p>
                  </div>
                </div>
                <Link
                  href="/super-admin/listings?status=pending"
                  onClick={() => setIsOpen(false)}
                  className="inline-flex items-center gap-1 rounded-lg bg-midnight px-3 py-1.5 text-xs font-semibold text-champagne shadow-2xs hover:bg-plum transition-colors"
                >
                  <span>Review Listings</span>
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            )}

            {/* Pending Bookings item */}
            {pendingBookings > 0 && (
              <div className="flex items-center justify-between rounded-xl border border-teal/30 bg-teal/5 p-3.5 transition-all hover:bg-teal/10">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal/20 text-teal shrink-0">
                    <CalendarCheck className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-midnight">
                      {pendingBookings} Booking Request{pendingBookings === 1 ? "" : "s"}
                    </h4>
                    <p className="text-[11px] text-muted">
                      Pending astrologer or admin schedule confirmation
                    </p>
                  </div>
                </div>
                <Link
                  href="/super-admin/bookings?status=pending"
                  onClick={() => setIsOpen(false)}
                  className="inline-flex items-center gap-1 rounded-lg bg-midnight px-3 py-1.5 text-xs font-semibold text-champagne shadow-2xs hover:bg-plum transition-colors"
                >
                  <span>Inspect Bookings</span>
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-gold/15 pt-3 text-[11px] text-muted">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              Actions are logged directly into Super Admin audit logs
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="font-medium text-midnight hover:underline cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </ModalBackdrop>
    </>
  );
}
